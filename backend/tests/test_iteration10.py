"""Iteration 10 — Auth, RBAC (Roles+Permissions), Students, Orgs & Invites, Show is_live, Map detach."""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@luxe.test"
ADMIN_PASSWORD = "LuxeAdmin!23"


def _new_email(prefix="test"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@luxe.test"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        s.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "name": "LUXE Admin"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


# ==================== AUTH ====================
class TestAuth:
    def test_auth_status_public(self):
        r = requests.get(f"{API}/auth/status")
        assert r.status_code == 200
        assert "any_users" in r.json()

    def test_get_me_without_cookie_returns_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_costumes_requires_auth(self):
        r = requests.get(f"{API}/costumes")
        assert r.status_code == 401

    def test_register_login_me_logout_flow(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        email = _new_email("reg")
        # Register new subsequent user (should get parent_volunteer, org_id=None)
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!23", "name": "T Reg"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email.lower()
        email = email.lower()
        assert body["session_token"]
        assert body["user"]["role_slug"] == "parent_volunteer"
        assert body["user"]["org_id"] in (None, "")
        assert body["user"]["is_superadmin"] is False

        # /auth/me with cookie
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == email.lower()
        assert "role" in me
        assert "permissions" in (me.get("role") or {})

        # Wrong password → 401
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        r = s2.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pass!!"})
        assert r.status_code == 401
        assert "Invalid email or password" in r.json().get("detail", "")

        # Login success
        r = s2.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!23"})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == email

        # Logout invalidates session
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_bearer_token_works(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        token = r.json()["session_token"]
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200


# ==================== STUDENTS ====================
class TestStudents:
    def test_students_config(self, admin_session):
        r = admin_session.get(f"{API}/students/config")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["measurement_keys"], list) and len(body["measurement_keys"]) >= 5
        assert isinstance(body["size_keys"], list) and len(body["size_keys"]) >= 3

    def test_students_stats(self, admin_session):
        r = admin_session.get(f"{API}/students/stats")
        assert r.status_code == 200
        for k in ("total", "invited", "with_email", "size_distribution"):
            assert k in r.json()

    def test_students_crud_and_invite(self, admin_session):
        s = admin_session
        # Create
        r = s.post(f"{API}/students", json={
            "first_name": "TEST_Alice",
            "last_name": "Smith",
            "grade": "9",
            "measurements": {"Waist": "28"},
            "sizes": {"Shirt": "M"},
        })
        assert r.status_code == 200, r.text
        stu = r.json()
        sid = stu["id"]
        assert stu["first_name"] == "TEST_Alice"
        assert stu["sizes"]["Shirt"] == "M"
        assert stu["invited"] is False
        try:
            # List includes it
            r = s.get(f"{API}/students")
            assert r.status_code == 200
            assert any(x["id"] == sid for x in r.json())

            # Get single
            r = s.get(f"{API}/students/{sid}")
            assert r.status_code == 200
            assert r.json()["last_name"] == "Smith"

            # Update
            r = s.put(f"{API}/students/{sid}", json={"grade": "10", "sizes": {"Shirt": "L"}})
            assert r.status_code == 200
            assert r.json()["grade"] == "10"
            assert r.json()["sizes"]["Shirt"] == "L"

            # Invite without email → 400
            r = s.post(f"{API}/students/{sid}/invite")
            assert r.status_code == 400

            # Add email then invite
            r = s.put(f"{API}/students/{sid}", json={"email": "alice@example.com"})
            assert r.status_code == 200
            r = s.post(f"{API}/students/{sid}/invite")
            assert r.status_code == 200
            assert r.json().get("ok") is True
            got = s.get(f"{API}/students/{sid}").json()
            assert got["invited"] is True
        finally:
            r = s.delete(f"{API}/students/{sid}")
            assert r.status_code == 200
            r = s.get(f"{API}/students/{sid}")
            assert r.status_code == 404


# ==================== ROLES ====================
class TestRoles:
    def test_permissions_catalog(self, admin_session):
        r = admin_session.get(f"{API}/permissions/catalog")
        assert r.status_code == 200
        body = r.json()
        assert "catalog" in body and "all_keys" in body
        assert len(body["catalog"]) == 7, f"expected 7 groups, got {len(body['catalog'])}"
        assert len(body["all_keys"]) == 34, f"expected 34 keys, got {len(body['all_keys'])}"

    def test_list_roles_has_presets(self, admin_session):
        r = admin_session.get(f"{API}/roles")
        assert r.status_code == 200
        roles = r.json()
        assert len(roles) >= 10, f"expected 10+ presets, got {len(roles)}"
        slugs = {r_["slug"] for r_ in roles}
        assert "director" in slugs
        assert "parent_volunteer" in slugs

    def test_role_crud_clone_and_delete(self, admin_session):
        s = admin_session
        # Pick preset to clone from
        preset = next(r_ for r_ in s.get(f"{API}/roles").json() if r_["slug"] == "director")
        name = f"TEST_ROLE_{uuid.uuid4().hex[:6]}"
        # Create with clone
        r = s.post(f"{API}/roles", json={"name": name, "clone_from": preset["id"], "description": "d1", "color": "#123456"})
        assert r.status_code == 200, r.text
        role = r.json()
        rid = role["id"]
        try:
            assert role["is_system"] is False
            assert role["color"] == "#123456"
            # Cloned permissions should not all be False (Director has many True)
            assert any(v for v in role["permissions"].values())

            # Update perms
            first_key = next(iter(role["permissions"].keys()))
            r = s.put(f"{API}/roles/{rid}", json={
                "description": "updated",
                "color": "#00FF00",
                "permissions": {first_key: False},
            })
            assert r.status_code == 200
            upd = r.json()
            assert upd["description"] == "updated"
            assert upd["color"] == "#00FF00"
            assert upd["permissions"][first_key] is False
        finally:
            r = s.delete(f"{API}/roles/{rid}")
            assert r.status_code == 200

    def test_cannot_delete_system_role(self, admin_session):
        director = next(r_ for r_ in admin_session.get(f"{API}/roles").json() if r_.get("is_system"))
        r = admin_session.delete(f"{API}/roles/{director['id']}")
        assert r.status_code == 400

    def test_roles_org_scoped_isolation(self, admin_session):
        """Two users in different orgs should see only their own roles."""
        # User A: create fresh account + new org
        sA = requests.Session()
        sA.headers.update({"Content-Type": "application/json"})
        emailA = _new_email("orgA")
        sA.post(f"{API}/auth/register", json={"email": emailA, "password": "Passw0rd!23", "name": "OrgA Dir"})
        sA.post(f"{API}/organizations", json={"name": f"TEST_ORG_A_{uuid.uuid4().hex[:6]}"})
        # Create a marker role in org A
        marker_name = f"TEST_ISO_A_{uuid.uuid4().hex[:6]}"
        rA = sA.post(f"{API}/roles", json={"name": marker_name}).json()

        # User B: separate account + separate org
        sB = requests.Session()
        sB.headers.update({"Content-Type": "application/json"})
        emailB = _new_email("orgB")
        sB.post(f"{API}/auth/register", json={"email": emailB, "password": "Passw0rd!23", "name": "OrgB Dir"})
        sB.post(f"{API}/organizations", json={"name": f"TEST_ORG_B_{uuid.uuid4().hex[:6]}"})

        try:
            rolesB = sB.get(f"{API}/roles").json()
            names_B = {x["name"] for x in rolesB}
            assert marker_name not in names_B, "Cross-org role visible — isolation broken"
            # But B should have its own presets
            assert any(x["slug"] == "director" for x in rolesB)
        finally:
            sA.delete(f"{API}/roles/{rA['id']}")


# ==================== SHOWS is_live TOGGLE ====================
class TestShowIsLive:
    def test_is_live_flags_attached_costumes(self, admin_session):
        s = admin_session
        # Create show
        show = s.post(f"{API}/shows", json={"name": f"TEST_LIVE_{uuid.uuid4().hex[:6]}", "year": 2026}).json()
        # Two costumes on the show using the new `shows` array shape
        c1 = s.post(f"{API}/costumes", json={
            "name": f"TEST_L1_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "shows": [{"show_id": show["id"]}],
            "sizes": {"S": 1},
        }).json()
        c2 = s.post(f"{API}/costumes", json={
            "name": f"TEST_L2_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "shows": [{"show_id": show["id"], "timestamp": "0:30"}],
            "sizes": {"S": 1},
        }).json()
        try:
            # Toggle is_live=True
            r = s.put(f"{API}/shows/{show['id']}", json={
                "name": show["name"], "year": 2026, "is_live": True,
            })
            assert r.status_code == 200
            assert r.json().get("is_live") is True

            for cid in (c1["id"], c2["id"]):
                got = s.get(f"{API}/costumes/{cid}").json()
                assert got.get("in_use") is True, f"{cid} in_use not set"
                assert got.get("current_show_id") == show["id"]

            # Toggle back off
            r = s.put(f"{API}/shows/{show['id']}", json={
                "name": show["name"], "year": 2026, "is_live": False,
            })
            assert r.status_code == 200
            for cid in (c1["id"], c2["id"]):
                got = s.get(f"{API}/costumes/{cid}").json()
                assert got.get("in_use") is False
                assert got.get("current_show_id") in (None, "")
        finally:
            s.delete(f"{API}/costumes/{c1['id']}")
            s.delete(f"{API}/costumes/{c2['id']}")
            s.delete(f"{API}/shows/{show['id']}")


# ==================== MAP DETACH ====================
class TestMapDetach:
    def _make_location_with_pin(self, s, item_id):
        loc = s.post(f"{API}/locations", json={"name": f"TEST_MAP_{uuid.uuid4().hex[:6]}"}).json()
        r = s.put(f"{API}/locations/{loc['id']}/map", json={
            "map_mode": "photo",
            "map_image_id": "img-test",
            "map_pins": [{"id": "p1", "item_id": item_id, "item_type": "costume",
                          "location_id": loc["id"], "x_pct": 0.1, "y_pct": 0.1, "label": ""}],
        })
        assert r.status_code == 200, r.text
        return loc

    def test_delete_costume_detaches_from_maps(self, admin_session):
        s = admin_session
        c = s.post(f"{API}/costumes", json={
            "name": f"TEST_MAPC_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
        }).json()
        loc = self._make_location_with_pin(s, c["id"])
        try:
            # Confirm pin is on the map
            got = s.get(f"{API}/locations/{loc['id']}").json()
            assert any(p.get("item_id") == c["id"] for p in got.get("map_pins", []))
            # Delete costume
            r = s.delete(f"{API}/costumes/{c['id']}")
            assert r.status_code == 200
            # Pin should be gone
            got = s.get(f"{API}/locations/{loc['id']}").json()
            assert not any(p.get("item_id") == c["id"] for p in got.get("map_pins", []))
        finally:
            s.delete(f"{API}/locations/{loc['id']}")

    def test_move_item_detaches_from_maps(self, admin_session):
        s = admin_session
        c = s.post(f"{API}/costumes", json={
            "name": f"TEST_MAPM_{uuid.uuid4().hex[:6]}", "category": "Modern",
            "location": "Main Wardrobe", "sizes": {"S": 1},
        }).json()
        loc = self._make_location_with_pin(s, c["id"])
        loc2 = s.post(f"{API}/locations", json={"name": f"TEST_MAP2_{uuid.uuid4().hex[:6]}"}).json()
        try:
            r = s.post(f"{API}/locations/move-item", json={
                "item_id": c["id"],
                "item_type": "costume",
                "new_location": loc2["name"],
            })
            assert r.status_code == 200, r.text
            got = s.get(f"{API}/locations/{loc['id']}").json()
            assert not any(p.get("item_id") == c["id"] for p in got.get("map_pins", []))
        finally:
            s.delete(f"{API}/costumes/{c['id']}")
            s.delete(f"{API}/locations/{loc['id']}")
            s.delete(f"{API}/locations/{loc2['id']}")


# ==================== ORGS + INVITES ====================
class TestOrgsInvites:
    def test_organizations_mine_and_members(self, admin_session):
        r = admin_session.get(f"{API}/organizations/mine")
        assert r.status_code == 200
        org = r.json()
        assert org.get("id")

        r = admin_session.get(f"{API}/organizations/members")
        assert r.status_code == 200
        members = r.json()
        assert any(m["email"] == ADMIN_EMAIL for m in members)

    def test_invite_create_preview_redeem(self, admin_session):
        s = admin_session
        # Pick a non-director role from admin's org
        roles = s.get(f"{API}/roles").json()
        pv = next(r_ for r_ in roles if r_["slug"] == "parent_volunteer")

        # Create invite
        r = s.post(f"{API}/invites", json={"role_id": pv["id"], "expires_days": 7, "email": "TEST_inv@luxe.test"})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert len(inv["code"]) == 10
        assert inv["code"].isalnum()

        # Public preview
        r = requests.get(f"{API}/invites/preview/{inv['code']}")
        assert r.status_code == 200, r.text
        prev = r.json()
        assert prev["code"] == inv["code"]
        assert prev["org_name"]
        assert prev["role_name"] == pv["name"]

        # New user redeems it
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        email = _new_email("redeem")
        r = s2.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!23", "name": "T Red"})
        assert r.status_code == 200
        assert r.json()["user"]["org_id"] in (None, "")

        r = s2.post(f"{API}/invites/redeem", json={"code": inv["code"]})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # /auth/me now shows the org
        me = s2.get(f"{API}/auth/me").json()
        admin_org = admin_session.get(f"{API}/organizations/mine").json()
        assert me["org_id"] == admin_org["id"]

        # Preview of same code should now 404 (accepted)
        r = requests.get(f"{API}/invites/preview/{inv['code']}")
        assert r.status_code == 404

    def test_create_new_organization(self, admin_session):
        # Fresh user
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(f"{API}/auth/register", json={"email": _new_email("neworg"), "password": "Passw0rd!23", "name": "New Dir"})
        me1 = s.get(f"{API}/auth/me").json()
        assert me1["org_id"] in (None, "")

        # Create org
        r = s.post(f"{API}/organizations", json={"name": f"TEST_NEWORG_{uuid.uuid4().hex[:6]}"})
        assert r.status_code == 200, r.text
        org = r.json()
        assert org["id"]

        me2 = s.get(f"{API}/auth/me").json()
        assert me2["org_id"] == org["id"]
        assert me2["role_slug"] == "director"
