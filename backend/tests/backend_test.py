"""Backend pytest tests for Costume Inventory Tracker — Iteration 6."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


ADMIN_EMAIL = "admin@luxe.test"
ADMIN_PASSWORD = "LuxeAdmin!23"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Login as admin so protected endpoints return 200 (iteration 10 auth gate)
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        # try register (first-user bootstrap or hybrid attach)
        s.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "name": "LUXE Admin"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Cannot log in as admin: {r.status_code} {r.text}"
    return s


# ---------- Health ----------
def test_api_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_stats_shape(session):
    r = session.get(f"{API}/stats")
    assert r.status_code == 200
    for k in ["total_costumes", "total_items", "categories", "category_count", "locations_in_use", "flagged_count"]:
        assert k in r.json()


# ==============================================================
# Iteration 5 — Subcategories as nested objects {id,name,parent_id}
# ==============================================================
@pytest.fixture
def temp_category(session):
    name = f"TEST_CAT_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/categories", json={"name": name})
    assert r.status_code == 200
    cat = r.json()
    yield cat
    session.delete(f"{API}/categories/{cat['id']}")


def _get_cat(session, cid):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    return next((c for c in r.json() if c["id"] == cid), None)


def test_categories_returns_subcategories_as_objects(session, temp_category):
    cat = _get_cat(session, temp_category["id"])
    assert cat is not None
    assert isinstance(cat["subcategories"], list)
    # Empty is fine — but should still be a list (object shape verified below)


def test_subcategory_add_rename_delete_flat(session, temp_category):
    cid = temp_category["id"]
    # Add root
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "Formal"})
    assert r.status_code == 200
    subs = r.json()["subcategories"]
    formal = next(s for s in subs if s["name"] == "Formal")
    assert formal["parent_id"] is None
    assert "id" in formal

    # Dup sibling => 409
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "Formal"})
    assert r.status_code == 409

    # Slash rejected
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "bad/name"})
    assert r.status_code == 400

    # Unknown parent => 404
    r = session.post(f"{API}/categories/{cid}/subcategories",
                     json={"name": "Sub", "parent_id": str(uuid.uuid4())})
    assert r.status_code == 404

    # Rename
    r = session.put(f"{API}/categories/{cid}/subcategories/{formal['id']}", json={"name": "Formal2"})
    assert r.status_code == 200

    # Rename dup sibling
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "Sibling"})
    sib = next(s for s in r.json()["subcategories"] if s["name"] == "Sibling")
    r = session.put(f"{API}/categories/{cid}/subcategories/{sib['id']}", json={"name": "Formal2"})
    assert r.status_code == 409

    # Delete
    r = session.delete(f"{API}/categories/{cid}/subcategories/{sib['id']}")
    assert r.status_code == 200


def test_subcategory_nested_3_deep(session, temp_category):
    cid = temp_category["id"]
    # Root
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "Root"})
    assert r.status_code == 200
    root = next(s for s in r.json()["subcategories"] if s["name"] == "Root")
    # A under Root
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "A", "parent_id": root["id"]})
    a = next(s for s in r.json()["subcategories"] if s["name"] == "A" and s["parent_id"] == root["id"])
    # 1 under A
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "1", "parent_id": a["id"]})
    one = next(s for s in r.json()["subcategories"] if s["name"] == "1" and s["parent_id"] == a["id"])
    # X under 1
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "X", "parent_id": one["id"]})
    assert r.status_code == 200
    x = next(s for s in r.json()["subcategories"] if s["name"] == "X" and s["parent_id"] == one["id"])

    # Verify chain
    subs = _get_cat(session, cid)["subcategories"]
    by_id = {s["id"]: s for s in subs}
    assert by_id[x["id"]]["parent_id"] == one["id"]
    assert by_id[one["id"]]["parent_id"] == a["id"]
    assert by_id[a["id"]]["parent_id"] == root["id"]
    assert by_id[root["id"]]["parent_id"] is None

    # Delete Root while it has children => 409
    r = session.delete(f"{API}/categories/{cid}/subcategories/{root['id']}")
    assert r.status_code == 409

    # Leaf X delete ok
    r = session.delete(f"{API}/categories/{cid}/subcategories/{x['id']}")
    assert r.status_code == 200

    # Now delete "1" (leaf), then a, then root
    for sid in [one["id"], a["id"], root["id"]]:
        rr = session.delete(f"{API}/categories/{cid}/subcategories/{sid}")
        assert rr.status_code == 200, f"delete {sid}: {rr.text}"


def test_legacy_string_subcategories_migrated_on_read(session):
    """Insert a legacy category with subcategories as list of strings via direct DB write is not possible here.
    Instead, verify all categories returned have subcategory items shaped as {id,name,parent_id} objects (never plain strings)."""
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    for cat in r.json():
        for s in cat.get("subcategories", []):
            assert isinstance(s, dict), f"legacy string not migrated: {s!r} in {cat['name']}"
            assert "id" in s and "name" in s and "parent_id" in s


# ==============================================================
# Iteration 5 — Show model with image_id/notes
# ==============================================================
def test_show_accepts_and_persists_image_id_and_notes(session):
    name = f"TEST_SHOW_{uuid.uuid4().hex[:6]}"
    payload = {"name": name, "year": 2001, "image_id": "img-abc-123", "notes": "opening night"}
    r = session.post(f"{API}/shows", json=payload)
    assert r.status_code == 200, r.text
    show = r.json()
    assert show["image_id"] == "img-abc-123"
    assert show["notes"] == "opening night"

    # Verify on list
    lst = session.get(f"{API}/shows").json()
    found = next(s for s in lst if s["id"] == show["id"])
    assert found["image_id"] == "img-abc-123"
    assert found["notes"] == "opening night"

    # PUT nullable image_id
    r = session.put(f"{API}/shows/{show['id']}",
                    json={"name": name, "year": 2001, "image_id": None, "notes": "updated"})
    assert r.status_code == 200
    assert r.json()["image_id"] is None
    assert r.json()["notes"] == "updated"

    # PUT set image_id back
    r = session.put(f"{API}/shows/{show['id']}",
                    json={"name": name, "year": 2001, "image_id": "new-img", "notes": ""})
    assert r.status_code == 200
    assert r.json()["image_id"] == "new-img"

    session.delete(f"{API}/shows/{show['id']}")


# ==============================================================
# Iteration 5 — Costume list filters: year, show_id, subcategory-prefix, system_size sort removed
# ==============================================================
def test_costume_filters_year_and_show_id(session):
    s1 = session.post(f"{API}/shows", json={"name": f"TEST_S1_{uuid.uuid4().hex[:6]}", "year": 1988}).json()
    s2 = session.post(f"{API}/shows", json={"name": f"TEST_S2_{uuid.uuid4().hex[:6]}", "year": 1999}).json()
    s3 = session.post(f"{API}/shows", json={"name": f"TEST_S3_{uuid.uuid4().hex[:6]}", "year": 1988}).json()

    ids = []
    # C1: original s1 (1988)
    ids.append(session.post(f"{API}/costumes", json={
        "name": f"TEST_C1_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "location": "Main Wardrobe", "original_show_id": s1["id"],
        "sizes": {"S": 1},
    }).json()["id"])
    # C2: original s2 (1999) + additional s1
    ids.append(session.post(f"{API}/costumes", json={
        "name": f"TEST_C2_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "location": "Main Wardrobe", "original_show_id": s2["id"],
        "additional_show_ids": [s1["id"]], "sizes": {"S": 1},
    }).json()["id"])
    # C3: original s3 (1988)
    ids.append(session.post(f"{API}/costumes", json={
        "name": f"TEST_C3_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "location": "Main Wardrobe", "original_show_id": s3["id"],
        "sizes": {"S": 1},
    }).json()["id"])

    try:
        my = set(ids)

        # year filter = 1988 should match C1, C3
        r = session.get(f"{API}/costumes", params={"year": 1988})
        assert r.status_code == 200
        mine = [c for c in r.json() if c["id"] in my]
        got_years = {c["origin_year"] for c in mine}
        assert got_years == {1988}
        assert len(mine) == 2

        # year filter = 1999 should match only C2
        r = session.get(f"{API}/costumes", params={"year": 1999})
        mine = [c for c in r.json() if c["id"] in my]
        assert len(mine) == 1

        # show_id = s1 should match C1 (original) AND C2 (additional)
        r = session.get(f"{API}/costumes", params={"show_id": s1["id"]})
        assert r.status_code == 200
        mine = [c for c in r.json() if c["id"] in my]
        assert {c["id"] for c in mine} == {ids[0], ids[1]}

        # show_id = s3 only original
        r = session.get(f"{API}/costumes", params={"show_id": s3["id"]})
        mine = [c for c in r.json() if c["id"] in my]
        assert {c["id"] for c in mine} == {ids[2]}

        # Combined filter: year=1988 & show_id=s1 => only C1
        r = session.get(f"{API}/costumes", params={"year": 1988, "show_id": s1["id"]})
        mine = [c for c in r.json() if c["id"] in my]
        assert {c["id"] for c in mine} == {ids[0]}
    finally:
        for cid in ids:
            session.delete(f"{API}/costumes/{cid}")
        for sid in [s1["id"], s2["id"], s3["id"]]:
            session.delete(f"{API}/shows/{sid}")


def test_system_size_sort_falls_through_no_500(session):
    r = session.get(f"{API}/costumes", params={"sort": "system_size"})
    assert r.status_code == 200
    # Also ensure other sorts still 200
    for s in ["updated_desc", "origin_year_asc", "origin_year_desc", "name_asc", "total_desc"]:
        r = session.get(f"{API}/costumes", params={"sort": s})
        assert r.status_code == 200, f"sort {s} failed"


def test_subcategory_filter_prefix_matches_children(session):
    # Create costumes with subcategory 'Formal' and 'Formal / Long'
    c1 = session.post(f"{API}/costumes", json={
        "name": f"TEST_SUB_A_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "subcategory": "Formal", "location": "Main Wardrobe", "sizes": {"S": 1}
    }).json()
    c2 = session.post(f"{API}/costumes", json={
        "name": f"TEST_SUB_B_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "subcategory": "Formal / Long", "location": "Main Wardrobe", "sizes": {"S": 1}
    }).json()
    c3 = session.post(f"{API}/costumes", json={
        "name": f"TEST_SUB_C_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "subcategory": "Casual", "location": "Main Wardrobe", "sizes": {"S": 1}
    }).json()
    try:
        # filter 'Formal' should match both c1 and c2
        r = session.get(f"{API}/costumes", params={"subcategory": "Formal"})
        assert r.status_code == 200
        got = {c["id"] for c in r.json()}
        assert c1["id"] in got
        assert c2["id"] in got
        assert c3["id"] not in got

        # filter 'Formal / Long' should match only c2
        r = session.get(f"{API}/costumes", params={"subcategory": "Formal / Long"})
        got = {c["id"] for c in r.json()}
        assert c2["id"] in got
        assert c1["id"] not in got

        # q search matches subcategory
        r = session.get(f"{API}/costumes", params={"q": "Casual"})
        got = {c["id"] for c in r.json()}
        assert c3["id"] in got
    finally:
        for c in (c1, c2, c3):
            session.delete(f"{API}/costumes/{c['id']}")


def test_q_search_matches_creator_and_keywords(session):
    c = session.post(f"{API}/costumes", json={
        "name": f"TEST_Q_{uuid.uuid4().hex[:6]}", "category": "Modern",
        "location": "Main Wardrobe", "creator": "ZZZQCreator", "keywords": ["ZZZQKeyword"],
        "sizes": {"S": 1}
    }).json()
    try:
        r = session.get(f"{API}/costumes", params={"q": "ZZZQCreator"})
        assert any(x["id"] == c["id"] for x in r.json())
        r = session.get(f"{API}/costumes", params={"q": "ZZZQKeyword"})
        assert any(x["id"] == c["id"] for x in r.json())
    finally:
        session.delete(f"{API}/costumes/{c['id']}")


# ---------- Locations sanity (still working) ----------
def test_locations_list_has_path_depth(session):
    r = session.get(f"{API}/locations")
    assert r.status_code == 200
    for d in r.json():
        assert "parent_id" in d and "path" in d and "depth" in d


# ---------- Settings ----------
def test_settings_default_view(session):
    r = session.get(f"{API}/settings")
    assert r.status_code == 200
    assert "default_view" in r.json()

# ==============================================================
# Iteration 6 — BUG#1: legacy string subcategories bug fix
# ==============================================================
@pytest.fixture
def mongo_db():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


def test_bug1_legacy_string_subcategories_nested_add(session, mongo_db):
    """BUG#1 repro: insert category with legacy string subcategories directly in DB.
    GET should normalize+persist; subsequent POST with parent_id should succeed."""
    cat_id = "test-cat-legacy-bug1"
    # Clean any leftover
    mongo_db.categories.delete_one({"id": cat_id})
    mongo_db.categories.insert_one({
        "id": cat_id,
        "name": "TEST_LEGACY_BUG1",
        "subcategories": ["LegacyA", "LegacyB"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        # First GET → normalizes and persists
        r = session.get(f"{API}/categories")
        assert r.status_code == 200
        cat = next((c for c in r.json() if c["id"] == cat_id), None)
        assert cat is not None
        subs1 = cat["subcategories"]
        assert len(subs1) == 2
        for s in subs1:
            assert isinstance(s, dict)
            assert "id" in s and "name" in s
            assert s["parent_id"] is None
        legacy_a = next(s for s in subs1 if s["name"] == "LegacyA")
        legacy_a_id = legacy_a["id"]

        # Verify persistence in DB (not fresh UUIDs)
        db_doc = mongo_db.categories.find_one({"id": cat_id})
        db_subs = db_doc["subcategories"]
        assert all(isinstance(s, dict) for s in db_subs)
        db_ids = {s["id"] for s in db_subs}
        assert legacy_a_id in db_ids, "Normalized subcategory IDs not persisted"

        # Second GET → same IDs (stable)
        r2 = session.get(f"{API}/categories")
        cat2 = next(c for c in r2.json() if c["id"] == cat_id)
        subs2 = cat2["subcategories"]
        legacy_a2 = next(s for s in subs2 if s["name"] == "LegacyA")
        assert legacy_a2["id"] == legacy_a_id, "IDs changed between GETs"

        # Now POST a child under LegacyA using its id
        r3 = session.post(f"{API}/categories/{cat_id}/subcategories",
                          json={"name": "Child", "parent_id": legacy_a_id})
        assert r3.status_code == 200, f"BUG#1 not fixed: {r3.status_code} {r3.text}"
        result_subs = r3.json()["subcategories"]
        child = next((s for s in result_subs if s["name"] == "Child"), None)
        assert child is not None
        assert child["parent_id"] == legacy_a_id

        # Third GET → parent_id chain preserved
        r4 = session.get(f"{API}/categories")
        cat4 = next(c for c in r4.json() if c["id"] == cat_id)
        subs4 = cat4["subcategories"]
        by_id = {s["id"]: s for s in subs4}
        assert child["id"] in by_id
        assert by_id[child["id"]]["parent_id"] == legacy_a_id
        assert by_id[legacy_a_id]["parent_id"] is None
    finally:
        mongo_db.categories.delete_one({"id": cat_id})


def test_stable_ids_across_repeated_gets(session, temp_category):
    """Repeated GETs return stable IDs (no fresh UUIDs)."""
    cid = temp_category["id"]
    session.post(f"{API}/categories/{cid}/subcategories", json={"name": "SA"})
    session.post(f"{API}/categories/{cid}/subcategories", json={"name": "SB"})
    ids_snapshots = []
    for _ in range(3):
        r = session.get(f"{API}/categories")
        cat = next(c for c in r.json() if c["id"] == cid)
        ids_snapshots.append({s["name"]: s["id"] for s in cat["subcategories"]})
    assert ids_snapshots[0] == ids_snapshots[1] == ids_snapshots[2], f"IDs unstable: {ids_snapshots}"


def test_iter6_nested_3_deep_root_a_1(session, temp_category):
    """3-deep nesting: Root -> A -> 1 all succeed with parent_id resolving."""
    cid = temp_category["id"]
    r = session.post(f"{API}/categories/{cid}/subcategories", json={"name": "Root"})
    assert r.status_code == 200
    root = next(s for s in r.json()["subcategories"] if s["name"] == "Root")

    r = session.post(f"{API}/categories/{cid}/subcategories",
                     json={"name": "A", "parent_id": root["id"]})
    assert r.status_code == 200
    a = next(s for s in r.json()["subcategories"] if s["name"] == "A" and s["parent_id"] == root["id"])

    r = session.post(f"{API}/categories/{cid}/subcategories",
                     json={"name": "1", "parent_id": a["id"]})
    assert r.status_code == 200
    one = next(s for s in r.json()["subcategories"] if s["name"] == "1" and s["parent_id"] == a["id"])
    assert one["parent_id"] == a["id"]


# ==============================================================
# Iteration 6 — Default costume sort = origin_year_desc (nulls last)
# ==============================================================
def test_costumes_default_sort_is_origin_year_desc(session):
    """GET /api/costumes with no sort → same as sort=origin_year_desc (nulls last)."""
    shows = []
    costumes = []
    try:
        # Create shows with distinct years
        s_old = session.post(f"{API}/shows", json={"name": f"TEST_OLD_{uuid.uuid4().hex[:6]}", "year": 1985}).json()
        s_new = session.post(f"{API}/shows", json={"name": f"TEST_NEW_{uuid.uuid4().hex[:6]}", "year": 2024}).json()
        shows = [s_old, s_new]

        c_old = session.post(f"{API}/costumes", json={
            "name": f"TEST_SORT_OLD_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "original_show_id": s_old["id"], "sizes": {"S": 1},
        }).json()
        c_new = session.post(f"{API}/costumes", json={
            "name": f"TEST_SORT_NEW_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "original_show_id": s_new["id"], "sizes": {"S": 1},
        }).json()
        c_null = session.post(f"{API}/costumes", json={
            "name": f"TEST_SORT_NULL_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
        }).json()
        costumes = [c_old, c_new, c_null]
        my_ids = {c["id"] for c in costumes}

        # Default (no sort param)
        r = session.get(f"{API}/costumes")
        assert r.status_code == 200
        all_default = r.json()
        mine_default = [c for c in all_default if c["id"] in my_ids]
        # Should be ordered: c_new (2024), c_old (1985), c_null (null last)
        assert [c["id"] for c in mine_default] == [c_new["id"], c_old["id"], c_null["id"]], \
            f"Default sort not origin_year_desc: {[(c['name'], c.get('origin_year')) for c in mine_default]}"

        # Explicit sort=origin_year_desc → same
        r = session.get(f"{API}/costumes", params={"sort": "origin_year_desc"})
        mine_desc = [c for c in r.json() if c["id"] in my_ids]
        assert [c["id"] for c in mine_desc] == [c_new["id"], c_old["id"], c_null["id"]]

        # sort=origin_year_asc → ascending, nulls last: c_old, c_new, c_null
        r = session.get(f"{API}/costumes", params={"sort": "origin_year_asc"})
        mine_asc = [c for c in r.json() if c["id"] in my_ids]
        assert [c["id"] for c in mine_asc] == [c_old["id"], c_new["id"], c_null["id"]], \
            f"origin_year_asc order wrong: {[(c['name'], c.get('origin_year')) for c in mine_asc]}"
    finally:
        for c in costumes:
            session.delete(f"{API}/costumes/{c['id']}")
        for s in shows:
            session.delete(f"{API}/shows/{s['id']}")



# ==============================================================
# Iteration 7 — Inventory Groups
# ==============================================================
class TestGroupsIteration7:
    def test_group_full_flow(self, session):
        # Create group
        payload = {
            "name": "TEST_Earring Set",
            "category": "Accessories",
            "location": "Test Loc",
            "keywords": ["jewelry"],
        }
        r = session.post(f"{API}/groups", json=payload)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["name"] == payload["name"]
        assert g["category"] == "Accessories"
        assert g["location"] == "Test Loc"
        assert g["keywords"] == ["jewelry"]
        assert "id" in g
        gid = g["id"]

        # List groups includes it with variant_count
        r = session.get(f"{API}/groups")
        assert r.status_code == 200
        listed = r.json()
        match = next((x for x in listed if x["id"] == gid), None)
        assert match is not None
        assert match.get("variant_count") == 0

        # Get single group
        r = session.get(f"{API}/groups/{gid}")
        assert r.status_code == 200
        gd = r.json()
        assert gd["variants"] == []
        assert gd["variant_count"] == 0
        assert gd["total_items"] == 0

        # Update
        upd = dict(payload)
        upd["name"] = "TEST_Earring Set Updated"
        upd["location"] = "New Loc"
        r = session.put(f"{API}/groups/{gid}", json=upd)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_Earring Set Updated"
        assert r.json()["location"] == "New Loc"

        # Create a costume assigned to this group via POST
        cpayload = {
            "name": "TEST_Red Earring",
            "category": "Accessories",
            "location": "Test Loc",
            "sizes": {"S": 2},
            "group_id": gid,
            "variant_label": "Red",
        }
        r = session.post(f"{API}/costumes", json=cpayload)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["group_id"] == gid
        assert c["variant_label"] == "Red"
        cid = c["id"]

        # Verify on GET
        r = session.get(f"{API}/costumes/{cid}")
        assert r.status_code == 200
        assert r.json()["group_id"] == gid
        assert r.json()["variant_label"] == "Red"

        # Create another via PUT assignment (start ungrouped)
        r = session.post(f"{API}/costumes", json={
            "name": "TEST_Blue Earring",
            "category": "Accessories",
            "location": "Test Loc",
            "sizes": {"M": 3},
        })
        assert r.status_code == 200
        cid2 = r.json()["id"]
        assert r.json().get("group_id") in (None, "")
        r = session.put(f"{API}/costumes/{cid2}", json={"group_id": gid, "variant_label": "Blue"})
        assert r.status_code == 200
        assert r.json()["group_id"] == gid
        assert r.json()["variant_label"] == "Blue"

        # GET group shows both variants
        r = session.get(f"{API}/groups/{gid}")
        assert r.status_code == 200
        gd = r.json()
        assert gd["variant_count"] == 2
        assert gd["total_items"] == 5  # 2 + 3
        labels = {v["variant_label"] for v in gd["variants"]}
        assert labels == {"Red", "Blue"}

        # /api/inventory mixed feed
        r = session.get(f"{API}/inventory")
        assert r.status_code == 200
        feed = r.json()
        group_entry = next((e for e in feed if e.get("type") == "group" and e.get("id") == gid), None)
        assert group_entry is not None
        assert group_entry["variant_count"] == 2
        assert group_entry["total_items"] == 5
        # Grouped costumes should NOT appear as separate type=costume entries
        assert not any(e.get("type") == "costume" and e.get("id") in (cid, cid2) for e in feed)

        # Delete group -> costumes get group_id=null
        r = session.delete(f"{API}/groups/{gid}")
        assert r.status_code == 200
        r = session.get(f"{API}/groups/{gid}")
        assert r.status_code == 404
        for cc in (cid, cid2):
            r = session.get(f"{API}/costumes/{cc}")
            assert r.status_code == 200
            assert r.json().get("group_id") in (None, "")
            # cleanup
            session.delete(f"{API}/costumes/{cc}")

    def test_inventory_includes_ungrouped_costume(self, session):
        r = session.post(f"{API}/costumes", json={
            "name": "TEST_Ungrouped",
            "category": "Accessories",
            "location": "Test Loc",
            "sizes": {"S": 1},
        })
        assert r.status_code == 200
        cid = r.json()["id"]
        try:
            r = session.get(f"{API}/inventory")
            assert r.status_code == 200
            feed = r.json()
            found = next((e for e in feed if e.get("type") == "costume" and e.get("id") == cid), None)
            assert found is not None
        finally:
            session.delete(f"{API}/costumes/{cid}")

    def test_create_group_requires_name(self, session):
        r = session.post(f"{API}/groups", json={"name": "  "})
        assert r.status_code == 400



# ==============================================================
# Iteration 8 — Flags system, org branding, buy_link, show_link, category color
# ==============================================================
class TestIteration8:
    def test_settings_org_and_logo(self, session):
        r = session.get(f"{API}/settings")
        assert r.status_code == 200
        s = r.json()
        assert "org_name" in s
        assert "logo_image_id" in s
        original_org = s["org_name"]
        original_logo = s["logo_image_id"]
        try:
            r = session.put(f"{API}/settings", json={"org_name": "TEST_ORG", "logo_image_id": "img-xyz"})
            assert r.status_code == 200
            s2 = r.json()
            assert s2["org_name"] == "TEST_ORG"
            assert s2["logo_image_id"] == "img-xyz"
            # clear logo with empty string
            r = session.put(f"{API}/settings", json={"logo_image_id": ""})
            assert r.status_code == 200
            assert r.json()["logo_image_id"] is None
        finally:
            session.put(f"{API}/settings", json={"org_name": original_org or "LUXE", "logo_image_id": original_logo or ""})

    def test_flag_categories_seeded_defaults(self, session):
        r = session.get(f"{API}/flag-categories")
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert {"On Loan", "Needs Repair", "In Cleaning"}.issubset(names), f"missing seeds: {names}"

    def test_flag_category_crud_and_cascade(self, session):
        # Create
        name = f"TEST_FC_{uuid.uuid4().hex[:6]}"
        r = session.post(f"{API}/flag-categories", json={"name": name, "color": "#123456"})
        assert r.status_code == 200, r.text
        fc = r.json()
        fc_id = fc["id"]
        assert fc["color"] == "#123456"
        # Duplicate
        r = session.post(f"{API}/flag-categories", json={"name": name})
        assert r.status_code == 409
        # Update
        r = session.put(f"{API}/flag-categories/{fc_id}", json={"name": name + "_2", "color": "#654321"})
        assert r.status_code == 200
        assert r.json()["name"] == name + "_2"
        assert r.json()["color"] == "#654321"

        # Attach to a costume; delete FC and verify cascade
        c = session.post(f"{API}/costumes", json={
            "name": f"TEST_FL_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
            "flags": [{"category_id": fc_id, "note": "will cascade"}]
        }).json()
        cid = c["id"]
        assert c["is_flagged"] is True
        assert len(c["flags"]) == 1
        # Costumes-by-flag endpoint
        r = session.get(f"{API}/flag-categories/{fc_id}/costumes")
        assert r.status_code == 200
        assert any(x["id"] == cid for x in r.json())

        # Delete cascade
        r = session.delete(f"{API}/flag-categories/{fc_id}")
        assert r.status_code == 200
        # Costume should now have 0 flags and is_flagged False
        c2 = session.get(f"{API}/costumes/{cid}").json()
        assert c2["flags"] == []
        assert c2["is_flagged"] is False
        session.delete(f"{API}/costumes/{cid}")

    def test_costume_create_with_flags_and_flag_endpoints(self, session):
        # Get a flag category id (use seeded)
        fcs = session.get(f"{API}/flag-categories").json()
        fc = next(c for c in fcs if c["name"] == "On Loan")
        fc2 = next(c for c in fcs if c["name"] == "Needs Repair")

        r = session.post(f"{API}/costumes", json={
            "name": f"TEST_MF_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
            "flags": [{"category_id": fc["id"], "note": "note A"}]
        })
        assert r.status_code == 200, r.text
        c = r.json()
        cid = c["id"]
        try:
            assert c["is_flagged"] is True
            assert len(c["flags"]) == 1
            assert c["flags"][0]["note"] == "note A"
            assert "note A" in c["flag_reason"]

            # POST attach second flag
            r = session.post(f"{API}/costumes/{cid}/flags", json={"category_id": fc2["id"], "note": "note B"})
            assert r.status_code == 200
            c = r.json()
            assert len(c["flags"]) == 2
            assert c["is_flagged"] is True
            second = next(f for f in c["flags"] if f["note"] == "note B")

            # PUT update note
            r = session.put(f"{API}/costumes/{cid}/flags/{second['id']}", json={"note": "note B updated"})
            assert r.status_code == 200
            c = r.json()
            assert any(f["id"] == second["id"] and f["note"] == "note B updated" for f in c["flags"])

            # DELETE detach both — after first, is_flagged still True
            first_id = c["flags"][0]["id"]
            r = session.delete(f"{API}/costumes/{cid}/flags/{first_id}")
            assert r.status_code == 200
            c = r.json()
            assert len(c["flags"]) == 1
            assert c["is_flagged"] is True

            r = session.delete(f"{API}/costumes/{cid}/flags/{second['id']}")
            assert r.status_code == 200
            c = r.json()
            assert len(c["flags"]) == 0
            assert c["is_flagged"] is False
        finally:
            session.delete(f"{API}/costumes/{cid}")

    def test_costume_buy_link_persists(self, session):
        r = session.post(f"{API}/costumes", json={
            "name": f"TEST_BL_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
            "buy_link": "https://example.com/buy",
        })
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["buy_link"] == "https://example.com/buy"
        got = session.get(f"{API}/costumes/{c['id']}").json()
        assert got["buy_link"] == "https://example.com/buy"
        # PUT update
        session.put(f"{API}/costumes/{c['id']}", json={"buy_link": "https://example.com/updated"})
        got2 = session.get(f"{API}/costumes/{c['id']}").json()
        assert got2["buy_link"] == "https://example.com/updated"
        session.delete(f"{API}/costumes/{c['id']}")

    def test_category_color_update_and_cascade_rename(self, session):
        name = f"TEST_CATCLR_{uuid.uuid4().hex[:6]}"
        cat = session.post(f"{API}/categories", json={"name": name}).json()
        cid = cat["id"]
        try:
            r = session.put(f"{API}/categories/{cid}", json={"color": "#ABCDEF"})
            assert r.status_code == 200
            assert r.json()["color"] == "#ABCDEF"

            # Create costume under this cat then rename cat -> costume.category should follow
            c = session.post(f"{API}/costumes", json={
                "name": f"TEST_CC_{uuid.uuid4().hex[:6]}", "category": name,
                "location": "Main Wardrobe", "sizes": {"S": 1},
            }).json()
            new_name = name + "_R"
            r = session.put(f"{API}/categories/{cid}", json={"name": new_name})
            assert r.status_code == 200
            got = session.get(f"{API}/costumes/{c['id']}").json()
            assert got["category"] == new_name
            session.delete(f"{API}/costumes/{c['id']}")
        finally:
            session.delete(f"{API}/categories/{cid}")

    def test_show_link_persists(self, session):
        r = session.post(f"{API}/shows", json={
            "name": f"TEST_SL_{uuid.uuid4().hex[:6]}", "year": 2020, "show_link": "https://youtu.be/abc"
        })
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["show_link"] == "https://youtu.be/abc"
        r = session.put(f"{API}/shows/{s['id']}", json={
            "name": s["name"], "year": 2020, "show_link": "https://youtu.be/xyz"
        })
        assert r.status_code == 200
        assert r.json()["show_link"] == "https://youtu.be/xyz"
        got = next(x for x in session.get(f"{API}/shows").json() if x["id"] == s["id"])
        assert got["show_link"] == "https://youtu.be/xyz"
        session.delete(f"{API}/shows/{s['id']}")


# ==============================================================
# Iteration 9 — merge, similar, migrate-legacy-flags, in-use, note images, show timestamp, flag images
# ==============================================================
class TestIteration9:
    def test_similar_categories_empty_returns_empty(self, session):
        r = session.get(f"{API}/categories/similar", params={"name": ""})
        assert r.status_code == 200
        assert r.json() == []

    def test_similar_categories_fuzzy_match(self, session):
        name = f"TEST_SIM_{uuid.uuid4().hex[:6]}"
        cat = session.post(f"{API}/categories", json={"name": name}).json()
        try:
            # Query with a slight typo (drop last char + swap)
            typo = name[:-1]
            r = session.get(f"{API}/categories/similar", params={"name": typo})
            assert r.status_code == 200
            names = [x["name"] for x in r.json()]
            assert cat["name"] in names
        finally:
            session.delete(f"{API}/categories/{cat['id']}")

    def test_categories_merge_full_flow(self, session):
        k = session.post(f"{API}/categories", json={"name": f"TEST_KEEP_{uuid.uuid4().hex[:6]}"}).json()
        d = session.post(f"{API}/categories", json={"name": f"TEST_DISC_{uuid.uuid4().hex[:6]}"}).json()
        # add a subcat to discard
        session.post(f"{API}/categories/{d['id']}/subcategories", json={"name": "Sub1"})
        subs = _get_cat(session, d["id"])["subcategories"]
        sub_name = subs[0]["name"]
        # create a costume under discard with subcategory
        c = session.post(f"{API}/costumes", json={
            "name": f"TEST_MG_{uuid.uuid4().hex[:6]}", "category": d["name"],
            "subcategory": sub_name, "location": "Main Wardrobe", "sizes": {"S": 1},
        }).json()
        try:
            # same-id => 400
            r = session.post(f"{API}/categories/merge", json={"keeper_id": k["id"], "discard_id": k["id"]})
            assert r.status_code == 400
            # unknown => 404
            r = session.post(f"{API}/categories/merge", json={"keeper_id": k["id"], "discard_id": "nonexistent"})
            assert r.status_code == 404

            # valid merge
            r = session.post(f"{API}/categories/merge", json={"keeper_id": k["id"], "discard_id": d["id"]})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["ok"] is True
            assert body["keeper"] == k["name"]
            assert body["discarded"] == d["name"]
            assert body["moved"] >= 1

            # discard category is deleted
            r = session.get(f"{API}/categories")
            assert not any(x["id"] == d["id"] for x in r.json())
            # costume moved
            got = session.get(f"{API}/costumes/{c['id']}").json()
            assert got["category"] == k["name"]
            assert got.get("subcategory", "") == ""
        finally:
            session.delete(f"{API}/costumes/{c['id']}")
            session.delete(f"{API}/categories/{k['id']}")
            session.delete(f"{API}/categories/{d['id']}")

    def test_migrate_legacy_flags(self, session):
        # Create a legacy is_flagged costume with empty flags array via raw payload
        c = session.post(f"{API}/costumes", json={
            "name": f"TEST_LEGF_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
        }).json()
        # Force is_flagged via mongo direct isn't available in session; instead use PUT to try to set
        # Use direct mongo via fixture
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        db.costumes.update_one({"id": c["id"]}, {"$set": {"is_flagged": True, "flag_reason": "legacy on loan", "flags": []}})
        client.close()
        try:
            r = session.post(f"{API}/admin/migrate-legacy-flags")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["ok"] is True
            assert body["migrated"] >= 1
            assert body["legacy_category_id"]
            # verify costume now has a flag
            got = session.get(f"{API}/costumes/{c['id']}").json()
            assert len(got["flags"]) == 1
            assert got["flags"][0]["category_id"] == body["legacy_category_id"]
            # Legacy category exists
            fcs = session.get(f"{API}/flag-categories").json()
            assert any(fc["name"] == "Legacy" for fc in fcs)
        finally:
            session.delete(f"{API}/costumes/{c['id']}")

    def test_stats_has_in_use_count(self, session):
        r = session.get(f"{API}/stats")
        assert r.status_code == 200
        assert "in_use_count" in r.json()

    def test_in_use_endpoint_and_roundtrip(self, session):
        c = session.post(f"{API}/costumes", json={
            "name": f"TEST_INUSE_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
            "in_use": True, "in_use_note": "on stage",
            "note_image_ids": ["nimg1", "nimg2"],
        }).json()
        try:
            assert c["in_use"] is True
            assert c["in_use_note"] == "on stage"
            assert c.get("in_use_since")
            assert c["note_image_ids"] == ["nimg1", "nimg2"]

            r = session.get(f"{API}/in-use")
            assert r.status_code == 200
            assert any(x["id"] == c["id"] for x in r.json())

            # turn off
            r = session.put(f"{API}/costumes/{c['id']}", json={"in_use": False})
            assert r.status_code == 200
            got = r.json()
            assert got["in_use"] is False
            assert got.get("in_use_since") in (None, "")
            # no longer in in-use list
            r = session.get(f"{API}/in-use")
            assert not any(x["id"] == c["id"] for x in r.json())

            # stats reflects
            stats = session.get(f"{API}/stats").json()
            assert isinstance(stats["in_use_count"], int)
        finally:
            session.delete(f"{API}/costumes/{c['id']}")

    def test_flag_image_ids_crud(self, session):
        fcs = session.get(f"{API}/flag-categories").json()
        fc = next(c for c in fcs if c["name"] == "On Loan")
        c = session.post(f"{API}/costumes", json={
            "name": f"TEST_FLIMG_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
            "flags": [{"category_id": fc["id"], "note": "n1", "image_ids": ["a", "b"]}]
        }).json()
        try:
            assert c["flags"][0]["image_ids"] == ["a", "b"]
            # POST attach with image_ids
            fc2 = next(x for x in fcs if x["name"] == "Needs Repair")
            r = session.post(f"{API}/costumes/{c['id']}/flags",
                             json={"category_id": fc2["id"], "note": "n2", "image_ids": ["x"]})
            assert r.status_code == 200
            flag2 = next(f for f in r.json()["flags"] if f["note"] == "n2")
            assert flag2["image_ids"] == ["x"]
            # PUT update image_ids
            r = session.put(f"{API}/costumes/{c['id']}/flags/{flag2['id']}",
                            json={"image_ids": ["x", "y", "z"]})
            assert r.status_code == 200
            updated = next(f for f in r.json()["flags"] if f["id"] == flag2["id"])
            assert updated["image_ids"] == ["x", "y", "z"]
        finally:
            session.delete(f"{API}/costumes/{c['id']}")

    def test_show_link_timestamp_persists(self, session):
        r = session.post(f"{API}/shows", json={
            "name": f"TEST_TS_{uuid.uuid4().hex[:6]}", "year": 2020,
            "show_link": "https://youtu.be/abc", "link_timestamp": "1:23",
        })
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["link_timestamp"] == "1:23"
        r = session.put(f"{API}/shows/{s['id']}", json={
            "name": s["name"], "year": 2020, "show_link": "https://youtu.be/abc",
            "link_timestamp": "2:00",
        })
        assert r.status_code == 200
        assert r.json()["link_timestamp"] == "2:00"
        got = next(x for x in session.get(f"{API}/shows").json() if x["id"] == s["id"])
        assert got["link_timestamp"] == "2:00"
        session.delete(f"{API}/shows/{s['id']}")
