import type { Express, Request, Response } from "express";

const BACKEND_URL = String(process.env.SAMVID_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const HOP_BY_HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"]);

function forwardedHeaders(request: Request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function parsedBody(request: Request, headers: Headers): BodyInit | undefined {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "DELETE") return undefined;
  if (request.body === undefined || request.body === null) return undefined;
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("application/json")) return JSON.stringify(request.body);
  if (contentType.includes("application/x-www-form-urlencoded")) return new URLSearchParams(request.body as Record<string, string>).toString();
  return request as unknown as BodyInit;
}

export function registerBackendProxy(app: Express) {
  app.use("/api/backend", async (request: Request, response: Response) => {
    const suffix = request.originalUrl.slice("/api/backend".length) || "/";
    const headers = forwardedHeaders(request);
    const contentType = headers.get("content-type") || "";
    const streamBody = contentType.includes("multipart/form-data") ? request as unknown as BodyInit : undefined;
    const body = streamBody ?? parsedBody(request, headers);
    try {
      const upstream = await fetch(`${BACKEND_URL}${suffix}`, {
        method: request.method,
        headers,
        body,
        duplex: streamBody ? "half" : undefined,
      } as RequestInit & { duplex?: "half" });
      response.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) response.setHeader(key, value);
      });
      response.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      console.error("[Backend proxy] Upstream request failed:", error);
      response.status(502).json({ detail: "The SAMVID backend could not be reached." });
    }
  });
}
