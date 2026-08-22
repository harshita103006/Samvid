import type { Express, Request, Response } from "express";

const LIVE_BACKEND_URL = String(process.env.SAMVID_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const HOP_BY_HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"]);

async function readBody(req: Request): Promise<Buffer | undefined> {
  if (["GET", "HEAD"].includes(req.method)) return undefined;
  const contentType = String(req.headers["content-type"] ?? "");
  if (req.body !== undefined && !contentType.toLowerCase().startsWith("multipart/form-data")) {
    if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
      return Buffer.from(new URLSearchParams(req.body as Record<string, string>).toString());
    }
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export function registerBackendProxy(app: Express) {
  app.use("/api/backend", async (req: Request, res: Response) => {
    const suffix = req.originalUrl.replace(/^\/api\/backend/, "") || "/";
    const target = `${LIVE_BACKEND_URL}${suffix}`;
    try {
      const body = await readBody(req);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || value === undefined) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: body as BodyInit | undefined,
        redirect: "manual",
      });
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
      });
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      res.send(responseBody);
    } catch (error) {
      console.error("[Backend Proxy] Upstream request failed:", error);
      res.status(502).json({ detail: "The Samvid backend is temporarily unavailable." });
    }
  });
}
