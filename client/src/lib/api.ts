export type UserRole = "DATA_OWNER" | "ORGANIZATION" | string;

export type AuthResponse = {
  access_token: string;
  token_type?: string;
  role?: UserRole;
  user?: { id?: string | number; role?: UserRole; [key: string]: unknown };
  [key: string]: unknown;
};

export type ApiError = Error & { status?: number; detail?: unknown };

const TOKEN_KEY = "samvid_access_token";
const ROLE_KEY = "samvid_user_role";
export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "https://samvid-a74u.onrender.com").replace(/\/$/, "");

export function getAccessToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredRole(): UserRole | null {
  return window.localStorage.getItem(ROLE_KEY);
}

export function storeSession(auth: AuthResponse) {
  if (!auth.access_token) throw new Error("The backend did not return an access token.");
  const role = auth.role ?? auth.user?.role;
  window.localStorage.setItem(TOKEN_KEY, auth.access_token);
  if (role) window.localStorage.setItem(ROLE_KEY, role);
  return { token: auth.access_token, role: role ?? null };
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);

  // Remove legacy/preview auth state that can otherwise make the UI appear logged in.
  window.localStorage.removeItem("manus-runtime-user-info");
  window.localStorage.removeItem("samvid_force_login");
  window.sessionStorage.removeItem("manus-cookie");
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const detail = typeof body === "object" && body ? body.detail ?? body.message : body;
    const message = response.status === 401 ? "Your session has expired. Please log in again." : response.status === 403 ? "Access denied. Consent may be revoked or expired." : response.status === 404 ? "The requested SAMVID resource was not found." : response.status === 422 ? "The backend rejected the submitted data." : response.status >= 500 ? "SAMVID backend error. Please try again." : String(detail || "The request failed.");
    const error = new Error(message) as ApiError;
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return body;
}

async function request<T>(path: string, init: RequestInit = {}, options: { auth?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("samvid:auth-expired"));
  }
  return parseResponse(response) as Promise<T>;
}

export const api = {
  baseUrl: API_BASE_URL,
  register: (payload: { name: string; email: string; password: string; role: "DATA_OWNER" | "ORGANIZATION" | "AUDITOR" }) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(payload) }, { auth: false }),
  login: (payload: { username: string; password: string }) => {
    const form = new URLSearchParams();
    form.set("username", payload.username);
    form.set("password", payload.password);
    return request<AuthResponse>("/auth/login", { method: "POST", body: form.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, { auth: false });
  },
  me: () => request<any>("/auth/me"),
  listRecords: () => request<any[]>("/records"),
  getRecord: (recordId: string | number) => request<any>(`/records/${encodeURIComponent(recordId)}`),
  uploadRecord: (payload: { title: string; record_type: string; file: File }) => {
    const form = new FormData();
    form.set("title", payload.title);
    form.set("record_type", payload.record_type);
    form.set("file", payload.file);
    return request<any>("/records/upload", { method: "POST", body: form });
  },
  getAccessRequests: () => request<any[]>("/access-requests"),
  createAccessRequest: (payload: { record_id: string | number; purpose: string; requested_access_type: string }) => request<any>("/access-requests", { method: "POST", body: JSON.stringify(payload) }),
  approveAccessRequest: (requestId: string | number) => request<any>(`/access-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST" }),
  revokeAccessRequest: (requestId: string | number) => request<any>(`/access-requests/${encodeURIComponent(requestId)}/revoke`, { method: "POST" }),
  rejectAccessRequest: (requestId: string | number) => request<any>(`/access-requests/${encodeURIComponent(requestId)}/reject`, { method: "POST" }),
  getConsents: () => request<any[]>("/consents"),
  updateConsent: (consentId: string | number, accessType: string, expiryTime?: string | number) => {
    const query = new URLSearchParams({ access_type: accessType });
    if (expiryTime !== undefined && expiryTime !== "") query.set("expiry_time", String(expiryTime));
    return request<any>(`/consents/${encodeURIComponent(consentId)}?${query.toString()}`, { method: "PUT" });
  },
  getOrganizations: () => request<any[]>("/organizations"),
  createOrganization: (payload: Record<string, unknown>) => request<any>("/organizations", { method: "POST", body: JSON.stringify(payload) }),
  getOrganization: (organizationId: string | number) => request<any>(`/organizations/${encodeURIComponent(organizationId)}`),
  getAuditLogs: (params: { result?: string; record_id?: string | number; actor_id?: string | number } = {}) => {
    const query = new URLSearchParams();
    if (params.result) query.set("result", params.result);
    if (params.record_id !== undefined) query.set("record_id", String(params.record_id));
    if (params.actor_id !== undefined) query.set("actor_id", String(params.actor_id));
    return request<any[]>(`/audit-logs${query.toString() ? `?${query.toString()}` : ""}`);
  },
  analyzeContract: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<any>("/smart-audit/analyze", { method: "POST", body: form }, { auth: false });
  },
  getRecordFile: (recordId: string | number) => request<Response>(`/records/${encodeURIComponent(recordId)}/file`),
  viewRecord: (recordId: string | number) => request<Response>(`/records/${encodeURIComponent(recordId)}/view`),
};

export async function fetchSecureRecord(recordId: string | number) {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/records/${encodeURIComponent(recordId)}/view`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!response.ok) await parseResponse(response);
  return { response, mimeType: response.headers.get("content-type") || "application/octet-stream" };
}
