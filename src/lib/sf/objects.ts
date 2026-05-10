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
    // Field API names verified against the live Orca SF org via
    // scripts/sf-describe.ts. Lifecycle transition dates other than
    // SQL_Date__c (MQL / Opportunity / Customer) don't exist as custom fields
    // in this org — Phase 3 will need to backfill them from Field History
    // Tracking on Lifecycle_Stage__c (or from Opportunity/Presentation events).
    // For now we leave the corresponding columns null in raw.sf_contact.
    //
    // Source fields:
    //   - LeadSource (standard field) is the "original source" equivalent
    //   - Last_Lead_Source__c (custom) is the "latest source" equivalent
    fields: [
      "Id",
      "AccountId",
      "Email",
      "FirstName",
      "LastName",
      "Lifecycle_Stage__c",
      "SQL_Date__c",
      "LeadSource",
      "Last_Lead_Source__c",
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
      mql_date: null,
      sql_date: sfDate(r.SQL_Date__c),
      opportunity_date: null,
      customer_date: null,
      original_source: sfString(r.LeadSource),
      latest_source: sfString(r.Last_Lead_Source__c),
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
    // Verified field names. The contact reference's API name is
    // `Primary_Contract__c` despite the user-facing label "Primary Contact"
    // (an existing typo in the org's schema). We use the API name as-is.
    fields: [
      "Id",
      "Primary_Contract__c",
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
      contact_id: sfString(r.Primary_Contract__c),
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
