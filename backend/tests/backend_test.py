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
    for k in ["total_costumes", "total_items", "categories", "by_size"]:
        assert k in data
    for sk in SIZE_KEYS:
        assert sk in data["by_size"]
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
def test_stats_has_flagged_and_extra_sizes(session):
    r = session.get(f"{API}/stats")
    assert r.status_code == 200
    data = r.json()
    assert "flagged_count" in data
    assert isinstance(data["flagged_count"], int)
    for k in ["XXL", "XXXL"]:
        assert k in data["by_size"], f"missing size key {k} in by_size"


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
    # legacy payload without XXL/XXXL
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
        # server should default missing keys to 0
        assert d["sizes"]["XXL"] == 0
        assert d["sizes"]["XXXL"] == 0
        # GET returns same
        d2 = session.get(f"{API}/costumes/{cid}").json()
        assert d2["sizes"]["XXL"] == 0
        assert d2["sizes"]["XXXL"] == 0
    finally:
        session.delete(f"{API}/costumes/{cid}")
