"""Backend pytest tests for Costume Inventory Tracker — Iteration 4."""
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


# ---------- Locations (Iteration 4 hierarchy) ----------
def test_locations_seeded_and_hierarchical_fields(session):
    r = session.get(f"{API}/locations")
    assert r.status_code == 200
    docs = r.json()
    names = {x["name"] for x in docs}
    for expected in ["Main Wardrobe", "Backstage Storage", "Costume Closet A"]:
        assert expected in names
    # Every doc must have parent_id, path, depth (post-migration)
    for d in docs:
        assert "parent_id" in d
        assert "path" in d and d["path"]
        assert "depth" in d
        assert isinstance(d["depth"], int)


def test_locations_hierarchy_crud(session):
    root_name = f"TEST_ROOT_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/locations", json={"name": root_name})
    assert r.status_code == 200, r.text
    root = r.json()
    assert root["parent_id"] is None
    assert root["depth"] == 0
    assert root["path"] == root_name

    # Child
    child_name = "A"
    r = session.post(f"{API}/locations", json={"name": child_name, "parent_id": root["id"]})
    assert r.status_code == 200
    child = r.json()
    assert child["parent_id"] == root["id"]
    assert child["depth"] == 1
    assert child["path"] == f"{root_name} / A"

    # Grandchild (depth 2)
    r = session.post(f"{API}/locations", json={"name": "1", "parent_id": child["id"]})
    grand = r.json()
    assert grand["depth"] == 2
    assert grand["path"] == f"{root_name} / A / 1"

    # Great-grandchild (depth 3)
    r = session.post(f"{API}/locations", json={"name": "x", "parent_id": grand["id"]})
    ggchild = r.json()
    assert ggchild["depth"] == 3
    assert ggchild["path"] == f"{root_name} / A / 1 / x"

    # Duplicate sibling => 409
    r = session.post(f"{API}/locations", json={"name": "A", "parent_id": root["id"]})
    assert r.status_code == 409

    # Slash in name => 400
    r = session.post(f"{API}/locations", json={"name": "bad/name"})
    assert r.status_code == 400

    # But same name under DIFFERENT parent is allowed
    r = session.post(f"{API}/locations", json={"name": "A", "parent_id": grand["id"]})
    assert r.status_code == 200

    # Rename with slash => 400
    r = session.put(f"{API}/locations/{child['id']}", json={"name": "bad/n"})
    assert r.status_code == 400

    # Rename to duplicate sibling => need another root+sibling
    sib_name = "Sibling"
    r_sib = session.post(f"{API}/locations", json={"name": sib_name, "parent_id": root["id"]})
    assert r_sib.status_code == 200
    r = session.put(f"{API}/locations/{r_sib.json()['id']}", json={"name": child_name})
    assert r.status_code == 409

    # Rename ok
    r = session.put(f"{API}/locations/{r_sib.json()['id']}", json={"name": "Sibling2"})
    assert r.status_code == 200
    assert r.json()["name"] == "Sibling2"

    # Delete node with children => 409
    r = session.delete(f"{API}/locations/{root['id']}")
    assert r.status_code == 409

    # Cleanup depth-first
    # ggchild -> grand -> child A2 -> child -> Sibling2 -> root
    # find the second 'A' under grand
    r = session.get(f"{API}/locations")
    all_locs = r.json()
    second_a = next(l for l in all_locs if l["name"] == "A" and l["parent_id"] == grand["id"])
    for lid in [ggchild["id"], second_a["id"], grand["id"], child["id"], r_sib.json()["id"], root["id"]]:
        rr = session.delete(f"{API}/locations/{lid}")
        assert rr.status_code == 200, f"delete {lid}: {rr.text}"

    # 404 after delete
    r = session.delete(f"{API}/locations/{root['id']}")
    assert r.status_code == 404


# ---------- Shows CRUD (Iteration 4) ----------
def test_shows_crud_and_dupe(session):
    name = f"TEST_SHOW_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/shows", json={"name": name, "year": 1999})
    assert r.status_code == 200, r.text
    show = r.json()
    assert show["name"] == name
    assert show["year"] == 1999

    # dupe name+year => 409
    r = session.post(f"{API}/shows", json={"name": name, "year": 1999})
    assert r.status_code == 409

    # same name, different year is OK
    r = session.post(f"{API}/shows", json={"name": name, "year": 2000})
    assert r.status_code == 200
    show2_id = r.json()["id"]

    # list is sorted by year asc (nulls last), then name
    r = session.get(f"{API}/shows")
    assert r.status_code == 200
    lst = r.json()
    assert any(s["id"] == show["id"] for s in lst)

    # PUT edit year
    r = session.put(f"{API}/shows/{show['id']}", json={"name": name, "year": 2005})
    assert r.status_code == 200
    assert r.json()["year"] == 2005

    # cleanup
    session.delete(f"{API}/shows/{show['id']}")
    session.delete(f"{API}/shows/{show2_id}")

    # delete non-existent => 404
    r = session.delete(f"{API}/shows/{uuid.uuid4()}")
    assert r.status_code == 404


def test_show_delete_409_when_used_and_origin_year_propagation(session):
    # Create show
    show_name = f"TEST_ORIG_SHOW_{uuid.uuid4().hex[:6]}"
    show = session.post(f"{API}/shows", json={"name": show_name, "year": 2015}).json()
    add_show = session.post(f"{API}/shows", json={"name": f"{show_name}_add", "year": 2016}).json()

    # Create costume referencing show as original
    p = {
        "name": f"TEST_ORIG_{uuid.uuid4().hex[:6]}",
        "category": "Historical",
        "location": "Main Wardrobe",
        "creator": "Jane Doe",
        "original_show_id": show["id"],
        "additional_show_ids": [add_show["id"]],
        "sizes": {"S": 1},
    }
    r = session.post(f"{API}/costumes", json=p)
    assert r.status_code == 200, r.text
    c = r.json()
    cid = c["id"]
    try:
        # origin_year auto-populated
        assert c["origin_year"] == 2015
        assert c["creator"] == "Jane Doe"
        assert c["original_show_id"] == show["id"]
        assert add_show["id"] in c["additional_show_ids"]

        # DELETE show used as original => 409
        r = session.delete(f"{API}/shows/{show['id']}")
        assert r.status_code == 409

        # DELETE additional show => 409
        r = session.delete(f"{API}/shows/{add_show['id']}")
        assert r.status_code == 409

        # PUT show year => propagates to costume.origin_year
        r = session.put(f"{API}/shows/{show['id']}", json={"name": show_name, "year": 1975})
        assert r.status_code == 200
        # verify propagation
        r = session.get(f"{API}/costumes/{cid}")
        assert r.json()["origin_year"] == 1975
    finally:
        session.delete(f"{API}/costumes/{cid}")
        session.delete(f"{API}/shows/{show['id']}")
        session.delete(f"{API}/shows/{add_show['id']}")


# ---------- Costume CRUD & new fields ----------
@pytest.fixture
def created_costume(session):
    payload = {
        "name": f"TEST_Costume_{uuid.uuid4().hex[:6]}",
        "category": "Historical",
        "location": "Main Wardrobe",
        "notes": "Test",
        "sizes": {"XS": 1, "S": 2, "M": 3},
    }
    r = session.post(f"{API}/costumes", json=payload)
    assert r.status_code == 200
    data = r.json()
    yield data
    session.delete(f"{API}/costumes/{data['id']}")


def test_create_costume_totals_and_defaults(created_costume):
    assert created_costume["total_quantity"] == 6
    # Iteration 4 defaults
    assert created_costume["creator"] == ""
    assert created_costume["original_show_id"] is None
    assert created_costume["additional_show_ids"] == []
    assert created_costume["origin_year"] is None
    # last_year_used should NOT be present (removed from model)
    assert "last_year_used" not in created_costume


def test_get_costume_404(session):
    r = session.get(f"{API}/costumes/{uuid.uuid4()}")
    assert r.status_code == 404


def test_update_costume_change_original_show_updates_origin_year(session):
    s1 = session.post(f"{API}/shows", json={"name": f"TEST_S1_{uuid.uuid4().hex[:6]}", "year": 2010}).json()
    s2 = session.post(f"{API}/shows", json={"name": f"TEST_S2_{uuid.uuid4().hex[:6]}", "year": 2022}).json()
    p = {
        "name": f"TEST_OY_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "original_show_id": s1["id"], "sizes": {"S": 1},
    }
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    try:
        # switch to s2
        r = session.put(f"{API}/costumes/{cid}", json={"original_show_id": s2["id"]})
        assert r.status_code == 200
        assert r.json()["origin_year"] == 2022
    finally:
        session.delete(f"{API}/costumes/{cid}")
        session.delete(f"{API}/shows/{s1['id']}")
        session.delete(f"{API}/shows/{s2['id']}")


def test_delete_costume(session):
    p = {"name": f"TEST_D_{uuid.uuid4().hex[:6]}", "category": "Modern",
         "location": "Main Wardrobe", "sizes": {"S": 1}}
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    assert session.delete(f"{API}/costumes/{cid}").status_code == 200
    assert session.get(f"{API}/costumes/{cid}").status_code == 404


# ---------- Sorts (Iteration 4) ----------
def test_list_costumes_sorts_iteration4(session):
    # Create shows with distinct years
    y1 = session.post(f"{API}/shows", json={"name": f"TEST_YR_{uuid.uuid4().hex[:6]}", "year": 1990}).json()
    y2 = session.post(f"{API}/shows", json={"name": f"TEST_YR_{uuid.uuid4().hex[:6]}", "year": 2020}).json()

    ids = []
    for i, sid in enumerate([y1["id"], y2["id"], None]):
        p = {
            "name": f"TEST_SORT4_{i}_{uuid.uuid4().hex[:6]}",
            "category": "Modern", "location": "Main Wardrobe",
            "original_show_id": sid, "sizes": {"S": i + 1},
        }
        ids.append(session.post(f"{API}/costumes", json=p).json()["id"])
    try:
        my = set(ids)
        # default = origin_year_asc, nulls last
        r = session.get(f"{API}/costumes")
        assert r.status_code == 200
        mine = [c for c in r.json() if c["id"] in my]
        years = [c["origin_year"] for c in mine]
        non_null = [y for y in years if y is not None]
        assert non_null == sorted(non_null)
        assert years[-1] is None  # null last

        # explicit origin_year_asc
        r = session.get(f"{API}/costumes", params={"sort": "origin_year_asc"})
        assert r.status_code == 200

        # origin_year_desc
        r = session.get(f"{API}/costumes", params={"sort": "origin_year_desc"})
        assert r.status_code == 200
        mine = [c for c in r.json() if c["id"] in my]
        yrs = [c["origin_year"] for c in mine if c["origin_year"] is not None]
        assert yrs == sorted(yrs, reverse=True)

        # Other sorts should return 200
        for s in ["updated_desc", "name_asc", "total_desc", "system_size"]:
            r = session.get(f"{API}/costumes", params={"sort": s})
            assert r.status_code == 200, f"sort {s} failed"

        # Removed sorts should NOT 500 (falls through to default)
        for s in ["last_used_asc", "last_used_desc"]:
            r = session.get(f"{API}/costumes", params={"sort": s})
            assert r.status_code == 200, f"legacy sort {s} 500'd"
    finally:
        for cid in ids:
            session.delete(f"{API}/costumes/{cid}")
        session.delete(f"{API}/shows/{y1['id']}")
        session.delete(f"{API}/shows/{y2['id']}")


# ---------- Backwards compat ----------
def test_backcompat_legacy_costume_without_iter4_fields(session):
    # Legacy costume with last_year_used field simulated
    p = {
        "name": f"TEST_LEGACY_{uuid.uuid4().hex[:6]}",
        "category": "Modern", "location": "Main Wardrobe",
        "sizes": {"S": 1},
        # deliberately do NOT set creator/origin/show fields
    }
    r = session.post(f"{API}/costumes", json=p)
    assert r.status_code == 200
    cid = r.json()["id"]
    try:
        r = session.get(f"{API}/costumes")
        assert r.status_code == 200
        # legacy items (if any) should be present without erroring
        # Also verify GET single item
        r2 = session.get(f"{API}/costumes/{cid}")
        assert r2.status_code == 200
        g = r2.json()
        assert g["creator"] == ""
        assert g["origin_year"] is None
        assert g["additional_show_ids"] == []
    finally:
        session.delete(f"{API}/costumes/{cid}")


# ---------- Categories (existing behavior) ----------
def test_categories_seeded(session):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    names = {x["name"] for x in r.json()}
    assert "Historical" in names


def test_flag_unflag_endpoints(session):
    p = {"name": f"TEST_F_{uuid.uuid4().hex[:6]}", "category": "Modern",
         "location": "Main Wardrobe", "sizes": {"S": 1}}
    cid = session.post(f"{API}/costumes", json=p).json()["id"]
    try:
        r = session.post(f"{API}/costumes/{cid}/flag", json={"reason": "test"})
        assert r.status_code == 200 and r.json()["is_flagged"] is True
        r = session.post(f"{API}/costumes/{cid}/unflag")
        assert r.status_code == 200 and r.json()["is_flagged"] is False
    finally:
        session.delete(f"{API}/costumes/{cid}")


def test_settings_default_view(session):
    r = session.get(f"{API}/settings")
    assert r.status_code == 200
    assert "default_view" in r.json()


def test_upload_image_contract():
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
           b"\xcf\xc0\x00\x00\x00\x03\x00\x01\x5a\x8e\xb4\xa8\x00\x00\x00\x00"
           b"IEND\xaeB`\x82")
    files = {"file": ("t.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{API}/upload", files=files, timeout=60)
    if r.status_code == 503:
        pytest.skip("Storage service unavailable")
    assert r.status_code == 200
