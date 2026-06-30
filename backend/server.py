from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import requests
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Storage config
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "costume-tracker")
storage_key: Optional[str] = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set, storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Storage initialized successfully")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage not available")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 403:
        global storage_key
        storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage not available")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 403:
        global storage_key
        storage_key = None
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp"
}


# Create FastAPI app
app = FastAPI(title="Costume Inventory Tracker")
api_router = APIRouter(prefix="/api")


# --------- Models ---------
SIZE_KEYS = ["XS", "S", "M", "L", "XL"]


class CostumeBase(BaseModel):
    name: str
    category: str
    location: str
    notes: Optional[str] = ""
    sizes: Dict[str, int] = Field(default_factory=lambda: {k: 0 for k in SIZE_KEYS})


class CostumeCreate(CostumeBase):
    image_id: Optional[str] = None


class CostumeUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    sizes: Optional[Dict[str, int]] = None
    image_id: Optional[str] = None


class Costume(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category: str
    location: str
    notes: str = ""
    sizes: Dict[str, int]
    total_quantity: int
    image_id: Optional[str] = None
    created_at: str
    updated_at: str


class LocationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    created_at: str


class LocationCreate(BaseModel):
    name: str


def _compute_total(sizes: Dict[str, int]) -> int:
    return int(sum(int(v or 0) for v in sizes.values()))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------- Costume Routes ---------
@api_router.get("/")
async def root():
    return {"message": "Costume Inventory API"}


@api_router.get("/stats")
async def get_stats():
    costumes = await db.costumes.find({}, {"_id": 0}).to_list(10000)
    total_costumes = len(costumes)
    total_items = sum(c.get("total_quantity", 0) for c in costumes)
    categories = sorted({c.get("category", "") for c in costumes if c.get("category")})
    locations_in_use = sorted({c.get("location", "") for c in costumes if c.get("location")})
    by_size = {k: 0 for k in SIZE_KEYS}
    for c in costumes:
        for k in SIZE_KEYS:
            by_size[k] += int((c.get("sizes") or {}).get(k, 0))
    return {
        "total_costumes": total_costumes,
        "total_items": total_items,
        "categories": categories,
        "category_count": len(categories),
        "locations_in_use": locations_in_use,
        "by_size": by_size,
    }


@api_router.get("/costumes", response_model=List[Costume])
async def list_costumes(
    q: Optional[str] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    size: Optional[str] = None,
):
    query: Dict = {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
        ]
    if category:
        query["category"] = category
    if location:
        query["location"] = location
    if size and size in SIZE_KEYS:
        query[f"sizes.{size}"] = {"$gt": 0}
    docs = await db.costumes.find(query, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    return docs


@api_router.get("/costumes/{costume_id}", response_model=Costume)
async def get_costume(costume_id: str):
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Costume not found")
    return doc


@api_router.post("/costumes", response_model=Costume)
async def create_costume(payload: CostumeCreate):
    now = _now_iso()
    sizes = {k: int(payload.sizes.get(k, 0)) for k in SIZE_KEYS}
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "category": payload.category.strip(),
        "location": payload.location.strip(),
        "notes": (payload.notes or "").strip(),
        "sizes": sizes,
        "total_quantity": _compute_total(sizes),
        "image_id": payload.image_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.costumes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/costumes/{costume_id}", response_model=Costume)
async def update_costume(costume_id: str, payload: CostumeUpdate):
    existing = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Costume not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "sizes" in updates:
        sizes = {k: int(updates["sizes"].get(k, 0)) for k in SIZE_KEYS}
        updates["sizes"] = sizes
        updates["total_quantity"] = _compute_total(sizes)
    updates["updated_at"] = _now_iso()
    await db.costumes.update_one({"id": costume_id}, {"$set": updates})
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    return doc


@api_router.delete("/costumes/{costume_id}")
async def delete_costume(costume_id: str):
    res = await db.costumes.delete_one({"id": costume_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Costume not found")
    return {"ok": True}


# --------- Locations Routes ---------
@api_router.get("/locations", response_model=List[LocationItem])
async def list_locations():
    docs = await db.locations.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return docs


@api_router.post("/locations", response_model=LocationItem)
async def create_location(payload: LocationCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.locations.find_one({"name": name})
    if existing:
        raise HTTPException(status_code=409, detail="Location already exists")
    doc = {"id": str(uuid.uuid4()), "name": name, "created_at": _now_iso()}
    await db.locations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str):
    res = await db.locations.delete_one({"id": location_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    return {"ok": True}


# --------- Categories Routes ---------
@api_router.get("/categories")
async def list_categories():
    docs = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    existing = {d["name"] for d in docs}
    used = await db.costumes.distinct("category")
    for u in used:
        if u and u not in existing:
            docs.append({"id": str(uuid.uuid4()), "name": u, "created_at": _now_iso()})
            existing.add(u)
    return sorted(docs, key=lambda x: x["name"].lower())


@api_router.post("/categories")
async def create_category(payload: LocationCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.categories.find_one({"name": name})
    if existing:
        existing.pop("_id", None)
        return existing
    doc = {"id": str(uuid.uuid4()), "name": name, "created_at": _now_iso()}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


# --------- Upload / Image Routes ---------
@api_router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    image_id = str(uuid.uuid4())
    path = f"{APP_NAME}/costumes/{image_id}.{ext}"
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    result = put_object(path, data, content_type)
    record = {
        "id": image_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": _now_iso(),
    }
    await db.files.insert_one(record)
    return {"image_id": image_id, "url": f"/api/images/{image_id}"}


@api_router.get("/images/{image_id}")
async def get_image(image_id: str):
    record = await db.files.find_one({"id": image_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Image not found")
    data, content_type = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", content_type))


# --------- App Setup ---------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_storage()
    # Seed default locations if empty
    count = await db.locations.count_documents({})
    if count == 0:
        defaults = [
            "Main Wardrobe", "Backstage Storage", "Costume Closet A",
            "Costume Closet B", "Off-site Storage", "Repair Station"
        ]
        for name in defaults:
            await db.locations.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "created_at": _now_iso()
            })
    # Seed default categories
    cat_count = await db.categories.count_documents({})
    if cat_count == 0:
        defaults = ["Historical", "Fantasy", "Modern", "Period", "Children", "Animal", "Uniform"]
        for name in defaults:
            await db.categories.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "created_at": _now_iso()
            })


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
