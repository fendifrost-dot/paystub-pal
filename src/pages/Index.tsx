import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Calculator, FileText, Printer, RotateCcw, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COMPANY_KEY = "paystub-generator-companies";
const EMPLOYEE_KEY = "paystub-generator-employees";

const stateRates = {
  Illinois: 0.0495,
  Texas: 0,
};

type CompanyState = keyof typeof stateRates;
type FilingStatus = "Single" | "Married" | "Head of Household";

type CompanyProfile = {
  id: string;
  name: string;
  address1: string;
  address2: string;
  ein: string;
  state: CompanyState;
};

type EmployeeProfile = {
  id: string;
  name: string;
  employeeId: string;
  filingStatus: FilingStatus;
  federalAllowances: string;
  stateExemptions: string;
  federalExempt: boolean;
  stateExempt: boolean;
  ssExempt: boolean;
  medicareExempt: boolean;
  additionalFederal: string;
};

type PayrollRun = {
  payDate: string;
  periodStart: string;
  periodEnd: string;
  hourlyRate: string;
  regularHours: string;
  overtimeHours: string;
  overtimeMultiplier: string;
  pretaxDeductions: string;
  posttaxDeductions: string;
  federalRate: string;
  stateOverrideRate: string;
};

type FieldErrors = Record<string, string>;

const emptyCompany = (): CompanyProfile => ({
  id: crypto.randomUUID(),
  name: "",
  address1: "",
  address2: "",
  ein: "",
  state: "Illinois",
});

const emptyEmployee = (): EmployeeProfile => ({
  id: crypto.randomUUID(),
  name: "",
  employeeId: "",
  filingStatus: "Single",
  federalAllowances: "0",
  stateExemptions: "0",
  federalExempt: false,
  stateExempt: false,
  ssExempt: false,
  medicareExempt: false,
  additionalFederal: "0",
});

const initialPayrollRun = (): PayrollRun => ({
  payDate: new Date().toISOString().slice(0, 10),
  periodStart: "",
  periodEnd: "",
  hourlyRate: "25",
  regularHours: "40",
  overtimeHours: "0",
  overtimeMultiplier: "1.5",
  pretaxDeductions: "0",
  posttaxDeductions: "0",
  federalRate: "12",
  stateOverrideRate: "",
});

const parseMoney = (value: string) => Math.max(Number(value) || 0, 0);
const formatMoney = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const loadStored = <T,>(key: string, fallback: T[]): T[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
};

const upsertById = <T extends { id: string }>(items: T[], next: T) => {
  const exists = items.some((item) => item.id === next.id);
  return exists ? items.map((item) => (item.id === next.id ? next : item)) : [...items, next];
};

const calculatePaystub = (company: CompanyProfile, employee: EmployeeProfile, payroll: PayrollRun) => {
  const hourlyRate = parseMoney(payroll.hourlyRate);
  const regularHours = parseMoney(payroll.regularHours);
  const overtimeHours = parseMoney(payroll.overtimeHours);
  const overtimeMultiplier = parseMoney(payroll.overtimeMultiplier) || 1.5;
  const pretaxDeductions = parseMoney(payroll.pretaxDeductions);
  const posttaxDeductions = parseMoney(payroll.posttaxDeductions);
  const federalBaseRate = parseMoney(payroll.federalRate) / 100;
  const stateRate = payroll.stateOverrideRate.trim()
    ? parseMoney(payroll.stateOverrideRate) / 100
    : stateRates[company.state];
  const additionalFederal = parseMoney(employee.additionalFederal);

  const regularPay = regularHours * hourlyRate;
  const overtimeRate = hourlyRate * overtimeMultiplier;
  const overtimePay = overtimeHours * overtimeRate;
  const grossPay = regularPay + overtimePay;
  const taxableWages = Math.max(grossPay - pretaxDeductions, 0);
  const federalWithholding = employee.federalExempt ? 0 : taxableWages * federalBaseRate + additionalFederal;
  const stateWithholding = employee.stateExempt ? 0 : taxableWages * stateRate;
  const socialSecurity = employee.ssExempt ? 0 : taxableWages * 0.062;
  const medicare = employee.medicareExempt ? 0 : taxableWages * 0.0145;
  const totalDeductions =
    federalWithholding + stateWithholding + socialSecurity + medicare + pretaxDeductions + posttaxDeductions;
  const netPay = Math.max(grossPay - totalDeductions, 0);

  return {
    hourlyRate,
    regularHours,
    overtimeHours,
    overtimeRate,
    regularPay,
    overtimePay,
    grossPay,
    taxableWages,
    federalBaseRate,
    stateRate,
    federalWithholding,
    stateWithholding,
    socialSecurity,
    medicare,
    pretaxDeductions,
    posttaxDeductions,
    additionalFederal,
    totalDeductions,
    netPay,
  };
};

const Index = () => {
  const [companies, setCompanies] = useState<CompanyProfile[]>(() => loadStored(COMPANY_KEY, []));
  const [employees, setEmployees] = useState<EmployeeProfile[]>(() => loadStored(EMPLOYEE_KEY, []));
  const [company, setCompany] = useState<CompanyProfile>(() => emptyCompany());
  const [employee, setEmployee] = useState<EmployeeProfile>(() => emptyEmployee());
  const [payroll, setPayroll] = useState<PayrollRun>(() => initialPayrollRun());
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => localStorage.setItem(COMPANY_KEY, JSON.stringify(companies)), [companies]);
  useEffect(() => localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(employees)), [employees]);

  const calculations = useMemo(() => calculatePaystub(company, employee, payroll), [company, employee, payroll]);

  const updateCompany = (field: keyof CompanyProfile, value: string) => {
    setCompany((current) => ({ ...current, [field]: value }));
  };

  const updateEmployee = (field: keyof EmployeeProfile, value: string | boolean) => {
    setEmployee((current) => ({ ...current, [field]: value }));
  };

  const updatePayroll = (field: keyof PayrollRun, value: string) => {
    setPayroll((current) => ({ ...current, [field]: value }));
  };

  const validate = () => {
    const nextErrors: FieldErrors = {};
    if (!company.name.trim()) nextErrors.companyName = "Company name is required";
    if (!company.address1.trim()) nextErrors.companyAddress1 = "Address line 1 is required";
    if (!company.address2.trim()) nextErrors.companyAddress2 = "City, state, and ZIP are required";
    if (!company.ein.trim()) nextErrors.companyEin = "EIN / Tax ID is required";
    if (!employee.name.trim()) nextErrors.employeeName = "Employee name is required";
    if (!employee.employeeId.trim()) nextErrors.employeeId = "Employee ID is required";
    if (!payroll.payDate) nextErrors.payDate = "Pay date is required";
    if (!payroll.periodStart) nextErrors.periodStart = "Period start is required";
    if (!payroll.periodEnd) nextErrors.periodEnd = "Period end is required";
    if (parseMoney(payroll.hourlyRate) <= 0) nextErrors.hourlyRate = "Hourly rate must be greater than 0";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveCompany = () => {
    if (!company.name.trim()) {
      setErrors((current) => ({ ...current, companyName: "Company name is required" }));
      toast.error("Add a company name before saving.");
      return;
    }
    setCompanies((current) => upsertById(current, company));
    toast.success("Company profile saved.");
  };

  const saveEmployee = () => {
    if (!employee.name.trim()) {
      setErrors((current) => ({ ...current, employeeName: "Employee name is required" }));
      toast.error("Add an employee name before saving.");
      return;
    }
    setEmployees((current) => upsertById(current, employee));
    toast.success("Employee profile saved.");
  };

  const generateStub = () => {
    if (validate()) toast.success("Paystub preview updated.");
    else toast.error("Please complete the required fields.");
  };

  const printStub = () => {
    if (validate()) window.print();
    else toast.error("Complete required fields before printing.");
  };

  const errorText = (key: string) => errors[key] && <p className="mt-1 text-xs font-medium text-destructive">{errors[key]}</p>;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-hero-pattern">
        <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl animate-fade-up">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur">
              <FileText className="h-4 w-4 text-accent" /> Classic letter-size payroll stubs
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">Paystub Generator</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Save company and employee profiles, enter each payroll run, auto-calculate deductions, and print a clean non-negotiable check-stub.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card/85 p-3 shadow-glass backdrop-blur animate-float-in">
            <Metric label="Gross" value={formatMoney(calculations.grossPay)} />
            <Metric label="Deductions" value={formatMoney(calculations.totalDeductions)} />
            <Metric label="Net" value={formatMoney(calculations.netPay)} strong />
          </div>
        </div>
      </section>

      <section className="container grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)] print:block print:p-0">
        <div className="space-y-6 print:hidden">
          <Panel icon={<Building2 className="h-5 w-5" />} title="Company Profiles" action={
            <Button type="button" variant="outline" size="sm" onClick={() => setCompany(emptyCompany())}>
              <RotateCcw /> New Company
            </Button>
          }>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Select saved company">
                <Select value={company.id} onValueChange={(id) => setCompany(companies.find((item) => item.id === id) ?? company)}>
                  <SelectTrigger><SelectValue placeholder="Choose a company" /></SelectTrigger>
                  <SelectContent>{companies.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="State">
                <Select value={company.state} onValueChange={(value) => updateCompany("state", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Illinois">Illinois</SelectItem>
                    <SelectItem value="Texas">Texas</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Company name" error={errorText("companyName")}><Input value={company.name} onChange={(event) => updateCompany("name", event.target.value)} /></Field>
              <Field label="EIN / Tax ID" error={errorText("companyEin")}><Input value={company.ein} onChange={(event) => updateCompany("ein", event.target.value)} /></Field>
              <Field label="Address line 1" error={errorText("companyAddress1")}><Input value={company.address1} onChange={(event) => updateCompany("address1", event.target.value)} /></Field>
              <Field label="Address line 2" error={errorText("companyAddress2")}><Input value={company.address2} onChange={(event) => updateCompany("address2", event.target.value)} placeholder="City, ST ZIP" /></Field>
            </div>
            <Button type="button" className="mt-4" onClick={saveCompany}><Save /> Save/Update Company</Button>
          </Panel>

          <Panel icon={<UserRound className="h-5 w-5" />} title="Employee Profiles" action={
            <Button type="button" variant="outline" size="sm" onClick={() => setEmployee(emptyEmployee())}>
              <RotateCcw /> New Employee
            </Button>
          }>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Select saved employee">
                <Select value={employee.id} onValueChange={(id) => setEmployee(employees.find((item) => item.id === id) ?? employee)}>
                  <SelectTrigger><SelectValue placeholder="Choose an employee" /></SelectTrigger>
                  <SelectContent>{employees.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Employee name" error={errorText("employeeName")}><Input value={employee.name} onChange={(event) => updateEmployee("name", event.target.value)} /></Field>
              <Field label="Employee ID" error={errorText("employeeId")}><Input value={employee.employeeId} onChange={(event) => updateEmployee("employeeId", event.target.value)} /></Field>
              <Field label="Federal filing status">
                <Select value={employee.filingStatus} onValueChange={(value) => updateEmployee("filingStatus", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single">Single</SelectItem>
                    <SelectItem value="Married">Married</SelectItem>
                    <SelectItem value="Head of Household">Head of Household</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Federal allowances/dependents"><Input type="number" min="0" value={employee.federalAllowances} onChange={(event) => updateEmployee("federalAllowances", event.target.value)} /></Field>
              <Field label="State withholding exemptions"><Input type="number" min="0" value={employee.stateExemptions} onChange={(event) => updateEmployee("stateExemptions", event.target.value)} /></Field>
              <Field label="Additional federal withholding ($)"><Input type="number" min="0" step="0.01" value={employee.additionalFederal} onChange={(event) => updateEmployee("additionalFederal", event.target.value)} /></Field>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CheckField label="Federal exempt" checked={employee.federalExempt} onCheckedChange={(checked) => updateEmployee("federalExempt", Boolean(checked))} />
              <CheckField label="State exempt" checked={employee.stateExempt} onCheckedChange={(checked) => updateEmployee("stateExempt", Boolean(checked))} />
              <CheckField label="Social Security exempt" checked={employee.ssExempt} onCheckedChange={(checked) => updateEmployee("ssExempt", Boolean(checked))} />
              <CheckField label="Medicare exempt" checked={employee.medicareExempt} onCheckedChange={(checked) => updateEmployee("medicareExempt", Boolean(checked))} />
            </div>
            <Button type="button" className="mt-4" onClick={saveEmployee}><Save /> Save/Update Employee</Button>
          </Panel>

          <Panel icon={<Calculator className="h-5 w-5" />} title="Payroll Run Inputs">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Pay date" error={errorText("payDate")}><Input type="date" value={payroll.payDate} onChange={(event) => updatePayroll("payDate", event.target.value)} /></Field>
              <Field label="Pay period start" error={errorText("periodStart")}><Input type="date" value={payroll.periodStart} onChange={(event) => updatePayroll("periodStart", event.target.value)} /></Field>
              <Field label="Pay period end" error={errorText("periodEnd")}><Input type="date" value={payroll.periodEnd} onChange={(event) => updatePayroll("periodEnd", event.target.value)} /></Field>
              <Field label="Hourly rate" error={errorText("hourlyRate")}><Input type="number" min="0" step="0.01" value={payroll.hourlyRate} onChange={(event) => updatePayroll("hourlyRate", event.target.value)} /></Field>
              <Field label="Regular hours"><Input type="number" min="0" step="0.01" value={payroll.regularHours} onChange={(event) => updatePayroll("regularHours", event.target.value)} /></Field>
              <Field label="Overtime hours"><Input type="number" min="0" step="0.01" value={payroll.overtimeHours} onChange={(event) => updatePayroll("overtimeHours", event.target.value)} /></Field>
              <Field label="Overtime multiplier"><Input type="number" min="0" step="0.01" value={payroll.overtimeMultiplier} onChange={(event) => updatePayroll("overtimeMultiplier", event.target.value)} /></Field>
              <Field label="Pre-tax deductions ($)"><Input type="number" min="0" step="0.01" value={payroll.pretaxDeductions} onChange={(event) => updatePayroll("pretaxDeductions", event.target.value)} /></Field>
              <Field label="Post-tax deductions ($)"><Input type="number" min="0" step="0.01" value={payroll.posttaxDeductions} onChange={(event) => updatePayroll("posttaxDeductions", event.target.value)} /></Field>
              <Field label="Federal withholding base rate (%)"><Input type="number" min="0" step="0.01" value={payroll.federalRate} onChange={(event) => updatePayroll("federalRate", event.target.value)} /></Field>
              <Field label="State tax override rate (%)"><Input type="number" min="0" step="0.01" value={payroll.stateOverrideRate} onChange={(event) => updatePayroll("stateOverrideRate", event.target.value)} placeholder={formatPercent(stateRates[company.state])} /></Field>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" onClick={generateStub}><Calculator /> Generate Stub</Button>
              <Button type="button" variant="secondary" onClick={printStub}><Printer /> Print Stub</Button>
            </div>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start print:static">
          <PaystubPreview company={company} employee={employee} payroll={payroll} calculations={calculations} onPrint={printStub} />
        </aside>
      </section>
    </main>
  );
};

const Metric = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className="min-w-0 rounded-md bg-secondary px-3 py-2 text-center">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={strong ? "text-lg font-bold text-accent" : "text-sm font-bold text-foreground"}>{value}</p>
  </div>
);

const Panel = ({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) => (
  <section className="rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-glass">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground"><span className="text-accent">{icon}</span>{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Field = ({ label, children, error }: { label: string; children: ReactNode; error?: ReactNode }) => (
  <div>
    <Label className="mb-2 block text-sm font-semibold text-foreground">{label}</Label>
    {children}
    {error}
  </div>
);

const CheckField = ({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean | "indeterminate") => void }) => (
  <label className="flex items-center gap-3 rounded-md border border-border bg-secondary/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
    <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
    {label}
  </label>
);

const PaystubPreview = ({ company, employee, payroll, calculations, onPrint }: {
  company: CompanyProfile;
  employee: EmployeeProfile;
  payroll: PayrollRun;
  calculations: ReturnType<typeof calculatePaystub>;
  onPrint: () => void;
}) => (
  <div className="rounded-lg border border-border bg-card p-4 shadow-glass print:border-0 print:bg-background print:p-0 print:shadow-none">
    <div className="mb-4 flex items-center justify-between print:hidden">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Preview</p>
        <h2 className="text-xl font-bold text-card-foreground">Letter-size paystub</h2>
      </div>
      <Button type="button" onClick={onPrint}><Printer /> Print Stub</Button>
    </div>

    <article id="paystub-print" className="mx-auto min-h-[10.25in] w-full max-w-[8.5in] rounded-md border border-stub-line bg-stub p-5 font-mono text-sm text-stub-foreground shadow-sm print:min-h-0 print:max-w-none print:rounded-none print:border-stub-line print:p-6 print:shadow-none">
      <header className="border-b-2 border-stub-line pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold uppercase tracking-wide">{company.name || "Company Name"}</h2>
            <p>{company.address1 || "Address line 1"}</p>
            <p>{company.address2 || "City, State ZIP"}</p>
            <p>EIN / Tax ID: {company.ein || "—"}</p>
          </div>
          <div className="rounded border-2 border-stub-line px-4 py-3 text-center">
            <p className="text-xs font-bold uppercase tracking-widest">Non-Negotiable</p>
            <p className="mt-1 text-2xl font-bold">{formatMoney(calculations.netPay)}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 border-b border-stub-line py-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stub-muted">Employee</p>
          <p className="text-lg font-bold">{employee.name || "Employee Name"}</p>
          <p>ID: {employee.employeeId || "—"}</p>
          <p>Filing: {employee.filingStatus}</p>
          <p>Federal allowances/dependents: {employee.federalAllowances || "0"}</p>
          <p>State exemptions: {employee.stateExemptions || "0"}</p>
        </div>
        <div className="sm:text-right">
          <p><span className="font-bold">Pay date:</span> {payroll.payDate || "—"}</p>
          <p><span className="font-bold">Period:</span> {payroll.periodStart || "—"} to {payroll.periodEnd || "—"}</p>
          <p><span className="font-bold">State:</span> {company.state}</p>
          <p><span className="font-bold">Taxable wages:</span> {formatMoney(calculations.taxableWages)}</p>
        </div>
      </section>

      <section className="grid gap-5 py-4 lg:grid-cols-2 print:grid-cols-2">
        <StubTable title="Earnings" rows={[
          ["Regular", `${calculations.regularHours.toFixed(2)} hrs @ ${formatMoney(calculations.hourlyRate)}`, formatMoney(calculations.regularPay)],
          ["Overtime", `${calculations.overtimeHours.toFixed(2)} hrs @ ${formatMoney(calculations.overtimeRate)}`, formatMoney(calculations.overtimePay)],
        ]} />
        <StubTable title="Deductions / Withholding" rows={[
          ["Federal", formatPercent(calculations.federalBaseRate), formatMoney(calculations.federalWithholding)],
          ["State", formatPercent(calculations.stateRate), formatMoney(calculations.stateWithholding)],
          ["Social Security", "6.20%", formatMoney(calculations.socialSecurity)],
          ["Medicare", "1.45%", formatMoney(calculations.medicare)],
          ["Pre-tax deductions", "", formatMoney(calculations.pretaxDeductions)],
          ["Post-tax deductions", "", formatMoney(calculations.posttaxDeductions)],
        ]} />
      </section>

      <footer className="grid gap-3 border-t-2 border-stub-line pt-4 sm:grid-cols-3">
        <Summary label="Gross Pay" value={formatMoney(calculations.grossPay)} />
        <Summary label="Total Deductions" value={formatMoney(calculations.totalDeductions)} />
        <Summary label="Net Pay" value={formatMoney(calculations.netPay)} highlight />
      </footer>
      <p className="mt-5 border-t border-dashed border-stub-line pt-3 text-center text-xs font-bold uppercase tracking-[0.28em] text-stub-muted">Payroll earnings statement • Non-negotiable</p>
    </article>
  </div>
);

const StubTable = ({ title, rows }: { title: string; rows: string[][] }) => (
  <div>
    <h3 className="mb-2 border-b border-stub-line pb-1 text-base font-bold uppercase tracking-wide">{title}</h3>
    <table className="w-full border-collapse text-left text-xs">
      <thead>
        <tr className="border-b border-stub-line">
          <th className="py-2 font-bold">Item</th>
          <th className="py-2 font-bold">Rate/Qty</th>
          <th className="py-2 text-right font-bold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([item, rate, amount]) => (
          <tr key={item} className="border-b border-stub-line/70">
            <td className="py-2">{item}</td>
            <td className="py-2">{rate || "—"}</td>
            <td className="py-2 text-right font-bold">{amount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Summary = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
  <div className={highlight ? "rounded border-2 border-stub-line bg-stub-accent p-3" : "rounded border border-stub-line p-3"}>
    <p className="text-xs font-bold uppercase tracking-wide text-stub-muted">{label}</p>
    <p className="text-xl font-bold">{value}</p>
  </div>
);

export default Index;
