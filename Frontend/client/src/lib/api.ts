export type UserRole = "DATA_OWNER" | "ORGANIZATION" | "AUDITOR";

export type AuthResponse = {
  access_token: string;
  token_type?: string;
  role?: UserRole;
  user?: { id?: string | number; role?: UserRole; [key: string]: unknown };
  [key: string]: unknown;
};

export type ApiError = Error & { status?: number; detail?: unknown };

export const TOKEN_KEY = "samvid_access_token";
export const ROLE_KEY = "samvid_user_role";
const LEGACY_AUTH_KEYS = [TOKEN_KEY, ROLE_KEY, "access_token", "token", "auth_token", "jwt_token", "user_role", "jwt", "samvid_token", "user", "role", "samvid_user", "samvid_session", "manus-cookie", "manus-runtime-user-info"] as const;
const AUTH_COOKIE_NAMES = [TOKEN_KEY, ROLE_KEY, "access_token", "token", "auth_token", "jwt", "samvid_session", "manus-cookie"] as const;
const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
export const API_BASE_URL = (/^https?:\/\//i.test(configuredApiBaseUrl) ? configuredApiBaseUrl : "http://127.0.0.1:8000").replace(/\/$/, "");
function getRequestBaseUrl() {
  if (typeof window === "undefined") return API_BASE_URL;
  const hostname = window.location?.hostname ?? "localhost";
  return /^(localhost|127\.0\.0\.1)$/.test(hostname) ? API_BASE_URL : "/api/backend";
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getStoredRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(ROLE_KEY) as UserRole | null; } catch { return null; }
}

export function storeSession(auth: AuthResponse) {
  if (!auth.access_token) throw new Error("The backend did not return an access token.");
  const role = auth.role ?? auth.user?.role;
  clearSession();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, auth.access_token);
    if (role) window.localStorage.setItem(ROLE_KEY, role);
  }
  return { token: auth.access_token, role: role ?? null };
}

export function clearSession() {
  const storageAreas: (Storage | undefined)[] = [];
  try { storageAreas.push(window.localStorage); } catch { /* storage unavailable */ }
  try { storageAreas.push(window.sessionStorage); } catch { /* storage unavailable */ }
  for (const storage of storageAreas) {
    if (!storage) continue;
    for (const key of LEGACY_AUTH_KEYS) storage.removeItem(key);
  }
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    for (const name of AUTH_COOKIE_NAMES) {
      document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
    }
  }
}

export function formatApiMessage(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatApiMessage).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "detail", "error", "msg"]) {
      if (record[key] !== undefined && record[key] !== value) {
        const nested = formatApiMessage(record[key]);
        if (nested) return nested;
      }
    }
    const readable = Object.entries(record).map(([key, entry]) => `${key.replace(/_/g, " ")}: ${formatApiMessage(entry)}`).filter(Boolean).join("; ");
    return readable || "The backend returned an unreadable error.";
  }
  return value == null ? "" : String(value);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const detail = typeof body === "object" && body ? body.detail ?? body.message : body;
    const message = formatApiMessage(detail) || (response.status === 401 ? "Your session has expired. Please log in again." : response.status === 403 ? "Access denied. You do not have permission for this action." : response.status === 404 ? "The requested SAMVID resource was not found." : response.status === 422 ? "The backend rejected the submitted data." : response.status >= 500 ? "SAMVID backend error. Please try again." : "The request failed.");
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("samvid:api-error", { detail: { message, status: response.status } }));
    const error = new Error(message) as ApiError;
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return body;
}

async function fetchBinary(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${getRequestBaseUrl()}${path}`, { ...init, headers });
  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("samvid:auth-expired"));
  }
  if (!response.ok) await parseResponse(response);
  return response;
}

async function request<T>(path: string, init: RequestInit = {}, options: { auth?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${getRequestBaseUrl()}${path}`, { ...init, headers });
  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("samvid:auth-expired"));
  }
  return parseResponse(response) as Promise<T>;
}

export const api = {
  baseUrl: API_BASE_URL,
  register: (payload: { name: string; email: string; password: string; role: UserRole }) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(payload) }, { auth: false }),
  login: (payload: { username: string; password: string }) => {
    const form = new URLSearchParams();
    form.set("username", payload.username);
    form.set("password", payload.password);
    return request<AuthResponse>("/auth/login", { method: "POST", body: form.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, { auth: false });
  },
  me: () => request<any>("/auth/me"),
  listRecords: () => request<any>("/records"),
  getRecord: (recordId: string | number) => request<any>(`/records/${encodeURIComponent(recordId)}`),
  getRecordFile: (recordId: string | number) => fetchBinary(`/records/${encodeURIComponent(recordId)}/file`),
  deleteRecord: (recordId: string | number) => request<any>(`/records/${encodeURIComponent(recordId)}`, { method: "DELETE" }),
  uploadRecord: (payload: { title: string; record_type: string; file: File }) => {
    const form = new FormData();
    form.set("title", payload.title);
    form.set("record_type", payload.record_type);
    form.set("file", payload.file);
    return request<any>("/records/upload", { method: "POST", body: form });
  },
  viewRecord: (recordId: string | number) => request<Response>(`/records/${encodeURIComponent(recordId)}/view`),
  getOrganizations: () => request<any>("/organizations"),
  createOrganization: (payload: Record<string, unknown>) => request<any>("/organizations", { method: "POST", body: JSON.stringify(payload) }),
  getOrganization: (organizationId: string | number) => request<any>(`/organizations/${encodeURIComponent(organizationId)}`),
  getAccessRequests: () => request<any>("/access-requests"),
  getOwnerRecordsByEmail: (email: string) => request<any>(`/records/by-owner-email?email=${encodeURIComponent(email.trim())}`),
  getReceivedAccessRequests: () => request<any>("/access-requests/received"),
  createAccessRequest: (payload: { record_id: string | number; purpose: string; requested_access_type: string }) => request<any>("/access-requests", { method: "POST", body: JSON.stringify(payload) }),
  approveAccessRequest: (requestId: string | number, startTime: string, expiryTime: string) => request<any>(`/access-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST", body: JSON.stringify({ start_time: startTime, expiry_time: expiryTime }) }),
  rejectAccessRequest: (requestId: string | number) => request<any>(`/access-requests/${encodeURIComponent(requestId)}/reject`, { method: "POST" }),
  revokeAccessRequest: (requestId: string | number) => request<any>(`/access-requests/${encodeURIComponent(requestId)}/revoke`, { method: "POST" }),
  getConsents: () => request<any>("/consents"),
  updateConsent: (consentId: string | number, accessType: string, expiryTime: string | number) => {
    const query = new URLSearchParams({ access_type: accessType, expiry_time: String(expiryTime) });
    return request<any>(`/consents/${encodeURIComponent(consentId)}?${query.toString()}`, { method: "PUT" });
  },
  getAuditLogs: (params: { result?: string; record_id?: string | number; actor_id?: string | number } = {}) => {
    const query = new URLSearchParams();
    if (params.result) query.set("result", params.result);
    if (params.record_id !== undefined) query.set("record_id", String(params.record_id));
    if (params.actor_id !== undefined) query.set("actor_id", String(params.actor_id));
    return request<any>(`/audit-logs${query.toString() ? `?${query.toString()}` : ""}`);
  },
  analyzeContract: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<any>("/smart-audit/analyze", { method: "POST", body: form }, { auth: false });
  },
};

export async function fetchSecureRecord(recordId: string | number) {
  const token = getAccessToken();
  const response = await fetch(`${getRequestBaseUrl()}/records/${encodeURIComponent(recordId)}/view`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("samvid:auth-expired"));
  }
  if (!response.ok) await parseResponse(response);
  return { response, mimeType: response.headers.get("content-type") || "application/octet-stream" };
}
