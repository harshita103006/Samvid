import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const records = mysqlTable("records", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  sensitivity: mysqlEnum("sensitivity", ["Low", "Medium", "High", "Critical"]).default("Medium").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }),
  sizeBytes: int("sizeBytes"),
  verified: int("verified").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  organizationId: int("organizationId").notNull(),
  recordId: int("recordId").notNull(),
  purpose: varchar("purpose", { length: 255 }).notNull(),
  scope: mysqlEnum("scope", ["View only", "View + verify"]).default("View only").notNull(),
  status: mysqlEnum("status", ["PENDING", "ACTIVE", "REVOKED"]).default("PENDING").notNull(),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const accessRequests = mysqlTable("accessRequests", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  organizationId: int("organizationId").notNull(),
  recordId: int("recordId").notNull(),
  purpose: varchar("purpose", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "DENIED"]).default("PENDING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
});

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  recordId: int("recordId"),
  permissionId: int("permissionId"),
  organizationId: int("organizationId"),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  message: text("message").notNull(),
  decision: mysqlEnum("decision", ["ALLOWED", "DENIED", "RECORDED"]).default("RECORDED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RecordRow = typeof records.$inferSelect;
export type PermissionRow = typeof permissions.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
