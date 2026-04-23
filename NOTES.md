# PayStub Pal — Open Issues & Feedback

Last updated: 2026-04-23 · running notes for the next Cowork session.

## Context
- Repo: https://github.com/fendifrost-dot/paystub-pal (`main` branch)
- Vanilla HTML/CSS/JS stub generator (not the Vite/React scaffold still living in `src/`)
- Tool will be used to generate stubs across **all of Fendi's companies** — multi-company is a first-class requirement, not a nice-to-have.

---

## 1. YTD should auto-compute from total hours, not manual entry

**Reported:** "the calculations aren't right for ytd — it should automatically populate when you put the total hours in"

**Current behavior:** The YTD section has ~10 manual-entry fields (YTD regular hours, YTD regular pay, YTD OT hours, YTD OT pay, YTD federal w/h, YTD state w/h, YTD SS, YTD Medicare, YTD pre-tax, YTD post-tax). Blank fields fall back to the *current period's* values — so the first stub looks right, but nothing is actually accumulating period-over-period.

**What's needed:**
- YTD must be a **running total** per (company, employee, tax year), not per stub.
- Every generated stub should persist: `{ companyId, employeeId, payDate, grossPay, socSec, medicare, federal, state, pretax, posttax, netPay, regularHours, overtimeHours }`.
- When generating a new stub, YTD for every field = sum of all prior stubs for that employee in the same tax year (year of `payDate`) + this stub.
- Enter total hours → regular pay + OT pay + all withholdings auto-compute from current period → YTD auto-rolls up from history.
- Only manual YTD field we should keep: a one-time **"starting YTD" seed** per employee, for migrating mid-year from another payroll system.

**Implementation sketch:**
- New localStorage key `paystub.stubs` → array of generated stub records
- On generate: look up all stubs for this employee+year, sum fields, display as YTD
- On print: append current stub to history (idempotent if same payDate)
- Add a "Stub history" drawer per employee so Fendi can see/edit/delete prior stubs

---

## 2. Redundant fields in the YTD section

**Reported:** "some fields seem redundant in the ytd section"

**Audit of current YTD fields vs. what's actually needed:**

| Current field | Keep? | Why |
|---|---|---|
| YTD regular hours | Auto | Sum from history |
| YTD regular pay | Auto | Sum from history |
| YTD OT hours | Auto | Sum from history |
| YTD OT pay | Auto | Sum from history |
| YTD federal w/h | Auto | Sum from history |
| YTD state w/h | Auto | Sum from history |
| YTD Social Security | Auto | Sum from history |
| YTD Medicare | Auto | Sum from history |
| YTD pre-tax | Auto | Sum from history |
| YTD post-tax | Auto | Sum from history |

**Proposed replacement:** collapse all 10 manual YTD fields into one optional "Starting-YTD seed" dialog per employee (grossPay + each withholding + net, total hours). Used once when onboarding an employee mid-year, then hidden.

---

## 3. Saved employees disappear between sessions

**Reported:** "when you save an employee you see save but there is no where to find them if you exit out and come back in"

**Most likely root causes (in order):**

1. **Lovable preview iframe blocks `localStorage`.** Browsers increasingly block storage in sandboxed/third-party iframes. The "Saved ✓" flash means the in-memory array was updated and `localStorage.setItem` was called without throwing — but the write is scoped to the iframe and wiped when the preview reloads.
2. **Different origin on each visit.** If Lovable rotates preview URLs, localStorage doesn't follow.
3. **Private/incognito mode** wipes storage on close.

**Fix path — pick one:**

- **Short-term (no backend):** add JSON **Export / Import** buttons. User clicks Export → downloads a `.json` snapshot of companies + employees + stub history. Import reloads it. Ugly but reliable across Lovable previews.
- **Medium-term:** migrate from localStorage to **IndexedDB** — slightly better iframe behavior, supports larger data.
- **Right answer:** a real backend. Supabase/Firebase/Cloudflare D1 + auth so Fendi can log in on any device and see their companies + employees + generated stubs. This is the only way a multi-company payroll tool makes sense long-term.

---

## 4. Company data partial persistence — form stays, dropdown empties

**Reported:** "that's the same for the company except the company stays put in the field"

**Why this happens:** on page load, `seedDefaultOptions()` inserts a default "Sample Company LLC" if `companies` is empty. Then `hydrateSelects()` applies `companies[0]` to the form. So after a storage wipe, the fields *look* populated (with the seed), but the dropdown has only the seed — no user-saved companies.

**Fix paths (same as #3, plus):**
- Kill the seed entirely — don't auto-populate fake data. If there are no saved companies, leave the form blank and show an empty-state hint.

---

## 5. Multi-company architecture (foundational)

**Reported:** "this tool will be used for all of my companies"

**What this implies:**
- Company picker must be prominent, with easy "Add new company" flow.
- Each company should have its own saved employees (scoped — right now it's a flat global list).
- Each employee's YTD is per-company, per-tax-year.
- Stub history filterable by company + year + employee.
- Print batch: select a company → select a pay date → generate stubs for every employee at that company in one click.
- Possible future: per-company pay-frequency default, per-company check # sequence, per-company EIN + address baked in.

**Data model (proposed):**
```
Company { id, name, address1, address2, ein, state, createdAt }
Employee { id, companyId, name, address1, address2, ssnLast4, filingStatus, allowances, exemptions, hourlyRate (default) }
Stub { id, companyId, employeeId, payDate, periodStart, periodEnd, grossPay, netPay, socSec, medicare, federal, state, pretax, posttax, regularHours, overtimeHours, checkNumber }
```

---

## Priority for next session

1. Kill the localStorage-only model → add Export/Import JSON so data survives Lovable reloads (quick win).
2. Scope employees under companies (data model change).
3. Replace manual YTD section with stub-history rollup.
4. Kill the seeded "Sample Company LLC" default.
5. Plan the backend migration for real multi-device usage.

## Nice-to-haves mentioned earlier
- Check # and Home Department fields on the stub
- Social Security wage-base cap ($168,600 / year 2024; update for 2026)
- Additional Medicare 0.9% on wages over $200K single / $250K married
- Batch-print all employees for a given pay date
