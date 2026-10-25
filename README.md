# BenchFlow AI

IT job requirements aggregation and vendor intelligence portal for US IT staffing and bench sales recruiters.

**Status: Phase 1** — auth, multi-tenant database, live dashboard, Boolean global search, manual entry, CSV import, exact/fuzzy duplicate detection, vendor directory, audit log. Email sync, job-board connectors, and AI are planned for later phases and are **not connected yet**. Pages for those features say so and show no data.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, schema, integration limits and phase plan.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS v4 |
| Data / Auth | Supabase Postgres 17 + Auth, row-level security per organization |
| Search | Postgres: custom Boolean parser → safe SQL (regex word-boundary matching on a trigram-indexed `search_text`), synonym expansion |
| Shared logic | `packages/core` — query parser, synonyms, validation schemas, CSV import, dedupe |
| Tests | Vitest (unit), SQL access-policy tests, Playwright (E2E + mobile) |

```
apps/web          Next.js app
packages/core     Framework-free domain logic (shared with the Phase 2 worker)
supabase/         config, migrations, seed.sql (synthetic), tests/rls.sql
docs/             architecture and plan
```

## Local development

Requirements: Node 22, pnpm 9, Docker.

```bash
pnpm install
pnpm db:start                     # starts local Supabase, applies migrations + synthetic seed
cp .env.example apps/web/.env.local   # paste ANON_KEY from `pnpm exec supabase status`
pnpm dev                          # http://localhost:3000
```

Demo logins (synthetic data, local only):

| Email | Password | Role |
|---|---|---|
| demo@benchflow.local | demo-password-123 | owner |
| viewer@benchflow.local | demo-password-123 | viewer (read-only, no consultant data) |

Or sign up a new account. You create an empty organization with no demo data. Local auth emails (magic links) show up in Mailpit at http://127.0.0.1:54324.

### Commands

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint + TypeScript across the workspace |
| `pnpm test` | Unit tests (core + web) |
| `pnpm db:test` | Row-level-security / authorization tests against the local DB |
| `pnpm test:e2e` | Playwright against `pnpm start` (run `pnpm build` first), or set `E2E_BASE_URL=http://localhost:3000` to reuse `pnpm dev` |
| `pnpm db:reset` | Recreate the local DB from migrations + seed |

## Search syntax

`Java AND AWS AND C2C` · `"data engineer" snowflake Texas` · `react (node OR nodejs) -angular` · `snow*`

- Operators: `AND` (or just a space), `OR`, `NOT` / leading `-`, parentheses, `"phrases"`, trailing `*` for a prefix match.
- Fields: `title:` `skill:` `state:`/`location:` `vendor:` `prime:` `partner:` `client:` `company:` `source:` `sender:` `recruiter:` `jobid:` `status:` `type:`
- Synonyms: skill aliases from the `skills`/`skill_aliases` tables (e.g. `k8s` → Kubernetes, `reactjs` → React), staffing terms (`C2C` ↔ corp-to-corp, `H1B` ↔ H-1B), state names ↔ codes.
- Filters: source type, source, date range, received within, state, skills, work arrangement, employment type, tax terms, vendor, status. All search state is in the URL, so the Back button returns to the same results.

## Duplicate handling

1. Same source job ID → linked to the existing requirement as an extra source.
2. Same canonical URL (tracking params stripped) → linked.
3. Same employer + title + location fingerprint → saved, **flagged for review**.
4. Identical / ≥60% similar description text → saved, **flagged for review**.

Fuzzy matches are never merged automatically. Reviewers choose "Mark as duplicate" or "Not a duplicate" on the requirement page.

## Deployment (Phase 1)

1. Create a Supabase project. Run `pnpm exec supabase link --project-ref <ref>`, then `pnpm exec supabase db push`. Do **not** run `seed.sql` in production.
2. In Supabase Auth settings, set Site URL and redirect URLs to `https://<your-domain>/auth/callback`. Enable email confirmations.
3. Vercel: import the repo, set root directory to `apps/web`, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_TIMEZONE`.
4. The in-memory rate limiter is per instance. On Vercel, add a shared limiter (Upstash) or WAF rate-limit rules for `/login`.

## Security checklist

- [x] RLS on every table, scoped by organization; viewers cannot write or read consultants/audit log
- [x] Server-side role checks in every Server Action before the DB call
- [x] Mailbox/connector token references are not readable or writable by app users (column grants)
- [x] Audit log triggers on requirements, vendors, roles, mailboxes, connectors, consultants, attachments
- [x] Zod validation of all inputs; parameterized/quoted SQL in search; CSV formula-injection neutralized on export
- [x] Security headers (HSTS, frame-deny, nosniff, referrer policy); open-redirect-safe `next` param
- [x] No secrets in the repo; `.env*.local` ignored
- [ ] Phase 2: encrypted OAuth tokens in Supabase Vault, token revocation on disconnect
- [ ] Phase 6: malware scanning for uploads, shared rate limiter, backups/PITR verification, member invitations, data-retention jobs

Backups: enable Supabase daily backups (PITR on Pro) and test a restore into a staging project each quarter.

## Features that need external approval or credentials

| Feature | Needs |
|---|---|
| Hosted deployment | Supabase project, Vercel project |
| Gmail / Google Workspace sync | Google Cloud OAuth client. `gmail.readonly` is a restricted scope: Testing mode means re-consent every 7 days, Internal mode needs a Workspace admin, public apps need Google verification |
| Microsoft 365 sync | Azure AD app registration; tenant admin consent may be required |
| AI extraction / semantic search | OpenAI API key |
| LinkedIn, Indeed, Dice | No public read APIs. Listings come in through job-alert emails, with link-outs to the originals |
| CareerBuilder / Monster | Access to be confirmed with the current owner |
| USAJOBS, Adzuna | Free API keys |

## Troubleshooting

- **`supabase start` fails pulling images**: retry. The CLI falls back from ECR to GHCR.
- **Redirect loop to /onboarding**: the user has no organization membership. Finish onboarding, or run `pnpm db:reset` locally.
- **Search returns nothing for a 2-letter word**: bare state codes only expand with `state:`, e.g. `state:IN`.
