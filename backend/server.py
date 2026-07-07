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
DEFAULT_SIZING_SYSTEMS = [
    {"name": "Letter", "sizes": ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]},
    {"name": "Number (Even)", "sizes": ["0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28", "30"]},
    {"name": "Tall", "sizes": ["4T", "6T", "8T", "10T", "12T", "14T", "16T"]},
    {"name": "Petite", "sizes": ["4P", "6P", "8P", "10P", "12P", "14P", "16P"]},
]


class CostumeFlag(BaseModel):
    id: str
    category_id: str
    note: Optional[str] = ""
    created_at: str


class CostumeBase(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = ""
    location: str
    sub_location: Optional[str] = ""
    notes: Optional[str] = ""
    sizing_system: Optional[str] = "Letter"
    sizes: Dict[str, int] = Field(default_factory=dict)
    size_notes: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    creator: Optional[str] = ""
    buy_link: Optional[str] = ""
    original_show_id: Optional[str] = None
    additional_show_ids: List[str] = Field(default_factory=list)
    group_id: Optional[str] = None
    variant_label: Optional[str] = ""


class CostumeCreate(CostumeBase):
    image_id: Optional[str] = None
    is_flagged: Optional[bool] = False
    flag_reason: Optional[str] = ""
    flags: Optional[List[Dict]] = None


class CostumeUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    location: Optional[str] = None
    sub_location: Optional[str] = None
    notes: Optional[str] = None
    sizing_system: Optional[str] = None
    sizes: Optional[Dict[str, int]] = None
    size_notes: Optional[Dict[str, str]] = None
    keywords: Optional[List[str]] = None
    creator: Optional[str] = None
    buy_link: Optional[str] = None
    original_show_id: Optional[str] = None
    additional_show_ids: Optional[List[str]] = None
    image_id: Optional[str] = None
    is_flagged: Optional[bool] = None
    flag_reason: Optional[str] = None
    flags: Optional[List[Dict]] = None
    group_id: Optional[str] = None
    variant_label: Optional[str] = None


class FlagPayload(BaseModel):
    reason: str


class FlagCategoryPayload(BaseModel):
    name: str
    color: Optional[str] = "#EF4444"


class FlagCategory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    color: str = "#EF4444"
    created_at: str


class AttachFlagPayload(BaseModel):
    category_id: str
    note: Optional[str] = ""


class UpdateFlagPayload(BaseModel):
    note: Optional[str] = ""


class Costume(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category: str
    subcategory: str = ""
    location: str
    sub_location: str = ""
    notes: str = ""
    sizing_system: str = "Letter"
    sizes: Dict[str, int]
    size_notes: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    creator: str = ""
    buy_link: str = ""
    original_show_id: Optional[str] = None
    additional_show_ids: List[str] = Field(default_factory=list)
    origin_year: Optional[int] = None
    total_quantity: int
    image_id: Optional[str] = None
    is_flagged: bool = False
    flag_reason: str = ""
    flagged_at: Optional[str] = None
    flags: List[Dict] = Field(default_factory=list)
    created_at: str
    updated_at: str
    group_id: Optional[str] = None
    variant_label: str = ""


class InventoryGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category: str = ""
    subcategory: str = ""
    location: str = ""
    sub_location: str = ""
    notes: str = ""
    keywords: List[str] = Field(default_factory=list)
    creator: str = ""
    original_show_id: Optional[str] = None
    additional_show_ids: List[str] = Field(default_factory=list)
    image_id: Optional[str] = None
    created_at: str
    updated_at: str


class GroupPayload(BaseModel):
    name: str
    category: Optional[str] = ""
    subcategory: Optional[str] = ""
    location: Optional[str] = ""
    sub_location: Optional[str] = ""
    notes: Optional[str] = ""
    keywords: Optional[List[str]] = None
    creator: Optional[str] = ""
    original_show_id: Optional[str] = None
    additional_show_ids: Optional[List[str]] = None
    image_id: Optional[str] = None


class Show(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    year: Optional[int] = None
    image_id: Optional[str] = None
    notes: Optional[str] = ""
    show_link: Optional[str] = ""
    created_at: str


class ShowPayload(BaseModel):
    name: str
    year: Optional[int] = None
    image_id: Optional[str] = None
    notes: Optional[str] = ""
    show_link: Optional[str] = ""


class SubcategoryPayload(BaseModel):
    name: str
    parent_id: Optional[str] = None


class SubcategoryRename(BaseModel):
    name: str


class SizingSystem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    sizes: List[str]
    created_at: str


class SizingSystemPayload(BaseModel):
    name: str
    sizes: List[str]


def _normalize_subcategories(subs):
    """Migrate flat list of strings → list of dicts with id/name/parent_id."""
    out = []
    for s in subs or []:
        if isinstance(s, str):
            out.append({"id": str(uuid.uuid4()), "name": s, "parent_id": None})
        elif isinstance(s, dict):
            out.append({
                "id": s.get("id") or str(uuid.uuid4()),
                "name": s.get("name", ""),
                "parent_id": s.get("parent_id"),
            })
    return out


def _subcategory_path(subs, sub_id):
    by_id = {s["id"]: s for s in subs}
    parts = []
    cur = by_id.get(sub_id)
    seen = set()
    while cur and cur["id"] not in seen:
        seen.add(cur["id"])
        parts.append(cur.get("name", ""))
        cur = by_id.get(cur.get("parent_id")) if cur.get("parent_id") else None
    return " / ".join(reversed(parts))


class LocationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    parent_id: Optional[str] = None
    path: Optional[str] = None
    depth: Optional[int] = 0
    created_at: str


class LocationCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None


class LocationRename(BaseModel):
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
    return {
        "total_costumes": total_costumes,
        "total_items": total_items,
        "categories": categories,
        "category_count": len(categories),
        "locations_in_use": locations_in_use,
        "flagged_count": sum(1 for c in costumes if c.get("is_flagged")),
    }


@api_router.get("/costumes", response_model=List[Costume])
async def list_costumes(
    q: Optional[str] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    location: Optional[str] = None,
    size: Optional[str] = None,
    sizing_system: Optional[str] = None,
    year: Optional[int] = None,
    show_id: Optional[str] = None,
    flagged: Optional[bool] = None,
    sort: Optional[str] = None,
):
    query: Dict = {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
            {"subcategory": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
            {"sub_location": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
            {"creator": {"$regex": q, "$options": "i"}},
            {"keywords": {"$regex": q, "$options": "i"}},
        ]
    if category:
        query["category"] = category
    if subcategory:
        import re as _re
        # Match costumes whose subcategory path starts with the given path (so parent selection includes children)
        query["subcategory"] = {"$regex": f"^{_re.escape(subcategory)}(?: / |$)"}
    if location:
        query["location"] = location
    if size:
        query[f"sizes.{size}"] = {"$gt": 0}
    if sizing_system:
        query["sizing_system"] = sizing_system
    if year is not None:
        query["origin_year"] = year
    if show_id:
        query["$and"] = query.get("$and", []) + [{
            "$or": [
                {"original_show_id": show_id},
                {"additional_show_ids": show_id},
            ]
        }]
    if flagged is not None:
        query["is_flagged"] = flagged
    # Sorting
    sort_spec = [("origin_year", -1), ("name", 1)]  # default: most recently used (newest origin year first)
    if sort == "updated_desc":
        sort_spec = [("updated_at", -1)]
    elif sort == "origin_year_asc":
        sort_spec = [("origin_year", 1), ("name", 1)]
    elif sort == "origin_year_desc":
        sort_spec = [("origin_year", -1), ("name", 1)]
    elif sort == "name_asc":
        sort_spec = [("name", 1)]
    elif sort == "total_desc":
        sort_spec = [("total_quantity", -1)]
    docs = await db.costumes.find(query, {"_id": 0}).sort(sort_spec).to_list(2000)
    if sort == "origin_year_asc":
        docs.sort(key=lambda d: (d.get("origin_year") is None, d.get("origin_year") or 0, d.get("name", "").lower()))
    elif sort in (None, "origin_year_desc"):
        # newest first; nulls at end
        docs.sort(key=lambda d: (d.get("origin_year") is None, -(d.get("origin_year") or 0), d.get("name", "").lower()))
    return docs


@api_router.get("/costumes/{costume_id}", response_model=Costume)
async def get_costume(costume_id: str):
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Costume not found")
    return doc


async def _resolve_origin_year(original_show_id: Optional[str]) -> Optional[int]:
    if not original_show_id:
        return None
    show = await db.shows.find_one({"id": original_show_id})
    if not show:
        return None
    y = show.get("year")
    return int(y) if y is not None else None


@api_router.post("/costumes", response_model=Costume)
async def create_costume(payload: CostumeCreate):
    now = _now_iso()
    sizes = {str(k): int(v or 0) for k, v in (payload.sizes or {}).items()}
    size_notes = {str(k): str(v or "") for k, v in (payload.size_notes or {}).items()}
    keywords = [k.strip() for k in (payload.keywords or []) if k and k.strip()]
    origin_year = await _resolve_origin_year(payload.original_show_id)
    # Normalize flags list
    flags = []
    for f in (payload.flags or []):
        if not isinstance(f, dict) or not f.get("category_id"):
            continue
        flags.append({
            "id": f.get("id") or str(uuid.uuid4()),
            "category_id": f["category_id"],
            "note": (f.get("note") or "").strip(),
            "created_at": f.get("created_at") or now,
        })
    is_flagged = bool(payload.is_flagged) or len(flags) > 0
    flag_reason = (payload.flag_reason or "").strip() if is_flagged else ""
    if not flag_reason and flags:
        flag_reason = " · ".join([f["note"] for f in flags if f["note"]])
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "category": payload.category.strip(),
        "subcategory": (payload.subcategory or "").strip(),
        "location": payload.location.strip(),
        "sub_location": (payload.sub_location or "").strip(),
        "notes": (payload.notes or "").strip(),
        "sizing_system": (payload.sizing_system or "Letter").strip(),
        "sizes": sizes,
        "size_notes": size_notes,
        "keywords": keywords,
        "creator": (payload.creator or "").strip(),
        "buy_link": (payload.buy_link or "").strip(),
        "original_show_id": payload.original_show_id,
        "additional_show_ids": list(payload.additional_show_ids or []),
        "origin_year": origin_year,
        "total_quantity": _compute_total(sizes),
        "image_id": payload.image_id,
        "is_flagged": is_flagged,
        "flag_reason": flag_reason,
        "flagged_at": now if is_flagged else None,
        "flags": flags,
        "group_id": payload.group_id,
        "variant_label": (payload.variant_label or "").strip(),
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
        sizes = {str(k): int(v or 0) for k, v in (updates["sizes"] or {}).items()}
        updates["sizes"] = sizes
        updates["total_quantity"] = _compute_total(sizes)
    if "size_notes" in updates:
        updates["size_notes"] = {str(k): str(v or "") for k, v in (updates["size_notes"] or {}).items()}
    if "keywords" in updates:
        updates["keywords"] = [k.strip() for k in (updates["keywords"] or []) if k and k.strip()]
    if "original_show_id" in updates:
        updates["origin_year"] = await _resolve_origin_year(updates["original_show_id"])
    if "flags" in updates:
        raw = updates["flags"] or []
        normalized = []
        now_ts = _now_iso()
        for f in raw:
            if not isinstance(f, dict) or not f.get("category_id"):
                continue
            normalized.append({
                "id": f.get("id") or str(uuid.uuid4()),
                "category_id": f["category_id"],
                "note": (f.get("note") or "").strip(),
                "created_at": f.get("created_at") or now_ts,
            })
        updates["flags"] = normalized
        updates["is_flagged"] = len(normalized) > 0 or updates.get("is_flagged", existing.get("is_flagged", False))
        if normalized:
            updates["flagged_at"] = updates.get("flagged_at") or _now_iso()
            if not updates.get("flag_reason"):
                updates["flag_reason"] = " · ".join([f["note"] for f in normalized if f["note"]])
        else:
            if not updates.get("is_flagged"):
                updates["flag_reason"] = ""
                updates["flagged_at"] = None
    if "is_flagged" in updates and "flags" not in updates:
        if updates["is_flagged"]:
            updates["flagged_at"] = _now_iso()
        else:
            updates["flagged_at"] = None
            updates["flag_reason"] = ""
            updates["flags"] = []
    updates["updated_at"] = _now_iso()
    await db.costumes.update_one({"id": costume_id}, {"$set": updates})
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    return doc


@api_router.post("/costumes/{costume_id}/flag", response_model=Costume)
async def flag_costume(costume_id: str, payload: FlagPayload):
    existing = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Costume not found")
    await db.costumes.update_one(
        {"id": costume_id},
        {"$set": {
            "is_flagged": True,
            "flag_reason": payload.reason.strip(),
            "flagged_at": _now_iso(),
            "updated_at": _now_iso(),
        }}
    )
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    return doc


@api_router.post("/costumes/{costume_id}/unflag", response_model=Costume)
async def unflag_costume(costume_id: str):
    existing = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Costume not found")
    await db.costumes.update_one(
        {"id": costume_id},
        {"$set": {"is_flagged": False, "flag_reason": "", "flagged_at": None, "updated_at": _now_iso()}}
    )
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    return doc


@api_router.delete("/costumes/{costume_id}")
async def delete_costume(costume_id: str):
    res = await db.costumes.delete_one({"id": costume_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Costume not found")
    return {"ok": True}


# --------- Locations Routes ---------
def _build_location_path(all_docs: List[dict], doc: dict) -> tuple[str, int]:
    by_id = {d["id"]: d for d in all_docs}
    parts = []
    depth = 0
    cur = doc
    seen = set()
    while cur:
        if cur["id"] in seen:
            break
        seen.add(cur["id"])
        parts.append(cur.get("name", ""))
        pid = cur.get("parent_id")
        if not pid:
            break
        depth += 1
        cur = by_id.get(pid)
    return " / ".join(reversed(parts)), depth


@api_router.get("/locations", response_model=List[LocationItem])
async def list_locations():
    docs = await db.locations.find({}, {"_id": 0}).to_list(2000)
    # Compute path and depth for each
    for d in docs:
        d.setdefault("parent_id", None)
        path, depth = _build_location_path(docs, d)
        d["path"] = path
        d["depth"] = depth
    docs.sort(key=lambda d: d["path"].lower())
    return docs


@api_router.get("/locations/costume-counts")
async def location_costume_counts():
    """Return {location_path: {count, items}} aggregated over costume.location strings."""
    pipeline = [
        {"$group": {"_id": "$location", "count": {"$sum": 1}, "items": {"$sum": "$total_quantity"}}},
    ]
    counts = {}
    async for row in db.costumes.aggregate(pipeline):
        if row["_id"]:
            counts[row["_id"]] = {"count": row["count"], "items": row["items"]}
    return counts


@api_router.post("/locations", response_model=LocationItem)
async def create_location(payload: LocationCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    if "/" in name:
        raise HTTPException(status_code=400, detail="Name cannot contain '/'")
    parent_id = payload.parent_id
    if parent_id:
        parent = await db.locations.find_one({"id": parent_id})
        if not parent:
            raise HTTPException(status_code=404, detail="Parent location not found")
    # Duplicate check within same parent
    dupe = await db.locations.find_one({"name": name, "parent_id": parent_id})
    if dupe:
        raise HTTPException(status_code=409, detail="Location already exists under this parent")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "parent_id": parent_id,
        "created_at": _now_iso(),
    }
    await db.locations.insert_one(doc)
    all_docs = await db.locations.find({}, {"_id": 0}).to_list(2000)
    path, depth = _build_location_path(all_docs, doc)
    doc["path"] = path
    doc["depth"] = depth
    doc.pop("_id", None)
    return doc


@api_router.put("/locations/{location_id}", response_model=LocationItem)
async def rename_location(location_id: str, payload: LocationRename):
    doc = await db.locations.find_one({"id": location_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    if "/" in name:
        raise HTTPException(status_code=400, detail="Name cannot contain '/'")
    dupe = await db.locations.find_one({"name": name, "parent_id": doc.get("parent_id"), "id": {"$ne": location_id}})
    if dupe:
        raise HTTPException(status_code=409, detail="Sibling location already has that name")
    await db.locations.update_one({"id": location_id}, {"$set": {"name": name}})
    all_docs = await db.locations.find({}, {"_id": 0}).to_list(2000)
    updated = next((d for d in all_docs if d["id"] == location_id), None)
    path, depth = _build_location_path(all_docs, updated)
    updated["path"] = path
    updated["depth"] = depth
    updated.pop("_id", None)
    return updated


@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str):
    doc = await db.locations.find_one({"id": location_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    child = await db.locations.find_one({"parent_id": location_id})
    if child:
        raise HTTPException(status_code=409, detail="Location has children; delete them first")
    await db.locations.delete_one({"id": location_id})
    return {"ok": True}


# --------- Categories Routes ---------
@api_router.get("/categories")
async def list_categories():
    docs = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    for d in docs:
        original = d.get("subcategories")
        normalized = _normalize_subcategories(original)
        needs_migration = any(isinstance(s, str) for s in (original or []))
        if needs_migration:
            await db.categories.update_one({"id": d["id"]}, {"$set": {"subcategories": normalized}})
        d["subcategories"] = normalized
        d.setdefault("color", "#71717A")
    existing = {d["name"] for d in docs}
    used = await db.costumes.distinct("category")
    for u in used:
        if u and u not in existing:
            new_id = str(uuid.uuid4())
            new_doc = {"id": new_id, "name": u, "subcategories": [], "color": "#71717A", "created_at": _now_iso()}
            await db.categories.insert_one(dict(new_doc))
            docs.append(new_doc)
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
        existing["subcategories"] = _normalize_subcategories(existing.get("subcategories"))
        existing.setdefault("color", "#71717A")
        return existing
    doc = {"id": str(uuid.uuid4()), "name": name, "subcategories": [], "color": "#71717A", "created_at": _now_iso()}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryUpdate):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = {}
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name required")
        if new_name != doc.get("name"):
            dupe = await db.categories.find_one({"name": new_name, "id": {"$ne": category_id}})
            if dupe:
                raise HTTPException(status_code=409, detail="Another category has that name")
            # Cascade rename to costumes
            await db.costumes.update_many({"category": doc["name"]}, {"$set": {"category": new_name}})
            updates["name"] = new_name
    if payload.color is not None:
        updates["color"] = payload.color.strip() or "#71717A"
    if updates:
        await db.categories.update_one({"id": category_id}, {"$set": updates})
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    updated.setdefault("color", "#71717A")
    updated["subcategories"] = _normalize_subcategories(updated.get("subcategories"))
    return updated


@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    in_use = await db.costumes.count_documents({"category": doc["name"]})
    if in_use > 0:
        raise HTTPException(status_code=409, detail=f"Category is used by {in_use} costume(s)")
    await db.categories.delete_one({"id": category_id})
    return {"ok": True}


@api_router.post("/categories/{category_id}/subcategories")
async def add_subcategory(category_id: str, payload: SubcategoryPayload):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Subcategory name required")
    if "/" in name:
        raise HTTPException(status_code=400, detail="Subcategory name cannot contain '/'")
    subs = _normalize_subcategories(doc.get("subcategories"))
    # Persist normalized shape so IDs are stable across requests
    await db.categories.update_one({"id": category_id}, {"$set": {"subcategories": subs}})
    parent_id = payload.parent_id
    if parent_id and not any(s["id"] == parent_id for s in subs):
        raise HTTPException(status_code=404, detail="Parent subcategory not found")
    if any(s["name"].lower() == name.lower() and s.get("parent_id") == parent_id for s in subs):
        raise HTTPException(status_code=409, detail="Subcategory already exists under this parent")
    subs.append({"id": str(uuid.uuid4()), "name": name, "parent_id": parent_id})
    await db.categories.update_one({"id": category_id}, {"$set": {"subcategories": subs}})
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    updated["subcategories"] = _normalize_subcategories(updated.get("subcategories"))
    return updated


@api_router.put("/categories/{category_id}/subcategories/{sub_id}")
async def rename_subcategory(category_id: str, sub_id: str, payload: SubcategoryRename):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    name = payload.name.strip()
    if not name or "/" in name:
        raise HTTPException(status_code=400, detail="Invalid name")
    subs = _normalize_subcategories(doc.get("subcategories"))
    target = next((s for s in subs if s["id"] == sub_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    if any(s["id"] != sub_id and s["name"].lower() == name.lower() and s.get("parent_id") == target.get("parent_id") for s in subs):
        raise HTTPException(status_code=409, detail="Sibling with that name already exists")
    target["name"] = name
    await db.categories.update_one({"id": category_id}, {"$set": {"subcategories": subs}})
    return {"ok": True}


@api_router.delete("/categories/{category_id}/subcategories/{sub_id}")
async def delete_subcategory(category_id: str, sub_id: str):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    subs = _normalize_subcategories(doc.get("subcategories"))
    if any(s.get("parent_id") == sub_id for s in subs):
        raise HTTPException(status_code=409, detail="Subcategory has nested items; delete them first")
    subs = [s for s in subs if s["id"] != sub_id]
    await db.categories.update_one({"id": category_id}, {"$set": {"subcategories": subs}})
    return {"ok": True}


# --------- Sizing Systems Routes ---------
@api_router.get("/sizing-systems", response_model=List[SizingSystem])
async def list_sizing_systems():
    docs = await db.sizing_systems.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return docs


@api_router.post("/sizing-systems", response_model=SizingSystem)
async def create_sizing_system(payload: SizingSystemPayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    sizes = [s.strip() for s in (payload.sizes or []) if s and s.strip()]
    if not sizes:
        raise HTTPException(status_code=400, detail="At least one size required")
    existing = await db.sizing_systems.find_one({"name": name})
    if existing:
        raise HTTPException(status_code=409, detail="Sizing system already exists")
    doc = {"id": str(uuid.uuid4()), "name": name, "sizes": sizes, "created_at": _now_iso()}
    await db.sizing_systems.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/sizing-systems/{system_id}", response_model=SizingSystem)
async def update_sizing_system(system_id: str, payload: SizingSystemPayload):
    doc = await db.sizing_systems.find_one({"id": system_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sizing system not found")
    name = payload.name.strip()
    sizes = [s.strip() for s in (payload.sizes or []) if s and s.strip()]
    if not name or not sizes:
        raise HTTPException(status_code=400, detail="Name and at least one size required")
    await db.sizing_systems.update_one(
        {"id": system_id}, {"$set": {"name": name, "sizes": sizes}}
    )
    updated = await db.sizing_systems.find_one({"id": system_id}, {"_id": 0})
    return updated


@api_router.delete("/sizing-systems/{system_id}")
async def delete_sizing_system(system_id: str):
    doc = await db.sizing_systems.find_one({"id": system_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sizing system not found")
    in_use = await db.costumes.count_documents({"sizing_system": doc["name"]})
    if in_use > 0:
        raise HTTPException(status_code=409, detail=f"Sizing system is used by {in_use} costume(s)")
    await db.sizing_systems.delete_one({"id": system_id})
    return {"ok": True}


# --------- Inventory Groups Routes ---------
@api_router.get("/groups")
async def list_groups():
    docs = await db.groups.find({}, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    for d in docs:
        d["variant_count"] = await db.costumes.count_documents({"group_id": d["id"]})
    return docs


@api_router.post("/groups", response_model=InventoryGroup)
async def create_group(payload: GroupPayload):
    now = _now_iso()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name required")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "category": (payload.category or "").strip(),
        "subcategory": (payload.subcategory or "").strip(),
        "location": (payload.location or "").strip(),
        "sub_location": (payload.sub_location or "").strip(),
        "notes": (payload.notes or "").strip(),
        "keywords": [k.strip() for k in (payload.keywords or []) if k and k.strip()],
        "creator": (payload.creator or "").strip(),
        "original_show_id": payload.original_show_id,
        "additional_show_ids": list(payload.additional_show_ids or []),
        "image_id": payload.image_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.groups.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/groups/{group_id}")
async def get_group(group_id: str):
    doc = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Group not found")
    variants = await db.costumes.find({"group_id": group_id}, {"_id": 0}).sort("variant_label", 1).to_list(500)
    doc["variants"] = variants
    doc["variant_count"] = len(variants)
    doc["total_items"] = sum(v.get("total_quantity", 0) for v in variants)
    return doc


@api_router.put("/groups/{group_id}", response_model=InventoryGroup)
async def update_group(group_id: str, payload: GroupPayload):
    existing = await db.groups.find_one({"id": group_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Group not found")
    updates = {
        "name": payload.name.strip(),
        "category": (payload.category or "").strip(),
        "subcategory": (payload.subcategory or "").strip(),
        "location": (payload.location or "").strip(),
        "sub_location": (payload.sub_location or "").strip(),
        "notes": (payload.notes or "").strip(),
        "keywords": [k.strip() for k in (payload.keywords or []) if k and k.strip()],
        "creator": (payload.creator or "").strip(),
        "original_show_id": payload.original_show_id,
        "additional_show_ids": list(payload.additional_show_ids or []),
        "image_id": payload.image_id,
        "updated_at": _now_iso(),
    }
    await db.groups.update_one({"id": group_id}, {"$set": updates})
    doc = await db.groups.find_one({"id": group_id}, {"_id": 0})
    return doc


@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str):
    doc = await db.groups.find_one({"id": group_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.costumes.update_many({"group_id": group_id}, {"$set": {"group_id": None, "variant_label": ""}})
    await db.groups.delete_one({"id": group_id})
    return {"ok": True}


@api_router.get("/inventory")
async def list_inventory():
    """Return mixed feed: groups collapsed, plus ungrouped costumes."""
    groups = await db.groups.find({}, {"_id": 0}).to_list(2000)
    entries = []
    for g in groups:
        variants = await db.costumes.find({"group_id": g["id"]}, {"_id": 0}).to_list(500)
        entries.append({
            "type": "group",
            "id": g["id"],
            "name": g["name"],
            "category": g.get("category", ""),
            "subcategory": g.get("subcategory", ""),
            "location": g.get("location", ""),
            "sub_location": g.get("sub_location", ""),
            "image_id": g.get("image_id"),
            "keywords": g.get("keywords", []),
            "creator": g.get("creator", ""),
            "variant_count": len(variants),
            "total_items": sum(v.get("total_quantity", 0) for v in variants),
            "updated_at": g.get("updated_at", ""),
        })
    ungrouped = await db.costumes.find(
        {"$or": [{"group_id": None}, {"group_id": {"$exists": False}}]},
        {"_id": 0}
    ).to_list(2000)
    for c in ungrouped:
        entries.append({"type": "costume", **c})
    entries.sort(key=lambda e: e.get("updated_at", ""), reverse=True)
    return entries



# --------- Shows Routes ---------
@api_router.get("/shows", response_model=List[Show])
async def list_shows():
    docs = await db.shows.find({}, {"_id": 0}).to_list(1000)
    docs.sort(key=lambda d: (d.get("year") is None, d.get("year") or 0, (d.get("name") or "").lower()))
    return docs


@api_router.post("/shows", response_model=Show)
async def create_show(payload: ShowPayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    year = int(payload.year) if payload.year is not None else None
    dupe = await db.shows.find_one({"name": name, "year": year})
    if dupe:
        raise HTTPException(status_code=409, detail="Show already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "year": year,
        "image_id": payload.image_id,
        "notes": (payload.notes or "").strip(),
        "show_link": (payload.show_link or "").strip(),
        "created_at": _now_iso(),
    }
    await db.shows.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/shows/{show_id}", response_model=Show)
async def update_show(show_id: str, payload: ShowPayload):
    doc = await db.shows.find_one({"id": show_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Show not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    year = int(payload.year) if payload.year is not None else None
    dupe = await db.shows.find_one({"name": name, "year": year, "id": {"$ne": show_id}})
    if dupe:
        raise HTTPException(status_code=409, detail="Another show with that name+year already exists")
    updates = {
        "name": name,
        "year": year,
        "image_id": payload.image_id,
        "notes": (payload.notes or "").strip(),
        "show_link": (payload.show_link or "").strip(),
    }
    await db.shows.update_one({"id": show_id}, {"$set": updates})
    await db.costumes.update_many(
        {"original_show_id": show_id},
        {"$set": {"origin_year": year, "updated_at": _now_iso()}}
    )
    updated = await db.shows.find_one({"id": show_id}, {"_id": 0})
    return updated


@api_router.delete("/shows/{show_id}")
async def delete_show(show_id: str):
    doc = await db.shows.find_one({"id": show_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Show not found")
    used_original = await db.costumes.count_documents({"original_show_id": show_id})
    used_additional = await db.costumes.count_documents({"additional_show_ids": show_id})
    if used_original + used_additional > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Show is used by {used_original + used_additional} costume(s)"
        )
    await db.shows.delete_one({"id": show_id})
    return {"ok": True}


# --------- Settings Routes ---------
@api_router.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"id": "app"}, {"_id": 0})
    if not doc:
        doc = {
            "id": "app",
            "org_name": "LUXE",
            "logo_image_id": None,
            "default_view": "grid",
            "show_flag_banner": True,
        }
        await db.settings.insert_one(doc)
        doc.pop("_id", None)
    doc.setdefault("org_name", "LUXE")
    doc.setdefault("logo_image_id", None)
    doc.setdefault("default_view", "grid")
    doc.setdefault("show_flag_banner", True)
    return doc


class SettingsUpdate(BaseModel):
    org_name: Optional[str] = None
    logo_image_id: Optional[str] = None
    default_view: Optional[str] = None
    show_flag_banner: Optional[bool] = None


@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "default_view" in updates and updates["default_view"] not in ("grid", "list"):
        raise HTTPException(status_code=400, detail="default_view must be 'grid' or 'list'")
    if "logo_image_id" in updates and updates["logo_image_id"] == "":
        updates["logo_image_id"] = None
    await db.settings.update_one({"id": "app"}, {"$set": updates}, upsert=True)
    doc = await db.settings.find_one({"id": "app"}, {"_id": 0})
    return doc


@api_router.get("/flagged", response_model=List[Costume])
async def list_flagged():
    docs = await db.costumes.find({"is_flagged": True}, {"_id": 0}).sort("flagged_at", -1).to_list(1000)
    return docs


# --------- Flag Category Routes ---------
DEFAULT_FLAG_CATEGORY_COLORS = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"]


@api_router.get("/flag-categories", response_model=List[FlagCategory])
async def list_flag_categories():
    docs = await db.flag_categories.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    for d in docs:
        d.setdefault("color", "#EF4444")
    return docs


@api_router.post("/flag-categories", response_model=FlagCategory)
async def create_flag_category(payload: FlagCategoryPayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    dupe = await db.flag_categories.find_one({"name": name})
    if dupe:
        raise HTTPException(status_code=409, detail="Flag category already exists")
    color = (payload.color or "#EF4444").strip() or "#EF4444"
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "color": color,
        "created_at": _now_iso(),
    }
    await db.flag_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/flag-categories/{fc_id}", response_model=FlagCategory)
async def update_flag_category(fc_id: str, payload: FlagCategoryPayload):
    doc = await db.flag_categories.find_one({"id": fc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Flag category not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    dupe = await db.flag_categories.find_one({"name": name, "id": {"$ne": fc_id}})
    if dupe:
        raise HTTPException(status_code=409, detail="Another flag category has that name")
    color = (payload.color or "#EF4444").strip() or "#EF4444"
    await db.flag_categories.update_one({"id": fc_id}, {"$set": {"name": name, "color": color}})
    updated = await db.flag_categories.find_one({"id": fc_id}, {"_id": 0})
    return updated


@api_router.delete("/flag-categories/{fc_id}")
async def delete_flag_category(fc_id: str):
    doc = await db.flag_categories.find_one({"id": fc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Flag category not found")
    # Remove this flag from every costume
    await db.costumes.update_many(
        {"flags.category_id": fc_id},
        {"$pull": {"flags": {"category_id": fc_id}}}
    )
    # Refresh is_flagged based on remaining flags for affected costumes
    async for c in db.costumes.find({"flags": {"$size": 0}, "is_flagged": True}, {"id": 1}):
        await db.costumes.update_one({"id": c["id"]}, {"$set": {"is_flagged": False, "flag_reason": "", "flagged_at": None}})
    await db.flag_categories.delete_one({"id": fc_id})
    return {"ok": True}


@api_router.get("/flag-categories/{fc_id}/costumes", response_model=List[Costume])
async def list_costumes_by_flag_category(fc_id: str):
    docs = await db.costumes.find({"flags.category_id": fc_id}, {"_id": 0}).sort("flagged_at", -1).to_list(1000)
    return docs


@api_router.post("/costumes/{costume_id}/flags", response_model=Costume)
async def attach_flag(costume_id: str, payload: AttachFlagPayload):
    costume = await db.costumes.find_one({"id": costume_id})
    if not costume:
        raise HTTPException(status_code=404, detail="Costume not found")
    fc = await db.flag_categories.find_one({"id": payload.category_id})
    if not fc:
        raise HTTPException(status_code=404, detail="Flag category not found")
    now = _now_iso()
    new_flag = {
        "id": str(uuid.uuid4()),
        "category_id": payload.category_id,
        "note": (payload.note or "").strip(),
        "created_at": now,
    }
    flags = list(costume.get("flags") or [])
    flags.append(new_flag)
    reason = " · ".join([f["note"] for f in flags if f.get("note")])
    await db.costumes.update_one(
        {"id": costume_id},
        {"$set": {
            "flags": flags,
            "is_flagged": True,
            "flag_reason": reason,
            "flagged_at": now,
            "updated_at": now,
        }},
    )
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    return doc


@api_router.put("/costumes/{costume_id}/flags/{flag_id}", response_model=Costume)
async def update_costume_flag(costume_id: str, flag_id: str, payload: UpdateFlagPayload):
    costume = await db.costumes.find_one({"id": costume_id})
    if not costume:
        raise HTTPException(status_code=404, detail="Costume not found")
    flags = list(costume.get("flags") or [])
    found = False
    for f in flags:
        if f.get("id") == flag_id:
            f["note"] = (payload.note or "").strip()
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Flag not found on this costume")
    reason = " · ".join([f["note"] for f in flags if f.get("note")])
    await db.costumes.update_one(
        {"id": costume_id},
        {"$set": {"flags": flags, "flag_reason": reason, "updated_at": _now_iso()}},
    )
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
    return doc


@api_router.delete("/costumes/{costume_id}/flags/{flag_id}", response_model=Costume)
async def detach_flag(costume_id: str, flag_id: str):
    costume = await db.costumes.find_one({"id": costume_id})
    if not costume:
        raise HTTPException(status_code=404, detail="Costume not found")
    flags = [f for f in (costume.get("flags") or []) if f.get("id") != flag_id]
    reason = " · ".join([f["note"] for f in flags if f.get("note")])
    updates = {
        "flags": flags,
        "flag_reason": reason,
        "updated_at": _now_iso(),
    }
    if not flags:
        updates["is_flagged"] = False
        updates["flagged_at"] = None
    await db.costumes.update_one({"id": costume_id}, {"$set": updates})
    doc = await db.costumes.find_one({"id": costume_id}, {"_id": 0})
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
        defaults = [
            ("Historical", "#8B5CF6"),
            ("Fantasy", "#EC4899"),
            ("Modern", "#3B82F6"),
            ("Period", "#F59E0B"),
            ("Children", "#10B981"),
            ("Animal", "#84CC16"),
            ("Uniform", "#0EA5E9"),
        ]
        for name, color in defaults:
            await db.categories.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "subcategories": [],
                "color": color,
                "created_at": _now_iso()
            })
    # Backfill color on existing categories
    await db.categories.update_many({"color": {"$exists": False}}, {"$set": {"color": "#71717A"}})
    # Seed default flag categories
    fc_count = await db.flag_categories.count_documents({})
    if fc_count == 0:
        defaults_fc = [("On Loan", "#F59E0B"), ("Needs Repair", "#EF4444"), ("In Cleaning", "#3B82F6")]
        for name, color in defaults_fc:
            await db.flag_categories.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "color": color,
                "created_at": _now_iso(),
            })
    # Seed default sizing systems
    sys_count = await db.sizing_systems.count_documents({})
    if sys_count == 0:
        for sys in DEFAULT_SIZING_SYSTEMS:
            await db.sizing_systems.insert_one({
                "id": str(uuid.uuid4()),
                "name": sys["name"],
                "sizes": sys["sizes"],
                "created_at": _now_iso(),
            })
    # Migration: ensure every location doc has parent_id field
    await db.locations.update_many({"parent_id": {"$exists": False}}, {"$set": {"parent_id": None}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
