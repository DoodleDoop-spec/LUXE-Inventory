#!/usr/bin/env python3
"""
Backend API Testing for LUXE Inventory - Iteration 13
Tests MapPin and MapShape location_id linking + negative width/height for lines
"""

import requests
import json
from typing import Dict, Any, Optional

# Backend URL from frontend/.env
BASE_URL = "https://luxe-inventory-7.preview.emergentagent.com/api"

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def record_pass(self, test_name: str):
        self.passed += 1
        print(f"✅ PASS: {test_name}")
    
    def record_fail(self, test_name: str, reason: str):
        self.failed += 1
        error_msg = f"❌ FAIL: {test_name}\n   Reason: {reason}"
        self.errors.append(error_msg)
        print(error_msg)
    
    def summary(self):
        print("\n" + "="*80)
        print(f"TEST SUMMARY: {self.passed} passed, {self.failed} failed")
        print("="*80)
        if self.errors:
            print("\nFailed Tests:")
            for error in self.errors:
                print(error)
        return self.failed == 0


def make_request(method: str, endpoint: str, data: Optional[Dict] = None, expected_status: int = 200) -> tuple[bool, Any]:
    """Make HTTP request and validate response"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method == "GET":
            resp = requests.get(url, timeout=10)
        elif method == "POST":
            resp = requests.post(url, json=data, timeout=10)
        elif method == "PUT":
            resp = requests.put(url, json=data, timeout=10)
        elif method == "DELETE":
            resp = requests.delete(url, timeout=10)
        else:
            return False, f"Unknown method: {method}"
        
        if resp.status_code != expected_status:
            return False, f"Expected {expected_status}, got {resp.status_code}. Response: {resp.text[:500]}"
        
        if resp.status_code == 204:
            return True, None
        
        try:
            return True, resp.json()
        except:
            return True, resp.text
    except Exception as e:
        return False, f"Request failed: {str(e)}"


def test_equipment_crud(result: TestResult):
    """Test Equipment CRUD operations"""
    print("\n" + "="*80)
    print("TESTING EQUIPMENT CRUD")
    print("="*80)
    
    # 1. GET /api/equipment
    success, data = make_request("GET", "/equipment")
    if success:
        result.record_pass("GET /api/equipment returns list")
        print(f"   Found {len(data)} existing equipment items")
    else:
        result.record_fail("GET /api/equipment", data)
        return
    
    # 2. POST /api/equipment-categories
    success, cat_data = make_request("POST", "/equipment-categories", {"name": "Electronics"}, expected_status=200)
    if not success and "already exists" in str(cat_data):
        # Category already exists, that's OK
        result.record_pass("POST /api/equipment-categories (already exists)")
        # Get existing category
        success, cats = make_request("GET", "/equipment-categories")
        cat_data = next((c for c in cats if c["name"] == "Electronics"), None)
    elif success:
        result.record_pass("POST /api/equipment-categories creates Electronics")
    else:
        result.record_fail("POST /api/equipment-categories", cat_data)
        return
    
    # 3. POST /api/equipment-sorting-systems
    success, sys_data = make_request("POST", "/equipment-sorting-systems", 
                                     {"name": "Cable Length", "sizes": ["short", "medium", "long"]})
    if not success and "already exists" in str(sys_data):
        result.record_pass("POST /api/equipment-sorting-systems (already exists)")
        # Get existing system
        success, systems = make_request("GET", "/equipment-sorting-systems")
        sys_data = next((s for s in systems if s["name"] == "Cable Length"), None)
    elif success:
        result.record_pass("POST /api/equipment-sorting-systems creates Cable Length")
        print(f"   Created sorting system: {sys_data['name']} with sizes: {sys_data['sizes']}")
    else:
        result.record_fail("POST /api/equipment-sorting-systems", sys_data)
        return
    
    # 4. POST /api/equipment with full payload
    equipment_payload = {
        "name": "HDMI Cable Set",
        "category": "Electronics",
        "location": "Backstage",
        "sorting_system": "Cable Length",
        "sizes": {"short": 2, "medium": 1, "long": 0},
        "pinned": True,
        "in_use": True,
        "in_use_note": "on stage tonight"
    }
    success, equip_data = make_request("POST", "/equipment", equipment_payload)
    if success:
        # Validate response
        if equip_data.get("total_quantity") == 3:
            result.record_pass("POST /api/equipment computes total_quantity correctly (3)")
        else:
            result.record_fail("POST /api/equipment total_quantity", 
                             f"Expected 3, got {equip_data.get('total_quantity')}")
        
        if equip_data.get("pinned") == True:
            result.record_pass("POST /api/equipment sets pinned=true")
        else:
            result.record_fail("POST /api/equipment pinned", 
                             f"Expected pinned=true, got {equip_data.get('pinned')}")
        
        if equip_data.get("in_use") == True:
            result.record_pass("POST /api/equipment sets in_use=true")
        else:
            result.record_fail("POST /api/equipment in_use", 
                             f"Expected in_use=true, got {equip_data.get('in_use')}")
        
        equipment_id = equip_data.get("id")
        print(f"   Created equipment: {equip_data['name']} (ID: {equipment_id})")
    else:
        result.record_fail("POST /api/equipment", equip_data)
        return
    
    # 5. GET /api/equipment/pinned
    success, pinned_data = make_request("GET", "/equipment/pinned")
    if success:
        pinned_ids = [e["id"] for e in pinned_data]
        if equipment_id in pinned_ids:
            result.record_pass("GET /api/equipment/pinned contains created item")
        else:
            result.record_fail("GET /api/equipment/pinned", 
                             f"Created equipment {equipment_id} not in pinned list")
    else:
        result.record_fail("GET /api/equipment/pinned", pinned_data)
    
    # 6. GET /api/equipment-stats
    success, stats_data = make_request("GET", "/equipment-stats")
    if success:
        required_fields = ["total_pieces", "total_items", "in_use_count", "flagged_count"]
        missing = [f for f in required_fields if f not in stats_data]
        if not missing:
            result.record_pass("GET /api/equipment-stats returns all required fields")
            print(f"   Stats: {stats_data}")
        else:
            result.record_fail("GET /api/equipment-stats", f"Missing fields: {missing}")
    else:
        result.record_fail("GET /api/equipment-stats", stats_data)
    
    # 7. PUT /api/equipment - switch to no sorting system with override
    update_payload = {
        "sorting_system": "",
        "total_quantity_override": 99
    }
    success, updated_data = make_request("PUT", f"/equipment/{equipment_id}", update_payload)
    if success:
        if updated_data.get("sorting_system") == "":
            result.record_pass("PUT /api/equipment clears sorting_system")
        else:
            result.record_fail("PUT /api/equipment sorting_system", 
                             f"Expected empty string, got {updated_data.get('sorting_system')}")
        
        if updated_data.get("total_quantity") == 99:
            result.record_pass("PUT /api/equipment uses total_quantity_override (99)")
        else:
            result.record_fail("PUT /api/equipment total_quantity_override", 
                             f"Expected 99, got {updated_data.get('total_quantity')}")
        
        if updated_data.get("sizes") == {}:
            result.record_pass("PUT /api/equipment clears sizes when sorting_system removed")
        else:
            result.record_fail("PUT /api/equipment sizes", 
                             f"Expected empty dict, got {updated_data.get('sizes')}")
    else:
        result.record_fail("PUT /api/equipment", updated_data)
    
    # 8. DELETE /api/equipment
    success, del_data = make_request("DELETE", f"/equipment/{equipment_id}")
    if success:
        result.record_pass("DELETE /api/equipment removes item")
        print(f"   Deleted equipment: {equipment_id}")
    else:
        result.record_fail("DELETE /api/equipment", del_data)
    
    # 9. DELETE /api/equipment-sorting-systems (should work when unused)
    if sys_data and "id" in sys_data:
        success, del_sys = make_request("DELETE", f"/equipment-sorting-systems/{sys_data['id']}")
        if success:
            result.record_pass("DELETE /api/equipment-sorting-systems (unused)")
        else:
            result.record_fail("DELETE /api/equipment-sorting-systems", del_sys)
    
    # 10. DELETE /api/equipment-categories while in use (should 409)
    # First create a test equipment in Electronics category
    test_equip = {
        "name": "Test Item for Category Delete",
        "category": "Electronics",
        "location": "Storage",
        "sorting_system": "",
        "total_quantity_override": 1
    }
    success, test_equip_data = make_request("POST", "/equipment", test_equip)
    if success:
        test_equip_id = test_equip_data["id"]
        # Now try to delete the category
        if cat_data and "id" in cat_data:
            success, del_cat = make_request("DELETE", f"/equipment-categories/{cat_data['id']}", 
                                          expected_status=409)
            if success:
                result.record_pass("DELETE /api/equipment-categories returns 409 when in use")
            else:
                result.record_fail("DELETE /api/equipment-categories (in use)", 
                                 f"Expected 409, but got different response: {del_cat}")
        
        # Clean up test equipment
        make_request("DELETE", f"/equipment/{test_equip_id}")
    else:
        result.record_fail("Setup for category delete test", test_equip_data)


def test_location_maps(result: TestResult):
    """Test Storage Location Map functionality"""
    print("\n" + "="*80)
    print("TESTING STORAGE LOCATION MAPS")
    print("="*80)
    
    # 1. Create a test location
    location_payload = {"name": "Test Costume Closet A"}
    success, loc_data = make_request("POST", "/locations", location_payload)
    if success:
        location_id = loc_data.get("id")
        result.record_pass("POST /api/locations creates test location")
        print(f"   Created location: {loc_data['name']} (ID: {location_id})")
    else:
        result.record_fail("POST /api/locations", loc_data)
        return
    
    # 2. PUT /api/locations/{id}/map with photo mode + pins
    photo_map_payload = {
        "map_mode": "photo",
        "map_image_id": None,
        "map_pins": [
            {
                "id": "p1",
                "x_pct": 10.5,
                "y_pct": 20.2,
                "label": "Top shelf",
                "color": "#EF4444"
            }
        ]
    }
    success, photo_map_data = make_request("PUT", f"/locations/{location_id}/map", photo_map_payload)
    if success:
        if photo_map_data.get("map_mode") == "photo":
            result.record_pass("PUT /api/locations/{id}/map sets map_mode=photo")
        else:
            result.record_fail("PUT /api/locations/{id}/map map_mode", 
                             f"Expected 'photo', got {photo_map_data.get('map_mode')}")
        
        pins = photo_map_data.get("map_pins", [])
        if len(pins) == 1 and pins[0].get("label") == "Top shelf":
            result.record_pass("PUT /api/locations/{id}/map saves photo pins correctly")
        else:
            result.record_fail("PUT /api/locations/{id}/map pins", 
                             f"Expected 1 pin with label 'Top shelf', got {pins}")
    else:
        result.record_fail("PUT /api/locations/{id}/map (photo mode)", photo_map_data)
    
    # 3. PUT /api/locations/{id}/map with floorplan mode + shapes
    floorplan_map_payload = {
        "map_mode": "floorplan",
        "floorplan_shapes": [
            {
                "id": "s1",
                "type": "rect",
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 50,
                "label": "Rack A",
                "fill_color": "#DBEAFE",
                "stroke_color": "#1D4ED8"
            }
        ]
    }
    success, floor_map_data = make_request("PUT", f"/locations/{location_id}/map", floorplan_map_payload)
    if success:
        if floor_map_data.get("map_mode") == "floorplan":
            result.record_pass("PUT /api/locations/{id}/map sets map_mode=floorplan")
        else:
            result.record_fail("PUT /api/locations/{id}/map map_mode", 
                             f"Expected 'floorplan', got {floor_map_data.get('map_mode')}")
        
        shapes = floor_map_data.get("floorplan_shapes", [])
        if len(shapes) == 1 and shapes[0].get("label") == "Rack A":
            result.record_pass("PUT /api/locations/{id}/map saves floorplan shapes correctly")
        else:
            result.record_fail("PUT /api/locations/{id}/map shapes", 
                             f"Expected 1 shape with label 'Rack A', got {shapes}")
    else:
        result.record_fail("PUT /api/locations/{id}/map (floorplan mode)", floor_map_data)
    
    # 4. PUT /api/locations/{id}/map with invalid map_mode (should 400)
    invalid_map_payload = {"map_mode": "bogus"}
    success, invalid_data = make_request("PUT", f"/locations/{location_id}/map", 
                                        invalid_map_payload, expected_status=400)
    if success:
        result.record_pass("PUT /api/locations/{id}/map rejects invalid map_mode with 400")
    else:
        result.record_fail("PUT /api/locations/{id}/map (invalid mode)", 
                         f"Expected 400, but got: {invalid_data}")
    
    # 5. GET /api/locations/{id} returns defaults
    success, get_loc_data = make_request("GET", f"/locations/{location_id}")
    if success:
        required_defaults = {
            "map_mode": str,
            "map_pins": list,
            "floorplan_shapes": list,
            "canvas_width": int,
            "canvas_height": int
        }
        missing = []
        for field, expected_type in required_defaults.items():
            if field not in get_loc_data:
                missing.append(field)
            elif not isinstance(get_loc_data[field], expected_type):
                missing.append(f"{field} (wrong type)")
        
        if not missing:
            result.record_pass("GET /api/locations/{id} returns all default map fields")
            print(f"   Location map data: mode={get_loc_data['map_mode']}, "
                  f"canvas={get_loc_data['canvas_width']}x{get_loc_data['canvas_height']}")
        else:
            result.record_fail("GET /api/locations/{id} defaults", 
                             f"Missing or wrong type: {missing}")
    else:
        result.record_fail("GET /api/locations/{id}", get_loc_data)
    
    # 6. Cleanup: DELETE test location
    success, del_loc = make_request("DELETE", f"/locations/{location_id}")
    if success:
        result.record_pass("DELETE /api/locations cleans up test location")
        print(f"   Deleted test location: {location_id}")
    else:
        result.record_fail("DELETE /api/locations", del_loc)


def test_iteration_13_map_location_linking(result: TestResult):
    """Test Iteration 13: MapPin and MapShape location_id linking + negative width/height for lines"""
    print("\n" + "="*80)
    print("TESTING ITERATION 13: MAP LOCATION LINKING & LINE ROTATION")
    print("="*80)
    
    # Step 1: Create parent location L1
    l1_payload = {"name": "IterTest Room 1"}
    success, l1_data = make_request("POST", "/locations", l1_payload)
    if success:
        l1_id = l1_data.get("id")
        result.record_pass("Step 1: POST /api/locations creates parent location L1")
        print(f"   Created L1: {l1_data['name']} (ID: {l1_id})")
    else:
        result.record_fail("Step 1: POST /api/locations (L1)", l1_data)
        return
    
    # Step 2: Create child location L2 with parent_id
    l2_payload = {"name": "IterTest Rack 1", "parent_id": l1_id}
    success, l2_data = make_request("POST", "/locations", l2_payload)
    if success:
        l2_id = l2_data.get("id")
        result.record_pass("Step 2: POST /api/locations creates child location L2")
        print(f"   Created L2: {l2_data['name']} (ID: {l2_id}, parent: {l1_id})")
    else:
        result.record_fail("Step 2: POST /api/locations (L2)", l2_data)
        # Cleanup L1
        make_request("DELETE", f"/locations/{l1_id}")
        return
    
    # Step 3: PUT floorplan with shapes including location_id and negative width/height
    floorplan_payload = {
        "map_mode": "floorplan",
        "floorplan_shapes": [
            {
                "id": "s1",
                "type": "rect",
                "x": 100,
                "y": 100,
                "width": 200,
                "height": 100,
                "label": "Rack A",
                "location_id": l2_id
            },
            {
                "id": "s2",
                "type": "line",
                "x": 50,
                "y": 50,
                "width": -100,
                "height": -80,
                "label": "Backward line"
            }
        ]
    }
    success, floor_data = make_request("PUT", f"/locations/{l1_id}/map", floorplan_payload)
    if success:
        result.record_pass("Step 3: PUT /api/locations/{id}/map with floorplan mode")
        
        # Verify location_id on shape s1
        shapes = floor_data.get("floorplan_shapes", [])
        s1 = next((s for s in shapes if s.get("id") == "s1"), None)
        if s1 and s1.get("location_id") == l2_id:
            result.record_pass("Step 3a: floorplan_shapes[0].location_id === L2.id")
            print(f"   ✓ Shape s1 location_id: {s1.get('location_id')}")
        else:
            result.record_fail("Step 3a: floorplan_shapes[0].location_id", 
                             f"Expected {l2_id}, got {s1.get('location_id') if s1 else 'shape not found'}")
        
        # Verify negative width/height preserved on line s2
        s2 = next((s for s in shapes if s.get("id") == "s2"), None)
        if s2:
            if s2.get("width") == -100:
                result.record_pass("Step 3b: floorplan_shapes[1].width === -100 (negative preserved)")
                print(f"   ✓ Line s2 width: {s2.get('width')}")
            else:
                result.record_fail("Step 3b: floorplan_shapes[1].width", 
                                 f"Expected -100, got {s2.get('width')}")
            
            if s2.get("height") == -80:
                result.record_pass("Step 3c: floorplan_shapes[1].height === -80 (negative preserved)")
                print(f"   ✓ Line s2 height: {s2.get('height')}")
            else:
                result.record_fail("Step 3c: floorplan_shapes[1].height", 
                                 f"Expected -80, got {s2.get('height')}")
        else:
            result.record_fail("Step 3b/c: floorplan_shapes[1]", "Line shape s2 not found in response")
    else:
        result.record_fail("Step 3: PUT /api/locations/{id}/map (floorplan)", floor_data)
    
    # Step 4: PUT photo mode with pins including location_id
    photo_payload = {
        "map_mode": "photo",
        "map_pins": [
            {
                "id": "p1",
                "x_pct": 30,
                "y_pct": 40,
                "label": "Rack area",
                "location_id": l2_id,
                "color": "#3B82F6"
            }
        ]
    }
    success, photo_data = make_request("PUT", f"/locations/{l1_id}/map", photo_payload)
    if success:
        result.record_pass("Step 4: PUT /api/locations/{id}/map with photo mode")
        
        # Verify location_id on pin p1
        pins = photo_data.get("map_pins", [])
        p1 = next((p for p in pins if p.get("id") == "p1"), None)
        if p1 and p1.get("location_id") == l2_id:
            result.record_pass("Step 4a: map_pins[0].location_id === L2.id")
            print(f"   ✓ Pin p1 location_id: {p1.get('location_id')}")
        else:
            result.record_fail("Step 4a: map_pins[0].location_id", 
                             f"Expected {l2_id}, got {p1.get('location_id') if p1 else 'pin not found'}")
    else:
        result.record_fail("Step 4: PUT /api/locations/{id}/map (photo)", photo_data)
    
    # Step 5: GET location to verify both floorplan_shapes and map_pins are returned with location_id intact
    success, get_data = make_request("GET", f"/locations/{l1_id}")
    if success:
        result.record_pass("Step 5: GET /api/locations/{id} returns location data")
        
        # Verify floorplan_shapes with location_id
        shapes = get_data.get("floorplan_shapes", [])
        s1 = next((s for s in shapes if s.get("id") == "s1"), None)
        if s1 and s1.get("location_id") == l2_id:
            result.record_pass("Step 5a: GET returns floorplan_shapes with location_id intact")
        else:
            result.record_fail("Step 5a: GET floorplan_shapes location_id", 
                             f"Expected {l2_id}, got {s1.get('location_id') if s1 else 'shape not found'}")
        
        # Verify map_pins with location_id
        pins = get_data.get("map_pins", [])
        p1 = next((p for p in pins if p.get("id") == "p1"), None)
        if p1 and p1.get("location_id") == l2_id:
            result.record_pass("Step 5b: GET returns map_pins with location_id intact")
        else:
            result.record_fail("Step 5b: GET map_pins location_id", 
                             f"Expected {l2_id}, got {p1.get('location_id') if p1 else 'pin not found'}")
    else:
        result.record_fail("Step 5: GET /api/locations/{id}", get_data)
    
    # Step 6: Cleanup - delete both locations (child first, then parent)
    success, del_l2 = make_request("DELETE", f"/locations/{l2_id}")
    if success:
        result.record_pass("Step 6a: DELETE /api/locations (L2)")
        print(f"   Deleted L2: {l2_id}")
    else:
        result.record_fail("Step 6a: DELETE /api/locations (L2)", del_l2)
    
    success, del_l1 = make_request("DELETE", f"/locations/{l1_id}")
    if success:
        result.record_pass("Step 6b: DELETE /api/locations (L1)")
        print(f"   Deleted L1: {l1_id}")
    else:
        result.record_fail("Step 6b: DELETE /api/locations (L1)", del_l1)


def main():
    print("\n" + "="*80)
    print("LUXE INVENTORY - ITERATION 13 BACKEND TESTING")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print("="*80)
    
    result = TestResult()
    
    # Test Iteration 13: Map location linking + negative width/height
    test_iteration_13_map_location_linking(result)
    
    # Print summary
    print("\n")
    all_passed = result.summary()
    
    if all_passed:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {result.failed} TEST(S) FAILED")
        return 1


if __name__ == "__main__":
    exit(main())
