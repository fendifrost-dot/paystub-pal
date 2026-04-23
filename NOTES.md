# PayStub Pal — Open Issues & Feedback

Last updated: 2026-04-23

## Shipped in this session

- [x] Kill the hardcoded "Sample Company LLC" seed. Empty-state prompt when no companies.
- [x] Add Export / Import JSON so data survives Lovable reloads.
- [x] Scope employees under the active company (employees list filters to the selected company).
- [x] Migration: any legacy employee without `companyId` gets assigned to the first saved company.
- [x] Delete buttons for company and employee (with confirm + cascade cleanup).
- [x] Stub history stored per (company, employee, tax year).
- [x] **Save stub to history** button on the primary action row. Idempotent per pay date.
- [x] Stub history list with Load + Delete buttons per row.
- [x] YTD columns now auto-compute from: starting-YTD seed (one-time) + sum of saved stubs for this employee in this tax year + current period.
- [x] Collapse the 10 manual YTD inputs to one "Starting YTD seed" `<details>` accordion on the employee record (only needed when onboarding mid-year).
- [x] Context indicator at the top of the controls panel: `Company › Employee` breadcrumb.
- [x] `Save ✓` / `Save failed` flash feedback on every primary action button.
- [x] State locked to IL only (bake in 4.95%).
- [x] Save-button safety: replace `crypto.randomUUID()` with `genId()` fallback.
- [x] BACKEND.md — decision framework, recommended stack (Supabase), minimum-viable schema with RLS, migration strategy.

## Still open

### Short-term (next session candidates)

- [ ] **Hourly rate as employee default.** Currently lives on the stub-level form. Should be saved on the employee record and pre-fill when switching employees; still overridable per stub.
- [ ] **Batch generate** — select a company + pay date → generate a stub for every employee at that company in one click (print all at once).
- [ ] **Check Number** field (auto-increments per company; editable).
- [ ] **Home Department** field on Employee and on the stub.
- [ ] **Social Security wage-base cap** ($168,600 for 2024; update for 2026). Cap YTD SS at that amount.
- [ ] **Additional Medicare** 0.9% surtax on wages over $200K single / $250K married.
- [ ] **Confirm-on-unsaved-changes** dialog when switching companies or employees without saving.

### Medium-term

- [ ] Move to Supabase per BACKEND.md so data actually syncs across devices and survives Lovable iframe wipes for real.
- [ ] Per-company defaults (pay frequency, OT multiplier, federal rate).
- [ ] Stub history filter by date range (for multi-year employees).
- [ ] W-2-style annual summary export per employee.

### Long-term

- [ ] Multi-user roles (owner, admin, read-only) — needed if Fendi's accountant should see the data.
- [ ] PDF export (instead of browser print dialog) for reliable email attachments.
- [ ] Audit log — who changed what, when.

## YTD audit (from Plan-mode review) — resolutions

- [x] **Double-count on Save (HIGH).** Was overstating YTD by exactly one pay period after clicking Save. `rollupYtd` now accepts an `excludePayDate` argument and skips any saved stub matching the current pay date. `generateStub` always passes the current pay date so it can then safely add the current-period values on top — no matter whether the stub is in history yet or not.
- [x] **Year fallback (LOW-MED).** If `payDate` is blank or invalid, year now falls back to the current calendar year instead of returning null (which silently collapsed rollup to seed-only).
- [x] **Seed YTD net explicit (MED).** Added `seedYtdNet` input in the Starting YTD accordion. If you fill it, it's used directly. If blank, seed net is derived from `seed gross − sum(seed withholdings)` as before.
- [x] **SS wage-base cap (MED).** Social Security withholding now caps at the annual wage base. 2024: $168,600 / 2025: $176,100 / 2026: $184,500 (estimate; replace with the official SSA figure when announced). Once YTD taxable wages hit the cap, SS stops being withheld for the rest of the year. Applied in both `generateStub` and `saveStubToHistory`.
- [x] **Seed contributes to totals only (MED).** Seed hours/gross now roll into YTD totals (Total Hours, Gross Earnings, Net Pay) rather than into the "Hourly" row specifically. This avoids silently misattributing a mid-year hire's prior OT as regular hours. The per-row YTD ("Hourly" / "Overtime") shows only this-year saved stubs, which is the only data we can split reliably.

## Still open from that audit

- [ ] **Cross-company aggregation for the same SSN.** If the same employee works at two of Fendi's companies, YTD for SS wage base / Additional Medicare should aggregate across both. Currently scoped strictly per-company. Fix requires an SSN-based lookup across companies (or a unified "person" entity). Call-out: out of scope for a per-company stub generator, in scope for a real payroll product.
- [ ] **Additional Medicare** 0.9% surtax on wages over $200K single / $250K married.
- [ ] **Display rounding drift.** Values stored as full floats, rounded only at display. Sum-of-cells can drift a cent from the displayed total. Visual, not a calc bug — worth a one-pass rounding helper if it ever matters.

## Known fragilities

- **localStorage inside Lovable's preview iframe is not reliable** across reloads. Export/Import is the mitigation until a backend lands.
- **State tax is hardcoded for IL.** Adding TX, CA, NY etc. is one line in `STATE_CONFIG` + one `<option>` each — when Fendi's companies need them.
- **Federal tax uses a flat user-set rate** (default 12%), not IRS tax tables. Fine for stub generation; don't confuse with actual tax-advice software.
- **React vs vanilla duality.** The repo has TWO implementations: the vanilla `index.html` / `styles.css` / `script.js` (where all the new work lives) and a React/Vite scaffold at `src/pages/Index.tsx` (older, simpler, no YTD logic, uses different storage keys `paystub-generator-*`). Lovable's pipeline may favor one or the other depending on how it serves the project — needs verification. See "Decision: React vs. vanilla" below.

## Decision: React vs. vanilla

All the new work (YTD rollup, stub history, Export/Import, multi-company, bug fixes) lives in the vanilla `script.js`. The React `src/pages/Index.tsx` is still the old, simpler, no-YTD version. Three ways to reconcile:

1. **Port the vanilla improvements to React** (keeps Lovable preview working out of the box, ~500–800 LOC of React). Best if Lovable really does serve the React app.
2. **Strip the React scaffold** and deploy the vanilla via GitHub Pages / Netlify / Vercel. Cleanest end-state, ~5 minutes to deploy, but Lovable preview would no longer be the right surface.
3. **Keep both; choose per preview**. Tolerate the duality; the one that renders is the one that renders. Fine short-term, bad long-term.

Recommendation: verify which surface Lovable is actually serving (open the preview, view page source — if you see `<form id="paystub-form">` it's vanilla, if you see React-mounted content under `<div id="root">` it's React). Then pick option 1 or 2.

## Nice architectural things already in place

- Every stub event flows through a single `generateStub()` function that re-renders the preview. No duplicated calc paths.
- Calculations are pure: gross → taxable → each withholding → net, with exempt flags zeroing out cleanly.
- Stub history is content-addressable by `(companyId, employeeId, payDate)`, so re-saving the same period idempotently updates.
- YTD computation pulls from the single source of truth (the stubs array) — impossible to drift.
