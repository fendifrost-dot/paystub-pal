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

## Known fragilities

- **localStorage inside Lovable's preview iframe is not reliable** across reloads. Export/Import is the mitigation until a backend lands.
- **State tax is hardcoded for IL.** Adding TX, CA, NY etc. is one line in `STATE_CONFIG` + one `<option>` each — when Fendi's companies need them.
- **Federal tax uses a flat user-set rate** (default 12%), not IRS tax tables. Fine for stub generation; don't confuse with actual tax-advice software.

## Nice architectural things already in place

- Every stub event flows through a single `generateStub()` function that re-renders the preview. No duplicated calc paths.
- Calculations are pure: gross → taxable → each withholding → net, with exempt flags zeroing out cleanly.
- Stub history is content-addressable by `(companyId, employeeId, payDate)`, so re-saving the same period idempotently updates.
- YTD computation pulls from the single source of truth (the stubs array) — impossible to drift.
