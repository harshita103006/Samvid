import { describe, expect, it } from "vitest";
import { canAccess } from "./consent";

describe("SAMVID consent gateway decision", () => {
  const now = new Date("2026-08-17T00:00:00.000Z");

  it("allows an active, unexpired permission", () => {
    expect(canAccess({ status: "ACTIVE", expiresAt: new Date("2026-08-18T00:00:00.000Z") }, now)).toBe(true);
  });

  it("denies future access after revocation", () => {
    expect(canAccess({ status: "REVOKED", expiresAt: new Date("2026-08-18T00:00:00.000Z") }, now)).toBe(false);
  });

  it("denies an expired permission", () => {
    expect(canAccess({ status: "ACTIVE", expiresAt: new Date("2026-08-16T23:59:59.000Z") }, now)).toBe(false);
  });
});
