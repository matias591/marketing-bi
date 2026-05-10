/**
 * Per-object SF → Postgres sync definitions.
 *
 * Each entry declares:
 *   - the SF object (`sobject`)
 *   - the SOQL field list (verify against your org's actual API names — see
 *     README §"Salesforce custom-field API names")
 *   - whether to use `queryAll` (Pitfall 12: Contact / Account / CampaignMember
 *     must include soft-deletes) or plain `query`
 *   - whether to use Bulk API 2.0 (high-volume objects) or REST `query`
 *   - the destination table in `raw.*`
 *   - a row-mapper that transforms the SF JSON record into a row insertable
 *     into Postgres (camelCase → snake_case + type coercion)
 *
 * Watermark management lives in `sync.ts` — each run reads the prior watermark
 * from `ops.watermarks`, queries `WHERE LastModifiedDate > {watermark}`, and
 * advances on success.
 */

export type SfObjectName =
  | "Contact"
  | "Account"
  | "Campaign"
  | "CampaignMember"
  | "Opportunity"
  | "OpportunityContactRole"
  | "Presentation__c";

export interface SfObjectDef {
  name: SfObjectName;
  destTable: string; // e.g. "raw.sf_contact"
  fields: string[]; // SOQL SELECT list (no SELECT keyword)
  useQueryAll: boolean; // Pitfall 12 — soft-delete mirroring
  useBulkApi: boolean; // Pitfall 1 — heavy volume objects
  mapRow: (row: Record<string, unknown>) => Record<string, unknown>;
}

const sfDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  return v.length >= 10 ? v.slice(0, 10) : null;
};

const sfTimestamp = (v: unknown): string | null => {
  return typeof v === "string" ? v : null;
};

const sfString = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  return String(v);
};

const sfBool = (v: unknown): boolean => Boolean(v);

export const SF_OBJECTS: SfObjectDef[] = [
  {
    name: "Contact",
    destTable: "raw.sf_contact",
    // ⚠ Custom field API names below are best-guess from PROJECT.md / CLAUDE.md.
    // VERIFY against your SF org before first sync. Run:
    //   node -e "import('./src/lib/sf/jwt.js').then(...)"
    // or use jsforce REPL to call describe('Contact') and confirm.
    fields: [
      "Id",
      "AccountId",
      "Email",
      "FirstName",
      "LastName",
      "Lifecycle_Stage__c",
      "MQL_Date__c",
      "SQL_Date__c",
      "Opportunity_Date__c",
      "Customer_Date__c",
      "Original_Source__c",
      "Latest_Source__c",
      "IsDeleted",
      "CreatedDate",
      "LastModifiedDate",
    ],
    useQueryAll: true,
    useBulkApi: false,
    mapRow: (r) => ({
      id: sfString(r.Id),
      account_id: sfString(r.AccountId),
      email: sfString(r.Email),
      first_name: sfString(r.FirstName),
      last_name: sfString(r.LastName),
      lifecycle_stage: sfString(r.Lifecycle_Stage__c),
      mql_date: sfDate(r.MQL_Date__c),
      sql_date: sfDate(r.SQL_Date__c),
      opportunity_date: sfDate(r.Opportunity_Date__c),
      customer_date: sfDate(r.Customer_Date__c),
      original_source: sfString(r.Original_Source__c),
      latest_source: sfString(r.Latest_Source__c),
      is_deleted: sfBool(r.IsDeleted),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
  {
    name: "Account",
    destTable: "raw.sf_account",
    fields: ["Id", "Name", "OwnerId", "IsDeleted", "CreatedDate", "LastModifiedDate"],
    useQueryAll: true,
    useBulkApi: false,
    mapRow: (r) => ({
      id: sfString(r.Id),
      name: sfString(r.Name),
      owner_id: sfString(r.OwnerId),
      is_deleted: sfBool(r.IsDeleted),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
  {
    name: "Campaign",
    destTable: "raw.sf_campaign",
    fields: [
      "Id",
      "Name",
      "Type",
      "Status",
      "IsActive",
      "IsDeleted",
      "StartDate",
      "EndDate",
      "CreatedDate",
      "LastModifiedDate",
    ],
    useQueryAll: false,
    useBulkApi: false,
    mapRow: (r) => ({
      id: sfString(r.Id),
      name: sfString(r.Name),
      type: sfString(r.Type),
      status: sfString(r.Status),
      is_active: r.IsActive == null ? null : sfBool(r.IsActive),
      is_deleted: sfBool(r.IsDeleted),
      start_date: sfDate(r.StartDate),
      end_date: sfDate(r.EndDate),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
  {
    name: "CampaignMember",
    destTable: "raw.sf_campaign_member",
    fields: [
      "Id",
      "CampaignId",
      "ContactId",
      "Status",
      "FirstRespondedDate",
      "IsDeleted",
      "CreatedDate",
      "LastModifiedDate",
    ],
    useQueryAll: true,
    useBulkApi: true, // Pitfall 1
    mapRow: (r) => ({
      id: sfString(r.Id),
      campaign_id: sfString(r.CampaignId),
      contact_id: sfString(r.ContactId),
      status: sfString(r.Status),
      first_responded_date: sfDate(r.FirstRespondedDate),
      is_deleted: sfBool(r.IsDeleted),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
  {
    name: "Opportunity",
    destTable: "raw.sf_opportunity",
    fields: [
      "Id",
      "AccountId",
      "Name",
      "StageName",
      "Amount",
      "IsWon",
      "IsClosed",
      "CloseDate",
      "IsDeleted",
      "CreatedDate",
      "LastModifiedDate",
    ],
    useQueryAll: false,
    useBulkApi: false,
    mapRow: (r) => ({
      id: sfString(r.Id),
      account_id: sfString(r.AccountId),
      name: sfString(r.Name),
      stage_name: sfString(r.StageName),
      amount: r.Amount == null ? null : String(r.Amount),
      is_won: r.IsWon == null ? null : sfBool(r.IsWon),
      is_closed: r.IsClosed == null ? null : sfBool(r.IsClosed),
      close_date: sfDate(r.CloseDate),
      is_deleted: sfBool(r.IsDeleted),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
  {
    name: "OpportunityContactRole",
    destTable: "raw.sf_opportunity_contact_role",
    fields: [
      "Id",
      "OpportunityId",
      "ContactId",
      "Role",
      "IsPrimary",
      "IsDeleted",
      "CreatedDate",
      "LastModifiedDate",
    ],
    useQueryAll: false,
    useBulkApi: false,
    mapRow: (r) => ({
      id: sfString(r.Id),
      opportunity_id: sfString(r.OpportunityId),
      contact_id: sfString(r.ContactId),
      role: sfString(r.Role),
      is_primary: r.IsPrimary == null ? null : sfBool(r.IsPrimary),
      is_deleted: sfBool(r.IsDeleted),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
  {
    name: "Presentation__c",
    destTable: "raw.sf_presentation",
    // Custom object: assumed fields. Verify via describe() before first sync.
    fields: [
      "Id",
      "Contact__c",
      "Name",
      "Status__c",
      "IsDeleted",
      "CreatedDate",
      "LastModifiedDate",
    ],
    useQueryAll: false,
    useBulkApi: false,
    mapRow: (r) => ({
      id: sfString(r.Id),
      contact_id: sfString(r.Contact__c),
      name: sfString(r.Name),
      status: sfString(r.Status__c),
      is_deleted: sfBool(r.IsDeleted),
      created_date: sfTimestamp(r.CreatedDate),
      last_modified_date: sfTimestamp(r.LastModifiedDate),
    }),
  },
];

export function findObject(name: SfObjectName): SfObjectDef | undefined {
  return SF_OBJECTS.find((o) => o.name === name);
}
