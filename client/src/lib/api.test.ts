import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, api, clearSession } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deployed FastAPI configuration", () => {
  it("uses the configured deployed health endpoint", async () => {
    expect(API_BASE_URL).toBe("https://samvid-a74u.onrender.com");
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

  it("posts registration details to the deployed FastAPI auth route", async () => {
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

  it("posts login credentials to the deployed FastAPI auth route", async () => {
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

  it("clears the local JWT session for sign out", () => {
    vi.stubGlobal("window", { localStorage: { removeItem: vi.fn(), getItem: vi.fn() } });
    clearSession();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith("samvid_access_token");
    expect(window.localStorage.removeItem).toHaveBeenCalledWith("samvid_user_role");
  });

  it("fetches gateway organizations and records from the protected deployed routes", async () => {
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
});
