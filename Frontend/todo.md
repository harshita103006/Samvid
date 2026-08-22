
- [x] Preserve original light-mode humanoid animation and Samvid logo on landing/login screens
- [x] Keep the entire application light-mode only with no dark-mode toggle
- [x] Implement client-side Samvid token login using POST /auth/login with application/x-www-form-urlencoded
- [x] Hydrate authenticated user from GET /auth/me and protect dashboard routes
- [x] Implement client-side logout that clears token and session state
- [x] Add centralized API client with automatic Bearer authorization and 401 redirect handling
- [x] Connect Records list, upload, detail, and file view/download endpoints using backend field names
- [x] Connect Organizations list, create, and detail endpoints using backend field names
- [x] Connect Access Requests list, create, approve, reject, and revoke endpoints
- [x] Connect Consents list and update endpoints with access_type and expiry_time query parameters
- [x] Connect Audit Logs list with result, record_id, and actor_id filters
- [x] Connect Smart Contract Audit multipart upload for Solidity files and render structured findings
- [x] Add role-aware sidebar navigation for DATA_OWNER, ORGANIZATION, and AUDITOR
- [x] Show backend-driven loading, empty, forbidden, validation, and server-error states with toast notifications for errors
- [x] Add Vitest coverage for API client, auth/session behavior, and route contract handling
- [x] Verify responsive UI, animation preservation, live API behavior, protected routes, and logout flow
- [x] Save final project checkpoint for delivery

- [x] Wire a real record detail panel that calls GET /records/{record_id}
- [x] Implement binary-safe GET /records/{record_id}/file download/view handling
- [x] Add a consent-management UI invoking PUT /consents/{consent_id}?access_type=...&expiry_time=...
- [x] Add consent update and binary record file contract tests
- [x] Add audit-log filter controls for result, record_id, and actor_id
- [x] Add filtered audit-log contract tests
- [x] Replace header-only authenticated navigation with a true role-aware sidebar layout
- [x] Add explicit 403 restricted-access states across protected modules
- [x] Verify comprehensive loading, empty, validation, forbidden, server-error, and toast behavior

- [x] Add exact audit-log filter query-string and authorization contract test
- [x] Verify responsive mobile/tablet/desktop behavior and browser logout code path; live authenticated browser logout requires user credentials

- [x] Add an explicit frontend-only demo mode for visual and navigation testing before backend connection
- [x] Add demo session login and demo data adapters without changing the live backend API contract
- [x] Add a clear demo-mode indicator and backend switch guidance
- [x] Verify demo navigation, forms, responsive layout, and return-to-live-backend behavior
- [x] Save the demo-mode checkpoint

- [x] Remove shared-access-reference generation, parsing, and generated-link UI from the frontend
- [x] Remove gateway_ref routing and shared-link navigation dependencies
- [x] Keep secure access based on authenticated organization ID, record ID, and backend permission checks
- [x] Update demo mode to use ID-based gateway selection without generated links
- [x] Add security tests proving shared references are no longer used and ID-based access remains
- [x] Save the secure ID-based access checkpoint

- [x] Add demo role selection for DATA_OWNER and ORGANIZATION before entering the frontend-only dashboard
- [x] Populate demo organization gateway data for Data Owner and Record ID request testing
- [x] Verify Organization Gateway request-access UI without generated links or backend calls
- [x] Save the organization-gateway demo checkpoint

- [ ] Clone and inspect GitHub backend ishani024342/Samvid and reconcile routes, schemas, roles, and response shapes with the frontend
- [ ] Configure the live API base URL centrally as https://samvid-a74u.onrender.com
- [ ] Verify and fix backend CORS for the published frontend origin
- [ ] Ensure login sends OAuth2 form data, hydrates /auth/me, persists session, and redirects on 401/logout
- [ ] Connect records, organizations, consents, access requests, audit logs, and smart-audit to real backend responses
- [ ] Remove hardcoded/demo data from live production behavior while preserving an explicitly isolated optional frontend preview mode
- [ ] Implement real loading, empty, 401, 403, 422, and 500 states across all API-driven screens
- [ ] Verify role-based navigation for DATA_OWNER, ORGANIZATION, and AUDITOR using real accounts
- [ ] Test real login, refresh persistence, protected routes, uploads, record viewing, smart audit, and logout
- [ ] Save the final live-backend integration checkpoint

- [ ] Prepare Render deployment from GitHub repository ishani024342/Samvid
- [ ] Configure Render build/start commands, Python version, and working directory
- [ ] Provision and connect the backend database and required persistent storage
- [ ] Add backend secrets and CORS_ORIGINS for the Manus frontend domain
- [ ] Deploy backend and verify /health plus OpenAPI routes
- [ ] Set the frontend API base URL to the Render backend URL and publish
- [ ] Test login, /auth/me, refresh persistence, role navigation, records, requests, audit, smart audit, and logout

- [ ] Prepare an isolated backend zip without modifying the active GitHub deployment
- [ ] Confirm the zip root contains the correct FastAPI app and requirements file
- [ ] Deploy the zip as a separate Render service or use a private upload repository copy
- [ ] Configure a separate database, secrets, CORS, uploads, and API URL for the isolated service
- [ ] Connect the frontend only to the isolated backend URL and test live flows

- [x] Fix Render deployment ModuleNotFoundError: No module named app by correcting Root Directory or start command
- [ ] Redeploy and verify the service reaches healthy status after the import-path fix

- [x] Extract the original uploaded backend ZIP and identify the complete FastAPI source tree
- [x] Create a separate private Render-ready backend repository without changing the original repository
- [x] Verify app/main.py, requirements.txt, and import paths at the new repository root; import now reaches Settings validation, confirming the module path
- [ ] Provide Render settings for the new repository and verify deployment

- [ ] Rotate the exposed Supabase password, JWT secret, encryption key, and blockchain private key; do not reuse pasted values
- [ ] Confirm Render service repository is ishani024342/samvid-backend-render-copy, not backend-sih
- [ ] Keep Root Directory blank and redeploy the corrected private repository
- [ ] Add only rotated secrets and CORS_ORIGINS to Render, then verify startup and health

- [ ] Make production frontend use only the healthy live backend as the application-data source
- [x] Remove or isolate all demo/mock application data from production behavior
- [ ] Reconcile final API contract including OAuth2 login response, /auth/me, records view, roles, and real audit/consent statuses
- [ ] Verify dynamic dashboard statistics or hide them when the backend does not expose data
- [ ] Verify live error handling for 400, 401, 403, 404, 422, and 500 responses
- [ ] Complete production verification against the final backend URL before publishing

- [ ] Deliver a complete production integrated prototype using the verified isolated backend
- [ ] Confirm the final backend URL, startup health, CORS, and required rotated secrets before live verification
- [x] Ensure production mode never renders mock/demo application data or fake success states
- [ ] Verify every required end-to-end flow before the final checkpoint

- [ ] Keep production API base fixed to https://samvid-a74u.onrender.com
- [ ] Verify existing live backend CORS allows https://samviddash-gbamjfry.manus.space
- [x] Complete live-only frontend integration against the existing backend without switching Render services
- [ ] Verify login, /auth/me, role modules, records, requests, consents, audit, smart audit, and logout against the existing backend

- [x] Add a same-origin frontend server proxy for the existing live backend because its CORS currently rejects the published frontend origin
- [x] Test proxy login, JSON APIs, multipart upload, binary downloads, and backend error propagation

- [x] Hide Create organization controls from DATA_OWNER users
- [x] Guard organization creation handlers by role and preserve view/detail access
- [x] Add role-aware organization UI test and publish the fix

- [x] Hide DATA_OWNER-only Home actions and My Data affordances from ORGANIZATION users
- [x] Preserve organization Gateway, access-request, and organization flows on Home
- [x] Add and run a role-aware Home regression test, then publish the fix

- [ ] Load real DATA_OWNER options for the ORGANIZATION Gateway owner selector
- [ ] Keep owner selection ID-based and preserve live backend request payloads
- [ ] Add owner-selector contract coverage and publish the verified fix

- [x] Replace unavailable owner/record directory dropdowns with live-safe Owner ID and Record ID inputs
- [x] Preserve the real organization access-request payload and no mock owner/record data
- [x] Add ID-input regression coverage and publish the working prototype

- [x] Remove the unused Owner ID field or relabel it so the prototype does not imply unsupported owner validation
- [x] Re-run ID-based Gateway regression coverage after reconciling the live request schema
- [x] Publish the schema-aligned Gateway prototype checkpoint

- [x] Add clear inline validation messages for Record ID and purpose
- [x] Add an accessible tooltip explaining what to enter in purpose
- [x] Add regression coverage and publish the improved Gateway form

- [x] Keep Organization Home and Gateway as separate available dashboard views
- [x] Add honest owner name/email guidance without fabricated lookup or mock data
- [x] Preserve the live Record ID and purpose request contract and publish the UX update

- [x] Remove Create organization controls from the ORGANIZATION role everywhere
- [x] Add owner email workflow guidance without claiming unsupported backend email lookup
- [x] Preserve DATA_OWNER record upload and real approval flow, then test and publish

- [x] Replace manual Record ID entry with owner-email lookup and internal record selection
- [x] Keep Record ID hidden from Organization UI while preserving the real access-request payload
- [x] Show the document only after backend approval and add contract coverage before publishing

- [x] Add the backend owner-email lookup endpoint and deploy it, or keep the email UI explicitly blocked
- [x] Reconcile the frontend request payload with the actual deployed backend contract
- [ ] Verify authenticated owner lookup, request approval, and approved document viewing end to end

- [x] Compare uploaded api_modified.ts and Home_modified.tsx with active frontend files
- [x] Merge compatible uploaded API and Home changes without breaking live backend, role, or secure-view behavior
- [x] Run tests/build and publish the merged uploaded changes

- [x] Inspect deployment and local logs for the no-revision deployment failure
- [x] Fix any code/configuration issue and verify tests/build
- [x] Publish a corrected checkpoint or document the external deployment blocker

- [x] Extract and inspect the newly uploaded Samvid backend ZIP structure and startup contract
- [x] Align frontend API and role flows with the uploaded backend routes and schemas
- [x] Validate full-stack build/startup and publish a verified compatible checkpoint

- [x] Harden uploaded backend organization and owner-email role checks without changing the active live service
- [x] Add reliable Render root/start configuration for the nested FastAPI app
- [x] Validate and package the corrected backend ZIP for deployment

- [x] Diagnose the Backend unavailable message using live health, proxy, and browser logs
- [x] Fix any reproducible backend URL, proxy, auth, or startup mismatch
- [x] Retest the health path and publish or document any external backend blocker

- [x] Point the frontend API and proxy to local FastAPI backend http://127.0.0.1:8000
- [x] Preserve JWT Bearer auth, role routing, real-data-only behavior, and existing UI/workflow
- [ ] Validate local backend health, API contracts, error handling, and complete owner/organization flow
