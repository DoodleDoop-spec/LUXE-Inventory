# Auth-Gated App Testing Playbook (LUXE Inventory)

## Two authentication flows co-exist:
1. **Emergent-managed Google Auth** — user hits `/login`, clicks "Continue with Google",
   is redirected to `auth.emergentagent.com`, returns with `#session_id=...`,
   backend exchanges the session_id for a `session_token`.
2. **Email + Password (JWT-style session token)** — traditional signup/login endpoints
   `POST /api/auth/register` and `POST /api/auth/login`. Same `user_sessions` table.

Both flows produce a `session_token` cookie (httpOnly, secure, samesite=none)
and are validated the same way by the `get_current_user` FastAPI dependency.

## Test Users (see `/app/memory/test_credentials.md` for latest)
- Password admin: `admin@luxe.test` / `LuxeAdmin!23` — role: Director
- Password volunteer: `parent@luxe.test` / `Parent!23` — role: Parent Volunteer

## Test Steps

### Step 1: Create a session directly in MongoDB (skips OAuth)
```
mongosh --eval "
use('luxe_inventory');
var uid = 'u_' + Date.now();
var tok = 't_' + Date.now();
db.users.insertOne({
  user_id: uid,
  email: 'test.' + Date.now() + '@luxe.test',
  name: 'Test User',
  auth_provider: 'password',
  role_slug: 'director',
  is_superadmin: false,
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: uid,
  session_token: tok,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('token=' + tok);
"
```

### Step 2: Verify via API
```
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -X GET "$API_URL/api/auth/me" -H "Authorization: Bearer <TOKEN>"
curl -X GET "$API_URL/api/students" -H "Authorization: Bearer <TOKEN>"
```

### Step 3: Register + login via password flow
```
curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@luxe.test","password":"LuxeAdmin!23","name":"Admin"}'
# → returns {user, session_token}

curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@luxe.test","password":"LuxeAdmin!23"}'
```

### Step 4: Browser Playwright — set cookie and load app
```python
await page.context.add_cookies([{
  "name": "session_token", "value": "<TOKEN>",
  "domain": "<host>", "path": "/",
  "httpOnly": True, "secure": True, "sameSite": "None"
}])
await page.goto("<app>")
```

## Success indicators
- ✅ `/api/auth/me` returns user JSON with `user_id`, `email`, `role_slug`.
- ✅ Non-auth users hitting `/` get redirected to `/login`.
- ✅ After login, protected routes render.
- ✅ Logout clears the cookie and forces `/login`.

## Failure indicators
- ❌ 401 responses on protected endpoints with a valid cookie.
- ❌ Infinite redirect loop between `/` and `/login`.
- ❌ `_id` leaking into API JSON output.
