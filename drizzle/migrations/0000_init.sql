-- ============================================================================
-- Marketing BI — Phase 1 initial migration
--
-- Creates:
--   1. Schemas: raw, ops
--   2. raw.sf_*           — Salesforce mirror tables (7 objects)
--   3. ops.*              — sync run lifecycle, errors, watermarks, snapshots
--   4. public.profiles    — per-user role (admin | end_user)
--   5. Allowlist trigger  — BEFORE INSERT on auth.users blocks non-orca-ai.io domains
--   6. Profile trigger    — AFTER INSERT on auth.users auto-creates profile;
--                           email matching FIRST_ADMIN_EMAIL becomes 'admin'
--   7. RLS policies       — permissive for `authenticated` (single-team posture
--                           per .planning/research/STACK.md §RLS strategy)
--
-- Idempotency: every CREATE uses IF NOT EXISTS / CREATE OR REPLACE so the
-- migration is safe to re-run.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS ops;

-- pgcrypto enables gen_random_uuid() — usually already on in Supabase, but defensive.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- raw.sf_*  — 1:1 Salesforce mirror tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw.sf_contact (
    id                  varchar(18)  PRIMARY KEY,
    account_id          varchar(18),
    email               text,
    first_name          text,
    last_name           text,
    lifecycle_stage     text,
    mql_date            date,
    sql_date            date,
    opportunity_date    date,
    customer_date       date,
    original_source     text,
    latest_source       text,
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_date        timestamptz,
    last_modified_date  timestamptz,
    synced_at           timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_contact_account_idx     ON raw.sf_contact (account_id);
CREATE INDEX IF NOT EXISTS sf_contact_sql_date_idx    ON raw.sf_contact (sql_date) WHERE sql_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS sf_contact_lifecycle_idx   ON raw.sf_contact (lifecycle_stage);

CREATE TABLE IF NOT EXISTS raw.sf_account (
    id                  varchar(18)  PRIMARY KEY,
    name                text,
    owner_id            varchar(18),
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_date        timestamptz,
    last_modified_date  timestamptz,
    synced_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw.sf_campaign (
    id                  varchar(18)  PRIMARY KEY,
    name                text,
    type                text,
    status              text,
    is_active           boolean,
    is_deleted          boolean      NOT NULL DEFAULT false,
    start_date          date,
    end_date            date,
    created_date        timestamptz,
    last_modified_date  timestamptz,
    synced_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw.sf_campaign_member (
    id                    varchar(18)  PRIMARY KEY,
    campaign_id           varchar(18)  NOT NULL,
    contact_id            varchar(18),
    status                text,
    first_responded_date  date,
    is_deleted            boolean      NOT NULL DEFAULT false,
    created_date          timestamptz,
    last_modified_date    timestamptz,
    synced_at             timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sf_cm_campaign_idx ON raw.sf_campaign_member (campaign_id);
CREATE INDEX IF NOT EXISTS sf_cm_contact_idx  ON raw.sf_campaign_member (contact_id);
-- Pitfall 11: dedupe on (contact_id, campaign_id). The unique constraint here
-- prevents accidental double-inserts; the mart layer (Phase 3) will use a
-- proper window function over the touchpoint stream.
CREATE UNIQUE INDEX IF NOT EXISTS sf_cm_contact_campaign_uniq
    ON raw.sf_campaign_member (contact_id, campaign_id)
    WHERE contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS raw.sf_opportunity (
    id                  varchar(18)  PRIMARY KEY,
    account_id          varchar(18),
    name                text,
    stage_name          text,
    amount              text,
    is_won              boolean,
    is_closed           boolean,
    close_date          date,
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_date        timestamptz,
    last_modified_date  timestamptz,
    synced_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw.sf_opportunity_contact_role (
    id                  varchar(18)  PRIMARY KEY,
    opportunity_id      varchar(18)  NOT NULL,
    contact_id          varchar(18),
    role                text,
    is_primary          boolean,
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_date        timestamptz,
    last_modified_date  timestamptz,
    synced_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw.sf_presentation (
    id                  varchar(18)  PRIMARY KEY,
    contact_id          varchar(18),
    name                text,
    status              text,
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_date        timestamptz,
    last_modified_date  timestamptz,
    synced_at           timestamptz  NOT NULL DEFAULT now()
);

-- ============================================================================
-- ops.*  — sync infrastructure + Pitfall 6/16 history snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS ops.sync_runs (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at    timestamptz  NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    status        text         NOT NULL DEFAULT 'running',
    triggered_by  text         NOT NULL DEFAULT 'cron',
    row_counts    jsonb        NOT NULL DEFAULT '{}'::jsonb,
    error         text
);
CREATE INDEX IF NOT EXISTS sync_runs_started_idx ON ops.sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx  ON ops.sync_runs (status);

CREATE TABLE IF NOT EXISTS ops.sync_errors (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id        uuid         NOT NULL REFERENCES ops.sync_runs(id) ON DELETE CASCADE,
    object_name   text         NOT NULL,
    error_code    text,
    message       text         NOT NULL,
    raw_error     jsonb,
    occurred_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_errors_run_idx ON ops.sync_errors (run_id);

CREATE TABLE IF NOT EXISTS ops.watermarks (
    object_name           text         PRIMARY KEY,
    last_modified_date    timestamptz,
    updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.contact_source_history (
    contact_id        varchar(18)  NOT NULL,
    sync_run_id       uuid         NOT NULL REFERENCES ops.sync_runs(id) ON DELETE CASCADE,
    original_source   text,
    latest_source     text,
    snapshot_at       timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, sync_run_id)
);
CREATE INDEX IF NOT EXISTS contact_source_hist_contact_idx
    ON ops.contact_source_history (contact_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS ops.campaigns_history (
    campaign_id    varchar(18)  NOT NULL,
    sync_run_id    uuid         NOT NULL REFERENCES ops.sync_runs(id) ON DELETE CASCADE,
    name           text,
    type           text,
    status         text,
    snapshot_at    timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, sync_run_id)
);
CREATE INDEX IF NOT EXISTS campaigns_hist_campaign_idx
    ON ops.campaigns_history (campaign_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS ops.sync_object_stats (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id        uuid         NOT NULL REFERENCES ops.sync_runs(id) ON DELETE CASCADE,
    object_name   text         NOT NULL,
    fetched       integer      NOT NULL DEFAULT 0,
    upserted      integer      NOT NULL DEFAULT 0,
    duration_ms   bigint       NOT NULL DEFAULT 0
);

-- ============================================================================
-- public.profiles — per-user role
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id          uuid         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text         NOT NULL,
    role        text         NOT NULL DEFAULT 'end_user',
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'end_user'))
);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- ============================================================================
-- Allowlist trigger — BEFORE INSERT on auth.users
--
-- Rejects any email whose domain is not 'orca-ai.io' with a specific message.
-- Per CONTEXT D-08, D-09, D-10:
--   - case-insensitive comparison against split_part(email, '@', 2)
--   - specific error message includes the rejected email
--   - hardcoded list (single domain for now); future domains via new migration
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_email_domain_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    email_domain text;
    allowed_domains text[] := ARRAY['orca-ai.io'];
BEGIN
    IF NEW.email IS NULL OR NEW.email = '' THEN
        RAISE EXCEPTION 'Cannot create user without email address.'
            USING ERRCODE = '22023';
    END IF;

    email_domain := lower(split_part(NEW.email, '@', 2));

    IF NOT (email_domain = ANY(allowed_domains)) THEN
        RAISE EXCEPTION
            'Cannot invite %  — only @% email addresses are allowed.',
            NEW.email,
            array_to_string(allowed_domains, ', @')
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_email_domain_allowlist ON auth.users;
CREATE TRIGGER enforce_email_domain_allowlist
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_email_domain_allowlist();

-- ============================================================================
-- Profile-creation trigger — AFTER INSERT on auth.users
--
-- Auto-creates a public.profiles row for every new auth.users row.
-- The first-admin email is auto-elevated to role='admin'; everyone else is
-- 'end_user'. This is idempotent — re-invites won't duplicate (PK on id).
--
-- The first-admin email is hardcoded here so the seed is migration-driven and
-- doesn't depend on a runtime env var lookup. Update via new migration if the
-- admin changes (rare).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    first_admin text := 'matias@orca-ai.io';
    assigned_role text;
BEGIN
    IF lower(NEW.email) = lower(first_admin) THEN
        assigned_role := 'admin';
    ELSE
        assigned_role := 'end_user';
    END IF;

    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, assigned_role)
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            role  = CASE
                       WHEN public.profiles.role = 'admin' THEN 'admin'  -- never demote
                       ELSE EXCLUDED.role
                    END,
            updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handle_new_auth_user ON auth.users;
CREATE TRIGGER handle_new_auth_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- RLS policies — permissive for authenticated (single-team posture)
--
-- Per .planning/research/STACK.md §"RLS strategy":
--   "You have one team, one role, one shared dataset. RLS does not buy data
--    isolation between users — there's nothing to isolate."
--
-- The real auth gate is Supabase Auth + the email-domain trigger above.
-- We still enable RLS to keep `anon` blocked at the database layer.
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Self-update of own profile is allowed but role changes are not (admins use
-- service-role from a server-side admin tool, P6).
DROP POLICY IF EXISTS profiles_update_own_no_role ON public.profiles;
CREATE POLICY profiles_update_own_no_role
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- raw.* and ops.* — readable by any authenticated user (the dashboard layer
-- needs SELECT). Writes happen only via service-role from the cron handler.
ALTER TABLE raw.sf_contact                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.sf_account                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.sf_campaign                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.sf_campaign_member           ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.sf_opportunity               ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.sf_opportunity_contact_role  ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.sf_presentation              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.sync_runs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.sync_errors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.watermarks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.contact_source_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.campaigns_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.sync_object_stats            ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'raw.sf_contact', 'raw.sf_account', 'raw.sf_campaign',
        'raw.sf_campaign_member', 'raw.sf_opportunity',
        'raw.sf_opportunity_contact_role', 'raw.sf_presentation',
        'ops.sync_runs', 'ops.sync_errors', 'ops.watermarks',
        'ops.contact_source_history', 'ops.campaigns_history',
        'ops.sync_object_stats'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s;', 'select_authenticated', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (true);',
            'select_authenticated', t
        );
    END LOOP;
END$$;
