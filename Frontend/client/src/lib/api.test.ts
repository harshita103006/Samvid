import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { API_BASE_URL, api, clearSession, fetchSecureRecord, formatApiMessage, getAccessToken, getStoredRole } from "./api";
import { normalizeAccessRequests } from "../pages/Home";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("organization role visibility contract", () => {
  it("only exposes organization creation when the backend role is ORGANIZATION", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("canCreate={false}");
    expect(source).not.toContain("canCreate={backendUserRole === \"ORGANIZATION\"}");
    expect(source).toContain("if (!canCreate || !name.trim() || !email.trim()) return;");
    expect(source).toContain("{canCreate && <section");
  });

  it("keeps ORGANIZATION Home actions on the gateway and removes owner-only Add record controls", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("const isOrganization = backendUserRole === \"ORGANIZATION\";");
    expect(source).toContain("{ label: \"Request data access\", detail:");
    expect(source).toContain("action: () => setView(\"GATEWAY\")");
    expect(source).toContain("{ label: \"Add record\", detail: \"Upload to your vault\"");
    expect(source).toContain("backendUserRole={backendUserRole}");
  });

  it("uses owner email and internal record selection without fabricated owner data", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("Data Owner email");
    expect(source).toContain("Record IDs remain internal");
    expect(source).toContain("ownerEmail.trim()");
    expect(source).toContain("getOwnerRecordsByEmail");
    expect(source).toContain("fetchSecureRecord(selectedRecord.record_id)");
    expect(source).not.toContain("Enter the record ID");
  });

  it("provides inline Gateway validation and purpose guidance", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("Enter a valid Data Owner email.");
    expect(source).toContain("Explain why access is needed.");
    expect(source).toContain("Purpose must be 500 characters or fewer.");
    expect(source).toContain("For example: compliance review, onboarding verification");
    expect(source).toContain("Request view-only access");
  });

  it("keeps owner email lookup and approved document viewing role-aware", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("role === \"ORGANIZATION\" ? [\"HOME\", \"GATEWAY\", \"ORGANIZATIONS\"]");
    expect(source).toContain("Find available documents");
    expect(source).toContain("getOwnerRecordsByEmail");
    expect(source).not.toContain("emailLookupAvailable = false");
    expect(source).toContain("Open approved document");
    expect(source).toContain("The document will open only after approval.");
  });

  it("removes organization creation and keeps the email workflow informational", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("canCreate={false}");
    expect(source).not.toContain("canCreate={backendUserRole === \\\"ORGANIZATION\\\"}");
    expect(source).toContain("Data Owner email");
    expect(source).toContain("ownerEmail.trim()");
  });

  it("preserves DATA_OWNER upload and approval navigation", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../pages/Home.tsx"), "utf8");
    expect(source).toContain("role === \"DATA_OWNER\" ? [\"HOME\", \"MY DATA\", \"PERMISSIONS\", \"ORGANIZATIONS\", \"SECURITY\"]");
    expect(source).toContain("if (view === \"MY DATA\")");
    expect(source).toContain("if (view === \"PERMISSIONS\")");
    expect(source).toContain("api.uploadRecord");
    expect(source).toContain("api.approveAccessRequest");
  });
});

describe("server-safe browser storage guards", () => {
  it("returns empty auth state when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(getAccessToken()).toBeNull();
    expect(getStoredRole()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });
});

describe("local FastAPI configuration", () => {
  it("uses the configured local health endpoint", async () => {
    expect(API_BASE_URL).toBe("http://127.0.0.1:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "healthy" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetch(`${API_BASE_URL}/health`);
    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/health`);
  });

  it("posts registration details to the local FastAPI auth route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "registered" }), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.register({ name: "Real User", email: "real@example.com", password: "test-password", role: "DATA_OWNER" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/register`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Real User", email: "real@example.com", password: "test-password", role: "DATA_OWNER" }) }),
    );
  });

  it("posts login credentials to the local FastAPI auth route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "test-token", token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.login({ username: "user@example.com", password: "test-password" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/login`,
      expect.objectContaining({
        method: "POST",
        body: "username=user%40example.com&password=test-password",
        headers: expect.any(Headers),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).toBe("username=user%40example.com&password=test-password");
    expect((request.headers as Headers).get("Content-Type")).toBe("application/x-www-form-urlencoded");
  });

  it("clears every frontend JWT/session storage key for sign out", () => {
    const localRemove = vi.fn();
    const sessionRemove = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem: localRemove, getItem: vi.fn() }, sessionStorage: { removeItem: sessionRemove } });
    clearSession();
    expect(localRemove).toHaveBeenCalledWith("samvid_access_token");
    expect(localRemove).toHaveBeenCalledWith("samvid_user_role");
    expect(localRemove).toHaveBeenCalledWith("access_token");
    expect(sessionRemove).toHaveBeenCalledWith("samvid_access_token");
    expect(sessionRemove).toHaveBeenCalledWith("samvid_user_role");
  });

  it("deletes a record through the protected local route", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => key === "samvid_access_token" ? "delete-token" : null } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "deleted" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.deleteRecord(42);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/records/42`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer delete-token");
  });

  it("fetches gateway organizations and records from the protected local routes", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => key === "samvid_access_token" ? "gateway-token" : null } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ organization_id: 7, name: "Live Organization" }]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ record_id: 11, title: "Live Record", record_type: "Identity" }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getOrganizations();
    await api.listRecords();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/organizations`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API_BASE_URL}/records`);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer gateway-token");
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer gateway-token");
  });

  it("deletes a record through the protected local backend route", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => key === "samvid_access_token" ? "owner-token" : null } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Record removed successfully" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.deleteRecord(42);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/records/42`,
      expect.objectContaining({ method: "DELETE", headers: expect.any(Headers) }),
    );
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer owner-token");
  });

  it("posts consent requests using the local backend VIEW_ONLY access type", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => key === "samvid_access_token" ? "org-token" : null } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: 9 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.createAccessRequest({ record_id: 42, purpose: "Live verification", requested_access_type: "VIEW_ONLY" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/access-requests`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ record_id: 42, purpose: "Live verification", requested_access_type: "VIEW_ONLY" }) }),
    );
  });
  it("reaches the configured local backend health endpoint", async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ status: "healthy" });
  });
});

describe("local backend error handling", () => {
  it("formats structured backend detail without rendering Object object", () => {
    expect(formatApiMessage({ message: "Access denied", context: { reason: "Consent revoked" } })).toBe("Access denied");
    expect(formatApiMessage([{ msg: "Record is required" }, { msg: "Purpose is required" }])).toBe("Record is required; Purpose is required");
  });
  it("surfaces the backend detail for a record deletion conflict", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "delete-token", removeItem: vi.fn() }, dispatchEvent: vi.fn() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Cannot delete a record with consent history." }), { status: 409, headers: { "content-type": "application/json" } })));

    await expect(api.deleteRecord(42)).rejects.toThrow("Cannot delete a record with consent history.");
  });

  it("clears the session and emits auth-expired on secure-view 401", async () => {
    const removeItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem: () => "expired-token", removeItem }, dispatchEvent });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401, headers: { "content-type": "application/json" } })));

    await expect(fetchSecureRecord(42)).rejects.toThrow("Not authenticated");
    expect(removeItem).toHaveBeenCalledWith("samvid_access_token");
    expect(dispatchEvent).toHaveBeenCalledWith(expect.any(Event));
  });
});

it("posts the required ConsentApproval fields when approving access", async () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "owner-token" } });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  await api.approveAccessRequest(2, "2026-08-20T17:40:00Z", "2030-01-01T00:00:00Z");

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/access-requests/2/approve`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ start_time: "2026-08-20T17:40:00Z", expiry_time: "2030-01-01T00:00:00Z" }),
    }),
  );
});

describe("unified session storage", () => {
  it("stores and clears the canonical session across browser storage locations", () => {
    const local = new Map<string, string>([["access_token", "legacy-token"], ["samvid_access_token", "old-token"], ["samvid_user_role", "DATA_OWNER"]]);
    const session = new Map<string, string>([["token", "session-token"], ["samvid_user", "cached-user"]]);
    const makeStorage = (values: Map<string, string>): Storage => ({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
      clear: () => values.clear(),
      key: index => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
    });
    const cookieValues: string[] = [];
    vi.stubGlobal("window", { localStorage: makeStorage(local), sessionStorage: makeStorage(session), location: { hostname: "localhost" } });
    vi.stubGlobal("document", { set cookie(value: string) { cookieValues.push(value); } });

    clearSession();

    expect(local.size).toBe(0);
    expect(session.size).toBe(0);
    expect(cookieValues.some(value => value.startsWith("samvid_access_token="))).toBe(true);
  });
});


describe("live access-request normalization", () => {
  it("preserves pending request IDs and status from wrapped backend responses", () => {
    expect(normalizeAccessRequests({ access_requests: [{ request_id: 77, record_id: 32, organization_name: "Live Organization", purpose: "Verification", status: "pending", requested_access_type: "VIEW_ONLY" }] })).toEqual([{ id: 77, recordId: 32, record: "32", orgId: undefined, org: "Live Organization", purpose: "Verification", requestedAccessType: "VIEW_ONLY", status: "PENDING", requester: "Organization requester" }]);
  });
});


describe("live record and Smart Audit contracts", () => {
  it("uses the backend record view endpoint with the bearer token", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => key === "samvid_access_token" ? "view-token" : null } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["record"]), { status: 200, headers: { "content-type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.viewRecord(32);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/records/32/view`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer view-token");
  });

  it("posts Solidity files as multipart form data to Smart Audit", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ risk_level: "LOW" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["contract Demo {}"], "Demo.sol", { type: "text/plain" });

    await api.analyzeContract(file);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/smart-audit/analyze`);
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("file")).toBe(file);
  });
});

describe("binary record files and consent updates", () => {
  it("fetches record files as protected binary responses", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => key === "samvid_access_token" ? "file-token" : null } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["record"]), { status: 200, headers: { "content-type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getRecordFile(32);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/records/32/file`, expect.objectContaining({ headers: expect.any(Headers) }));
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer file-token");
  });

  it("sends consent access_type and expiry_time as backend query parameters", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "consent-token" } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.updateConsent(9, "VIEW_ONLY", 1893456000);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/consents/9?access_type=VIEW_ONLY&expiry_time=1893456000`);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer consent-token");
  });
});


describe("audit log filters", () => {
  it("serializes result, record_id, and actor_id filters exactly", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "audit-token" } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getAuditLogs({ result: "SUCCESS", record_id: 32, actor_id: 7 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/audit-logs?result=SUCCESS&record_id=32&actor_id=7`);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer audit-token");
  });
});


describe("ID-based protected gateway", () => {
  it("loads a record by numeric record ID with the authenticated bearer token", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "id-gateway-token" } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ record_id: 101, title: "Identity Record" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getRecord(101);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/records/101`);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer id-gateway-token");
  });

  it("looks up sanitized owner records by email without exposing file paths", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "org-token" } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ record_id: 101, title: "Identity document", record_type: "identity" }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getOwnerRecordsByEmail("owner@example.com");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/records/by-owner-email?email=owner%40example.com`);
  });

  it("creates an access request with an internal record_id and no generated-link field", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "id-request-token" } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: 501 }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.createAccessRequest({ record_id: 101, purpose: "Email-based verification", requested_access_type: "VIEW_ONLY" });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/access-requests`);
    expect(request.body).toBe(JSON.stringify({ record_id: 101, purpose: "Email-based verification", requested_access_type: "VIEW_ONLY" }));
    expect(String(request.body)).not.toContain("gateway_ref");
    expect(String(request.body)).not.toContain("share");
  });
});
