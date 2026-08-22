import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, auditEvents, organizations, permissions, records, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach(field => { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listOwnerRecords(ownerId: number) { const db = await getDb(); return db ? db.select().from(records).where(eq(records.ownerId, ownerId)).orderBy(desc(records.createdAt)) : []; }
export async function listOwnerPermissions(ownerId: number) { const db = await getDb(); return db ? db.select().from(permissions).where(eq(permissions.ownerId, ownerId)).orderBy(desc(permissions.createdAt)) : []; }
export async function listOwnerAudit(ownerId: number) { const db = await getDb(); return db ? db.select().from(auditEvents).where(eq(auditEvents.ownerId, ownerId)).orderBy(desc(auditEvents.createdAt)).limit(100) : []; }
export async function findOrganization(name: string) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(organizations).where(eq(organizations.name, name)).limit(1); return rows[0]; }
export async function findPermissionForGateway(organizationId: number, recordId: number) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(permissions).where(and(eq(permissions.organizationId, organizationId), eq(permissions.recordId, recordId))).limit(1); return rows[0]; }

export async function addAuditEvent(input: typeof auditEvents.$inferInsert) { const db = await getDb(); if (!db) return; await db.insert(auditEvents).values(input); }
