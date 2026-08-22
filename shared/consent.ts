export type ConsentState = "PENDING" | "ACTIVE" | "REVOKED";

export function canAccess(input: { status: ConsentState; expiresAt?: Date | null }, now = new Date()) {
  if (input.status !== "ACTIVE") return false;
  return !input.expiresAt || input.expiresAt > now;
}
