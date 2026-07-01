"""Backend pytest tests for Costume Inventory Tracker"""
import os
import io
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SIZE_KEYS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
def test_api_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Stats ----------
def test_stats_shape(session):
    r = session.get(f"{API}/stats")
    assert r.status_code == 200
    data = r.json()
    for k in ["total_costumes", "total_items", "categories", "category_count", "locations_in_use", "flagged_count"]:
        assert k in data
    assert isinstance(data["categories"], list)


# ---------- Locations ----------
def test_locations_seeded(session):
    r = session.get(f"{API}/locations")
    assert r.status_code == 200
    names = {x["name"] for x in r.json()}
    for expected in ["Main Wardrobe", "Backstage Storage", "Costume Closet A"]:
        assert expected in names, f"Expected seeded location {expected}"


def test_locations_create_duplicate_delete(session):
    new_name = f"TEST_LOC_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/locations", json={"name": new_name})
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["name"] == new_name
    loc_id = created["id"]

    # duplicate => 409
    r2 = session.post(f"{API}/locations", json={"name": new_name})
    assert r2.status_code == 409

    # delete
    r3 = session.delete(f"{API}/locations/{loc_id}")
    assert r3.status_code == 200

    # delete again -> 404
    r4 = session.delete(f"{API}/locations/{loc_id}")
    assert r4.status_code == 404


# ---------- Categories ----------
def test_categories_seeded(session):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    names = {x["name"] for x in r.json()}
    for expected in ["Historical", "Fantasy", "Modern"]:
        assert expected in names


def test_categories_create(session):
    new_name = f"TEST_CAT_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/categories", json={"name": new_name})
    assert r.status_code == 200
    assert r.json()["name"] == new_name


# ---------- Costumes CRUD ----------
@pytest.fixture
def created_costume(session):
    payload = {
        "name": f"TEST_Costume_{uuid.uuid4().hex[:6]}",
        "category": "Historical",
        "location": "Main Wardrobe",
        "notes": "Test entry",
        "sizes": {"XS": 1, "S": 2, "M": 3, "L": 4, "XL": 5},
    }
    r = session.post(f"{API}/costumes", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    yield data
    # cleanup
    session.delete(f"{API}/costumes/{data['id']}")


def test_create_costume_computes_total(created_costume):
    assert created_costume["total_quantity"] == 1 + 2 + 3 + 4 + 5
    assert created_costume["sizes"]["M"] == 3
    assert "id" in created_costume
    assert created_costume["created_at"]


def test_get_costume_by_id(session, created_costume):
    r = session.get(f"{API}/costumes/{created_costume['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created_costume["id"]


def test_get_costume_404(session):
    r = session.get(f"{API}/costumes/{uuid.uuid4()}")
    assert r.status_code == 404


def test_list_costumes_filters(session, created_costume):
    # full list
    r = session.get(f"{API}/costumes")
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert created_costume["id"] in ids

    # search by q
    q = created_costume["name"][:8]
    r = session.get(f"{API}/costumes", params={"q": q})
    assert r.status_code == 200
    assert any(c["id"] == created_costume["id"] for c in r.json())

    # filter by category
    r = session.get(f"{API}/costumes", params={"category": "Historical"})
    assert r.status_code == 200
    assert any(c["id"] == created_costume["id"] for c in r.json())

    # filter by size XS (qty 1, should be included)
    r = session.get(f"{API}/costumes", params={"size": "XS"})
    assert r.status_code == 200
    assert any(c["id"] == created_costume["id"] for c in r.json())


def test_size_filter_excludes_zero(session):
    # create costume with size XS=0
    payload = {
        "name": f"TEST_ZeroXS_{uuid.uuid4().hex[:6]}",
        "category": "Modern",
        "location": "Main Wardrobe",
        "sizes": {"XS": 0, "S": 1, "M": 0, "L": 0, "XL": 0},
    }
    r = session.post(f"{API}/costumes", json=payload)
    assert r.status_code == 200
    cid = r.json()["id"]
    try:
        r = session.get(f"{API}/costumes", params={"size": "XS"})
        ids = [c["id"] for c in r.json()]
        assert cid not in ids
        r = session.get(f"{API}/costumes", params={"size": "S"})
        ids = [c["id"] for c in r.json()]
        assert cid in ids
    finally:
        session.delete(f"{API}/costumes/{cid}")


def test_update_costume_recomputes_total(session, created_costume):
    new_sizes = {"XS": 0, "S": 0, "M": 0, "L": 0, "XL": 10}
    r = session.put(f"{API}/costumes/{created_costume['id']}",
                    json={"sizes": new_sizes, "name": "TEST_UpdatedName"})
    assert r.status_code == 200
    data = r.json()
    assert data["total_quantity"] == 10
    assert data["name"] == "TEST_UpdatedName"

    # GET verification
    r = session.get(f"{API}/costumes/{created_costume['id']}")
    assert r.json()["total_quantity"] == 10


def test_delete_costume(session):
    payload = {
        "name": f"TEST_Del_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizes": {k: 1 for k in SIZE_KEYS},
    }
    r = session.post(f"{API}/costumes", json=payload)
    cid = r.json()["id"]
    r = session.delete(f"{API}/costumes/{cid}")
    assert r.status_code == 200
    r = session.get(f"{API}/costumes/{cid}")
    assert r.status_code == 404


# ---------- Upload (external dependency) ----------
def test_upload_image_contract():
    """Test upload endpoint contract. May 503 if storage unavailable."""
    # Minimal valid PNG
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
        b"\xcf\xc0\x00\x00\x00\x03\x00\x01\x5a\x8e\xb4\xa8\x00\x00\x00\x00"
        b"IEND\xaeB`\x82"
    )
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
    r = requests.post(f"{API}/upload", files=files, timeout=60)
    if r.status_code == 503:
        pytest.skip("Storage service unavailable (external dependency)")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "image_id" in data and "url" in data
    image_id = data["image_id"]
    assert data["url"] == f"/api/images/{image_id}"

    # GET image
    r2 = requests.get(f"{API}/images/{image_id}", timeout=60)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")
    assert len(r2.content) > 0



# ---------- Iteration 2: Stats extended fields ----------
def test_stats_has_flagged(session):
    r = session.get(f"{API}/stats")
    assert r.status_code == 200
    data = r.json()
    assert "flagged_count" in data
    assert isinstance(data["flagged_count"], int)


# ---------- Iteration 2: sub_location, size_notes, flag on create ----------
def test_create_costume_with_new_fields(session):
    payload = {
        "name": f"TEST_Flag_{uuid.uuid4().hex[:6]}",
        "category": "Historical",
        "location": "Costume Closet A",
        "sub_location": "B2",
        "notes": "general notes",
        "sizes": {"XS": 1, "S": 0, "M": 0, "L": 0, "XL": 0, "XXL": 3, "XXXL": 2},
        "size_notes": {"XS": "torn", "XXXL": "brand new"},
        "is_flagged": True,
        "flag_reason": "needs repair",
    }
    r = session.post(f"{API}/costumes", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    cid = d["id"]
    try:
        assert d["sub_location"] == "B2"
        assert d["sizes"]["XXL"] == 3
        assert d["sizes"]["XXXL"] == 2
        assert d["total_quantity"] == 6
        assert d["size_notes"]["XS"] == "torn"
        assert d["size_notes"]["XXXL"] == "brand new"
        assert d["is_flagged"] is True
        assert d["flag_reason"] == "needs repair"
        assert d["flagged_at"] is not None

        # GET verify persistence
        r2 = session.get(f"{API}/costumes/{cid}")
        g = r2.json()
        assert g["sub_location"] == "B2"
        assert g["sizes"]["XXXL"] == 2
        assert g["is_flagged"] is True
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ---------- Iteration 2: PUT updates for new fields ----------
def test_put_updates_new_fields_and_unflag(session):
    payload = {
        "name": f"TEST_PutFlag_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizes": {k: 0 for k in SIZE_KEYS},
        "is_flagged": True, "flag_reason": "initial",
    }
    r = session.post(f"{API}/costumes", json=payload)
    cid = r.json()["id"]
    try:
        # update sub_location + size_notes
        r = session.put(f"{API}/costumes/{cid}", json={
            "sub_location": "Shelf 3",
            "size_notes": {"XXL": "faded"},
        })
        assert r.status_code == 200
        d = r.json()
        assert d["sub_location"] == "Shelf 3"
        assert d["size_notes"]["XXL"] == "faded"

        # unflag via is_flagged=False -> clears reason + flagged_at
        r = session.put(f"{API}/costumes/{cid}", json={"is_flagged": False})
        d = r.json()
        assert d["is_flagged"] is False
        assert d["flag_reason"] == ""
        assert d["flagged_at"] is None
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ---------- Iteration 2: /flag and /unflag endpoints ----------
def test_flag_unflag_endpoints(session):
    payload = {
        "name": f"TEST_FUEP_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizes": {k: 0 for k in SIZE_KEYS},
    }
    cid = session.post(f"{API}/costumes", json=payload).json()["id"]
    try:
        r = session.post(f"{API}/costumes/{cid}/flag", json={"reason": "missing button"})
        assert r.status_code == 200
        d = r.json()
        assert d["is_flagged"] is True
        assert d["flag_reason"] == "missing button"
        assert d["flagged_at"] is not None

        r = session.post(f"{API}/costumes/{cid}/unflag")
        assert r.status_code == 200
        d = r.json()
        assert d["is_flagged"] is False
        assert d["flag_reason"] == ""
        assert d["flagged_at"] is None
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ---------- Iteration 2: /flagged listing and filter=flagged ----------
def test_flagged_list_and_filter(session):
    ids = []
    for i in range(2):
        p = {
            "name": f"TEST_FLGD_{i}_{uuid.uuid4().hex[:6]}",
            "category": "Modern", "location": "Main Wardrobe",
            "sizes": {k: 0 for k in SIZE_KEYS},
            "is_flagged": True, "flag_reason": f"reason {i}",
        }
        ids.append(session.post(f"{API}/costumes", json=p).json()["id"])
    try:
        r = session.get(f"{API}/flagged")
        assert r.status_code == 200
        rows = r.json()
        rids = [c["id"] for c in rows]
        for cid in ids:
            assert cid in rids
        # sorted desc by flagged_at
        flagged_ats = [c["flagged_at"] for c in rows if c["flagged_at"]]
        assert flagged_ats == sorted(flagged_ats, reverse=True)

        # query param flagged=true
        r = session.get(f"{API}/costumes", params={"flagged": "true"})
        assert r.status_code == 200
        assert all(c["is_flagged"] for c in r.json())
        r_ids = {c["id"] for c in r.json()}
        for cid in ids:
            assert cid in r_ids

        # flagged=false excludes them
        r = session.get(f"{API}/costumes", params={"flagged": "false"})
        r_ids = {c["id"] for c in r.json()}
        for cid in ids:
            assert cid not in r_ids
    finally:
        for cid in ids:
            session.delete(f"{API}/costumes/{cid}")


# ---------- Iteration 2: /locations/costume-counts ----------
def test_location_costume_counts(session):
    p = {
        "name": f"TEST_LCC_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizes": {"M": 4, **{k: 0 for k in SIZE_KEYS if k != "M"}},
    }
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    try:
        r = session.get(f"{API}/locations/costume-counts")
        assert r.status_code == 200
        data = r.json()
        assert "Main Wardrobe" in data
        entry = data["Main Wardrobe"]
        assert "count" in entry and "items" in entry
        assert entry["count"] >= 1
        assert entry["items"] >= 4
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ---------- Iteration 2: DELETE category with 409/200/404 ----------
def test_delete_category_semantics(session):
    # 404 case
    r = session.delete(f"{API}/categories/{uuid.uuid4()}")
    assert r.status_code == 404

    # Create category, use it, expect 409
    cat_name = f"TEST_INUSE_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/categories", json={"name": cat_name})
    cat_id = r.json()["id"]

    p = {"name": f"TEST_USE_{uuid.uuid4().hex[:6]}",
         "category": cat_name, "location": "Main Wardrobe",
         "sizes": {k: 0 for k in SIZE_KEYS}}
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    try:
        r = session.delete(f"{API}/categories/{cat_id}")
        assert r.status_code == 409
    finally:
        session.delete(f"{API}/costumes/{cid}")

    # Now not in use -> 200
    r = session.delete(f"{API}/categories/{cat_id}")
    assert r.status_code == 200

    # Repeated -> 404
    r = session.delete(f"{API}/categories/{cat_id}")
    assert r.status_code == 404


# ---------- Iteration 2: settings ----------
def test_settings_default_and_update(session):
    r = session.get(f"{API}/settings")
    assert r.status_code == 200
    d = r.json()
    for k in ["org_name", "default_view", "show_flag_banner"]:
        assert k in d

    # invalid default_view
    r = session.put(f"{API}/settings", json={"default_view": "cards"})
    assert r.status_code == 400

    # update valid
    r = session.put(f"{API}/settings",
                    json={"org_name": "TEST_ORG", "default_view": "list", "show_flag_banner": False})
    assert r.status_code == 200
    d = r.json()
    assert d["org_name"] == "TEST_ORG"
    assert d["default_view"] == "list"
    assert d["show_flag_banner"] is False

    # persistence
    r = session.get(f"{API}/settings")
    d = r.json()
    assert d["org_name"] == "TEST_ORG"
    assert d["default_view"] == "list"

    # restore
    session.put(f"{API}/settings",
                json={"org_name": "Wardrobe/OS", "default_view": "grid", "show_flag_banner": True})


# ---------- Iteration 2: backwards-compat with missing size keys ----------
def test_backcompat_missing_xxl_keys(session):
    # legacy payload without XXL/XXXL - arbitrary keys now, they simply won't be present
    p = {
        "name": f"TEST_LEGACY_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizes": {"XS": 0, "S": 1, "M": 0, "L": 0, "XL": 0},
    }
    r = session.post(f"{API}/costumes", json=p)
    assert r.status_code == 200
    d = r.json()
    cid = d["id"]
    try:
        # arbitrary keys accepted; XXL/XXXL are simply absent (not defaulted to 0)
        assert d["sizes"].get("S") == 1
        assert d["total_quantity"] == 1
        # GET returns same
        d2 = session.get(f"{API}/costumes/{cid}").json()
        assert d2["sizes"].get("S") == 1
        # default sizing_system on missing
        assert d2["sizing_system"] == "Letter"
        assert d2["keywords"] == []
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ============================================================
# Iteration 3: Sizing Systems CRUD
# ============================================================
def test_sizing_systems_seeded(session):
    r = session.get(f"{API}/sizing-systems")
    assert r.status_code == 200
    systems = {s["name"]: s for s in r.json()}
    for expected in ["Letter", "Number (Even)", "Tall", "Petite"]:
        assert expected in systems, f"missing seeded system {expected}"
    # Verify Letter sizes
    assert "XS" in systems["Letter"]["sizes"]
    assert "XXXL" in systems["Letter"]["sizes"]
    # Number (Even) sizes
    assert "0" in systems["Number (Even)"]["sizes"]
    assert "30" in systems["Number (Even)"]["sizes"]
    # Tall
    assert "4T" in systems["Tall"]["sizes"]
    # Petite
    assert "4P" in systems["Petite"]["sizes"]


def test_sizing_system_crud(session):
    name = f"TEST_SYS_{uuid.uuid4().hex[:6]}"
    payload = {"name": name, "sizes": ["A", "B", "C"]}
    r = session.post(f"{API}/sizing-systems", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    sid = d["id"]
    assert d["name"] == name
    assert d["sizes"] == ["A", "B", "C"]

    # Duplicate 409
    r = session.post(f"{API}/sizing-systems", json=payload)
    assert r.status_code == 409

    # Update
    r = session.put(f"{API}/sizing-systems/{sid}", json={"name": name, "sizes": ["X", "Y"]})
    assert r.status_code == 200
    assert r.json()["sizes"] == ["X", "Y"]

    # GET verify
    r = session.get(f"{API}/sizing-systems")
    assert any(s["id"] == sid and s["sizes"] == ["X", "Y"] for s in r.json())

    # Delete
    r = session.delete(f"{API}/sizing-systems/{sid}")
    assert r.status_code == 200

    # Delete again -> 404
    r = session.delete(f"{API}/sizing-systems/{sid}")
    assert r.status_code == 404


def test_sizing_system_delete_in_use_409(session):
    name = f"TEST_INUSE_SYS_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/sizing-systems", json={"name": name, "sizes": ["A", "B"]})
    sid = r.json()["id"]
    # Create costume using this system
    p = {
        "name": f"TEST_C_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizing_system": name,
        "sizes": {"A": 3, "B": 2},
    }
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    try:
        r = session.delete(f"{API}/sizing-systems/{sid}")
        assert r.status_code == 409
    finally:
        session.delete(f"{API}/costumes/{cid}")
        session.delete(f"{API}/sizing-systems/{sid}")


# ============================================================
# Iteration 3: Subcategories
# ============================================================
def test_categories_have_subcategories_field(session):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    for c in r.json():
        assert "subcategories" in c
        assert isinstance(c["subcategories"], list)


def test_subcategory_add_and_delete(session):
    name = f"TEST_SUBCAT_CAT_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/categories", json={"name": name})
    cat_id = r.json()["id"]
    try:
        # Add subcategory
        r = session.post(f"{API}/categories/{cat_id}/subcategories", json={"name": "Formal"})
        assert r.status_code == 200, r.text
        assert "Formal" in r.json()["subcategories"]

        # Duplicate 409
        r = session.post(f"{API}/categories/{cat_id}/subcategories", json={"name": "Formal"})
        assert r.status_code == 409

        # Empty name 400
        r = session.post(f"{API}/categories/{cat_id}/subcategories", json={"name": "  "})
        assert r.status_code == 400

        # 404 unknown category
        r = session.post(f"{API}/categories/{uuid.uuid4()}/subcategories", json={"name": "X"})
        assert r.status_code == 404

        # Add another
        session.post(f"{API}/categories/{cat_id}/subcategories", json={"name": "CasualWear"})

        # GET list reflects
        r = session.get(f"{API}/categories")
        cat = next(c for c in r.json() if c["id"] == cat_id)
        assert "Formal" in cat["subcategories"]
        assert "CasualWear" in cat["subcategories"]

        # Delete (URL-encoded name)
        import urllib.parse
        encoded = urllib.parse.quote("CasualWear", safe="")
        r = session.delete(f"{API}/categories/{cat_id}/subcategories/{encoded}")
        assert r.status_code == 200

        r = session.get(f"{API}/categories")
        cat = next(c for c in r.json() if c["id"] == cat_id)
        assert "CasualWear" not in cat["subcategories"]
        assert "Formal" in cat["subcategories"]
    finally:
        # Manually cleanup category (must have no costumes)
        session.delete(f"{API}/categories/{cat_id}")


# ============================================================
# Iteration 3: Costume with new fields
# ============================================================
def test_create_costume_with_iteration3_fields(session):
    p = {
        "name": f"TEST_IT3_{uuid.uuid4().hex[:6]}",
        "category": "Historical",
        "subcategory": "Victorian",
        "location": "Main Wardrobe",
        "sizing_system": "Number (Even)",
        "sizes": {"0": 1, "4": 2, "10": 3},
        "size_notes": {"4": "needs mending"},
        "keywords": ["ball gown", "  lace  ", "", "vintage"],
        "last_year_used": 2023,
    }
    r = session.post(f"{API}/costumes", json=p)
    assert r.status_code == 200, r.text
    d = r.json()
    cid = d["id"]
    try:
        assert d["sizing_system"] == "Number (Even)"
        assert d["subcategory"] == "Victorian"
        assert d["sizes"] == {"0": 1, "4": 2, "10": 3}
        assert d["total_quantity"] == 6
        assert d["size_notes"]["4"] == "needs mending"
        # keywords trimmed & filtered
        assert "ball gown" in d["keywords"]
        assert "lace" in d["keywords"]
        assert "vintage" in d["keywords"]
        assert "" not in d["keywords"]
        assert d["last_year_used"] == 2023

        # GET verify
        r2 = session.get(f"{API}/costumes/{cid}")
        g = r2.json()
        assert g["sizing_system"] == "Number (Even)"
        assert g["subcategory"] == "Victorian"
        assert g["keywords"] == d["keywords"]
        assert g["last_year_used"] == 2023
        assert g["sizes"]["10"] == 3
    finally:
        session.delete(f"{API}/costumes/{cid}")


def test_update_costume_iteration3_fields(session):
    p = {
        "name": f"TEST_IT3U_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizing_system": "Letter",
        "sizes": {"S": 1},
        "keywords": ["initial"],
    }
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    try:
        r = session.put(f"{API}/costumes/{cid}", json={
            "keywords": ["  hero  ", "villain", "", "hero"],
            "last_year_used": 2020,
            "sizing_system": "Tall",
            "subcategory": "Kids",
            "sizes": {"4T": 2, "6T": 1},
            "size_notes": {"4T": "tight"},
        })
        assert r.status_code == 200, r.text
        d = r.json()
        # keywords trimmed
        assert "hero" in d["keywords"]
        assert "villain" in d["keywords"]
        assert "" not in d["keywords"]
        assert d["last_year_used"] == 2020
        assert d["sizing_system"] == "Tall"
        assert d["subcategory"] == "Kids"
        assert d["sizes"] == {"4T": 2, "6T": 1}
        assert d["total_quantity"] == 3
        assert d["size_notes"]["4T"] == "tight"

        # PUT can set last_year_used back to null via explicit None? update uses exclude_none.
        # Instead, test we can leave existing keywords when omitted
        r = session.put(f"{API}/costumes/{cid}", json={"name": "TEST_IT3U_renamed"})
        d = r.json()
        assert d["keywords"]  # preserved
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ============================================================
# Iteration 3: list_costumes query params + sorts
# ============================================================
def test_list_costumes_iteration3_filters_and_sort(session):
    # Create three costumes with distinct last_year_used
    ids = []
    for i, (yr, sys, sub) in enumerate([
        (2020, "Letter", "SubA"),
        (2023, "Tall", "SubB"),
        (None, "Letter", "SubA"),
    ]):
        p = {
            "name": f"TEST_SORT_{i}_{uuid.uuid4().hex[:6]}",
            "category": "Modern", "location": "Main Wardrobe",
            "subcategory": sub, "sizing_system": sys,
            "sizes": {"S": i + 1} if sys == "Letter" else {"4T": i + 1},
            "last_year_used": yr,
            "keywords": [f"kwtag{i}"],
        }
        ids.append((session.post(f"{API}/costumes", json=p).json()["id"], yr, sys, sub))
    try:
        my_ids = {t[0] for t in ids}

        # filter subcategory
        r = session.get(f"{API}/costumes", params={"subcategory": "SubA"})
        assert r.status_code == 200
        got = [c for c in r.json() if c["id"] in my_ids]
        assert {c["subcategory"] for c in got} == {"SubA"}
        assert len(got) == 2

        # filter sizing_system
        r = session.get(f"{API}/costumes", params={"sizing_system": "Tall"})
        got = [c for c in r.json() if c["id"] in my_ids]
        assert len(got) == 1
        assert got[0]["sizing_system"] == "Tall"

        # sort=last_used_asc nulls last
        r = session.get(f"{API}/costumes", params={"sort": "last_used_asc"})
        ordered = [c for c in r.json() if c["id"] in my_ids]
        years = [c["last_year_used"] for c in ordered]
        # non-null years ascending, then None at end
        non_null = [y for y in years if y is not None]
        assert non_null == sorted(non_null)
        assert years[-1] is None  # nulls last

        # sort=last_used_desc
        r = session.get(f"{API}/costumes", params={"sort": "last_used_desc"})
        ordered = [c for c in r.json() if c["id"] in my_ids]
        years = [c["last_year_used"] for c in ordered if c["last_year_used"] is not None]
        assert years == sorted(years, reverse=True)

        # sort=name_asc
        r = session.get(f"{API}/costumes", params={"sort": "name_asc"})
        assert r.status_code == 200
        # sort=total_desc
        r = session.get(f"{API}/costumes", params={"sort": "total_desc"})
        assert r.status_code == 200
        # sort=system_size
        r = session.get(f"{API}/costumes", params={"sort": "system_size"})
        assert r.status_code == 200

        # keyword search via q
        r = session.get(f"{API}/costumes", params={"q": "kwtag1"})
        got_ids = {c["id"] for c in r.json()}
        assert ids[1][0] in got_ids
    finally:
        for cid, *_ in ids:
            session.delete(f"{API}/costumes/{cid}")
