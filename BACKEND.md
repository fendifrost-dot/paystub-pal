# PayStub Pal — Backend Plan

**Why a backend:** PayStub Pal will be used across all of Fendi's companies. The current localStorage-only model is fragile in embedded preview iframes (Lovable), doesn't sync across devices, has no audit trail, and can't support multiple users. A real backend unlocks multi-device access, login, automatic backups, and eventually team access (accountants, HR).

This doc is a decision-framework and a minimum-viable schema, not a commitment. We can ship the current localStorage build and migrate later — Export/Import JSON is the bridge.

---

## Options

### Option A — Supabase (recommended for v1)

**What it is:** Postgres + auth + storage + row-level security, generously free-tier, hosted.

**Why it fits:**
- Drop-in auth (email magic link, Google sign-in) — no login code to write.
- Postgres gives us proper relational integrity for companies → employees → stubs.
- Row-level security (RLS): a user only sees their own companies. Enforced at the DB.
- JS client library is dead simple; the existing vanilla JS doesn't need a framework.
- Works in a Lovable iframe (it's just fetch calls to a public API endpoint; no cross-origin storage weirdness).
- Free tier is 500 MB DB + 50k monthly active users. More than enough for one business.

**Trade-offs:**
- Vendor lock-in, but Postgres is portable — you can export and move.
- Need to learn their dashboard for RLS policies (easy, but a real step).

**Cost path:** Free → $25/mo Pro when needed. Usage for a single-tenant payroll tool will live in the free tier for years.

---

### Option B — Firebase (Firestore + Auth)

**What it is:** Google's NoSQL document DB + auth + hosting.

**Why it's fine:**
- Also has magic-link and Google auth out of the box.
- Real-time subscriptions are free — if we ever want "employee list updates live when someone else in the org edits," this is built in.
- Very quick to prototype.

**Why not v1:**
- NoSQL schema modeling is less tidy for relational data like companies/employees/stubs with YTD aggregates.
- Querying "all stubs for this employee in this tax year" is clunkier than a SQL `WHERE`.
- Read-heavy apps can blow past the free tier faster than Supabase.

---

### Option C — Cloudflare D1 + Workers

**What it is:** SQLite-at-the-edge + edge functions, cheap and fast.

**Why it's tempting:**
- Ridiculously cheap at scale.
- Sub-50ms response times globally.
- Full control; no vendor dashboard bloat.

**Why not v1:**
- No built-in auth — we'd need to write it (Cloudflare Access or roll our own with magic links). Not hard, but it's code we don't have yet.
- SQLite is great but the D1 API is still maturing.
- More ops work for a one-person project.

---

### Option D — Keep localStorage; solve the problem with JSON export

**Already shipped.** Use the Export/Import buttons to take a JSON snapshot after each work session. Fine for a week or two of dogfooding. Not acceptable as a long-term answer because the data is trapped in one browser on one device.

---

## Recommendation

**Go Supabase when ready to migrate.** It's the least amount of code to get real auth + a real DB + multi-device sync for a one-person payroll tool across multiple companies. The schema below maps cleanly onto the current JS data model — the migration is essentially replacing `localStorage.setItem` with a Supabase client call.

---

## Minimum-viable schema (Supabase / Postgres)

```sql
-- auth.users is provided by Supabase Auth.

create table companies (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  address1        text,
  address2        text,
  ein             text,
  state           text not null default 'IL',
  created_at      timestamptz not null default now()
);

create table employees (
  id                         uuid primary key default gen_random_uuid(),
  owner_id                   uuid not null references auth.users(id) on delete cascade,
  company_id                 uuid not null references companies(id) on delete cascade,
  name                       text not null,
  employee_id                text,
  address1                   text,
  address2                   text,
  ssn_last4                  text,
  federal_filing_status      text default 'single',
  federal_allowances         int  default 0,
  state_exemptions           int  default 0,
  additional_federal         numeric(10,2) default 0,
  is_federal_exempt          boolean default false,
  is_state_exempt            boolean default false,
  is_social_security_exempt  boolean default false,
  is_medicare_exempt         boolean default false,
  seed_ytd                   jsonb,   -- { hours, gross, federal, state, socialsecurity, medicare, pretax, posttax }
  created_at                 timestamptz not null default now()
);

create table stubs (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,
  pay_date          date not null,
  period_start      date,
  period_end        date,
  pay_frequency     text,
  hourly_rate       numeric(10,4),
  ot_multiplier     numeric(6,2),
  regular_hours     numeric(10,4),
  regular_pay       numeric(12,2),
  overtime_hours    numeric(10,4),
  overtime_pay      numeric(12,2),
  gross_pay         numeric(12,2),
  pretax            numeric(12,2),
  posttax           numeric(12,2),
  federal_wh        numeric(12,2),
  state_wh          numeric(12,2),
  soc_sec           numeric(12,2),
  medicare          numeric(12,2),
  total_deductions  numeric(12,2),
  net_pay           numeric(12,2),
  created_at        timestamptz not null default now(),
  unique (company_id, employee_id, pay_date)
);

create index on employees (company_id);
create index on stubs (company_id, employee_id, pay_date desc);
```

### Row-level security policies

```sql
-- Enable RLS
alter table companies enable row level security;
alter table employees enable row level security;
alter table stubs     enable row level security;

-- Owner sees/edits only their own rows on all three tables
create policy "owner_rw" on companies for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner_rw" on employees for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner_rw" on stubs for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

---

## Migration strategy (localStorage → Supabase)

1. Ship localStorage + Export/Import (done).
2. Add Supabase project; apply the schema above.
3. Add a sign-in screen to the app (magic link).
4. After sign-in, read localStorage; if data exists, upload it all to Supabase in one batch, mark a `paystub.migrated = true` flag, then switch reads to Supabase.
5. From then on, every save is a Supabase call; localStorage becomes a write-through cache for offline use (optional).

The vanilla JS stays. The only new dependency is the `@supabase/supabase-js` client (delivered via CDN, no build step needed).

---

## Features unlocked by a backend

- **Multi-device:** open the app on phone, laptop, tablet — same data.
- **Shared access (future):** invite an accountant or HR person with read-only or edit rights.
- **Audit log:** `created_at` + `updated_by` on every stub for traceability.
- **Batch print by pay date:** query all stubs for a given company + pay date and print in sequence.
- **Per-employee history export:** annual W-2 prep becomes a single SQL query.
- **Wage-base cap for Social Security:** DB function can cap YTD SS contributions at the annual cap automatically.

---

## What we'd still do client-side

- All stub rendering (keeps print fidelity and works offline).
- Form validation.
- Local cache of recent data so the app loads instantly on reopen.

---

## Not recommended

- **Building our own Node/Postgres stack.** Too much ops for a single-user tool.
- **Google Sheets as the DB.** Tempting for simplicity, but no RLS, no schema, no auth, hits quotas.
- **Serverless KV (Upstash, Vercel KV).** Fine for JSON blobs but we want relational integrity for YTD accuracy.

---

## Next step when ready

Spin up a Supabase project, run the SQL above, add the client SDK to `index.html`, wire sign-in to a new top-level bar in `index.html`. Estimated effort: half a day to working login + data sync.
