/**
 * /dashboard/funnel queries — DASH-14 Funnel View.
 *
 * Returns MQL → SQL → Opportunity → Customer stage counts and conversion
 * rates for the selected period. Each stage is filtered by its own transition
 * date falling within the date range, so the counts reflect contacts who
 * reached that stage during the period (not a cohort that started together).
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

interface FunnelFilters {
  fromDate: string | null;
  toDate: string | null;
}

export interface FunnelStage {
  stage: "MQL" | "SQL" | "Opportunity" | "Customer";
  contacts: number;
  conversionFromPrev: number | null; // 0..1, null for MQL (no prior stage)
}

export async function getFunnelCounts(args: FunnelFilters): Promise<FunnelStage[]> {
  const fromClause = (col: ReturnType<typeof sql>) =>
    args.fromDate ? sql`AND ${col} >= ${args.fromDate}::date` : sql``;
  const toClause = (col: ReturnType<typeof sql>) =>
    args.toDate ? sql`AND ${col} <= ${args.toDate}::date` : sql``;

  const rows = await db.execute<{
    mql_count: string | number;
    sql_count: string | number;
    opp_count: string | number;
    customer_count: string | number;
  }>(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN lt.mql_date IS NOT NULL
            ${fromClause(sql`lt.mql_date`)} ${toClause(sql`lt.mql_date`)}
            THEN lt.contact_id END)      AS mql_count,
      COUNT(DISTINCT CASE WHEN lt.sql_date IS NOT NULL
            ${fromClause(sql`lt.sql_date`)} ${toClause(sql`lt.sql_date`)}
            THEN lt.contact_id END)      AS sql_count,
      COUNT(DISTINCT CASE WHEN lt.opp_date IS NOT NULL
            ${fromClause(sql`lt.opp_date`)} ${toClause(sql`lt.opp_date`)}
            THEN lt.contact_id END)      AS opp_count,
      COUNT(DISTINCT CASE WHEN lt.customer_date IS NOT NULL
            ${fromClause(sql`lt.customer_date`)} ${toClause(sql`lt.customer_date`)}
            THEN lt.contact_id END)      AS customer_count
    FROM mart.lifecycle_transitions lt
  `);

  const r = (rows as Array<typeof rows[number]>)[0];
  const mql = Number(r?.mql_count ?? 0);
  const sqlc = Number(r?.sql_count ?? 0);
  const opp = Number(r?.opp_count ?? 0);
  const customer = Number(r?.customer_count ?? 0);

  return [
    { stage: "MQL", contacts: mql, conversionFromPrev: null },
    { stage: "SQL", contacts: sqlc, conversionFromPrev: mql > 0 ? sqlc / mql : null },
    { stage: "Opportunity", contacts: opp, conversionFromPrev: sqlc > 0 ? opp / sqlc : null },
    { stage: "Customer", contacts: customer, conversionFromPrev: opp > 0 ? customer / opp : null },
  ];
}

export interface FunnelTrendRow {
  period: string; // YYYY-MM
  mql: number;
  sql: number;
  opp: number;
  customer: number;
}

/** Monthly trend counts for each stage — used as the secondary time-series chart. */
export async function getFunnelTrend(args: FunnelFilters): Promise<FunnelTrendRow[]> {
  const dateFilter = [
    args.fromDate
      ? sql`AND GREATEST(lt.mql_date, lt.sql_date, lt.opp_date, lt.customer_date) >= ${args.fromDate}::date`
      : sql``,
    args.toDate
      ? sql`AND LEAST(
              COALESCE(lt.mql_date, '9999-12-31'::date),
              COALESCE(lt.sql_date, '9999-12-31'::date),
              COALESCE(lt.opp_date, '9999-12-31'::date),
              COALESCE(lt.customer_date, '9999-12-31'::date)
            ) <= ${args.toDate}::date`
      : sql``,
  ];

  const rows = await db.execute<{
    period: string;
    mql: string | number;
    sql: string | number;
    opp: string | number;
    customer: string | number;
  }>(sql`
    WITH months AS (
      SELECT DISTINCT TO_CHAR(d, 'YYYY-MM') AS period
      FROM (
        SELECT lt.mql_date      AS d FROM mart.lifecycle_transitions lt WHERE lt.mql_date IS NOT NULL
        UNION ALL
        SELECT lt.sql_date      AS d FROM mart.lifecycle_transitions lt WHERE lt.sql_date IS NOT NULL
        UNION ALL
        SELECT lt.opp_date      AS d FROM mart.lifecycle_transitions lt WHERE lt.opp_date IS NOT NULL
        UNION ALL
        SELECT lt.customer_date AS d FROM mart.lifecycle_transitions lt WHERE lt.customer_date IS NOT NULL
      ) dates
      ${args.fromDate ? sql`WHERE d >= ${args.fromDate}::date` : sql``}
      ${args.toDate   ? sql`${args.fromDate ? sql`AND` : sql`WHERE`} d <= ${args.toDate}::date` : sql``}
    )
    SELECT
      m.period,
      COUNT(DISTINCT CASE WHEN TO_CHAR(lt.mql_date, 'YYYY-MM')      = m.period THEN lt.contact_id END) AS mql,
      COUNT(DISTINCT CASE WHEN TO_CHAR(lt.sql_date, 'YYYY-MM')      = m.period THEN lt.contact_id END) AS sql,
      COUNT(DISTINCT CASE WHEN TO_CHAR(lt.opp_date, 'YYYY-MM')      = m.period THEN lt.contact_id END) AS opp,
      COUNT(DISTINCT CASE WHEN TO_CHAR(lt.customer_date, 'YYYY-MM') = m.period THEN lt.contact_id END) AS customer
    FROM months m
    CROSS JOIN mart.lifecycle_transitions lt
    GROUP BY m.period
    ORDER BY m.period ASC
  `);

  return (rows as Array<typeof rows[number]>).map((r) => ({
    period: r.period,
    mql: Number(r.mql),
    sql: Number(r.sql),
    opp: Number(r.opp),
    customer: Number(r.customer),
  }));
}
