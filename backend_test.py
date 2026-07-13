#!/usr/bin/env python3
"""
Backend API tests for LUXE Inventory Iteration 11
Tests: optional sorting system, pinned costumes, max 2 active shows, hide_in_use_mode setting
"""

import requests
import json
from typing import Dict, Any, Optional

# Backend URL
BASE_URL = "https://luxe-inventory-7.preview.emergentagent.com/api"

# Test results tracking
test_results = []


def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({"name": name, "passed": passed, "details": details})
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")


def create_show(name: str, year: int) -> Optional[str]:
    """Helper: create a show and return its ID"""
    try:
        resp = requests.post(f"{BASE_URL}/shows", json={
            "name": name,
            "year": year,
            "show_link": f"https://example.com/{name.lower().replace(' ', '-')}"
        }, timeout=10)
        if resp.status_code in [200, 201]:
            return resp.json()["id"]
        print(f"  Warning: Failed to create show {name}: {resp.status_code}")
        return None
    except Exception as e:
        print(f"  Warning: Exception creating show {name}: {e}")
        return None


def create_costume(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Helper: create a costume and return the response"""
    try:
        resp = requests.post(f"{BASE_URL}/costumes", json=data, timeout=10)
        if resp.status_code in [200, 201]:
            return resp.json()
        return None
    except Exception as e:
        print(f"  Exception creating costume: {e}")
        return None


def update_costume(costume_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Helper: update a costume and return the response"""
    try:
        resp = requests.put(f"{BASE_URL}/costumes/{costume_id}", json=data, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        print(f"  Exception updating costume: {e}")
        return None


def test_optional_sorting_system():
    """Test 1: Optional sorting system + total override"""
    print("\n" + "="*80)
    print("TEST 1: Optional sorting system + total override")
    print("="*80)
    
    # Test 1.1: Create costume with blank sorting_system and total_quantity_override
    print("\n1.1: POST costume with sorting_system='' and total_quantity_override=12")
    costume_data = {
        "name": "Sunglasses",
        "category": "Accessories",
        "location": "Vault",
        "sorting_system": "",
        "sizes": {},
        "total_quantity_override": 12
    }
    
    resp = requests.post(f"{BASE_URL}/costumes", json=costume_data, timeout=10)
    if resp.status_code in [200, 201]:
        costume = resp.json()
        checks = [
            (costume.get("sorting_system") == "", "sorting_system is empty string"),
            (costume.get("total_quantity") == 12, f"total_quantity is 12 (got {costume.get('total_quantity')})"),
            (costume.get("sizes") == {}, "sizes is empty dict")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Create costume with blank sorting_system and total_quantity_override", all_passed, details)
        costume1_id = costume.get("id")
    else:
        log_test("Create costume with blank sorting_system and total_quantity_override", False, 
                f"Status {resp.status_code}: {resp.text[:200]}")
        return
    
    # Test 1.2: Update costume that had sorting_system to blank
    print("\n1.2: Create costume with sorting_system, then update to blank with total_quantity_override")
    costume2_data = {
        "name": "Test Shirt",
        "category": "Tops",
        "location": "Vault",
        "sorting_system": "Letter",
        "sizes": {"M": 3, "L": 2}
    }
    costume2 = create_costume(costume2_data)
    if costume2:
        costume2_id = costume2.get("id")
        # Now update to blank sorting_system
        update_data = {
            "sorting_system": "",
            "total_quantity_override": 25
        }
        updated = update_costume(costume2_id, update_data)
        if updated:
            checks = [
                (updated.get("sorting_system") == "", "sorting_system is empty"),
                (updated.get("sizes") == {}, "sizes cleared to {}"),
                (updated.get("size_notes") == {}, "size_notes cleared to {}"),
                (updated.get("total_quantity") == 25, f"total_quantity is 25 (got {updated.get('total_quantity')})")
            ]
            all_passed = all(check[0] for check in checks)
            details = "; ".join([check[1] for check in checks])
            log_test("Update costume from sorting_system to blank with override", all_passed, details)
        else:
            log_test("Update costume from sorting_system to blank with override", False, "Update failed")
    else:
        log_test("Update costume from sorting_system to blank with override", False, "Failed to create test costume")
    
    # Test 1.3: Update costume back to having sorting_system
    print("\n1.3: Update costume back to sorting_system='Letter' with sizes")
    if costume2_id:
        update_data = {
            "sorting_system": "Letter",
            "sizes": {"M": 3}
        }
        updated = update_costume(costume2_id, update_data)
        if updated:
            checks = [
                (updated.get("sorting_system") == "Letter", "sorting_system is 'Letter'"),
                (updated.get("sizes") == {"M": 3}, f"sizes is {{'M': 3}} (got {updated.get('sizes')})"),
                (updated.get("total_quantity") == 3, f"total_quantity auto-computed to 3 (got {updated.get('total_quantity')})")
            ]
            all_passed = all(check[0] for check in checks)
            details = "; ".join([check[1] for check in checks])
            log_test("Update costume back to sorting_system with auto-computed total", all_passed, details)
        else:
            log_test("Update costume back to sorting_system with auto-computed total", False, "Update failed")


def test_pinned_costumes():
    """Test 2: Pinned toggle + /api/pinned endpoint"""
    print("\n" + "="*80)
    print("TEST 2: Pinned toggle + /api/pinned endpoint")
    print("="*80)
    
    # Test 2.1: Create costume with pinned=true
    print("\n2.1: POST costume with pinned=true")
    costume_data = {
        "name": "Pinned Hat",
        "category": "Accessories",
        "location": "Vault",
        "pinned": True
    }
    
    costume = create_costume(costume_data)
    if costume:
        costume_id = costume.get("id")
        passed = costume.get("pinned") == True
        log_test("Create costume with pinned=true", passed, 
                f"pinned={costume.get('pinned')}")
    else:
        log_test("Create costume with pinned=true", False, "Failed to create costume")
        return
    
    # Test 2.2: GET /api/pinned returns the costume
    print("\n2.2: GET /api/pinned returns the pinned costume")
    resp = requests.get(f"{BASE_URL}/pinned", timeout=10)
    if resp.status_code == 200:
        pinned_list = resp.json()
        found = any(c.get("id") == costume_id for c in pinned_list)
        log_test("GET /api/pinned returns pinned costume", found,
                f"Found {len(pinned_list)} pinned costumes, includes our costume: {found}")
    else:
        log_test("GET /api/pinned returns pinned costume", False,
                f"Status {resp.status_code}: {resp.text[:200]}")
    
    # Test 2.3: Update costume to pinned=false
    print("\n2.3: PUT costume with pinned=false, then verify GET /api/pinned excludes it")
    updated = update_costume(costume_id, {"pinned": False})
    if updated:
        passed = updated.get("pinned") == False
        log_test("Update costume to pinned=false", passed,
                f"pinned={updated.get('pinned')}")
        
        # Verify GET /api/pinned no longer includes it
        resp = requests.get(f"{BASE_URL}/pinned", timeout=10)
        if resp.status_code == 200:
            pinned_list = resp.json()
            not_found = not any(c.get("id") == costume_id for c in pinned_list)
            log_test("GET /api/pinned excludes unpinned costume", not_found,
                    f"Costume not in pinned list: {not_found}")
        else:
            log_test("GET /api/pinned excludes unpinned costume", False,
                    f"Status {resp.status_code}")
    else:
        log_test("Update costume to pinned=false", False, "Update failed")


def test_max_2_active_shows():
    """Test 3: Enforce max 2 active shows"""
    print("\n" + "="*80)
    print("TEST 3: Enforce max 2 active shows")
    print("="*80)
    
    # Create 4 shows
    print("\nCreating 4 test shows...")
    show_a = create_show("Show A", 2020)
    show_b = create_show("Show B", 2021)
    show_c = create_show("Show C", 2022)
    show_d = create_show("Show D", 2023)
    
    if not all([show_a, show_b, show_c, show_d]):
        log_test("Create test shows", False, "Failed to create all test shows")
        return
    
    print(f"Created shows: A={show_a[:8]}, B={show_b[:8]}, C={show_c[:8]}, D={show_d[:8]}")
    
    # Test 3.1: Create costume with in_use=true, current_show_id=A
    print("\n3.1: POST Costume1 with in_use=true, current_show_id=A")
    costume1 = create_costume({
        "name": "Costume1",
        "category": "Tops",
        "location": "Vault",
        "in_use": True,
        "current_show_id": show_a
    })
    if costume1:
        checks = [
            (costume1.get("in_use") == True, "in_use=true"),
            (costume1.get("current_show_id") == show_a, f"current_show_id={show_a[:8]}")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Create Costume1 with show A", all_passed, details)
        costume1_id = costume1.get("id")
    else:
        log_test("Create Costume1 with show A", False, "Failed to create")
        return
    
    # Test 3.2: Create costume with in_use=true, current_show_id=B (2nd distinct show)
    print("\n3.2: POST Costume2 with in_use=true, current_show_id=B (2nd distinct show)")
    costume2 = create_costume({
        "name": "Costume2",
        "category": "Tops",
        "location": "Vault",
        "in_use": True,
        "current_show_id": show_b
    })
    if costume2:
        checks = [
            (costume2.get("in_use") == True, "in_use=true"),
            (costume2.get("current_show_id") == show_b, f"current_show_id={show_b[:8]}")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Create Costume2 with show B (2nd distinct)", all_passed, details)
        costume2_id = costume2.get("id")
    else:
        log_test("Create Costume2 with show B (2nd distinct)", False, "Failed to create")
        return
    
    # Test 3.3: Try to create costume with in_use=true, current_show_id=C (3rd distinct show) - should FAIL 409
    print("\n3.3: POST Costume3 with in_use=true, current_show_id=C (3rd distinct) - should return 409")
    resp = requests.post(f"{BASE_URL}/costumes", json={
        "name": "Costume3",
        "category": "Tops",
        "location": "Vault",
        "in_use": True,
        "current_show_id": show_c
    }, timeout=10)
    
    if resp.status_code == 409:
        detail = resp.json().get("detail", "")
        has_cap_message = "2" in detail and ("show" in detail.lower() or "cap" in detail.lower())
        log_test("Create Costume3 with 3rd show returns 409", True,
                f"Status 409 with message: {detail}")
    else:
        log_test("Create Costume3 with 3rd show returns 409", False,
                f"Expected 409, got {resp.status_code}: {resp.text[:200]}")
    
    # Test 3.4: Create costume with same show as existing (show A) - should succeed
    print("\n3.4: POST Costume4 with in_use=true, current_show_id=A (same as Costume1) - should succeed")
    costume4 = create_costume({
        "name": "Costume4",
        "category": "Tops",
        "location": "Vault",
        "in_use": True,
        "current_show_id": show_a
    })
    if costume4:
        checks = [
            (costume4.get("in_use") == True, "in_use=true"),
            (costume4.get("current_show_id") == show_a, f"current_show_id={show_a[:8]}")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Create Costume4 with existing show A (still 2 distinct)", all_passed, details)
        costume4_id = costume4.get("id")
    else:
        log_test("Create Costume4 with existing show A (still 2 distinct)", False, "Failed to create")
    
    # Test 3.5: Set Costume1 to in_use=false, then try creating with show C
    print("\n3.5: PUT Costume1 with in_use=false, then POST new costume with show C")
    updated1 = update_costume(costume1_id, {"in_use": False})
    if updated1:
        checks = [
            (updated1.get("in_use") == False, "in_use=false"),
            (updated1.get("current_show_id") is None, f"current_show_id=None (got {updated1.get('current_show_id')})")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Update Costume1 to in_use=false clears current_show_id", all_passed, details)
    else:
        log_test("Update Costume1 to in_use=false clears current_show_id", False, "Update failed")
    
    # Test 3.6: Set Costume4 to in_use=false as well (now only show B is active)
    print("\n3.6: PUT Costume4 with in_use=false (now only show B active from Costume2)")
    updated4 = update_costume(costume4_id, {"in_use": False})
    if updated4:
        checks = [
            (updated4.get("in_use") == False, "in_use=false"),
            (updated4.get("current_show_id") is None, "current_show_id=None")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Update Costume4 to in_use=false", all_passed, details)
    else:
        log_test("Update Costume4 to in_use=false", False, "Update failed")
    
    # Test 3.7: Now create costume with show C - should succeed (only B is active, C would be 2nd)
    print("\n3.7: POST Costume5 with show C - should succeed (active shows: B, C)")
    costume5 = create_costume({
        "name": "Costume5",
        "category": "Tops",
        "location": "Vault",
        "in_use": True,
        "current_show_id": show_c
    })
    if costume5:
        checks = [
            (costume5.get("in_use") == True, "in_use=true"),
            (costume5.get("current_show_id") == show_c, f"current_show_id={show_c[:8]}")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Create Costume5 with show C (now 2 distinct: B, C)", all_passed, details)
    else:
        log_test("Create Costume5 with show C (now 2 distinct: B, C)", False, "Failed to create")
    
    # Test 3.8: Try to create costume with show D - should fail 409 (would be 3rd)
    print("\n3.8: POST Costume6 with show D - should return 409 (would be 3rd distinct)")
    resp = requests.post(f"{BASE_URL}/costumes", json={
        "name": "Costume6",
        "category": "Tops",
        "location": "Vault",
        "in_use": True,
        "current_show_id": show_d
    }, timeout=10)
    
    if resp.status_code == 409:
        detail = resp.json().get("detail", "")
        log_test("Create Costume6 with 3rd show D returns 409", True,
                f"Status 409 with message: {detail}")
    else:
        log_test("Create Costume6 with 3rd show D returns 409", False,
                f"Expected 409, got {resp.status_code}: {resp.text[:200]}")


def test_hide_in_use_mode_setting():
    """Test 4: hide_in_use_mode setting"""
    print("\n" + "="*80)
    print("TEST 4: hide_in_use_mode setting")
    print("="*80)
    
    # Test 4.1: PUT /api/settings with hide_in_use_mode="hide_all"
    print("\n4.1: PUT /api/settings with hide_in_use_mode='hide_all'")
    resp = requests.put(f"{BASE_URL}/settings", json={
        "hide_in_use_mode": "hide_all"
    }, timeout=10)
    
    if resp.status_code == 200:
        settings = resp.json()
        passed = settings.get("hide_in_use_mode") == "hide_all"
        log_test("Update settings with hide_in_use_mode='hide_all'", passed,
                f"hide_in_use_mode={settings.get('hide_in_use_mode')}")
        
        # Verify with GET
        resp_get = requests.get(f"{BASE_URL}/settings", timeout=10)
        if resp_get.status_code == 200:
            settings_get = resp_get.json()
            passed = settings_get.get("hide_in_use_mode") == "hide_all"
            log_test("GET /api/settings reflects hide_in_use_mode='hide_all'", passed,
                    f"hide_in_use_mode={settings_get.get('hide_in_use_mode')}")
        else:
            log_test("GET /api/settings reflects hide_in_use_mode='hide_all'", False,
                    f"GET failed with status {resp_get.status_code}")
    else:
        log_test("Update settings with hide_in_use_mode='hide_all'", False,
                f"Status {resp.status_code}: {resp.text[:200]}")
    
    # Test 4.2: PUT /api/settings with hide_in_use_mode="bogus" - should return 400
    print("\n4.2: PUT /api/settings with hide_in_use_mode='bogus' - should return 400")
    resp = requests.put(f"{BASE_URL}/settings", json={
        "hide_in_use_mode": "bogus"
    }, timeout=10)
    
    if resp.status_code == 400:
        detail = resp.json().get("detail", "")
        log_test("Update settings with invalid hide_in_use_mode returns 400", True,
                f"Status 400 with message: {detail}")
    else:
        log_test("Update settings with invalid hide_in_use_mode returns 400", False,
                f"Expected 400, got {resp.status_code}: {resp.text[:200]}")
    
    # Test 4.3: PUT /api/settings with org_name only (no hide_in_use_mode) - should preserve hide_in_use_mode
    print("\n4.3: PUT /api/settings with org_name only (no hide_in_use_mode field)")
    resp = requests.put(f"{BASE_URL}/settings", json={
        "org_name": "MyGroup"
    }, timeout=10)
    
    if resp.status_code == 200:
        settings = resp.json()
        checks = [
            (settings.get("org_name") == "MyGroup", f"org_name='MyGroup' (got {settings.get('org_name')})"),
            (settings.get("hide_in_use_mode") == "hide_all", f"hide_in_use_mode preserved as 'hide_all' (got {settings.get('hide_in_use_mode')})")
        ]
        all_passed = all(check[0] for check in checks)
        details = "; ".join([check[1] for check in checks])
        log_test("Update settings without hide_in_use_mode preserves value", all_passed, details)
    else:
        log_test("Update settings without hide_in_use_mode preserves value", False,
                f"Status {resp.status_code}: {resp.text[:200]}")
    
    # Test 4.4: PUT /api/settings with hide_in_use_mode="hide_marker"
    print("\n4.4: PUT /api/settings with hide_in_use_mode='hide_marker'")
    resp = requests.put(f"{BASE_URL}/settings", json={
        "hide_in_use_mode": "hide_marker"
    }, timeout=10)
    
    if resp.status_code == 200:
        settings = resp.json()
        passed = settings.get("hide_in_use_mode") == "hide_marker"
        log_test("Update settings with hide_in_use_mode='hide_marker'", passed,
                f"hide_in_use_mode={settings.get('hide_in_use_mode')}")
    else:
        log_test("Update settings with hide_in_use_mode='hide_marker'", False,
                f"Status {resp.status_code}: {resp.text[:200]}")
    
    # Test 4.5: PUT /api/settings with hide_in_use_mode="full"
    print("\n4.5: PUT /api/settings with hide_in_use_mode='full'")
    resp = requests.put(f"{BASE_URL}/settings", json={
        "hide_in_use_mode": "full"
    }, timeout=10)
    
    if resp.status_code == 200:
        settings = resp.json()
        passed = settings.get("hide_in_use_mode") == "full"
        log_test("Update settings with hide_in_use_mode='full'", passed,
                f"hide_in_use_mode={settings.get('hide_in_use_mode')}")
    else:
        log_test("Update settings with hide_in_use_mode='full'", False,
                f"Status {resp.status_code}: {resp.text[:200]}")


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for t in test_results if t["passed"])
    failed = sum(1 for t in test_results if not t["passed"])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"Passed: {passed} ✅")
    print(f"Failed: {failed} ❌")
    
    if failed > 0:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for t in test_results:
            if not t["passed"]:
                print(f"\n❌ {t['name']}")
                if t["details"]:
                    print(f"   {t['details']}")
    
    print("\n" + "="*80)
    return failed == 0


if __name__ == "__main__":
    print("="*80)
    print("LUXE Inventory - Iteration 11 Backend Tests")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print("="*80)
    
    try:
        # Run all tests
        test_optional_sorting_system()
        test_pinned_costumes()
        test_max_2_active_shows()
        test_hide_in_use_mode_setting()
        
        # Print summary
        all_passed = print_summary()
        
        exit(0 if all_passed else 1)
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
