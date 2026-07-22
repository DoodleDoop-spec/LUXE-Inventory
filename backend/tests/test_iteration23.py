"""Iteration 23 backend tests: Import History + Undo."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@luxe.test", "password": "LuxeAdmin!23"})
    assert r.status_code == 200, r.text
    return s


# ---------- Costume import batch recording + list + undo ----------
def test_costume_dry_run_does_not_record_batch(client):
    before = client.get(f"{API}/imports").json()
    before_ids = {b["id"] for b in before}
    payload = {
        "rows": [{"name": "TEST_ITER23_DRY_A", "category": "TEST_ITER23_CAT"}],
        "dry_run": True,
    }
    r = client.post(f"{API}/costumes/import", json=payload)
    assert r.status_code == 200, r.text
    after = client.get(f"{API}/imports").json()
    after_ids = {b["id"] for b in after}
    assert after_ids == before_ids, "dry_run must NOT record a batch row"


def test_costume_real_import_records_batch_and_undo_flow(client):
    payload = {
        "rows": [
            {"name": "TEST_ITER23_C_ONE", "category": "TEST_ITER23_CAT"},
            {"name": "TEST_ITER23_C_TWO", "category": "TEST_ITER23_CAT"},
        ],
        "dry_run": False,
    }
    r = client.post(f"{API}/costumes/import", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 2

    batches = client.get(f"{API}/imports").json()
    assert isinstance(batches, list) and len(batches) > 0
    # Newest first
    top = batches[0]
    for k in ["id", "entity", "user_email", "created_count", "created_ids",
              "duplicates", "invalid", "undone", "created_at"]:
        assert k in top, f"missing field {k} in batch row"
    assert top["entity"] == "costumes"
    assert top["created_count"] == 2
    assert top["undone"] is False
    assert isinstance(top["created_ids"], list) and len(top["created_ids"]) == 2

    batch_id = top["id"]
    created_ids = top["created_ids"]

    # Verify costumes actually exist
    for cid in created_ids:
        rr = client.get(f"{API}/costumes/{cid}")
        assert rr.status_code == 200

    # Undo
    r_undo = client.post(f"{API}/imports/{batch_id}/undo")
    assert r_undo.status_code == 200, r_undo.text
    ub = r_undo.json()
    assert ub["undone"] is True
    assert ub["deleted"] == 2

    # Verify they are gone
    for cid in created_ids:
        rr = client.get(f"{API}/costumes/{cid}")
        assert rr.status_code == 404

    # Second undo = 409
    r_undo2 = client.post(f"{API}/imports/{batch_id}/undo")
    assert r_undo2.status_code == 409

    # Batch row now shows undone=true
    batches2 = client.get(f"{API}/imports").json()
    found = next((b for b in batches2 if b["id"] == batch_id), None)
    assert found is not None
    assert found["undone"] is True
    assert found.get("undone_count") == 2


def test_undo_unknown_batch_404(client):
    r = client.post(f"{API}/imports/nonexistent-batch-id-xyz/undo")
    assert r.status_code == 404


# ---------- Equipment import batch recording + undo ----------
def test_equipment_real_import_records_batch_and_undo(client):
    payload = {
        "rows": [
            {"name": "TEST_ITER23_E_ONE", "category": "TEST_ITER23_ECAT"},
        ],
        "dry_run": False,
    }
    r = client.post(f"{API}/equipment/import", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1

    batches = client.get(f"{API}/imports").json()
    top = batches[0]
    assert top["entity"] == "equipment"
    assert top["created_count"] == 1
    batch_id = top["id"]
    eid = top["created_ids"][0]

    # Confirm exists
    e = client.get(f"{API}/equipment/{eid}")
    assert e.status_code == 200

    # Undo
    r_undo = client.post(f"{API}/imports/{batch_id}/undo")
    assert r_undo.status_code == 200
    assert r_undo.json()["deleted"] == 1

    # Confirm gone
    e2 = client.get(f"{API}/equipment/{eid}")
    assert e2.status_code == 404


def test_imports_list_newest_first(client):
    batches = client.get(f"{API}/imports").json()
    if len(batches) >= 2:
        assert batches[0]["created_at"] >= batches[1]["created_at"]
