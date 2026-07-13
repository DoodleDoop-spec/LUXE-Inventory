"""Backend tests for LUXE Inventory Iteration 10."""
import os
import uuid
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

def test_stats_new_fields():
    """Test 1: GET /api/stats returns total_shows, total_locations, equipment_count."""
    print("\n=== Test 1: Stats endpoint new fields ===")
    r = session.get(f"{API}/stats")
    assert r.status_code == 200, f"Stats failed: {r.status_code} {r.text}"
    data = r.json()
    
    # Check new fields exist
    assert "total_shows" in data, "Missing total_shows"
    assert "total_locations" in data, "Missing total_locations"
    assert "equipment_count" in data, "Missing equipment_count"
    
    # Check they are integers
    assert isinstance(data["total_shows"], int), f"total_shows not int: {type(data['total_shows'])}"
    assert isinstance(data["total_locations"], int), f"total_locations not int: {type(data['total_locations'])}"
    assert isinstance(data["equipment_count"], int), f"equipment_count not int: {type(data['equipment_count'])}"
    
    # In fresh DB: should be 0 shows, 6 locations (seeded), 0 equipment
    print(f"✓ Stats: total_shows={data['total_shows']}, total_locations={data['total_locations']}, equipment_count={data['equipment_count']}")
    print("✓ Test 1 PASSED")


def test_sorting_systems_crud():
    """Test 2: Sorting systems CRUD operations."""
    print("\n=== Test 2: Sorting systems CRUD ===")
    
    # GET default systems
    r = session.get(f"{API}/sorting-systems")
    assert r.status_code == 200, f"GET sorting-systems failed: {r.status_code} {r.text}"
    systems = r.json()
    assert len(systems) >= 4, f"Expected at least 4 default systems, got {len(systems)}"
    
    system_names = {s["name"] for s in systems}
    expected = {"Letter", "Number (Even)", "Tall", "Petite"}
    assert expected.issubset(system_names), f"Missing default systems. Got: {system_names}"
    print(f"✓ Default systems present: {system_names}")
    
    # POST new system
    new_system = {"name": "Colors", "sizes": ["Red", "Green", "Blue"]}
    r = session.post(f"{API}/sorting-systems", json=new_system)
    assert r.status_code == 200, f"POST sorting-systems failed: {r.status_code} {r.text}"
    created = r.json()
    assert created["name"] == "Colors", f"Name mismatch: {created['name']}"
    assert created["sizes"] == ["Red", "Green", "Blue"], f"Sizes mismatch: {created['sizes']}"
    system_id = created["id"]
    print(f"✓ Created system: {created['name']} with id {system_id}")
    
    # PUT update
    r = session.put(f"{API}/sorting-systems/{system_id}", json={"name": "Colors", "sizes": ["Red", "Green", "Blue", "Yellow"]})
    assert r.status_code == 200, f"PUT sorting-systems failed: {r.status_code} {r.text}"
    updated = r.json()
    assert len(updated["sizes"]) == 4, f"Expected 4 sizes, got {len(updated['sizes'])}"
    print(f"✓ Updated system sizes: {updated['sizes']}")
    
    # DELETE
    r = session.delete(f"{API}/sorting-systems/{system_id}")
    assert r.status_code == 200, f"DELETE sorting-systems failed: {r.status_code} {r.text}"
    print(f"✓ Deleted system {system_id}")
    
    # Verify cross-check with /api/sizing-systems
    r1 = session.get(f"{API}/sorting-systems")
    r2 = session.get(f"{API}/sizing-systems")
    assert r1.status_code == 200 and r2.status_code == 200
    assert len(r1.json()) == len(r2.json()), "sorting-systems and sizing-systems return different counts"
    print("✓ Cross-check: sorting-systems and sizing-systems return same list")
    print("✓ Test 2 PASSED")


def test_costumes_with_shows_list():
    """Test 3: Costumes with new per-costume shows list."""
    print("\n=== Test 3: Costumes with shows list ===")
    
    # Create 2 shows
    show2020 = session.post(f"{API}/shows", json={"name": f"TEST_Show_2020_{uuid.uuid4().hex[:6]}", "year": 2020}).json()
    show2024 = session.post(f"{API}/shows", json={"name": f"TEST_Show_2024_{uuid.uuid4().hex[:6]}", "year": 2024}).json()
    print(f"✓ Created shows: {show2020['name']} (2020), {show2024['name']} (2024)")
    
    try:
        # POST costume with shows list
        costume_payload = {
            "name": f"TEST_Costume_{uuid.uuid4().hex[:6]}",
            "category": "Modern",
            "location": "Main Wardrobe",
            "shows": [
                {"show_id": show2020["id"], "timestamp": "1:23"},
                {"show_id": show2024["id"], "timestamp": ""}
            ],
            "sorting_system": "Letter",
            "sizes": {"M": 2}
        }
        r = session.post(f"{API}/costumes", json=costume_payload)
        assert r.status_code == 200, f"POST costume failed: {r.status_code} {r.text}"
        costume = r.json()
        costume_id = costume["id"]
        print(f"✓ Created costume: {costume['name']}")
        
        # Verify shows list
        assert len(costume["shows"]) == 2, f"Expected 2 shows, got {len(costume['shows'])}"
        assert costume["shows"][0]["show_id"] == show2020["id"]
        assert costume["shows"][0]["timestamp"] == "1:23"
        assert costume["shows"][1]["show_id"] == show2024["id"]
        assert costume["shows"][1]["timestamp"] == ""
        print(f"✓ Shows list preserved with timestamps: {costume['shows']}")
        
        # Verify origin_year = 2020 (MIN)
        assert costume["origin_year"] == 2020, f"Expected origin_year=2020, got {costume['origin_year']}"
        print(f"✓ origin_year = {costume['origin_year']} (MIN of show years)")
        
        # Verify sorting_system
        assert costume["sorting_system"] == "Letter", f"Expected sorting_system=Letter, got {costume['sorting_system']}"
        print(f"✓ sorting_system = {costume['sorting_system']}")
        
        # PUT update shows list to only 2024
        r = session.put(f"{API}/costumes/{costume_id}", json={"shows": [{"show_id": show2024["id"], "timestamp": "5:00"}]})
        assert r.status_code == 200, f"PUT costume failed: {r.status_code} {r.text}"
        updated = r.json()
        assert updated["origin_year"] == 2024, f"Expected origin_year=2024 after update, got {updated['origin_year']}"
        assert len(updated["shows"]) == 1
        assert updated["shows"][0]["timestamp"] == "5:00"
        print(f"✓ Updated shows list, origin_year now = {updated['origin_year']}")
        
        # GET /api/costumes?show_id=<show2024.id> should include this costume
        r = session.get(f"{API}/costumes", params={"show_id": show2024["id"]})
        assert r.status_code == 200, f"GET costumes by show_id failed: {r.status_code} {r.text}"
        costumes = r.json()
        costume_ids = [c["id"] for c in costumes]
        assert costume_id in costume_ids, f"Costume {costume_id} not found in show filter results"
        print(f"✓ GET /costumes?show_id={show2024['id']} includes costume")
        
        # Test legacy field acceptance: PUT with sizing_system should update sorting_system
        r = session.put(f"{API}/costumes/{costume_id}", json={"sizing_system": "Number (Even)"})
        assert r.status_code == 200, f"PUT costume with sizing_system failed: {r.status_code} {r.text}"
        updated = r.json()
        assert updated["sorting_system"] == "Number (Even)", f"Legacy sizing_system not mapped to sorting_system"
        print(f"✓ Legacy field: sizing_system='Number (Even)' updated sorting_system")
        
        # Cleanup
        session.delete(f"{API}/costumes/{costume_id}")
        print("✓ Test 3 PASSED")
    finally:
        session.delete(f"{API}/shows/{show2020['id']}")
        session.delete(f"{API}/shows/{show2024['id']}")


def test_shows_link_timestamp_removed():
    """Test 4: Shows no longer have link_timestamp field."""
    print("\n=== Test 4: Shows link_timestamp removed ===")
    
    # POST show with link_timestamp (should be ignored)
    show_payload = {
        "name": f"TEST_Show_TS_{uuid.uuid4().hex[:6]}",
        "year": 2023,
        "show_link": "https://example.com/video",
        "link_timestamp": "2:30"  # This should be ignored
    }
    r = session.post(f"{API}/shows", json=show_payload)
    assert r.status_code == 200, f"POST show failed: {r.status_code} {r.text}"
    show = r.json()
    show_id = show["id"]
    
    # Verify link_timestamp is NOT in response
    assert "link_timestamp" not in show, f"link_timestamp should not be in response: {show.keys()}"
    print(f"✓ POST show with link_timestamp: field ignored, not in response")
    
    try:
        # PUT update show_link
        r = session.put(f"{API}/shows/{show_id}", json={
            "name": show["name"],
            "year": 2023,
            "show_link": "https://example.com/updated"
        })
        assert r.status_code == 200, f"PUT show failed: {r.status_code} {r.text}"
        updated = r.json()
        assert updated["show_link"] == "https://example.com/updated", f"show_link not updated"
        assert "link_timestamp" not in updated, f"link_timestamp should not be in response"
        print(f"✓ PUT show_link updated successfully")
        
        # DELETE show while costume references it → should 409
        costume = session.post(f"{API}/costumes", json={
            "name": f"TEST_Costume_Ref_{uuid.uuid4().hex[:6]}",
            "category": "Modern",
            "location": "Main Wardrobe",
            "shows": [{"show_id": show_id, "timestamp": "1:00"}],
            "sizes": {"S": 1}
        }).json()
        
        r = session.delete(f"{API}/shows/{show_id}")
        assert r.status_code == 409, f"Expected 409 when deleting referenced show, got {r.status_code}"
        print(f"✓ DELETE show with costume reference: 409 as expected")
        
        # Cleanup
        session.delete(f"{API}/costumes/{costume['id']}")
        print("✓ Test 4 PASSED")
    finally:
        session.delete(f"{API}/shows/{show_id}")


def test_categories_enrichment():
    """Test 5: Categories & subcategories enrichment fields."""
    print("\n=== Test 5: Categories enrichment ===")
    
    # POST category
    cat_name = f"TEST_Earrings_{uuid.uuid4().hex[:6]}"
    r = session.post(f"{API}/categories", json={"name": cat_name})
    assert r.status_code == 200, f"POST category failed: {r.status_code} {r.text}"
    cat = r.json()
    cat_id = cat["id"]
    print(f"✓ Created category: {cat_name}")
    
    try:
        # PUT with enrichment fields
        enrichment = {
            "image_id": None,
            "location": "Vault",
            "sub_location": "Drawer 3",
            "notes": "Small stuff",
            "keywords": ["jewelry", "small"],
            "creator": "Alice"
        }
        r = session.put(f"{API}/categories/{cat_id}", json=enrichment)
        assert r.status_code == 200, f"PUT category enrichment failed: {r.status_code} {r.text}"
        updated = r.json()
        
        # Verify all fields
        assert updated["location"] == "Vault", f"location mismatch: {updated.get('location')}"
        assert updated["sub_location"] == "Drawer 3", f"sub_location mismatch: {updated.get('sub_location')}"
        assert updated["notes"] == "Small stuff", f"notes mismatch: {updated.get('notes')}"
        assert updated["keywords"] == ["jewelry", "small"], f"keywords mismatch: {updated.get('keywords')}"
        assert updated["creator"] == "Alice", f"creator mismatch: {updated.get('creator')}"
        print(f"✓ Category enrichment fields updated: location={updated['location']}, creator={updated['creator']}")
        
        # POST subcategory with enrichment
        sub_payload = {
            "name": "Studs",
            "location": "Vault",
            "notes": "Post backs"
        }
        r = session.post(f"{API}/categories/{cat_id}/subcategories", json=sub_payload)
        assert r.status_code == 200, f"POST subcategory failed: {r.status_code} {r.text}"
        result = r.json()
        subs = result["subcategories"]
        stud = next((s for s in subs if s["name"] == "Studs"), None)
        assert stud is not None, "Subcategory 'Studs' not found"
        assert stud["location"] == "Vault", f"subcategory location mismatch: {stud.get('location')}"
        assert stud["notes"] == "Post backs", f"subcategory notes mismatch: {stud.get('notes')}"
        sub_id = stud["id"]
        print(f"✓ Subcategory created with enrichment: location={stud['location']}, notes={stud['notes']}")
        
        # PUT subcategory update notes only (no name)
        r = session.put(f"{API}/categories/{cat_id}/subcategories/{sub_id}", json={"notes": "Updated notes"})
        assert r.status_code == 200, f"PUT subcategory failed: {r.status_code} {r.text}"
        print(f"✓ Subcategory notes updated (name unchanged)")
        
        # Verify on GET
        r = session.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        cat_check = next((c for c in cats if c["id"] == cat_id), None)
        assert cat_check is not None
        sub_check = next((s for s in cat_check["subcategories"] if s["id"] == sub_id), None)
        assert sub_check["notes"] == "Updated notes", f"Subcategory notes not persisted"
        print(f"✓ Subcategory notes persisted: {sub_check['notes']}")
        
        print("✓ Test 5 PASSED")
    finally:
        session.delete(f"{API}/categories/{cat_id}")


def run_all_tests():
    """Run all Iteration 10 tests."""
    print("=" * 60)
    print("LUXE Inventory Iteration 10 Backend Tests")
    print("=" * 60)
    
    tests = [
        test_stats_new_fields,
        test_sorting_systems_crud,
        test_costumes_with_shows_list,
        test_shows_link_timestamp_removed,
        test_categories_enrichment,
    ]
    
    passed = 0
    failed = 0
    errors = []
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append(f"{test.__name__}: {str(e)}")
            print(f"✗ {test.__name__} FAILED: {e}")
        except Exception as e:
            failed += 1
            errors.append(f"{test.__name__}: {type(e).__name__}: {str(e)}")
            print(f"✗ {test.__name__} ERROR: {e}")
    
    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
    
    if errors:
        print("\nFAILURES:")
        for err in errors:
            print(f"  - {err}")
    
    return passed, failed, errors


if __name__ == "__main__":
    passed, failed, errors = run_all_tests()
    exit(0 if failed == 0 else 1)
