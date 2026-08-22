# Live FastAPI Contract

Base URL: https://samvid-a74u.onrender.com

Source: https://samvid-a74u.onrender.com/openapi.json (retrieved 2026-08-20)

| Module | Method | Path | Request | Auth |
|---|---:|---|---|---|
| Authentication | POST | `/auth/register` | JSON `RegisterRequest` | No |
| Authentication | POST | `/auth/login` | `application/x-www-form-urlencoded`; required `username`, `password`; optional OAuth2 fields | No |
| Authentication | GET | `/auth/me` | None | Bearer JWT |
| Records | POST | `/records/upload` | multipart `title`, `record_type`, `file` | Bearer JWT |
| Records | GET | `/records` | None | Bearer JWT |
| Records | GET | `/records/{record_id}` | Path integer | Bearer JWT |
| Records | GET | `/records/{record_id}/file` | Path integer; binary/file response expected | Bearer JWT |
| Records | GET | `/records/{record_id}/view` | Path integer; secure view | Bearer JWT |
| Organizations | GET | `/organizations` | None | Bearer JWT |
| Organizations | POST | `/organizations` | JSON `OrganizationCreate` | Bearer JWT |
| Organizations | GET | `/organizations/{organization_id}` | Path integer | Bearer JWT |
| Access requests | GET | `/access-requests` | None | Bearer JWT |
| Access requests | POST | `/access-requests` | JSON `record_id`, `purpose`, `requested_access_type` | Bearer JWT |
| Access requests | POST | `/access-requests/{request_id}/approve` | JSON `ConsentApproval` | Bearer JWT |
| Access requests | POST | `/access-requests/{request_id}/reject` | None | Bearer JWT |
| Access requests | POST | `/access-requests/{request_id}/revoke` | None | Bearer JWT |
| Audit | GET | `/audit-logs` | Optional query `result`, `record_id`, `actor_id` | Bearer JWT |
| Smart audit | POST | `/smart-audit/analyze` | multipart `file` Solidity source | No auth in published schema |
| Consents | GET | `/consents` | None | Bearer JWT |
| Consents | PUT | `/consents/{consent_id}` | Query `access_type`, `expiry_time` | Bearer JWT |
| Service | GET | `/` | None | No |
| Service | GET | `/health` | None | No |

The deployed login endpoint follows OAuth2 password form semantics: the frontend must send `username=<email-or-username>&password=<password>` as `application/x-www-form-urlencoded`, not JSON. Protected calls must include `Authorization: Bearer <access_token>`. The current frontend client needs its access-request revoke path corrected to `/revoke`, its record file path added, and its login body changed from JSON to URL-encoded form data.

The current OpenAPI response schemas for most business endpoints are untyped `{}` responses, so the frontend integration should normalize arrays and object fields defensively while preserving raw backend data for details. The Smart Contract Audit request is multipart with a required `file` field.


## Latest deployment verification

On 2026-08-20, the Render deploy log reported a successful Uvicorn deployment using `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Live verification then showed `OPTIONS https://samvid-a74u.onrender.com/auth/login` returning HTTP 200 with `access-control-allow-origin: https://samviddata-8484kndx.manus.space`, credential support, and the requested methods/headers. The same form-encoded login route still returns HTTP 500 for a shaped invalid-credential request, so database/auth runtime configuration remains the only confirmed backend blocker.

The latest Vercel production deployment was created from commit `49064137a9d58cc1131a345433d24c8a90a6327c`, is READY, and serves an asset bundle containing `https://samvid-a74u.onrender.com`. The custom Vercel domain fetch returns HTTP 200 HTML, while a direct asset check against the latest deployment URL found the expected bundle and one occurrence of the backend URL.
