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

SIZE_KEYS = ["XS", "S", "M", "L", "XL"]


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
