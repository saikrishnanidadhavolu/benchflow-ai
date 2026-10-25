# BenchFlow AI — Architecture, Schema, Integration Limits, Phase 1 Plan

## 1. Architecture

```
                    ┌──────────────────────── Vercel ────────────────────────┐
 Browser ──HTTPS──▶ │ Next.js 15 (App Router, TypeScript, Tailwind, shadcn/ui)│
                    │  • Server Components + Server Actions (all authz here)  │
                    │  • Route handlers: /api/search, /api/import/csv,        │
                    │    /api/oauth/{google,microsoft}/callback               │
                    └───────────────┬─────────────────────────────────────────┘
                                    │ supabase-js (user JWT → RLS enforced)
                    ┌───────────────▼──────────── Supabase ───────────────────┐
                    │ Postgres 15: tables + RLS by organization_id            │
                    │   pg_trgm (partial match), tsvector/GIN (full text),     │
                    │   pgvector (semantic search, Phase 5)                    │
                    │ Auth (email+password, magic link)  Storage (attachments) │
                    │ Vault / pgsodium: encrypted OAuth refresh tokens         │
                    └───────────────▲─────────────────────────────────────────┘
                                    │ service role (server only)
                    ┌───────────────┴──── Worker (Railway/Render/Fly) ────────┐
                    │ Node/TypeScript worker, pg-boss queue (Postgres-backed,  │
                    │ no Redis). Jobs: mailbox.sync, connector.sync,           │
                    │ extract.requirement, dedupe.check, freshness.sweep       │
                    │ Connector plugin registry (one adapter per source)       │
                    │ OpenAI (structured outputs + zod validation)             │
                    └──────────────────────────────────────────────────────────┘
```

Decisions:
- **Single language (TypeScript) for web + worker** in one repo (`apps/web`, `apps/worker`, `packages/core`). Shared zod schemas, parsers, dedupe and search logic. A Python/FastAPI service is not needed for the planned AI work (OpenAI is an API call); can be added later if heavy local ML is wanted.
- **pg-boss on Postgres** for queues/schedules: one less managed service, transactional with the data.
- **Search in Postgres** (not Elasticsearch): generated `tsvector` (title A, skills B, description C) + `pg_trgm` + structured filters, with a custom Boolean parser (`AND`/`OR`/`NOT`/quotes/parentheses/`field:value`) and synonym expansion from `skill_aliases`. pgvector hybrid ranking in Phase 5. Good to ~millions of rows.
- **AI is untrusted-input-safe**: email/doc text is passed only as data in a delimited user message; model has no tools; output must pass a strict zod schema; every extracted field carries an `evidence` snippet and `inferred` flag; unknown = `null`.
- **Security**: all writes through server actions that re-check role; RLS as defense in depth; tokens encrypted at rest and never sent to the browser; audit log on every mutation; rate limiting on auth/search/import routes.

## 2. Database schema (summary)

All tables: `id uuid pk`, `organization_id uuid fk` (except `organizations`), `created_at`, `updated_at`. RLS: member of org can read; role gates writes.

| Table | Key columns |
|---|---|
| organizations | name, slug (unique) |
| users | id = auth.users.id, email, display_name |
| user_roles | user_id, organization_id, role (`owner`/`admin`/`recruiter`/`viewer`) unique(user,org) |
| connected_mailboxes | label (`prohires`/`work`/`personal`), provider (`gmail`/`microsoft`/`imap`), email, status, scopes[], encrypted_token_ref, watch_rules jsonb (labels/folders/senders/excludes), sync_interval_min, history_from, last_synced_at, last_error |
| source_connectors | connector_key (`linkedin`,`dice`,`indeed`,`careerbuilder`,`monster`,`usajobs`,`adzuna`,`greenhouse`…), enabled, auth_status, config jsonb, search_config jsonb, sync_frequency_min, last_success_at, last_error, terms_notes |
| sync_runs | mailbox_id \| connector_id, started_at, finished_at, status, fetched, created, duplicates, errors jsonb |
| source_records | raw immutable inputs: source_type (`email`/`job_board`/`csv`/`manual`/`portal`), external_id, message_id, sender, subject, received_at, canonical_url, raw_text, raw_payload jsonb, content_hash; unique(org, source_type, external_id) |
| job_requirements | title, description, ai_summary, years_experience_min/max, location_city/state/country, work_arrangement, employment_type, rate_min/max, rate_unit, currency, tax_terms[] (`C2C`/`W2`/`1099`), visa_requirements[], source_job_id, original_url, date_posted, date_received, closing_date, recruiter_name/email/phone, vendor_id, prime_vendor_id, implementation_partner_id, end_client_id, submission_instructions, extraction_confidence, field_evidence jsonb, verification_status, last_verified_at, last_seen_at, status (`active`/`closed`/`expired`/`duplicate`/`needs_review`), duplicate_group_id, internal_notes, follow_up_status, fingerprint, search_tsv (generated), embedding vector(1536) |
| requirement_sources | requirement_id, source_record_id, source_name, source_category, url, seen_at — many sources per requirement |
| requirement_skills | requirement_id, skill_id, original_text, kind (`required`/`preferred`) |
| skills / skill_aliases | canonical name, category; alias → skill (synonyms: "ReactJS"→"React", "k8s"→"Kubernetes") |
| vendors | name, category (`staffing`/`prime_vendor`/`implementation_partner`/`end_client`/`consulting`), website, vendor_portal_url, supplier_registration_url, careers_url, contact jsonb, specializations[], coverage[], verification_status, last_verified_at, info_source, notes |
| vendor_relationships | vendor_id, related_vendor_id, relationship_type, evidence, verified_by, verified_at |
| consultants | display_name, years_experience, current/preferred location, work_arrangement_pref, availability_date, target_rate, resume_attachment_id, work_authorization (restricted column), active, notes |
| consultant_skills | consultant_id, skill_id, level, primary bool |
| saved_searches | user_id, name, query, filters jsonb |
| alerts | saved_search_id, channel (`in_app`/`email`), frequency, last_triggered_at |
| attachments | owner_type/owner_id, storage_path, mime, size, sha256, scan_status |
| extraction_jobs | source_record_id, status, model, prompt_version, output jsonb, validation_errors jsonb, confidence |
| audit_logs | actor_user_id, action, entity_type, entity_id, diff jsonb, ip, user_agent |
| duplicate_candidates | requirement_a, requirement_b, score, reasons jsonb, status (`pending`/`merged`/`rejected`) |

Indexes: GIN on `search_tsv`, GIN trigram on title/vendor names, btree on (org, date_received desc), (org, status), (org, location_state); unique on (org, source_job_id, source) where not null, (org, canonical url).

## 3. Integration limitations (honest status)

| Source | Authorized path | Reality |
|---|---|---|
| LinkedIn Jobs | No public job-search/read API. Job Posting API is for ATS partners posting jobs, not reading. | **Link-out + ingest LinkedIn job-alert emails** that arrive in your mailbox. No scraping. |
| Indeed | Public Publisher Job Search API is closed to new publishers. Partner APIs are for ATS/employers. | Link-out + Indeed job-alert emails. |
| Dice | No public job-search API available to individuals. | Link-out + Dice job-alert emails; a Dice partner/feed agreement would enable a real adapter. |
| CareerBuilder / Monster | Merged in 2024 and went through restructuring/asset sales in 2025; API availability must be verified directly with the current owner. | Adapter stub + config warning until access is confirmed. |
| Real API options | USAJOBS API (free key), Adzuna API (free key), Greenhouse/Lever/Ashby public job-board APIs per company, licensed aggregators (terms to be reviewed). | Real adapters can be built for these. |
| Gmail (personal/Workspace) | Gmail API `gmail.readonly` is a **restricted scope**: public apps need Google verification + security assessment. | For your own use: OAuth app in *Testing* mode (refresh tokens expire every 7 days → periodic re-auth) or *Internal* app if Prohires/work is Google Workspace (no expiry, admin may need to allow). |
| Microsoft 365 / Outlook | Graph `Mail.Read` delegated + `offline_access`. | Work tenant may require **admin consent**. |
| Other providers | IMAP with app password, where the provider supports it. | Supported as fallback. |
| Vendor portals (Beeline, SAP Fieldglass, VNDLY, etc.) | Require supplier credentials; terms usually forbid automation. | Directory with links + email ingestion of portal notifications; no portal automation. |

Job-board alert emails are the practical, terms-compliant way to bring LinkedIn/Indeed/Dice listings into the portal: they arrive in your authorized mailbox and keep the original listing URL.

## 4. Phase 1 plan (what gets built first)

1. Monorepo scaffold (pnpm workspaces), Next.js 15 + TS + Tailwind + shadcn/ui, ESLint/Prettier, GitHub Actions CI.
2. Supabase local stack + SQL migrations for the **full schema** above (so later phases don't need disruptive migrations), RLS policies, synthetic seed data (clearly marked demo org).
3. Auth: sign-up/sign-in (email+password, magic link), org creation on first login, roles, middleware-protected routes.
4. App shell: sidebar with all sections from the spec; not-yet-built sections show "Coming in Phase N" (no fake data).
5. Dashboard: real counts from DB — total, new today, by email vs job board, unique after dedupe, by technology, by state, by visa (when stated), by source/date, recently expired.
6. Global search: Boolean parser (`AND/OR/NOT`, quotes, parentheses, `field:value`), synonym expansion, partial (trigram) match, filters (source, date range, location, skills, arrangement, employment type, vendor, status), URL-encoded state so filters persist on back-navigation, pagination.
7. Requirement detail page: all fields, sources list, status controls (active/closed/expired/duplicate/needs review), notes, audit trail.
8. Manual job entry form (zod-validated) and CSV import (upload → column mapping → preview with validation errors → commit; exact-ID/URL dedupe on import).
9. Vendor directory CRUD (basic) — needed for vendor fields on requirements.
10. Tests: Vitest (parser, search builder, CSV import, dedupe keys, dashboard queries), RLS tests against local Supabase, Playwright smoke (login, create, search, responsive). README + `.env.example`.

Phase 2 next: Gmail/Graph OAuth for one mailbox, worker + pg-boss, classification + extraction with OpenAI.

## 5. Credentials / approvals needed (by phase)

| Item | Needed for |
|---|---|
| GitHub repo access | Phase 1 (to push code) |
| Supabase project URL + anon key + service-role key | Deploying Phase 1 (local dev works without) |
| Vercel account / project | Deploying web |
| OpenAI API key | Phase 2 extraction |
| Google Cloud OAuth client (and Workspace admin approval if applicable) | Gmail mailboxes |
| Azure AD app registration (and tenant admin consent) | Microsoft 365 mailboxes |
| Which provider hosts Prohires / work / personal mail | Phase 2–3 |
| USAJOBS / Adzuna keys, any licensed feed contracts | Phase 4 |
| Worker host (Railway/Render/Fly) | Phase 2 deploy |
