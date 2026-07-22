"""Iteration 24 backend tests: size-based assignments, shortage, live cap, bulk-delete."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@luxe.test", "password": "LuxeAdmin!23"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return sess


@pytest.fixture(scope="module")
def two_students(s):
    ids = []
    for i in range(2):
        r = s.post(f"{BASE_URL}/api/students", json={
            "first_name": f"TEST24_{i}", "last_name": "Kid",
            "preferred_sizes": {"Letter": "M"},
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        ids.append(r.json()["id"])
    yield ids
    for sid in ids:
        s.delete(f"{BASE_URL}/api/students/{sid}")


@pytest.fixture(scope="module")
def costume(s):
    r = s.post(f"{BASE_URL}/api/costumes", json={
        "name": f"TEST24_COSTUME_{uuid.uuid4().hex[:6]}",
        "category": "Tops", "location": "Wardrobe Rack",
        "sorting_system": "Letter",
        "sizes": {"S": 1, "M": 2, "L": 0},
        "in_use": True, "in_use_quantity": 3,
    }, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    yield cid
    s.delete(f"{BASE_URL}/api/costumes/{cid}")


# --- Size-based assignments & shortage ---
class TestAssignmentsAndShortage:
    def test_put_assignments_derives_ids_and_no_shortage(self, s, costume, two_students):
        payload = {"assignments": [
            {"student_id": two_students[0], "size": "M"},
            {"student_id": two_students[1], "size": "M"},
        ]}
        r = s.put(f"{BASE_URL}/api/costumes/{costume}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["assignments"] == payload["assignments"]
        assert set(d["assigned_student_ids"]) == set(two_students)
        assert d["shortage"] is False
        assert d["shortage_details"] == []

    def test_over_assign_size_triggers_shortage(self, s, costume, two_students):
        payload = {"assignments": [
            {"student_id": two_students[0], "size": "S"},
            {"student_id": two_students[1], "size": "S"},  # only 1 S available
        ]}
        r = s.put(f"{BASE_URL}/api/costumes/{costume}", json=payload, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["shortage"] is True
        assert any(sd["size"] == "S" and sd["deficit"] == 1 for sd in d["shortage_details"])

    def test_get_returns_shortage_fields(self, s, costume):
        r = s.get(f"{BASE_URL}/api/costumes/{costume}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "shortage" in d and "shortage_details" in d

    def test_legacy_assigned_student_ids_only_backfills(self, s, two_students):
        # Create legacy costume
        c = s.post(f"{BASE_URL}/api/costumes", json={
            "name": f"TEST24_LEGACY_{uuid.uuid4().hex[:6]}",
            "category": "Tops", "location": "Rack",
            "in_use": True, "in_use_quantity": 1,
            "total_quantity_override": 1,
        }, timeout=15).json()
        cid = c["id"]
        try:
            # legacy field only — 2 students, in_use_quantity=1 → shortage via legacy
            r = s.put(f"{BASE_URL}/api/costumes/{cid}",
                      json={"assigned_student_ids": two_students}, timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["shortage"] is True
            assert d["shortage_details"][0]["deficit"] == 1
            # assignments derived
            assert len(d["assignments"]) == 2
            assert all(a["size"] == "" for a in d["assignments"])
        finally:
            s.delete(f"{BASE_URL}/api/costumes/{cid}")


# --- Live cap + swap ---
class TestLiveCapAndToggle:
    @pytest.fixture(scope="class")
    def four_shows(self, s):
        ids = []
        for i in range(4):
            r = s.post(f"{BASE_URL}/api/shows", json={"name": f"TEST24_LIVE_{uuid.uuid4().hex[:6]}", "year": 2099 + i}, timeout=15)
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        yield ids
        # Cleanup: unlive & delete
        for sid in ids:
            s.post(f"{BASE_URL}/api/shows/{sid}/toggle-live", json={"is_live": False})
            s.delete(f"{BASE_URL}/api/shows/{sid}")

    def test_cap_reached_returns_409(self, s, four_shows):
        # Set first 3 live
        for sid in four_shows[:3]:
            r = s.post(f"{BASE_URL}/api/shows/{sid}/toggle-live", json={"is_live": True}, timeout=15)
            assert r.status_code == 200, r.text
        # 4th → 409
        r = s.post(f"{BASE_URL}/api/shows/{four_shows[3]}/toggle-live", json={"is_live": True}, timeout=15)
        assert r.status_code == 409
        body = r.json()
        detail = body["detail"]
        assert detail["reason"] == "live_cap_reached"
        assert detail["max"] == 3
        assert len(detail["live_shows"]) == 3

    def test_swap_deactivates_previous_and_activates_target(self, s, four_shows):
        target = four_shows[3]
        swap_out = four_shows[0]
        r = s.post(f"{BASE_URL}/api/shows/{target}/toggle-live",
                   json={"is_live": True, "swap_show_id": swap_out}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["show"]["is_live"] is True
        assert "released_costumes" in d
        # verify swap_out is now not live
        shows = s.get(f"{BASE_URL}/api/shows").json()
        by_id = {x["id"]: x for x in shows}
        assert by_id[swap_out]["is_live"] is False
        assert by_id[target]["is_live"] is True

    def test_end_live_clears_and_returns_released(self, s):
        # Fresh show + costume attached
        # Ensure no live shows exist that would blockage
        for existing in s.get(f"{BASE_URL}/api/shows").json():
            if existing.get("is_live"):
                s.post(f"{BASE_URL}/api/shows/{existing['id']}/toggle-live", json={"is_live": False})
        sh = s.post(f"{BASE_URL}/api/shows", json={"name": f"TEST24_END_{uuid.uuid4().hex[:6]}", "year": 2088}).json()
        sid = sh["id"]
        c = s.post(f"{BASE_URL}/api/costumes", json={
            "name": f"TEST24_C_END_{uuid.uuid4().hex[:6]}",
            "category": "Tops", "location": "Rack",
            "sorting_system": "Letter", "sizes": {"M": 1},
            "shows": [{"show_id": sid, "timestamp": ""}],
        }).json()
        cid = c["id"]
        try:
            # Go live → attaches costume
            r = s.post(f"{BASE_URL}/api/shows/{sid}/toggle-live", json={"is_live": True})
            assert r.status_code == 200, r.text
            # Set assignments/qty on costume via PUT
            r2 = s.put(f"{BASE_URL}/api/costumes/{cid}", json={
                "in_use_quantity": 1,
                "assignments": [{"student_id": "dummy-x", "size": "M"}],
            })
            assert r2.status_code == 200
            # End live
            r3 = s.post(f"{BASE_URL}/api/shows/{sid}/toggle-live", json={"is_live": False})
            assert r3.status_code == 200
            body = r3.json()
            released = body["released_costumes"]
            assert any(x["id"] == cid for x in released)
            # verify costume reset
            got = s.get(f"{BASE_URL}/api/costumes/{cid}").json()
            assert got["in_use"] is False
            assert got["in_use_quantity"] == 0
            assert got["assignments"] == []
            assert got["assigned_student_ids"] == []
            assert got["current_show_id"] in (None, "")
        finally:
            s.delete(f"{BASE_URL}/api/costumes/{cid}")
            s.delete(f"{BASE_URL}/api/shows/{sid}")


# --- Bulk delete ---
class TestBulkDelete:
    def test_bulk_delete(self, s):
        ids = []
        for _ in range(3):
            c = s.post(f"{BASE_URL}/api/costumes", json={
                "name": f"TEST24_BULK_{uuid.uuid4().hex[:6]}",
                "category": "Tops", "location": "Rack",
                "total_quantity_override": 0,
            }).json()
            ids.append(c["id"])
        r = s.post(f"{BASE_URL}/api/costumes/bulk-delete", json={"ids": ids})
        assert r.status_code == 200, r.text
        assert r.json() == {"deleted": 3}
        # verify gone
        for i in ids:
            g = s.get(f"{BASE_URL}/api/costumes/{i}")
            assert g.status_code == 404
