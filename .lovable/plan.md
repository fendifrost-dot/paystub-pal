

# YTD Calculation Audit

## Where the logic lives

**Heads-up:** YTD only exists in the legacy vanilla file `script.js` (paired with `index.html`). The React app at `src/pages/Index.tsx` — which is what actually renders at `/` — has **no YTD logic at all**. So in the deployed Lovable preview, none of this code runs. Worth confirming which surface you actually want audited.

Relevant code in `script.js`:

- **Seed YTD storage** — lines 41–46 (`SEED_YTD_FIELDS`), 453–474 (`readSeedYtd` / `applySeedYtd`)
- **Per-period calc + YTD assembly** — lines 479–545 (`generateStub`)
- **YTD rollup from saved stubs + seed** — lines 668–706 (`rollupYtd`)
- **Saving a stub to history** — lines 708–779 (`saveStubToHistory`)
- **History filter for display** — lines 781–793 (`renderStubHistory`)
- **Year extraction** — lines 977–982 (`yearFromInputDate`)

## How it currently works

1. On every `generateStub()`, the page calls `rollupYtd(activeCompanyId, employeeId, year)` where `year` is parsed from the `payDate` input (`YYYY-MM-DD` → `Number(parts[0])`).
2. `rollupYtd` seeds an accumulator from `employee.seedYtd` (mid-year onboarding), then sums every saved stub matching `companyId`, `employeeId`, and `yearFromInputDate(s.payDate) === year`.
3. The displayed YTD = `roll + current` (current period is added on top of the rollup, in memory, for display).
4. `saveStubToHistory()` is idempotent on `(companyId, employeeId, payDate)` — same pay date overwrites.

## Bugs and issues found

### 1. Double-counting when re-saving the current stub (HIGH)
In `generateStub`, YTD = `rollupYtd(...) + current`. `rollupYtd` already includes any saved stub whose `payDate` equals the current `payDate`. Flow:

- User enters values → preview shows `roll(no match yet) + current` ✓
- User clicks **Save stub to history** → stub saved under that payDate
- `saveStubToHistory` then calls `generateStub()` again (line 773) → now `rollupYtd` finds the just-saved stub AND `current` is still added → **YTD overstated by exactly one period**.

Fix direction: in `generateStub`, exclude any saved stub matching the current `(companyId, employeeId, payDate)` from the rollup before adding `current`. Or compute display YTD as `rollup OR (rollup + current if not yet saved)`.

### 2. Seed YTD overtime hours/pay are silently dropped (MED)
`rollupYtd` (lines 672–684) maps seed fields only into `regularHours` and `regularPay`. There is no `seed.overtimeHours` / `seed.overtimePay` key — and the form doesn't collect them either (`SEED_YTD_FIELDS` has only `seedYtdHours` and `seedYtdGross`). For a mid-year hire with prior OT, all OT history collapses into "regular," distorting the earnings table breakdown (totals still match because seed gross is a single bucket, but the per-row YTD is wrong).

### 3. Seed net pay derivation is inconsistent (MED)
Line 686: `seed netPay = seed.gross - (federal + state + ss + medicare + pretax + posttax)`. But seed `regularPay` is also set to `seed.gross`. That's fine for totals, yet `current.netPay` later is `gross - totalDed` *with `Math.max(0, …)`*, while the seed clamp is also `Math.max(0, …)`. The mismatch: the form has no `seedYtdNet` input, so seed net is reverse-engineered. If the user only enters `seedYtdGross` without all matching withholding seeds, **seed net = seed gross**, which silently inflates YTD net pay.

### 4. No January 1 reset semantics — only year-of-payDate filtering (LOW–MED, by design)
`rollupYtd` filters stubs by `yearFromInputDate(s.payDate) === year`. This means YTD is anchored to the *currently-entered pay date's year*, not "today's year." If the user backdates a stub to 2024 to reprint, YTD silently switches to 2024 totals. That's probably intended, but worth flagging — there's no warning when the year flips.

Also: `yearFromInputDate` uses string split on `-`. Empty/invalid `payDate` returns `null`, and `rollupYtd` will then match only stubs where `yearFromInputDate(s.payDate) === null` — i.e. zero matches → YTD = seed only, silently. No user feedback.

### 5. Multi-company aggregation is per-(company, employee), not per-employee (MED, depends on intent)
The filter requires `s.companyId === companyId`. If the same employee works for two companies in your DB, each company has its own independent YTD. **For Social Security wage base ($168,600 in 2024) and Additional Medicare ($200K threshold), federal YTD is per-employee across all employers.** If the user's intent is one employee = one company (typical), this is fine; if they're tracking the same SSN across companies, federal tax YTD is wrong. The `BACKEND.md` even notes "Wage-base cap for Social Security" as a future feature — currently uncapped.

### 6. No Social Security wage base cap (MED)
`socSec = taxableWages * 6.2%` always. Once YTD wages exceed the SSA cap, SS withholding should stop. Not implemented anywhere — would need YTD-aware calc in `generateStub` and `saveStubToHistory`.

### 7. Tax YTD is recomputed-then-summed, not recomputed from YTD wages (LOW, expected)
Each saved stub stores its own `federalWH/stateWH/socSec/medicare`, and YTD just sums them. So if the federal rate changes mid-year, prior periods keep their old rate — correct payroll behavior, just noting it's not "recompute YTD from current rate."

### 8. Rounding (LOW)
No rounding anywhere in storage — full float values are summed. Display uses `toLocaleString({ minimumFractionDigits: 2, maximumFractionDigits: 2 })` which rounds *for display* per cell. Sum of displayed cells may show a 1-cent drift vs. the displayed YTD total (classic banker's-rounding artifact). Not a calc bug, but a visual one.

### 9. Pre/post-tax deductions in YTD — correctly included (OK)
`pretax` and `posttax` are summed in `rollupYtd` and added to `ytd.totalDed` (line 545). Taxable wages = `gross − pretax` per period (correct: pre-tax reduces taxable, post-tax does not). No bug here.

### 10. Overtime in current-period inclusion (OK)
`overtimeHours` and `overtimePay` are summed both in rollup and current. `ytd.totalHours = regularHours + overtimeHours` (line 544) — correct.

## Severity summary

| # | Issue | Severity |
|---|---|---|
| 1 | Double-count after Save (current stub counted twice) | **HIGH** |
| 2 | Seed YTD has no overtime fields | MED |
| 3 | Seed net pay silently = gross when withholding seeds blank | MED |
| 5 | No cross-company aggregation for same employee | MED (intent-dependent) |
| 6 | No SS wage-base cap | MED |
| 4 | Year anchored to payDate, no warning on year flip / null | LOW–MED |
| 8 | Per-cell display rounding can drift 1¢ | LOW |
| 7 | Mid-year rate changes not retroactive | LOW (correct) |

## Recommended next step

Confirm **which app you want to fix** — the legacy `script.js`/`index.html` (where YTD lives) or the React `src/pages/Index.tsx` (where it doesn't exist yet). Then I'd prioritize fixing #1 first (real, reproducible double-count), then #6 and #3.

