"""Iteration 22 backend tests — CSV import (costumes/equipment) + shortage flag."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")

ADMIN = {"email": "admin@luxe.test", "password": "LuxeAdmin!23"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def _uniq(prefix="TEST_ITER22_"):
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# ============================================================
# Costume CSV Import
# ============================================================
class TestCostumeImport:
    def test_dry_run_does_not_insert(self, session):
        name = _uniq("TEST_CIMP_DRY_")
        r = session.post(f"{BASE_URL}/api/costumes/import", json={
            "rows": [{"name": name, "category": "TEST_ITER22_CAT_" + uuid.uuid4().hex[:6], "location": "TEST_ITER22_LOC_" + uuid.uuid4().hex[:6]}],
            "dry_run": True,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["dry_run"] is True
        assert d["would_create"] == 1
        assert d["created"] == 0
        assert d["duplicates"] == 0
        assert d["invalid"] == 0
        assert isinstance(d.get("preview"), list) and len(d["preview"]) == 1
        assert d["preview"][0]["name"] == name
        # Verify not inserted
        listing = session.get(f"{BASE_URL}/api/costumes").json()
        assert not any(c["name"] == name for c in listing), "dry-run should not insert"

    def test_missing_name_is_invalid(self, session):
        r = session.post(f"{BASE_URL}/api/costumes/import", json={
            "rows": [{"name": "", "category": "X"}, {"name": "   "}],
            "dry_run": True,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["invalid"] == 2
        assert d["would_create"] == 0

    def test_real_import_and_duplicate_and_autocreate(self, session):
        name = _uniq("TEST_CIMP_REAL_")
        cat = _uniq("TEST_ITER22_CAT_")
        loc = _uniq("TEST_ITER22_LOC_")
        # First real insert
        r = session.post(f"{BASE_URL}/api/costumes/import", json={
            "rows": [{"name": name, "category": cat, "location": loc}],
            "dry_run": False,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created"] == 1
        assert d["would_create"] == 0
        assert d["duplicates"] == 0

        # Verify persistence + auto-created cat/loc
        listing = session.get(f"{BASE_URL}/api/costumes").json()
        match = [c for c in listing if c["name"] == name]
        assert len(match) == 1
        assert match[0]["category"] == cat
        assert match[0]["location"] == loc

        cats = session.get(f"{BASE_URL}/api/categories").json()
        assert any(c.get("name") == cat for c in cats), "category should be auto-created"

        locs = session.get(f"{BASE_URL}/api/locations").json()
        assert any(l.get("path") == loc or l.get("name") == loc for l in locs), "location should be auto-created"

        # Duplicate second import
        r2 = session.post(f"{BASE_URL}/api/costumes/import", json={
            "rows": [{"name": name}],
            "dry_run": False,
        })
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["duplicates"] == 1
        assert d2["created"] == 0


# ============================================================
# Equipment CSV Import
# ============================================================
class TestEquipmentImport:
    def test_equipment_dry_run(self, session):
        name = _uniq("TEST_EIMP_DRY_")
        r = session.post(f"{BASE_URL}/api/equipment/import", json={
            "rows": [{"name": name}],
            "dry_run": True,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["would_create"] == 1
        assert d["created"] == 0

    def test_equipment_missing_name_invalid(self, session):
        r = session.post(f"{BASE_URL}/api/equipment/import", json={
            "rows": [{"name": ""}],
            "dry_run": True,
        })
        assert r.status_code == 200
        assert r.json()["invalid"] == 1

    def test_equipment_real_and_duplicate_and_autocreate(self, session):
        name = _uniq("TEST_EIMP_REAL_")
        cat = _uniq("TEST_ITER22_ECAT_")
        loc = _uniq("TEST_ITER22_ELOC_")
        r = session.post(f"{BASE_URL}/api/equipment/import", json={
            "rows": [{"name": name, "category": cat, "location": loc}],
            "dry_run": False,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created"] == 1

        listing = session.get(f"{BASE_URL}/api/equipment").json()
        assert any(e["name"] == name for e in listing)

        # Dup
        r2 = session.post(f"{BASE_URL}/api/equipment/import", json={
            "rows": [{"name": name}],
            "dry_run": False,
        })
        assert r2.status_code == 200
        assert r2.json()["duplicates"] == 1


# ============================================================
# Shortage flag
# ============================================================
class TestShortageFlag:
    def _create_costume(self, session, name):
        r = session.post(f"{BASE_URL}/api/costumes", json={
            "name": name,
            "category": "Uncategorized",
            "location": "Unfiled",
        })
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_list_all_have_shortage_key(self, session):
        listing = session.get(f"{BASE_URL}/api/costumes").json()
        assert all("shortage" in c for c in listing)

    def test_not_in_use_shortage_false(self, session):
        c = self._create_costume(session, _uniq("TEST_SHORT_A_"))
        cid = c["id"]
        # ensure not in_use, assign students anyway
        r = session.put(f"{BASE_URL}/api/costumes/{cid}", json={
            "in_use": False, "in_use_quantity": 0, "assigned_student_ids": ["s1", "s2", "s3"],
        })
        assert r.status_code == 200, r.text
        assert r.json().get("shortage") is False
        g = session.get(f"{BASE_URL}/api/costumes/{cid}").json()
        assert g.get("shortage") is False

    def test_in_use_shortage_true_when_qty_lt_assigned(self, session):
        c = self._create_costume(session, _uniq("TEST_SHORT_B_"))
        cid = c["id"]
        r = session.put(f"{BASE_URL}/api/costumes/{cid}", json={
            "in_use": True, "in_use_quantity": 1, "assigned_student_ids": ["s1", "s2", "s3"],
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("shortage") is True, body
        g = session.get(f"{BASE_URL}/api/costumes/{cid}").json()
        assert g.get("shortage") is True

    def test_in_use_shortage_false_when_no_assignments(self, session):
        c = self._create_costume(session, _uniq("TEST_SHORT_C_"))
        cid = c["id"]
        r = session.put(f"{BASE_URL}/api/costumes/{cid}", json={
            "in_use": True, "in_use_quantity": 0, "assigned_student_ids": [],
        })
        assert r.status_code == 200
        assert r.json().get("shortage") is False
