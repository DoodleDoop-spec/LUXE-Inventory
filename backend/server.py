from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query, Response, Request, Cookie, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import secrets
import requests
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext


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


class CostumeShowEntry(BaseModel):
    """A single show a costume appears in, with an optional per-costume timestamp."""
    show_id: str
    timestamp: Optional[str] = ""


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
    note_image_ids: List[str] = Field(default_factory=list)
    sorting_system: Optional[str] = ""
    sizes: Dict[str, int] = Field(default_factory=dict)
    size_notes: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    creator: Optional[str] = ""
    buy_link: Optional[str] = ""
    shows: List[CostumeShowEntry] = Field(default_factory=list)
    group_id: Optional[str] = None
    variant_label: Optional[str] = ""
    in_use: Optional[bool] = False
    in_use_note: Optional[str] = ""
    current_show_id: Optional[str] = None
    pinned: Optional[bool] = False
    total_quantity_override: Optional[int] = None  # used when sorting_system is blank


class CostumeCreate(CostumeBase):
    image_id: Optional[str] = None
    is_flagged: Optional[bool] = False
    flag_reason: Optional[str] = ""
    flags: Optional[List[Dict]] = None
    # Legacy field names — accepted for backward compatibility
    sizing_system: Optional[str] = None


class CostumeUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    location: Optional[str] = None
    sub_location: Optional[str] = None
    notes: Optional[str] = None
    note_image_ids: Optional[List[str]] = None
    sorting_system: Optional[str] = None
    sizing_system: Optional[str] = None  # legacy alias
    sizes: Optional[Dict[str, int]] = None
    size_notes: Optional[Dict[str, str]] = None
    keywords: Optional[List[str]] = None
    creator: Optional[str] = None
    buy_link: Optional[str] = None
    shows: Optional[List[CostumeShowEntry]] = None
    image_id: Optional[str] = None
    is_flagged: Optional[bool] = None
    flag_reason: Optional[str] = None
    flags: Optional[List[Dict]] = None
    group_id: Optional[str] = None
    variant_label: Optional[str] = None
    in_use: Optional[bool] = None
    in_use_note: Optional[str] = None
    current_show_id: Optional[str] = None
    pinned: Optional[bool] = None
    total_quantity_override: Optional[int] = None


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
    image_ids: Optional[List[str]] = None


class UpdateFlagPayload(BaseModel):
    note: Optional[str] = ""
    image_ids: Optional[List[str]] = None


class Costume(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category: str
    subcategory: str = ""
    location: str
    sub_location: str = ""
    notes: str = ""
    note_image_ids: List[str] = Field(default_factory=list)
    sorting_system: str = ""
    sizes: Dict[str, int]
    size_notes: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    creator: str = ""
    buy_link: str = ""
    shows: List[CostumeShowEntry] = Field(default_factory=list)
    origin_year: Optional[int] = None
    total_quantity: int
    image_id: Optional[str] = None
    is_flagged: bool = False
    flag_reason: str = ""
    flagged_at: Optional[str] = None
    flags: List[Dict] = Field(default_factory=list)
    in_use: bool = False
    in_use_note: str = ""
    in_use_since: Optional[str] = None
    current_show_id: Optional[str] = None
    pinned: bool = False
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
    is_live: bool = False
    created_at: str


class ShowPayload(BaseModel):
    name: str
    year: Optional[int] = None
    image_id: Optional[str] = None
    notes: Optional[str] = ""
    show_link: Optional[str] = ""
    is_live: Optional[bool] = None


class SubcategoryPayload(BaseModel):
    name: str
    parent_id: Optional[str] = None
    image_id: Optional[str] = None
    location: Optional[str] = None
    sub_location: Optional[str] = None
    notes: Optional[str] = None
    keywords: Optional[List[str]] = None


class SubcategoryRename(BaseModel):
    name: Optional[str] = None
    image_id: Optional[str] = None
    location: Optional[str] = None
    sub_location: Optional[str] = None
    notes: Optional[str] = None
    keywords: Optional[List[str]] = None


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
    """Migrate flat list of strings → list of dicts with id/name/parent_id and group-like fields."""
    out = []
    for s in subs or []:
        if isinstance(s, str):
            out.append({
                "id": str(uuid.uuid4()),
                "name": s,
                "parent_id": None,
                "image_id": None,
                "location": "",
                "sub_location": "",
                "notes": "",
                "keywords": [],
            })
        elif isinstance(s, dict):
            out.append({
                "id": s.get("id") or str(uuid.uuid4()),
                "name": s.get("name", ""),
                "parent_id": s.get("parent_id"),
                "image_id": s.get("image_id"),
                "location": s.get("location", "") or "",
                "sub_location": s.get("sub_location", "") or "",
                "notes": s.get("notes", "") or "",
                "keywords": list(s.get("keywords") or []),
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
    total_shows = await db.shows.count_documents({})
    total_locations = await db.locations.count_documents({})
    equipment_count = await db.equipment.count_documents({})
    return {
        "total_costumes": total_costumes,
        "total_items": total_items,
        "categories": categories,
        "category_count": len(categories),
        "locations_in_use": locations_in_use,
        "flagged_count": sum(1 for c in costumes if c.get("is_flagged")),
        "in_use_count": sum(1 for c in costumes if c.get("in_use")),
        "total_shows": total_shows,
        "total_locations": total_locations,
        "equipment_count": equipment_count,
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
        # Accept both legacy 'sizing_system' and new 'sorting_system' fields for filtering
        query["$or"] = query.get("$or", []) + [
            {"sorting_system": sizing_system},
            {"sizing_system": sizing_system},
        ]
    if year is not None:
        query["origin_year"] = year
    if show_id:
        query["$and"] = query.get("$and", []) + [{
            "$or": [
                {"shows.show_id": show_id},
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


async def _resolve_origin_year_from_shows(shows: List) -> Optional[int]:
    """Return the earliest year across a costume's shows list, if any."""
    if not shows:
        return None
    show_ids = []
    for s in shows:
        if isinstance(s, dict):
            sid = s.get("show_id")
        else:
            sid = getattr(s, "show_id", None)
        if sid:
            show_ids.append(sid)
    if not show_ids:
        return None
    docs = await db.shows.find({"id": {"$in": show_ids}}, {"_id": 0, "year": 1}).to_list(200)
    years = [int(d["year"]) for d in docs if d.get("year") is not None]
    return min(years) if years else None


def _normalize_costume_shows(raw) -> List[Dict]:
    out = []
    seen = set()
    for s in raw or []:
        if isinstance(s, dict):
            sid = s.get("show_id")
            ts = (s.get("timestamp") or "").strip()
        else:
            sid = getattr(s, "show_id", None)
            ts = (getattr(s, "timestamp", "") or "").strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        out.append({"show_id": sid, "timestamp": ts})
    return out


async def _enforce_current_show_cap(new_show_id: Optional[str], exclude_id: Optional[str] = None, cap: int = 2) -> None:
    """Ensure there are no more than `cap` distinct current_show_ids among in-use costumes.
    Raises HTTPException(409) if adding new_show_id would exceed the cap."""
    if not new_show_id:
        return
    q = {"in_use": True, "current_show_id": {"$ne": None}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    docs = await db.costumes.find(q, {"_id": 0, "current_show_id": 1}).to_list(2000)
    distinct = {d.get("current_show_id") for d in docs if d.get("current_show_id")}
    distinct.add(new_show_id)
    if len(distinct) > cap:
        raise HTTPException(
            status_code=409,
            detail=f"You can only have {cap} shows actively running at once. Clear a current show first."
        )


@api_router.post("/costumes", response_model=Costume)
async def create_costume(payload: CostumeCreate):
    now = _now_iso()
    sizes = {str(k): int(v or 0) for k, v in (payload.sizes or {}).items()}
    size_notes = {str(k): str(v or "") for k, v in (payload.size_notes or {}).items()}
    keywords = [k.strip() for k in (payload.keywords or []) if k and k.strip()]
    shows_list = _normalize_costume_shows(payload.shows)
    origin_year = await _resolve_origin_year_from_shows(shows_list)
    # sorting_system with legacy alias fallback; blank means "no sorting system → single total"
    sorting_system = (payload.sorting_system if payload.sorting_system is not None
                      else (payload.sizing_system if payload.sizing_system is not None else "")).strip()
    # Compute total_quantity: if a sorting system is set, sum sizes; otherwise use override or 0
    if sorting_system:
        total_qty = _compute_total(sizes)
    else:
        total_qty = int(payload.total_quantity_override or 0)
    current_show_id = payload.current_show_id if (payload.in_use and payload.current_show_id) else None
    if current_show_id:
        await _enforce_current_show_cap(current_show_id)
    # Normalize flags list
    flags = []
    for f in (payload.flags or []):
        if not isinstance(f, dict) or not f.get("category_id"):
            continue
        flags.append({
            "id": f.get("id") or str(uuid.uuid4()),
            "category_id": f["category_id"],
            "note": (f.get("note") or "").strip(),
            "image_ids": [str(x) for x in (f.get("image_ids") or []) if x],
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
        "note_image_ids": [str(x) for x in (payload.note_image_ids or []) if x],
        "sorting_system": sorting_system,
        "sizes": sizes,
        "size_notes": size_notes,
        "keywords": keywords,
        "creator": (payload.creator or "").strip(),
        "buy_link": (payload.buy_link or "").strip(),
        "shows": shows_list,
        "origin_year": origin_year,
        "total_quantity": total_qty,
        "image_id": payload.image_id,
        "is_flagged": is_flagged,
        "flag_reason": flag_reason,
        "flagged_at": now if is_flagged else None,
        "flags": flags,
        "in_use": bool(payload.in_use),
        "in_use_note": (payload.in_use_note or "").strip() if payload.in_use else "",
        "in_use_since": now if payload.in_use else None,
        "current_show_id": current_show_id,
        "pinned": bool(payload.pinned),
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
        # only auto-compute total when a sorting system is (still) in effect
        eff_sys = updates.get("sorting_system", existing.get("sorting_system", ""))
        if eff_sys:
            updates["total_quantity"] = _compute_total(sizes)
    if "total_quantity_override" in updates:
        # explicit total override — used when there's no sorting system
        override = int(updates.pop("total_quantity_override") or 0)
        eff_sys = updates.get("sorting_system", existing.get("sorting_system", ""))
        if not eff_sys:
            updates["total_quantity"] = override
    if "sorting_system" in updates and not updates["sorting_system"]:
        # switching to no-sorting-system: clear sizes
        updates["sizes"] = {}
        updates["size_notes"] = {}
    if "current_show_id" in updates:
        # enforce cap
        cs = updates["current_show_id"]
        in_use_effective = updates.get("in_use", existing.get("in_use", False))
        if cs and in_use_effective:
            await _enforce_current_show_cap(cs, exclude_id=costume_id)
        else:
            updates["current_show_id"] = None
    if "size_notes" in updates:
        updates["size_notes"] = {str(k): str(v or "") for k, v in (updates["size_notes"] or {}).items()}
    if "keywords" in updates:
        updates["keywords"] = [k.strip() for k in (updates["keywords"] or []) if k and k.strip()]
    # Legacy field alias: sizing_system -> sorting_system
    if "sizing_system" in updates and "sorting_system" not in updates:
        updates["sorting_system"] = updates["sizing_system"]
    updates.pop("sizing_system", None)
    # Normalize new shows list, recompute origin_year
    if "shows" in updates:
        updates["shows"] = _normalize_costume_shows(updates["shows"])
        updates["origin_year"] = await _resolve_origin_year_from_shows(updates["shows"])
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
                "image_ids": [str(x) for x in (f.get("image_ids") or []) if x],
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
    if "in_use" in updates:
        if updates["in_use"]:
            if not existing.get("in_use"):
                updates["in_use_since"] = _now_iso()
        else:
            updates["in_use_since"] = None
            updates["current_show_id"] = None
            if "in_use_note" not in updates:
                updates["in_use_note"] = ""
    if "note_image_ids" in updates:
        updates["note_image_ids"] = [str(x) for x in (updates["note_image_ids"] or []) if x]
    updates["updated_at"] = _now_iso()
    await db.costumes.update_one({"id": costume_id}, {"$set": updates})
    # If the location/sub-location changed, detach this costume from any map pins/shapes
    old_loc = existing.get("location") or ""
    old_sub = existing.get("sub_location") or ""
    new_loc = updates.get("location", old_loc)
    new_sub = updates.get("sub_location", old_sub)
    if ("location" in updates and new_loc != old_loc) or ("sub_location" in updates and new_sub != old_sub):
        await _detach_item_from_all_maps(costume_id)
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
    await _detach_item_from_all_maps(costume_id)
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
        d.setdefault("image_id", None)
        d.setdefault("location", "")
        d.setdefault("sub_location", "")
        d.setdefault("notes", "")
        d.setdefault("keywords", [])
        d.setdefault("creator", "")
    existing = {d["name"] for d in docs}
    used = await db.costumes.distinct("category")
    for u in used:
        if u and u not in existing:
            new_id = str(uuid.uuid4())
            new_doc = {"id": new_id, "name": u, "subcategories": [], "color": "#71717A", "image_id": None, "location": "", "sub_location": "", "notes": "", "keywords": [], "creator": "", "created_at": _now_iso()}
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
    image_id: Optional[str] = None
    location: Optional[str] = None
    sub_location: Optional[str] = None
    notes: Optional[str] = None
    keywords: Optional[List[str]] = None
    creator: Optional[str] = None


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
    if payload.image_id is not None:
        updates["image_id"] = payload.image_id or None
    if payload.location is not None:
        updates["location"] = payload.location.strip()
    if payload.sub_location is not None:
        updates["sub_location"] = payload.sub_location.strip()
    if payload.notes is not None:
        updates["notes"] = payload.notes.strip()
    if payload.keywords is not None:
        updates["keywords"] = [k.strip() for k in payload.keywords if k and k.strip()]
    if payload.creator is not None:
        updates["creator"] = payload.creator.strip()
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
    subs.append({
        "id": str(uuid.uuid4()),
        "name": name,
        "parent_id": parent_id,
        "image_id": payload.image_id,
        "location": (payload.location or "").strip(),
        "sub_location": (payload.sub_location or "").strip(),
        "notes": (payload.notes or "").strip(),
        "keywords": [k.strip() for k in (payload.keywords or []) if k and k.strip()],
    })
    await db.categories.update_one({"id": category_id}, {"$set": {"subcategories": subs}})
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    updated["subcategories"] = _normalize_subcategories(updated.get("subcategories"))
    return updated


@api_router.put("/categories/{category_id}/subcategories/{sub_id}")
async def rename_subcategory(category_id: str, sub_id: str, payload: SubcategoryRename):
    doc = await db.categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    subs = _normalize_subcategories(doc.get("subcategories"))
    target = next((s for s in subs if s["id"] == sub_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name or "/" in name:
            raise HTTPException(status_code=400, detail="Invalid name")
        if any(s["id"] != sub_id and s["name"].lower() == name.lower() and s.get("parent_id") == target.get("parent_id") for s in subs):
            raise HTTPException(status_code=409, detail="Sibling with that name already exists")
        target["name"] = name
    if payload.image_id is not None:
        target["image_id"] = payload.image_id or None
    if payload.location is not None:
        target["location"] = payload.location.strip()
    if payload.sub_location is not None:
        target["sub_location"] = payload.sub_location.strip()
    if payload.notes is not None:
        target["notes"] = payload.notes.strip()
    if payload.keywords is not None:
        target["keywords"] = [k.strip() for k in payload.keywords if k and k.strip()]
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


class CategoryMergePayload(BaseModel):
    keeper_id: str
    discard_id: str


@api_router.post("/categories/merge")
async def merge_categories(payload: CategoryMergePayload):
    if payload.keeper_id == payload.discard_id:
        raise HTTPException(status_code=400, detail="Cannot merge a category into itself")
    keeper = await db.categories.find_one({"id": payload.keeper_id})
    discard = await db.categories.find_one({"id": payload.discard_id})
    if not keeper or not discard:
        raise HTTPException(status_code=404, detail="Category not found")
    # Move all costumes from discard to keeper (clear subcategory since taxonomies differ)
    moved = await db.costumes.update_many(
        {"category": discard["name"]},
        {"$set": {"category": keeper["name"], "subcategory": "", "updated_at": _now_iso()}}
    )
    # Delete the discard category
    await db.categories.delete_one({"id": payload.discard_id})
    return {
        "ok": True,
        "keeper": keeper["name"],
        "discarded": discard["name"],
        "moved": moved.modified_count,
    }


@api_router.get("/categories/similar")
async def similar_categories(name: str, threshold: float = 0.6):
    """Return existing categories whose name is similar to the given name (case-insensitive)."""
    import difflib
    target = name.strip().lower()
    if not target:
        return []
    docs = await db.categories.find({}, {"_id": 0}).to_list(500)
    results = []
    for d in docs:
        ratio = difflib.SequenceMatcher(None, target, d["name"].lower()).ratio()
        if ratio >= threshold and d["name"].lower() != target:
            results.append({"id": d["id"], "name": d["name"], "color": d.get("color", "#71717A"), "similarity": round(ratio, 2)})
    results.sort(key=lambda x: -x["similarity"])
    return results[:5]


# --------- Sizing Systems Routes ---------
@api_router.get("/sizing-systems", response_model=List[SizingSystem])
async def list_sizing_systems():
    docs = await db.sizing_systems.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return docs


# --- Sorting Systems (new name for the same concept) ---
@api_router.get("/sorting-systems", response_model=List[SizingSystem])
async def list_sorting_systems():
    return await list_sizing_systems()


@api_router.post("/sorting-systems", response_model=SizingSystem)
async def create_sorting_system(payload: SizingSystemPayload):
    return await create_sizing_system(payload)


@api_router.put("/sorting-systems/{system_id}", response_model=SizingSystem)
async def update_sorting_system(system_id: str, payload: SizingSystemPayload):
    return await update_sizing_system(system_id, payload)


@api_router.delete("/sorting-systems/{system_id}")
async def delete_sorting_system(system_id: str):
    return await delete_sizing_system(system_id)


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
    in_use = await db.costumes.count_documents({
        "$or": [{"sorting_system": doc["name"]}, {"sizing_system": doc["name"]}]
    })
    if in_use > 0:
        raise HTTPException(status_code=409, detail=f"Sorting system is used by {in_use} costume(s)")
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
    for d in docs:
        d.setdefault("is_live", False)
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
        "is_live": bool(payload.is_live) if payload.is_live is not None else False,
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
    was_live = bool(doc.get("is_live", False))
    if payload.is_live is not None:
        updates["is_live"] = bool(payload.is_live)
    await db.shows.update_one({"id": show_id}, {"$set": updates})
    # Recompute origin_year for any costume that references this show
    if year is not None:
        affected = await db.costumes.find({"shows.show_id": show_id}, {"_id": 0, "id": 1, "shows": 1}).to_list(2000)
        for c in affected:
            ny = await _resolve_origin_year_from_shows(c.get("shows") or [])
            await db.costumes.update_one({"id": c["id"]}, {"$set": {"origin_year": ny, "updated_at": _now_iso()}})
    # Live-toggle side effects: propagate to attached costumes
    if payload.is_live is not None and bool(payload.is_live) != was_live:
        now = _now_iso()
        if bool(payload.is_live):
            # Turning ON: mark all costumes attached to this show as in-use with current_show_id
            await db.costumes.update_many(
                {"shows.show_id": show_id},
                {"$set": {"in_use": True, "in_use_since": now, "current_show_id": show_id, "updated_at": now}}
            )
        else:
            # Turning OFF: clear current_show_id + in_use flag ONLY for costumes currently tagged to this show
            await db.costumes.update_many(
                {"current_show_id": show_id},
                {"$set": {"in_use": False, "in_use_since": None, "current_show_id": None, "in_use_note": "", "updated_at": now}}
            )
    updated = await db.shows.find_one({"id": show_id}, {"_id": 0})
    updated.setdefault("is_live", False)
    return updated


@api_router.delete("/shows/{show_id}")
async def delete_show(show_id: str):
    doc = await db.shows.find_one({"id": show_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Show not found")
    in_use = await db.costumes.count_documents({"shows.show_id": show_id})
    legacy = await db.costumes.count_documents({
        "$or": [{"original_show_id": show_id}, {"additional_show_ids": show_id}]
    })
    total = in_use + legacy
    if total > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Show is used by {total} costume(s)"
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
            "hide_in_use_mode": "full",
        }
        await db.settings.insert_one(doc)
        doc.pop("_id", None)
    doc.setdefault("org_name", "LUXE")
    doc.setdefault("logo_image_id", None)
    doc.setdefault("default_view", "grid")
    doc.setdefault("show_flag_banner", True)
    doc.setdefault("hide_in_use_mode", "full")
    return doc


class SettingsUpdate(BaseModel):
    org_name: Optional[str] = None
    logo_image_id: Optional[str] = None
    default_view: Optional[str] = None
    show_flag_banner: Optional[bool] = None
    hide_in_use_mode: Optional[str] = None


@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "default_view" in updates and updates["default_view"] not in ("grid", "list"):
        raise HTTPException(status_code=400, detail="default_view must be 'grid' or 'list'")
    if "hide_in_use_mode" in updates and updates["hide_in_use_mode"] not in ("full", "hide_marker", "hide_all"):
        raise HTTPException(status_code=400, detail="hide_in_use_mode must be 'full', 'hide_marker', or 'hide_all'")
    if "logo_image_id" in updates and updates["logo_image_id"] == "":
        updates["logo_image_id"] = None
    await db.settings.update_one({"id": "app"}, {"$set": updates}, upsert=True)
    doc = await db.settings.find_one({"id": "app"}, {"_id": 0})
    return doc


@api_router.get("/pinned", response_model=List[Costume])
async def list_pinned():
    docs = await db.costumes.find({"pinned": True}, {"_id": 0}).sort("updated_at", -1).to_list(50)
    return docs


@api_router.get("/flagged", response_model=List[Costume])
async def list_flagged():
    docs = await db.costumes.find({"is_flagged": True}, {"_id": 0}).sort("flagged_at", -1).to_list(1000)
    return docs


@api_router.get("/in-use", response_model=List[Costume])
async def list_in_use():
    docs = await db.costumes.find({"in_use": True}, {"_id": 0}).sort("in_use_since", -1).to_list(1000)
    return docs


@api_router.post("/admin/migrate-legacy-flags")
async def migrate_legacy_flags():
    """
    Convert costumes that are is_flagged=True but have an empty flags array
    into the flags-array format under an auto-created 'Legacy' flag category.
    """
    legacy_cat = await db.flag_categories.find_one({"name": "Legacy"})
    if not legacy_cat:
        legacy_cat = {
            "id": str(uuid.uuid4()),
            "name": "Legacy",
            "color": "#71717A",
            "created_at": _now_iso(),
        }
        await db.flag_categories.insert_one(dict(legacy_cat))
    migrated = 0
    cursor = db.costumes.find({"is_flagged": True, "$or": [{"flags": {"$exists": False}}, {"flags": {"$size": 0}}]}, {"_id": 0})
    async for c in cursor:
        now = _now_iso()
        new_flag = {
            "id": str(uuid.uuid4()),
            "category_id": legacy_cat["id"],
            "note": (c.get("flag_reason") or "").strip(),
            "image_ids": [],
            "created_at": c.get("flagged_at") or now,
        }
        await db.costumes.update_one(
            {"id": c["id"]},
            {"$set": {"flags": [new_flag], "updated_at": now}},
        )
        migrated += 1
    return {"ok": True, "migrated": migrated, "legacy_category_id": legacy_cat["id"]}


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
        "image_ids": [str(x) for x in (payload.image_ids or []) if x],
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
            if payload.image_ids is not None:
                f["image_ids"] = [str(x) for x in payload.image_ids if x]
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


# ==================== EQUIPMENT ====================
# Equipment is a lightweight sibling to costumes: same feature set minus shows.
# It has its OWN categories collection and sorting systems collection for full isolation.

class EquipmentBase(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = ""
    location: str
    sub_location: Optional[str] = ""
    notes: Optional[str] = ""
    note_image_ids: List[str] = Field(default_factory=list)
    sorting_system: Optional[str] = ""
    sizes: Dict[str, int] = Field(default_factory=dict)
    size_notes: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    creator: Optional[str] = ""
    buy_link: Optional[str] = ""
    in_use: Optional[bool] = False
    in_use_note: Optional[str] = ""
    pinned: Optional[bool] = False
    total_quantity_override: Optional[int] = None


class EquipmentCreate(EquipmentBase):
    image_id: Optional[str] = None
    is_flagged: Optional[bool] = False
    flag_reason: Optional[str] = ""
    flags: Optional[List[Dict]] = None


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    location: Optional[str] = None
    sub_location: Optional[str] = None
    notes: Optional[str] = None
    note_image_ids: Optional[List[str]] = None
    sorting_system: Optional[str] = None
    sizes: Optional[Dict[str, int]] = None
    size_notes: Optional[Dict[str, str]] = None
    keywords: Optional[List[str]] = None
    creator: Optional[str] = None
    buy_link: Optional[str] = None
    image_id: Optional[str] = None
    is_flagged: Optional[bool] = None
    flag_reason: Optional[str] = None
    flags: Optional[List[Dict]] = None
    in_use: Optional[bool] = None
    in_use_note: Optional[str] = None
    pinned: Optional[bool] = None
    total_quantity_override: Optional[int] = None


class Equipment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category: str
    subcategory: str = ""
    location: str
    sub_location: str = ""
    notes: str = ""
    note_image_ids: List[str] = Field(default_factory=list)
    sorting_system: str = ""
    sizes: Dict[str, int]
    size_notes: Dict[str, str] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)
    creator: str = ""
    buy_link: str = ""
    total_quantity: int
    image_id: Optional[str] = None
    is_flagged: bool = False
    flag_reason: str = ""
    flagged_at: Optional[str] = None
    flags: List[Dict] = Field(default_factory=list)
    in_use: bool = False
    in_use_note: str = ""
    in_use_since: Optional[str] = None
    pinned: bool = False
    created_at: str
    updated_at: str


# ---- Equipment Categories ----
@api_router.get("/equipment-categories")
async def list_equipment_categories():
    docs = await db.equipment_categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    for d in docs:
        d["subcategories"] = _normalize_subcategories(d.get("subcategories"))
        d.setdefault("color", "#71717A")
    return docs


@api_router.post("/equipment-categories")
async def create_equipment_category(payload: LocationCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    dupe = await db.equipment_categories.find_one({"name": name})
    if dupe:
        raise HTTPException(status_code=409, detail="Category already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "subcategories": [],
        "color": "#71717A",
        "created_at": _now_iso(),
    }
    await db.equipment_categories.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/equipment-categories/{category_id}")
async def update_equipment_category(category_id: str, payload: CategoryUpdate):
    doc = await db.equipment_categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = {}
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name required")
        if new_name != doc.get("name"):
            dupe = await db.equipment_categories.find_one({"name": new_name, "id": {"$ne": category_id}})
            if dupe:
                raise HTTPException(status_code=409, detail="Another category has that name")
            await db.equipment.update_many({"category": doc["name"]}, {"$set": {"category": new_name}})
            updates["name"] = new_name
    if payload.color is not None:
        updates["color"] = payload.color.strip() or "#71717A"
    if updates:
        await db.equipment_categories.update_one({"id": category_id}, {"$set": updates})
    return await db.equipment_categories.find_one({"id": category_id}, {"_id": 0})


@api_router.delete("/equipment-categories/{category_id}")
async def delete_equipment_category(category_id: str):
    doc = await db.equipment_categories.find_one({"id": category_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Category not found")
    in_use = await db.equipment.count_documents({"category": doc["name"]})
    if in_use > 0:
        raise HTTPException(status_code=409, detail=f"Category is used by {in_use} equipment item(s)")
    await db.equipment_categories.delete_one({"id": category_id})
    return {"ok": True}


# ---- Equipment Sorting Systems ----
@api_router.get("/equipment-sorting-systems")
async def list_equipment_sorting_systems():
    docs = await db.equipment_sorting_systems.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return docs


@api_router.post("/equipment-sorting-systems")
async def create_equipment_sorting_system(payload: SizingSystemPayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    sizes = [s.strip() for s in (payload.sizes or []) if s and s.strip()]
    if not sizes:
        raise HTTPException(status_code=400, detail="At least one value required")
    dupe = await db.equipment_sorting_systems.find_one({"name": name})
    if dupe:
        raise HTTPException(status_code=409, detail="System already exists")
    doc = {"id": str(uuid.uuid4()), "name": name, "sizes": sizes, "created_at": _now_iso()}
    await db.equipment_sorting_systems.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/equipment-sorting-systems/{system_id}")
async def update_equipment_sorting_system(system_id: str, payload: SizingSystemPayload):
    doc = await db.equipment_sorting_systems.find_one({"id": system_id})
    if not doc:
        raise HTTPException(status_code=404, detail="System not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    sizes = [s.strip() for s in (payload.sizes or []) if s and s.strip()]
    if not sizes:
        raise HTTPException(status_code=400, detail="At least one value required")
    if name != doc.get("name"):
        await db.equipment.update_many({"sorting_system": doc["name"]}, {"$set": {"sorting_system": name}})
    await db.equipment_sorting_systems.update_one({"id": system_id}, {"$set": {"name": name, "sizes": sizes}})
    return await db.equipment_sorting_systems.find_one({"id": system_id}, {"_id": 0})


@api_router.delete("/equipment-sorting-systems/{system_id}")
async def delete_equipment_sorting_system(system_id: str):
    doc = await db.equipment_sorting_systems.find_one({"id": system_id})
    if not doc:
        raise HTTPException(status_code=404, detail="System not found")
    in_use = await db.equipment.count_documents({"sorting_system": doc["name"]})
    if in_use > 0:
        raise HTTPException(status_code=409, detail=f"Sorting system is used by {in_use} equipment item(s)")
    await db.equipment_sorting_systems.delete_one({"id": system_id})
    return {"ok": True}


# ---- Equipment CRUD ----
@api_router.get("/equipment", response_model=List[Equipment])
async def list_equipment(
    q: Optional[str] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    sort: Optional[str] = "recently_used",
):
    query: Dict[str, object] = {}
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"name": rx}, {"keywords": rx}, {"creator": rx}, {"notes": rx}]
    if category:
        query["category"] = category
    if location:
        query["location"] = location
    sort_map = {
        "recently_used": ("updated_at", -1),
        "created_desc": ("created_at", -1),
        "created_asc": ("created_at", 1),
        "name_asc": ("name", 1),
        "name_desc": ("name", -1),
        "quantity_desc": ("total_quantity", -1),
        "quantity_asc": ("total_quantity", 1),
    }
    field, direction = sort_map.get(sort or "recently_used", ("updated_at", -1))
    docs = await db.equipment.find(query, {"_id": 0}).sort(field, direction).to_list(5000)
    return docs


@api_router.get("/equipment-stats")
async def equipment_stats():
    docs = await db.equipment.find({}, {"_id": 0}).to_list(10000)
    total_items = sum(d.get("total_quantity", 0) for d in docs)
    return {
        "total_pieces": len(docs),
        "total_items": total_items,
        "in_use_count": sum(1 for d in docs if d.get("in_use")),
        "flagged_count": sum(1 for d in docs if d.get("is_flagged")),
    }


@api_router.get("/equipment/pinned", response_model=List[Equipment])
async def list_pinned_equipment():
    docs = await db.equipment.find({"pinned": True}, {"_id": 0}).sort("updated_at", -1).to_list(50)
    return docs


@api_router.get("/equipment/{equipment_id}", response_model=Equipment)
async def get_equipment(equipment_id: str):
    doc = await db.equipment.find_one({"id": equipment_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return doc


@api_router.post("/equipment", response_model=Equipment)
async def create_equipment(payload: EquipmentCreate):
    now = _now_iso()
    sizes = {str(k): int(v or 0) for k, v in (payload.sizes or {}).items()}
    size_notes = {str(k): str(v or "") for k, v in (payload.size_notes or {}).items()}
    keywords = [k.strip() for k in (payload.keywords or []) if k and k.strip()]
    sorting_system = (payload.sorting_system or "").strip()
    if sorting_system:
        total_qty = _compute_total(sizes)
    else:
        total_qty = int(payload.total_quantity_override or 0)
    flags = []
    for f in (payload.flags or []):
        if not isinstance(f, dict) or not f.get("category_id"):
            continue
        flags.append({
            "id": f.get("id") or str(uuid.uuid4()),
            "category_id": f["category_id"],
            "note": (f.get("note") or "").strip(),
            "image_ids": [str(x) for x in (f.get("image_ids") or []) if x],
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
        "note_image_ids": [str(x) for x in (payload.note_image_ids or []) if x],
        "sorting_system": sorting_system,
        "sizes": sizes,
        "size_notes": size_notes,
        "keywords": keywords,
        "creator": (payload.creator or "").strip(),
        "buy_link": (payload.buy_link or "").strip(),
        "total_quantity": total_qty,
        "image_id": payload.image_id,
        "is_flagged": is_flagged,
        "flag_reason": flag_reason,
        "flagged_at": now if is_flagged else None,
        "flags": flags,
        "in_use": bool(payload.in_use),
        "in_use_note": (payload.in_use_note or "").strip() if payload.in_use else "",
        "in_use_since": now if payload.in_use else None,
        "pinned": bool(payload.pinned),
        "created_at": now,
        "updated_at": now,
    }
    await db.equipment.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/equipment/{equipment_id}", response_model=Equipment)
async def update_equipment(equipment_id: str, payload: EquipmentUpdate):
    existing = await db.equipment.find_one({"id": equipment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Equipment not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "sizes" in updates:
        sizes = {str(k): int(v or 0) for k, v in (updates["sizes"] or {}).items()}
        updates["sizes"] = sizes
        eff_sys = updates.get("sorting_system", existing.get("sorting_system", ""))
        if eff_sys:
            updates["total_quantity"] = _compute_total(sizes)
    if "total_quantity_override" in updates:
        override = int(updates.pop("total_quantity_override") or 0)
        eff_sys = updates.get("sorting_system", existing.get("sorting_system", ""))
        if not eff_sys:
            updates["total_quantity"] = override
    if "sorting_system" in updates and not updates["sorting_system"]:
        updates["sizes"] = {}
        updates["size_notes"] = {}
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
                "image_ids": [str(x) for x in (f.get("image_ids") or []) if x],
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
    if "in_use" in updates:
        if updates["in_use"]:
            if not existing.get("in_use"):
                updates["in_use_since"] = _now_iso()
        else:
            updates["in_use_since"] = None
            if "in_use_note" not in updates:
                updates["in_use_note"] = ""
    if "note_image_ids" in updates:
        updates["note_image_ids"] = [str(x) for x in (updates["note_image_ids"] or []) if x]
    updates["updated_at"] = _now_iso()
    await db.equipment.update_one({"id": equipment_id}, {"$set": updates})
    old_loc = existing.get("location") or ""
    old_sub = existing.get("sub_location") or ""
    new_loc = updates.get("location", old_loc)
    new_sub = updates.get("sub_location", old_sub)
    if ("location" in updates and new_loc != old_loc) or ("sub_location" in updates and new_sub != old_sub):
        await _detach_item_from_all_maps(equipment_id)
    return await db.equipment.find_one({"id": equipment_id}, {"_id": 0})


@api_router.delete("/equipment/{equipment_id}")
async def delete_equipment(equipment_id: str):
    doc = await db.equipment.find_one({"id": equipment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Equipment not found")
    await db.equipment.delete_one({"id": equipment_id})
    await _detach_item_from_all_maps(equipment_id)
    return {"ok": True}


# ==================== STORAGE LOCATION MAPS ====================
# Two supported map modes per location:
#   - "photo": upload a photo, drop labeled pins on it (great for racks/shelves)
#   - "floorplan": place labeled shapes (rectangles, circles, lines, text) on a canvas (great for rooms)


class MapPin(BaseModel):
    id: str
    x_pct: float  # 0-100 (percentage of image width)
    y_pct: float  # 0-100
    label: str = ""
    item_id: Optional[str] = None  # link to a costume or equipment item
    item_type: Optional[str] = None  # "costume" | "equipment"
    location_id: Optional[str] = None  # link to a child storage location
    color: Optional[str] = "#EF4444"


class MapShape(BaseModel):
    id: str
    type: str  # "rect" | "circle" | "line" | "text"
    x: float
    y: float
    width: float = 0
    height: float = 0
    rotation: float = 0
    label: str = ""
    fill_color: Optional[str] = "#E5E7EB"
    stroke_color: Optional[str] = "#09090B"
    item_id: Optional[str] = None
    item_type: Optional[str] = None
    location_id: Optional[str] = None


class LocationMapPayload(BaseModel):
    map_mode: str  # "none" | "photo" | "floorplan"
    map_image_id: Optional[str] = None
    map_pins: Optional[List[MapPin]] = None
    floorplan_shapes: Optional[List[MapShape]] = None
    canvas_width: Optional[int] = None
    canvas_height: Optional[int] = None


class MoveItemPayload(BaseModel):
    item_id: str
    item_type: str  # "costume" | "equipment"
    new_location: str
    new_sub_location: Optional[str] = ""


async def _detach_item_from_all_maps(item_id: str) -> None:
    """Remove any map pins / floorplan shapes across ALL locations that reference this item.

    This keeps location maps in sync when an item is moved or its location changes,
    preventing ghost pins/shapes from showing up in a place where the item no longer lives.
    """
    if not item_id:
        return
    await db.locations.update_many(
        {"map_pins.item_id": item_id},
        {"$pull": {"map_pins": {"item_id": item_id}}},
    )
    await db.locations.update_many(
        {"floorplan_shapes.item_id": item_id},
        {"$pull": {"floorplan_shapes": {"item_id": item_id}}},
    )


@api_router.post("/locations/move-item")
async def move_item_to_location(payload: MoveItemPayload):
    if payload.item_type not in ("costume", "equipment"):
        raise HTTPException(status_code=400, detail="item_type must be 'costume' or 'equipment'")
    coll = db.costumes if payload.item_type == "costume" else db.equipment
    doc = await coll.find_one({"id": payload.item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    old_location = doc.get("location", "")
    updates = {
        "location": payload.new_location.strip(),
        "sub_location": (payload.new_sub_location or "").strip(),
        "updated_at": _now_iso(),
    }
    await coll.update_one({"id": payload.item_id}, {"$set": updates})
    # Detach this item from every location map (pins + shapes) it may be attached to
    await _detach_item_from_all_maps(payload.item_id)
    return {"ok": True, "old_location": old_location, "new_location": payload.new_location}


@api_router.put("/locations/{location_id}/map")
async def update_location_map(location_id: str, payload: LocationMapPayload):
    doc = await db.locations.find_one({"id": location_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    if payload.map_mode not in ("none", "photo", "floorplan"):
        raise HTTPException(status_code=400, detail="map_mode must be one of: none, photo, floorplan")
    updates = {"map_mode": payload.map_mode}
    if payload.map_image_id is not None:
        updates["map_image_id"] = payload.map_image_id or None
    if payload.map_pins is not None:
        updates["map_pins"] = [p.model_dump() for p in payload.map_pins]
    if payload.floorplan_shapes is not None:
        updates["floorplan_shapes"] = [s.model_dump() for s in payload.floorplan_shapes]
    if payload.canvas_width is not None:
        updates["canvas_width"] = int(payload.canvas_width)
    if payload.canvas_height is not None:
        updates["canvas_height"] = int(payload.canvas_height)
    await db.locations.update_one({"id": location_id}, {"$set": updates})
    updated = await db.locations.find_one({"id": location_id}, {"_id": 0})
    updated.setdefault("map_mode", "none")
    updated.setdefault("map_pins", [])
    updated.setdefault("floorplan_shapes", [])
    return updated


@api_router.get("/locations/{location_id}")
async def get_location(location_id: str):
    doc = await db.locations.find_one({"id": location_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    doc.setdefault("map_mode", "none")
    doc.setdefault("map_image_id", None)
    doc.setdefault("map_pins", [])
    doc.setdefault("floorplan_shapes", [])
    doc.setdefault("canvas_width", 1200)
    doc.setdefault("canvas_height", 800)
    return doc


# ==================== STUDENTS ====================
# Roster of performers (usually students) so directors, ADs, costumes managers
# and costuming parents can keep their sizing / measurements / notes in one place.
# Later, an optional email invite kicks off an authentication sign-up flow.

DEFAULT_MEASUREMENT_KEYS = [
    "Height",
    "Chest / Bust",
    "Waist",
    "Hips",
    "Inseam",
    "Sleeve",
    "Neck",
    "Shoulders",
]

DEFAULT_SIZE_KEYS = [
    "Shirt",
    "Pants",
    "Dress",
    "Shoe",
    "Hat",
    "Glove",
]


class Student(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    first_name: str
    last_name: Optional[str] = ""
    display_name: Optional[str] = ""
    image_id: Optional[str] = None
    email: Optional[str] = ""
    phone: Optional[str] = ""
    grade: Optional[str] = ""
    pronouns: Optional[str] = ""
    notes: Optional[str] = ""
    measurements: Dict[str, str] = {}
    sizes: Dict[str, str] = {}
    invited: bool = False
    invited_at: Optional[str] = None
    user_id: Optional[str] = None  # populated when the invited student signs up
    created_at: str
    updated_at: Optional[str] = None


class StudentPayload(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    display_name: Optional[str] = ""
    image_id: Optional[str] = None
    email: Optional[str] = ""
    phone: Optional[str] = ""
    grade: Optional[str] = ""
    pronouns: Optional[str] = ""
    notes: Optional[str] = ""
    measurements: Optional[Dict[str, str]] = None
    sizes: Optional[Dict[str, str]] = None


class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    image_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    grade: Optional[str] = None
    pronouns: Optional[str] = None
    notes: Optional[str] = None
    measurements: Optional[Dict[str, str]] = None
    sizes: Optional[Dict[str, str]] = None


def _clean_dict_str(d: Optional[Dict[str, str]]) -> Dict[str, str]:
    if not d:
        return {}
    out: Dict[str, str] = {}
    for k, v in d.items():
        key = str(k or "").strip()
        val = str(v or "").strip()
        if key:
            out[key] = val
    return out


def _student_full_name(doc: dict) -> str:
    parts = [doc.get("first_name") or "", doc.get("last_name") or ""]
    return " ".join(p for p in parts if p).strip()


@api_router.get("/students/config")
async def students_config():
    """Default measurement + size keys used by the client to render forms.

    In a later iteration these can be overridden per-org via Settings.
    """
    return {
        "measurement_keys": DEFAULT_MEASUREMENT_KEYS,
        "size_keys": DEFAULT_SIZE_KEYS,
    }


@api_router.get("/students", response_model=List[Student])
async def list_students(q: Optional[str] = None):
    query: Dict[str, object] = {}
    docs = await db.students.find(query, {"_id": 0}).to_list(5000)
    if q:
        needle = q.strip().lower()
        docs = [
            d for d in docs
            if needle in (d.get("first_name") or "").lower()
            or needle in (d.get("last_name") or "").lower()
            or needle in (d.get("display_name") or "").lower()
            or needle in (d.get("email") or "").lower()
        ]
    docs.sort(key=lambda d: ((d.get("last_name") or "").lower(), (d.get("first_name") or "").lower()))
    for d in docs:
        d.setdefault("measurements", {})
        d.setdefault("sizes", {})
        d.setdefault("invited", False)
    return docs


@api_router.get("/students/stats")
async def students_stats():
    docs = await db.students.find({}, {"_id": 0}).to_list(5000)
    total = len(docs)
    invited = sum(1 for d in docs if d.get("invited"))
    with_email = sum(1 for d in docs if (d.get("email") or "").strip())
    # Distribution of common size keys
    size_dist: Dict[str, Dict[str, int]] = {}
    for d in docs:
        for k, v in (d.get("sizes") or {}).items():
            v = (v or "").strip()
            if not v:
                continue
            size_dist.setdefault(k, {})
            size_dist[k][v] = size_dist[k].get(v, 0) + 1
    return {
        "total": total,
        "invited": invited,
        "with_email": with_email,
        "size_distribution": size_dist,
    }


@api_router.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: str):
    doc = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Student not found")
    doc.setdefault("measurements", {})
    doc.setdefault("sizes", {})
    doc.setdefault("invited", False)
    return doc


@api_router.post("/students", response_model=Student)
async def create_student(payload: StudentPayload):
    first = (payload.first_name or "").strip()
    if not first:
        raise HTTPException(status_code=400, detail="First name required")
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "first_name": first,
        "last_name": (payload.last_name or "").strip(),
        "display_name": (payload.display_name or "").strip(),
        "image_id": payload.image_id or None,
        "email": (payload.email or "").strip().lower(),
        "phone": (payload.phone or "").strip(),
        "grade": (payload.grade or "").strip(),
        "pronouns": (payload.pronouns or "").strip(),
        "notes": (payload.notes or "").strip(),
        "measurements": _clean_dict_str(payload.measurements),
        "sizes": _clean_dict_str(payload.sizes),
        "invited": False,
        "invited_at": None,
        "user_id": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.students.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/students/{student_id}", response_model=Student)
async def update_student(student_id: str, payload: StudentUpdate):
    existing = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    for key in ("first_name", "last_name", "display_name", "email", "phone", "grade", "pronouns", "notes"):
        if key in updates:
            val = str(updates[key] or "").strip()
            if key == "email":
                val = val.lower()
            updates[key] = val
    if "first_name" in updates and not updates["first_name"]:
        raise HTTPException(status_code=400, detail="First name required")
    if "measurements" in updates:
        updates["measurements"] = _clean_dict_str(updates["measurements"])
    if "sizes" in updates:
        updates["sizes"] = _clean_dict_str(updates["sizes"])
    updates["updated_at"] = _now_iso()
    await db.students.update_one({"id": student_id}, {"$set": updates})
    return await db.students.find_one({"id": student_id}, {"_id": 0})


@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str):
    res = await db.students.delete_one({"id": student_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"ok": True}


@api_router.post("/students/{student_id}/invite")
async def invite_student(student_id: str):
    """Mark a student as invited to sign up.

    NOTE: Actual email delivery ships with the Auth iteration. For now this only
    stamps the record so the UI can render "Invited" state and re-send later.
    """
    doc = await db.students.find_one({"id": student_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Student not found")
    email = (doc.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Student has no email on file")
    await db.students.update_one(
        {"id": student_id},
        {"$set": {"invited": True, "invited_at": _now_iso(), "updated_at": _now_iso()}},
    )
    return {"ok": True, "email": email, "queued": True, "sent": False,
            "message": "Invite queued. Email delivery will activate when authentication is enabled."}


# ==================== ROLES & PERMISSIONS ====================
# Simple in-org RBAC. Every role is a document with a flat map of permission keys.
# A Director-only Settings UI edits the matrix. Once auth ships, incoming requests
# will be checked against the caller's role -> permissions map.

PERMISSION_CATALOG: Dict[str, List[Dict[str, str]]] = {
    "Costumes": [
        {"key": "costumes.view", "label": "View costumes"},
        {"key": "costumes.create", "label": "Create costumes"},
        {"key": "costumes.edit", "label": "Edit costumes"},
        {"key": "costumes.delete", "label": "Delete costumes"},
        {"key": "costumes.flag", "label": "Flag / unflag costumes"},
        {"key": "costumes.pin", "label": "Pin to dashboard"},
    ],
    "Equipment": [
        {"key": "equipment.view", "label": "View equipment"},
        {"key": "equipment.create", "label": "Create equipment"},
        {"key": "equipment.edit", "label": "Edit equipment"},
        {"key": "equipment.delete", "label": "Delete equipment"},
    ],
    "Shows": [
        {"key": "shows.view", "label": "View shows"},
        {"key": "shows.create", "label": "Create shows"},
        {"key": "shows.edit", "label": "Edit shows"},
        {"key": "shows.delete", "label": "Delete shows"},
        {"key": "shows.toggle_live", "label": "Toggle Live status"},
    ],
    "Storage & Maps": [
        {"key": "locations.view", "label": "View storage"},
        {"key": "locations.create", "label": "Create locations"},
        {"key": "locations.edit", "label": "Edit locations"},
        {"key": "locations.delete", "label": "Delete locations"},
        {"key": "maps.edit", "label": "Edit location maps"},
        {"key": "items.drag_drop", "label": "Drag-drop reassign items"},
    ],
    "Flags": [
        {"key": "flags.view", "label": "View flag types"},
        {"key": "flags.edit", "label": "Manage flag categories"},
    ],
    "Students": [
        {"key": "students.view", "label": "View student roster"},
        {"key": "students.create", "label": "Add students"},
        {"key": "students.edit", "label": "Edit student measurements/notes"},
        {"key": "students.delete", "label": "Delete students"},
        {"key": "students.invite", "label": "Send sign-up invites"},
    ],
    "Organisation": [
        {"key": "settings.edit", "label": "Edit org settings & branding"},
        {"key": "taxonomy.edit", "label": "Manage categories / sizing systems"},
        {"key": "users.invite", "label": "Invite users"},
        {"key": "users.manage_roles", "label": "Assign / edit user roles"},
        {"key": "users.remove", "label": "Remove users from org"},
        {"key": "roles.edit", "label": "Edit role permissions"},
    ],
}


def _all_permission_keys() -> List[str]:
    keys: List[str] = []
    for group in PERMISSION_CATALOG.values():
        for p in group:
            keys.append(p["key"])
    return keys


def _perms_from_keys(keys: List[str], value: bool = True) -> Dict[str, bool]:
    return {k: value for k in keys}


def _default_role_presets() -> List[Dict]:
    all_keys = _all_permission_keys()

    def keys_startswith(prefixes: List[str]) -> List[str]:
        return [k for k in all_keys if any(k.startswith(p) for p in prefixes)]

    view_only = [k for k in all_keys if k.endswith(".view")]
    now = _now_iso()

    presets = [
        {
            "name": "Director",
            "slug": "director",
            "description": "Full control. Can manage users, roles, org settings, and everything else.",
            "color": "#DC2626",
            "permissions": _perms_from_keys(all_keys, True),
            "is_system": True,
        },
        {
            "name": "Assistant Director",
            "slug": "assistant_director",
            "description": "Nearly full control. Cannot remove users or edit roles.",
            "color": "#EA580C",
            "permissions": {
                **_perms_from_keys(all_keys, True),
                "users.remove": False,
                "users.manage_roles": False,
                "roles.edit": False,
            },
            "is_system": True,
        },
        {
            "name": "Tech Director",
            "slug": "tech_director",
            "description": "Runs equipment, maps and storage. Views everything else.",
            "color": "#2563EB",
            "permissions": {
                **_perms_from_keys(view_only, True),
                **_perms_from_keys(keys_startswith(["equipment.", "locations.", "maps.", "items."]), True),
                "shows.toggle_live": True,
            },
            "is_system": True,
        },
        {
            "name": "Costumes Manager",
            "slug": "costumes_manager",
            "description": "Owns costumes, flags and student measurements. Can toggle Live.",
            "color": "#7C3AED",
            "permissions": {
                **_perms_from_keys(view_only, True),
                **_perms_from_keys(keys_startswith(["costumes.", "flags.", "students.", "items."]), True),
                "shows.edit": True,
                "shows.toggle_live": True,
                "taxonomy.edit": True,
            },
            "is_system": True,
        },
        {
            "name": "Student",
            "slug": "student",
            "description": "Views costumes and shows. No edits.",
            "color": "#0891B2",
            "permissions": {
                **_perms_from_keys(["costumes.view", "shows.view"], True),
            },
            "is_system": True,
        },
        {
            "name": "Student · Captain",
            "slug": "student_captain",
            "description": "Student plus roster visibility.",
            "color": "#0EA5E9",
            "permissions": {
                **_perms_from_keys(["costumes.view", "shows.view", "students.view", "equipment.view"], True),
            },
            "is_system": True,
        },
        {
            "name": "Student · Company Manager",
            "slug": "student_company_manager",
            "description": "Student plus can add shows and manage the show list.",
            "color": "#22C55E",
            "permissions": {
                **_perms_from_keys(["costumes.view", "shows.view", "shows.create", "shows.edit", "students.view", "equipment.view"], True),
            },
            "is_system": True,
        },
        {
            "name": "Parent Volunteer",
            "slug": "parent_volunteer",
            "description": "Baseline volunteer access. View everything.",
            "color": "#78716C",
            "permissions": {
                **_perms_from_keys(view_only, True),
            },
            "is_system": True,
        },
        {
            "name": "Parent Volunteer · Costuming",
            "slug": "parent_costuming",
            "description": "Helps with costumes, flags and student measurements.",
            "color": "#DB2777",
            "permissions": {
                **_perms_from_keys(view_only, True),
                **_perms_from_keys(["costumes.edit", "costumes.flag", "flags.view", "students.edit", "items.drag_drop"], True),
            },
            "is_system": True,
        },
        {
            "name": "Parent Volunteer · Stage Management",
            "slug": "parent_stage_mgmt",
            "description": "Helps with shows, equipment and maps.",
            "color": "#0D9488",
            "permissions": {
                **_perms_from_keys(view_only, True),
                **_perms_from_keys(["equipment.edit", "shows.edit", "shows.toggle_live", "maps.edit", "items.drag_drop"], True),
            },
            "is_system": True,
        },
    ]
    # Backfill any missing keys with False so the matrix always renders
    for p in presets:
        for k in all_keys:
            p["permissions"].setdefault(k, False)
        p.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now})
    return presets


async def _seed_roles_if_empty() -> None:
    count = await db.roles.count_documents({})
    if count > 0:
        return
    presets = _default_role_presets()
    await db.roles.insert_many(presets)


class Role(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    description: Optional[str] = ""
    color: Optional[str] = "#71717A"
    permissions: Dict[str, bool] = {}
    is_system: bool = False
    created_at: str
    updated_at: Optional[str] = None


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#71717A"
    permissions: Optional[Dict[str, bool]] = None
    clone_from: Optional[str] = None  # role id to clone permissions from


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    permissions: Optional[Dict[str, bool]] = None


def _slugify(name: str) -> str:
    return "".join(c.lower() if c.isalnum() else "_" for c in name.strip()).strip("_") or f"role_{uuid.uuid4().hex[:6]}"


@api_router.get("/permissions/catalog")
async def permissions_catalog():
    return {"catalog": PERMISSION_CATALOG, "all_keys": _all_permission_keys()}


@api_router.get("/roles", response_model=List[Role])
async def list_roles(request: Request):
    await _seed_roles_if_empty()
    # Resolve user by session token (middleware already validated it).
    user_id = getattr(request.state, "session_user_id", None)
    org_id = None
    if user_id:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "org_id": 1})
        if u:
            org_id = u.get("org_id")
    # If the user has an org, scope to their org's roles. Otherwise return
    # unowned (global) roles so onboarding UIs can preview role names.
    if org_id:
        docs = await db.roles.find({"org_id": org_id}, {"_id": 0}).to_list(500)
        if not docs:
            docs = await db.roles.find({"$or": [{"org_id": {"$exists": False}}, {"org_id": None}]}, {"_id": 0}).to_list(500)
    else:
        docs = await db.roles.find({"$or": [{"org_id": {"$exists": False}}, {"org_id": None}]}, {"_id": 0}).to_list(500)
    # Ensure every role has an entry for every known permission key
    all_keys = _all_permission_keys()
    for d in docs:
        perms = d.get("permissions") or {}
        for k in all_keys:
            perms.setdefault(k, False)
        d["permissions"] = perms
    docs.sort(key=lambda d: (not d.get("is_system", False), d.get("name", "").lower()))
    return docs


@api_router.post("/roles", response_model=Role)
async def create_role(payload: RoleCreate):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name required")
    slug = _slugify(name)
    dupe = await db.roles.find_one({"$or": [{"name": name}, {"slug": slug}]})
    if dupe:
        raise HTTPException(status_code=409, detail="A role with that name already exists")
    all_keys = _all_permission_keys()
    perms: Dict[str, bool] = {}
    if payload.clone_from:
        src = await db.roles.find_one({"id": payload.clone_from}, {"_id": 0})
        if src:
            perms = {k: bool(v) for k, v in (src.get("permissions") or {}).items()}
    if payload.permissions:
        perms.update({k: bool(v) for k, v in payload.permissions.items()})
    for k in all_keys:
        perms.setdefault(k, False)
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "slug": slug,
        "description": (payload.description or "").strip(),
        "color": payload.color or "#71717A",
        "permissions": perms,
        "is_system": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.roles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/roles/{role_id}", response_model=Role)
async def update_role(role_id: str, payload: RoleUpdate):
    doc = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Role not found")
    updates: Dict[str, object] = {}
    if payload.name is not None and not doc.get("is_system"):
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        # keep slug stable for system roles; for custom roles allow rename but ensure uniqueness
        existing = await db.roles.find_one({"name": new_name, "id": {"$ne": role_id}})
        if existing:
            raise HTTPException(status_code=409, detail="Another role already uses that name")
        updates["name"] = new_name
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.color is not None:
        updates["color"] = payload.color
    if payload.permissions is not None:
        merged = dict(doc.get("permissions") or {})
        merged.update({k: bool(v) for k, v in payload.permissions.items()})
        # backfill unknown keys with False
        for k in _all_permission_keys():
            merged.setdefault(k, False)
        updates["permissions"] = merged
    updates["updated_at"] = _now_iso()
    await db.roles.update_one({"id": role_id}, {"$set": updates})
    return await db.roles.find_one({"id": role_id}, {"_id": 0})


@api_router.delete("/roles/{role_id}")
async def delete_role(role_id: str):
    doc = await db.roles.find_one({"id": role_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Role not found")
    if doc.get("is_system"):
        raise HTTPException(status_code=400, detail="Built-in roles cannot be deleted (edit their permissions instead)")
    await db.roles.delete_one({"id": role_id})
    return {"ok": True}


@api_router.post("/roles/reset-defaults")
async def reset_default_roles():
    """Wipe every role and reseed the built-in presets. Custom roles are lost."""
    await db.roles.delete_many({})
    await _seed_roles_if_empty()
    return {"ok": True}


# ==================== AUTHENTICATION ====================
# Two flows share one `users` + `user_sessions` collection:
#   1. Emergent-managed Google Auth (session_id → session_data → session_token).
#   2. Email + password (register / login → session_token).
# Both flows deposit a random 32-byte hex `session_token` in an httpOnly cookie.

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SESSION_DAYS = 7
SESSION_COOKIE_NAME = "session_token"
EMERGENT_SESSION_ENDPOINT = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class AppUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    auth_provider: str  # "google" | "password" | "hybrid"
    role_id: Optional[str] = None
    role_slug: Optional[str] = None
    org_id: Optional[str] = None
    is_superadmin: bool = False
    created_at: str
    updated_at: Optional[str] = None


class RegisterPayload(BaseModel):
    email: str
    password: str
    name: Optional[str] = ""


class LoginPayload(BaseModel):
    email: str
    password: str


class GoogleSessionPayload(BaseModel):
    session_id: str


def _new_token() -> str:
    return secrets.token_urlsafe(48)


def _expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)


def _cookie_kwargs():
    return {
        "httponly": True,
        "secure": True,
        "samesite": "none",
        "path": "/",
        "max_age": SESSION_DAYS * 24 * 3600,
    }


async def _director_role_id() -> Optional[str]:
    await _seed_roles_if_empty()
    role = await db.roles.find_one({"slug": "director"}, {"_id": 0})
    return role["id"] if role else None


async def _default_role_id() -> Optional[str]:
    """Non-privileged default role for new signups after the first user."""
    await _seed_roles_if_empty()
    # Prefer Parent Volunteer as a safe view-only default
    for slug in ("parent_volunteer", "student"):
        role = await db.roles.find_one({"slug": slug}, {"_id": 0})
        if role:
            return role["id"]
    return None


async def _project_user(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


async def _issue_session(user_id: str) -> str:
    token = _new_token()
    await db.user_sessions.insert_one({
        "session_id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_token": token,
        "created_at": datetime.now(timezone.utc),
        "expires_at": _expiry(),
    })
    return token


async def _resolve_role(role_id: Optional[str]) -> Optional[dict]:
    if not role_id:
        return None
    return await db.roles.find_one({"id": role_id}, {"_id": 0})


async def _upsert_google_user(email: str, name: str, picture: Optional[str]) -> dict:
    """Create or update a Google-linked user. First user gets Director role + super-admin."""
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google returned no email")
    now = _now_iso()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        updates = {"name": name or existing.get("name") or "", "picture": picture, "updated_at": now}
        # Upgrade auth_provider to hybrid if they also have a password
        if existing.get("auth_provider") == "password" and existing.get("password_hash"):
            updates["auth_provider"] = "hybrid"
        elif existing.get("auth_provider") != "hybrid":
            updates["auth_provider"] = "google" if not existing.get("password_hash") else "hybrid"
        await db.users.update_one({"user_id": existing["user_id"]}, {"$set": updates})
        return await db.users.find_one({"user_id": existing["user_id"]}, {"_id": 0})
    # New user
    user_count = await db.users.count_documents({})
    role_id = await _director_role_id() if user_count == 0 else await _default_role_id()
    role = await _resolve_role(role_id)
    doc = {
        "user_id": f"u_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": name or email.split("@")[0],
        "picture": picture,
        "auth_provider": "google",
        "role_id": role_id,
        "role_slug": role["slug"] if role else None,
        "org_id": None,
        "is_superadmin": user_count == 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(doc)
    # First-ever user: bootstrap the Default Org and assign self to it
    if user_count == 0:
        org_id = await _bootstrap_default_org_if_needed(doc["user_id"])
        await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {"org_id": org_id}})
    return await db.users.find_one({"user_id": doc["user_id"]}, {"_id": 0})


async def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(default=None),
) -> dict:
    """FastAPI dependency: resolve current user from cookie OR Authorization: Bearer <token>."""
    token = session_token
    if not token:
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@api_router.post("/auth/register")
async def auth_register(payload: RegisterPayload, response: Response):
    email = payload.email.lower().strip()
    if not payload.password or len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("password_hash"):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    now = _now_iso()
    pwd_hash = pwd_context.hash(payload.password)
    if existing:
        # Google-linked account adding a password → hybrid
        await db.users.update_one(
            {"user_id": existing["user_id"]},
            {"$set": {"password_hash": pwd_hash, "auth_provider": "hybrid", "updated_at": now,
                       "name": payload.name.strip() if payload.name else existing.get("name", "")}}
        )
        user_id = existing["user_id"]
    else:
        user_count = await db.users.count_documents({})
        role_id = await _director_role_id() if user_count == 0 else await _default_role_id()
        role = await _resolve_role(role_id)
        user_id = f"u_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": (payload.name or email.split("@")[0]).strip(),
            "picture": None,
            "auth_provider": "password",
            "password_hash": pwd_hash,
            "role_id": role_id,
            "role_slug": role["slug"] if role else None,
            "org_id": None,
            "is_superadmin": user_count == 0,
            "created_at": now,
            "updated_at": now,
        })
        # First user: create Default Org and assign self to it as Director
        if user_count == 0:
            org_id = await _bootstrap_default_org_if_needed(user_id)
            await db.users.update_one({"user_id": user_id}, {"$set": {"org_id": org_id}})
    token = await _issue_session(user_id)
    response.set_cookie(SESSION_COOKIE_NAME, token, **_cookie_kwargs())
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": user, "session_token": token}


@api_router.post("/auth/login")
async def auth_login(payload: LoginPayload, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_context.verify(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await _issue_session(user["user_id"])
    response.set_cookie(SESSION_COOKIE_NAME, token, **_cookie_kwargs())
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": user, "session_token": token}


@api_router.post("/auth/session")
async def auth_google_session(payload: GoogleSessionPayload, response: Response):
    """Exchange an Emergent OAuth `session_id` for our own session_token."""
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    try:
        # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        r = requests.get(
            EMERGENT_SESSION_ENDPOINT,
            headers={"X-Session-ID": payload.session_id},
            timeout=15,
        )
    except Exception as e:
        logger.error(f"Emergent auth request failed: {e}")
        raise HTTPException(status_code=502, detail="Auth service unreachable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json() or {}
    email = data.get("email")
    name = data.get("name") or ""
    picture = data.get("picture")
    emergent_session_token = data.get("session_token")
    if not email or not emergent_session_token:
        raise HTTPException(status_code=401, detail="Malformed session data")
    user = await _upsert_google_user(email, name, picture)
    # Store the Emergent-provided session_token as ours (7-day expiry)
    await db.user_sessions.insert_one({
        "session_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "session_token": emergent_session_token,
        "created_at": datetime.now(timezone.utc),
        "expires_at": _expiry(),
    })
    response.set_cookie(SESSION_COOKIE_NAME, emergent_session_token, **_cookie_kwargs())
    return {"user": user, "session_token": emergent_session_token}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    role = await _resolve_role(user.get("role_id"))
    return {**user, "role": role}


@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response, session_token: Optional[str] = Cookie(default=None)):
    token = session_token
    if not token:
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@api_router.get("/auth/status")
async def auth_status():
    """Quick lightweight check the frontend can call to know if any user exists yet."""
    count = await db.users.count_documents({})
    return {"any_users": count > 0}


# ==================== ORGANIZATIONS & INVITES ====================
# Each User belongs to exactly one Organization. On first-ever signup:
#   - Bootstrap a "Default Organization"
#   - Tag every existing document across owned collections with default_org_id
#   - Make the first user Director of Default Org
# Subsequent signups either:
#   (a) redeem an Invite Code -> join the invite's org with the invite's role
#   (b) create a new Organization -> become Director of that new org
#
# "Owned" collections that gain an org_id column:
ORG_SCOPED_COLLECTIONS = [
    "costumes", "equipment", "shows", "locations",
    "categories", "equipment_categories",
    "sizing_systems", "equipment_sorting_systems",
    "students", "flag_categories", "roles",
    "settings",  # per-org branding, hide_in_use_mode, etc.
]


class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    created_by_user_id: Optional[str] = None
    logo_image_id: Optional[str] = None
    is_default: bool = False
    created_at: str
    updated_at: Optional[str] = None


class OrgCreatePayload(BaseModel):
    name: str
    logo_image_id: Optional[str] = None


class InviteCreatePayload(BaseModel):
    role_id: str
    email: Optional[str] = ""
    expires_days: Optional[int] = 14


class InviteRedeemPayload(BaseModel):
    code: str


async def _bootstrap_default_org_if_needed(user_id: str) -> str:
    """If this is the very first user, create Default Org and tag existing data."""
    org = await db.organizations.find_one({"is_default": True}, {"_id": 0})
    if org:
        return org["id"]
    now = _now_iso()
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    await db.organizations.insert_one({
        "id": org_id,
        "name": "Default Organization",
        "slug": "default",
        "created_by_user_id": user_id,
        "logo_image_id": None,
        "is_default": True,
        "created_at": now,
        "updated_at": now,
    })
    # Tag every existing document with the default org_id
    for coll in ORG_SCOPED_COLLECTIONS:
        try:
            await db[coll].update_many(
                {"$or": [{"org_id": {"$exists": False}}, {"org_id": None}]},
                {"$set": {"org_id": org_id}},
            )
        except Exception as e:
            logger.warning(f"Backfill org_id on {coll} failed: {e}")
    return org_id


async def _create_new_org(name: str, user_id: str, logo_image_id: Optional[str] = None) -> str:
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Organization name required")
    slug_base = _slugify(name)
    slug = slug_base
    n = 2
    while await db.organizations.find_one({"slug": slug}):
        slug = f"{slug_base}_{n}"
        n += 1
    now = _now_iso()
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    await db.organizations.insert_one({
        "id": org_id,
        "name": name,
        "slug": slug,
        "created_by_user_id": user_id,
        "logo_image_id": logo_image_id,
        "is_default": False,
        "created_at": now,
        "updated_at": now,
    })
    # Seed the new org's roles by cloning from any existing "template" set:
    # prefer unowned roles (fresh install), else clone from the Default Org.
    all_roles = await db.roles.find({"$or": [{"org_id": {"$exists": False}}, {"org_id": None}]}, {"_id": 0}).to_list(500)
    if not all_roles:
        default_org = await db.organizations.find_one({"is_default": True}, {"_id": 0})
        if default_org:
            all_roles = await db.roles.find({"org_id": default_org["id"]}, {"_id": 0}).to_list(500)
    if not all_roles:
        # Absolute fallback — seed presets directly
        for preset in _default_role_presets():
            preset["org_id"] = org_id
            await db.roles.insert_one(preset)
    else:
        for r in all_roles:
            clone = {**r, "id": str(uuid.uuid4()), "org_id": org_id, "created_at": now, "updated_at": now}
            clone.pop("_id", None)
            await db.roles.insert_one(clone)
    return org_id


async def _ensure_user_has_org(user_doc: dict) -> str:
    """Return user's org_id, creating & assigning the default org if missing."""
    if user_doc.get("org_id"):
        return user_doc["org_id"]
    org_id = await _bootstrap_default_org_if_needed(user_doc["user_id"])
    await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"org_id": org_id, "updated_at": _now_iso()}})
    return org_id


async def get_current_org_id(user: dict = Depends(get_current_user)) -> str:
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=428, detail="Onboarding required — join or create an organization first")
    return org_id


@api_router.get("/organizations/mine", response_model=Organization)
async def my_org(user: dict = Depends(get_current_user)):
    if not user.get("org_id"):
        raise HTTPException(status_code=404, detail="No organization")
    doc = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Organization not found")
    return doc


@api_router.post("/organizations", response_model=Organization)
async def create_organization(payload: OrgCreatePayload, user: dict = Depends(get_current_user)):
    """Onboarding entry point: create a brand-new org and make the current user its Director."""
    if user.get("org_id"):
        raise HTTPException(status_code=409, detail="You already belong to an organization")
    org_id = await _create_new_org(payload.name, user["user_id"], payload.logo_image_id)
    # Find the Director role within this new org
    director = await db.roles.find_one({"org_id": org_id, "slug": "director"}, {"_id": 0})
    role_id = director["id"] if director else None
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"org_id": org_id, "role_id": role_id, "role_slug": "director",
                   "is_superadmin": user.get("is_superadmin") or True, "updated_at": _now_iso()}},
    )
    return await db.organizations.find_one({"id": org_id}, {"_id": 0})


@api_router.get("/organizations/members")
async def list_org_members(user: dict = Depends(get_current_user)):
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="No organization")
    docs = await db.users.find({"org_id": org_id}, {"_id": 0, "password_hash": 0}).to_list(500)
    # Attach role name
    for d in docs:
        rid = d.get("role_id")
        if rid:
            r = await db.roles.find_one({"id": rid}, {"_id": 0})
            d["role_name"] = r.get("name") if r else None
            d["role_color"] = r.get("color") if r else None
    docs.sort(key=lambda d: (d.get("name") or d.get("email") or "").lower())
    return docs


class ChangeMemberRolePayload(BaseModel):
    role_id: str


@api_router.put("/organizations/members/{user_id}/role")
async def change_member_role(user_id: str, payload: ChangeMemberRolePayload, user: dict = Depends(get_current_user)):
    org_id = user.get("org_id")
    target = await db.users.find_one({"user_id": user_id, "org_id": org_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization")
    role = await db.roles.find_one({"id": payload.role_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role_id": payload.role_id, "role_slug": role.get("slug"), "updated_at": _now_iso()}},
    )
    return {"ok": True}


@api_router.delete("/organizations/members/{user_id}")
async def remove_member(user_id: str, user: dict = Depends(get_current_user)):
    if user["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")
    org_id = user.get("org_id")
    target = await db.users.find_one({"user_id": user_id, "org_id": org_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization")
    await db.users.update_one({"user_id": user_id}, {"$set": {"org_id": None, "role_id": None, "role_slug": None}})
    return {"ok": True}


# --- Invites ---
class Invite(BaseModel):
    id: str
    org_id: str
    role_id: str
    role_name: Optional[str] = None
    email: Optional[str] = ""
    code: str
    invited_by_user_id: str
    accepted_by_user_id: Optional[str] = None
    accepted_at: Optional[str] = None
    expires_at: str
    revoked: bool = False
    created_at: str


def _invite_code() -> str:
    # 12 chars, uppercase, base32-ish for easy typing
    return "".join(secrets.choice("ABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(10))


@api_router.get("/invites")
async def list_invites(user: dict = Depends(get_current_user)):
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="No organization")
    docs = await db.invites.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Attach role_name for convenience
    for d in docs:
        r = await db.roles.find_one({"id": d.get("role_id")}, {"_id": 0})
        d["role_name"] = r.get("name") if r else None
    return docs


@api_router.post("/invites", response_model=Invite)
async def create_invite(payload: InviteCreatePayload, user: dict = Depends(get_current_user)):
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="No organization")
    role = await db.roles.find_one({"id": payload.role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    now = datetime.now(timezone.utc)
    expiry_days = max(1, min(int(payload.expires_days or 14), 180))
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "role_id": payload.role_id,
        "role_name": role.get("name"),
        "email": (payload.email or "").strip().lower(),
        "code": _invite_code(),
        "invited_by_user_id": user["user_id"],
        "accepted_by_user_id": None,
        "accepted_at": None,
        "expires_at": (now + timedelta(days=expiry_days)).isoformat(),
        "revoked": False,
        "created_at": now.isoformat(),
    }
    await db.invites.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, user: dict = Depends(get_current_user)):
    org_id = user.get("org_id")
    res = await db.invites.update_one(
        {"id": invite_id, "org_id": org_id, "accepted_at": None},
        {"$set": {"revoked": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invite not found (or already accepted)")
    return {"ok": True}


@api_router.get("/invites/preview/{code}")
async def preview_invite(code: str):
    """Public: given a code, show the org name + role for the acceptance screen."""
    code = (code or "").strip().upper()
    inv = await db.invites.find_one({"code": code, "revoked": False, "accepted_at": None}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    expires_at = inv.get("expires_at")
    if expires_at:
        try:
            ea = datetime.fromisoformat(expires_at)
            if ea.tzinfo is None:
                ea = ea.replace(tzinfo=timezone.utc)
            if ea < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Invite has expired")
        except HTTPException:
            raise
        except Exception:
            pass
    org = await db.organizations.find_one({"id": inv["org_id"]}, {"_id": 0})
    role = await db.roles.find_one({"id": inv["role_id"]}, {"_id": 0})
    return {
        "code": inv["code"],
        "org_name": org.get("name") if org else None,
        "role_name": role.get("name") if role else None,
    }


@api_router.post("/invites/redeem")
async def redeem_invite(payload: InviteRedeemPayload, user: dict = Depends(get_current_user)):
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code required")
    inv = await db.invites.find_one({"code": code, "revoked": False, "accepted_at": None}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid or already-used invite")
    # Check expiry
    try:
        ea = datetime.fromisoformat(inv.get("expires_at"))
        if ea.tzinfo is None:
            ea = ea.replace(tzinfo=timezone.utc)
        if ea < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Invite has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    if user.get("org_id") and user["org_id"] != inv["org_id"]:
        raise HTTPException(status_code=409, detail="You already belong to a different organization")
    role = await db.roles.find_one({"id": inv["role_id"]}, {"_id": 0})
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"org_id": inv["org_id"], "role_id": inv["role_id"],
                   "role_slug": role.get("slug") if role else None, "updated_at": _now_iso()}},
    )
    now = _now_iso()
    await db.invites.update_one(
        {"id": inv["id"]},
        {"$set": {"accepted_by_user_id": user["user_id"], "accepted_at": now}},
    )
    return {"ok": True, "org_id": inv["org_id"]}


# --------- App Setup ---------
app.include_router(api_router)


# --- API auth gate ---
# Every /api/* request needs a valid session token EXCEPT the endpoints listed here.
PUBLIC_API_PATHS = {
    "/api/",              # health / root
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/session",
    "/api/auth/logout",
    "/api/auth/me",       # returns 401 itself when unauth'd
    "/api/auth/status",
}


def _path_is_public(path: str) -> bool:
    if not path.startswith("/api/"):
        return True  # not an API route (shouldn't happen — Kubernetes ingress routes only /api here)
    if path in PUBLIC_API_PATHS:
        return True
    # Public: image fetching (public-embed)
    if path.startswith("/api/images/"):
        return True
    # Public: preview an invite before signing in (used by /invite/<code>)
    if path.startswith("/api/invites/preview/"):
        return True
    return False


@app.middleware("http")
async def require_auth_middleware(request: Request, call_next):
    from fastapi.responses import JSONResponse
    path = request.url.path
    # Preflight always passes
    if request.method == "OPTIONS":
        return await call_next(request)
    if _path_is_public(path):
        return await call_next(request)
    # Validate token
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if not token:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return JSONResponse({"detail": "Session expired"}, status_code=401)
    # Stash user_id for downstream handlers if they want it
    request.state.session_user_id = sess.get("user_id")
    return await call_next(request)


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

    # Migration: rename costume `sizing_system` → `sorting_system` for docs missing the new field
    await db.costumes.update_many(
        {"sorting_system": {"$exists": False}, "sizing_system": {"$exists": True}},
        [{"$set": {"sorting_system": "$sizing_system"}}]
    )
    await db.costumes.update_many(
        {"sorting_system": {"$exists": False}},
        {"$set": {"sorting_system": "Letter"}}
    )

    # Migration: build costume `shows` list from legacy `original_show_id`/`additional_show_ids`
    async for c in db.costumes.find({"shows": {"$exists": False}}, {"_id": 0, "id": 1, "original_show_id": 1, "additional_show_ids": 1}):
        merged: List[Dict] = []
        seen = set()
        for sid in [c.get("original_show_id")] + list(c.get("additional_show_ids") or []):
            if sid and sid not in seen:
                seen.add(sid)
                merged.append({"show_id": sid, "timestamp": ""})
        origin = await _resolve_origin_year_from_shows(merged)
        await db.costumes.update_one(
            {"id": c["id"]},
            {"$set": {"shows": merged, "origin_year": origin}}
        )
    # Also normalize any existing `shows` docs into the new schema
    async for c in db.costumes.find({"shows": {"$exists": True}}, {"_id": 0, "id": 1, "shows": 1}):
        norm = _normalize_costume_shows(c.get("shows"))
        if norm != c.get("shows"):
            await db.costumes.update_one({"id": c["id"]}, {"$set": {"shows": norm}})

    # Migration: drop legacy `link_timestamp` from all show docs
    await db.shows.update_many({"link_timestamp": {"$exists": True}}, {"$unset": {"link_timestamp": ""}})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
