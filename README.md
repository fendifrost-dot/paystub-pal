# Paystub Generator

A single-page payroll stub generator for saving reusable company and employee profiles, entering payroll run details, calculating withholdings, and printing a classic letter-size check-stub layout.

## Usage

1. Open the app in a browser.
2. Enter a company profile and click **Save/Update Company**.
3. Enter an employee profile and click **Save/Update Employee**.
4. Fill out payroll run fields such as pay date, pay period, hourly rate, hours, deductions, and withholding rates.
5. Click **Generate Stub** to refresh the preview.
6. Click **Print Stub** to print or save as PDF from the browser print dialog.

Saved company and employee profiles are stored in the browser with `localStorage`, so they stay available on the same device/browser without a backend.

## Tax calculation notes

Implemented defaults:

- Illinois state withholding: 4.95%
- Texas state withholding: 0.00%
- Social Security: 6.2%
- Medicare: 1.45%
- Optional state override rate replaces the default state rate
- Federal withholding uses the adjustable base rate plus additional federal withholding unless federally exempt

## Disclaimer

This app is for estimation, formatting, and recordkeeping support only. It is not tax, payroll, legal, or accounting advice. Payroll rules can vary by jurisdiction, employee status, benefits, pay frequency, and current law. Verify all withholdings and paystub requirements with a qualified payroll professional or official agency guidance before issuing payroll.
