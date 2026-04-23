# Paystub Generator (Static Web App)

Client-side paystub generator with saved company/employee profiles and a printable stub layout.

## Stack

- Vanilla HTML, CSS, and JavaScript (no build step)
- Browser `localStorage` persistence for saved companies and employees

## Features

- Save and reuse company records (name, address, EIN, state)
- Save and reuse employee withholding/exemption defaults
- Enter regular and overtime hours, hourly rate, and overtime multiplier
- Automatic gross pay, deductions, and net pay calculations
- State-aware defaults for:
  - **Illinois** (default state income tax rate 4.95%)
  - **Texas** (default state income tax rate 0.00%)
- Adjustable tax inputs:
  - Federal withholding base rate
  - State withholding override rate
  - Additional federal withholding amount
- Exemption options:
  - Federal withholding exempt
  - State withholding exempt
  - Social Security exempt
  - Medicare exempt
- Printable paystub output from the built-in preview pane

## How to Use

1. Open `index.html` in your browser.
2. Fill in company and employee/payroll inputs.
3. Click **Save / Update Company** and **Save / Update Employee** to reuse profiles later.
4. Click **Generate Stub** to refresh calculations and preview.
5. Click **Print Stub** for a print-ready paystub.

## Notes

- This tool is intended for internal draft paystub generation and planning workflows.
- Tax logic is simplified and configurable; verify rates and compliance details with your payroll/tax advisor before production payroll processing.
