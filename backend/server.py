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
    # Recompute origin_year for any costume that references this show
    if year is not None:
        affected = await db.costumes.find({"shows.show_id": show_id}, {"_id": 0, "id": 1, "shows": 1}).to_list(2000)
        for c in affected:
            ny = await _resolve_origin_year_from_shows(c.get("shows") or [])
            await db.costumes.update_one({"id": c["id"]}, {"$set": {"origin_year": ny, "updated_at": _now_iso()}})
    updated = await db.shows.find_one({"id": show_id}, {"_id": 0})
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
    return await db.equipment.find_one({"id": equipment_id}, {"_id": 0})


@api_router.delete("/equipment/{equipment_id}")
async def delete_equipment(equipment_id: str):
    doc = await db.equipment.find_one({"id": equipment_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Equipment not found")
    await db.equipment.delete_one({"id": equipment_id})
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
    # Clean up any map pins/shapes referencing this item on the OLD location's map
    if old_location and old_location != payload.new_location:
        old_loc = await db.locations.find_one({"name": old_location})
        if old_loc:
            pins = [p for p in (old_loc.get("map_pins") or []) if p.get("item_id") != payload.item_id]
            shapes = [s for s in (old_loc.get("floorplan_shapes") or []) if s.get("item_id") != payload.item_id]
            await db.locations.update_one(
                {"id": old_loc["id"]},
                {"$set": {"map_pins": pins, "floorplan_shapes": shapes}}
            )
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
