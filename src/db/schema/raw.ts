/**
 * Raw Salesforce mirror tables — `raw.sf_*`.
 *
 * Sacred layer: no transformation during ingest. Each row is a 1:1 mirror of
 * the Salesforce record with the same field names. Idempotent upserts on the
 * Salesforce Id. Soft-deleted rows (`is_deleted = true`) are mirrored from SF
 * (we use `queryAll` per Pitfall 12), not silently dropped.
 *
 * The table-creation SQL lives in drizzle/migrations — these Drizzle objects
 * exist purely so the chart query in /dashboard/campaigns can be type-safe.
 */
import { boolean, date, pgSchema, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const raw = pgSchema("raw");

export const sfContact = raw.table("sf_contact", {
  id: varchar({ length: 18 }).primaryKey(),
  accountId: varchar({ length: 18 }),
  email: text(),
  firstName: text(),
  lastName: text(),
  // Custom fields specific to Orca's SF org. Verify exact API names before first sync —
  // see README "Salesforce custom-field API names" for the verification checklist.
  lifecycleStage: text(),
  mqlDate: date(),
  sqlDate: date(),
  opportunityDate: date(),
  customerDate: date(),
  originalSource: text(),
  latestSource: text(),
  // Standard SF columns
  isDeleted: boolean().notNull().default(false),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sfAccount = raw.table("sf_account", {
  id: varchar({ length: 18 }).primaryKey(),
  name: text(),
  ownerId: varchar({ length: 18 }),
  isDeleted: boolean().notNull().default(false),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sfCampaign = raw.table("sf_campaign", {
  id: varchar({ length: 18 }).primaryKey(),
  name: text(),
  type: text(),
  status: text(),
  isActive: boolean(),
  isDeleted: boolean().notNull().default(false),
  startDate: date(),
  endDate: date(),
  budgetedCost: text(),
  actualCost: text(),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sfCampaignMember = raw.table("sf_campaign_member", {
  id: varchar({ length: 18 }).primaryKey(),
  campaignId: varchar({ length: 18 }).notNull(),
  contactId: varchar({ length: 18 }),
  status: text(),
  firstRespondedDate: date(),
  isDeleted: boolean().notNull().default(false),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sfOpportunity = raw.table("sf_opportunity", {
  id: varchar({ length: 18 }).primaryKey(),
  accountId: varchar({ length: 18 }),
  name: text(),
  stageName: text(),
  amount: text(),
  isWon: boolean(),
  isClosed: boolean(),
  closeDate: date(),
  isDeleted: boolean().notNull().default(false),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sfOpportunityContactRole = raw.table("sf_opportunity_contact_role", {
  id: varchar({ length: 18 }).primaryKey(),
  opportunityId: varchar({ length: 18 }).notNull(),
  contactId: varchar({ length: 18 }),
  role: text(),
  isPrimary: boolean(),
  isDeleted: boolean().notNull().default(false),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sfPresentation = raw.table("sf_presentation", {
  id: varchar({ length: 18 }).primaryKey(),
  contactId: varchar({ length: 18 }),
  name: text(),
  status: text(),
  isDeleted: boolean().notNull().default(false),
  createdDate: timestamp({ withTimezone: true }),
  lastModifiedDate: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
