(function () {
  "use strict";

  var STORAGE_KEYS = {
    companies: "paystub.companies",
    employees: "paystub.employees",
  };

  var STATE_CONFIG = {
    IL: { label: "Illinois", defaultStateTaxRate: 4.95 },
    TX: { label: "Texas", defaultStateTaxRate: 0.0 },
  };

  var SOCIAL_SECURITY_RATE = 6.2;
  var MEDICARE_RATE = 1.45;

  var form = document.getElementById("paystub-form");
  var companySelect = document.getElementById("companySelect");
  var employeeSelect = document.getElementById("employeeSelect");

  var companies = loadData(STORAGE_KEYS.companies);
  var employees = loadData(STORAGE_KEYS.employees);

  seedDefaultOptions();
  bindEvents();
  setDefaultDates();
  hydrateSelects();
  generateStub();

  function bindEvents() {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      generateStub();
    });

    document.getElementById("saveCompanyBtn").addEventListener("click", saveCompany);
    document.getElementById("newCompanyBtn").addEventListener("click", clearCompanyForm);
    document.getElementById("saveEmployeeBtn").addEventListener("click", saveEmployee);
    document.getElementById("newEmployeeBtn").addEventListener("click", clearEmployeeForm);
    document.getElementById("printStubBtn").addEventListener("click", function () {
      generateStub();
      window.print();
    });

    companySelect.addEventListener("change", function () {
      var company = companies.find(function (c) {
        return c.id === companySelect.value;
      });
      if (company) applyCompany(company);
      generateStub();
    });

    employeeSelect.addEventListener("change", function () {
      var employee = employees.find(function (e) {
        return e.id === employeeSelect.value;
      });
      if (employee) applyEmployee(employee);
      generateStub();
    });

    document.getElementById("state").addEventListener("change", function () {
      generateStub();
    });
  }

  function seedDefaultOptions() {
    if (!companies.length) {
      companies.push({
        id: crypto.randomUUID(),
        name: "Sample Company LLC",
        address1: "123 Main St",
        address2: "Chicago, IL 60601",
        ein: "00-0000000",
        state: "IL",
      });
      saveData(STORAGE_KEYS.companies, companies);
    }
  }

  function setDefaultDates() {
    var today = new Date();
    var start = new Date(today);
    start.setDate(today.getDate() - 13);
    document.getElementById("payDate").value = toInputDate(today);
    document.getElementById("periodStart").value = toInputDate(start);
    document.getElementById("periodEnd").value = toInputDate(today);
  }

  function toInputDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function hydrateSelects() {
    renderSelect(companySelect, companies, "Select company");
    renderSelect(employeeSelect, employees, "Select employee");
    if (companies.length) {
      companySelect.value = companies[0].id;
      applyCompany(companies[0]);
    }
  }

  function renderSelect(selectEl, list, placeholder) {
    selectEl.innerHTML = "";
    var baseOption = document.createElement("option");
    baseOption.value = "";
    baseOption.textContent = placeholder;
    selectEl.appendChild(baseOption);

    list.forEach(function (record) {
      var option = document.createElement("option");
      option.value = record.id;
      option.textContent = record.name;
      selectEl.appendChild(option);
    });
  }

  function saveCompany() {
    var company = {
      id: companySelect.value || crypto.randomUUID(),
      name: valueOf("companyName"),
      address1: valueOf("companyAddress1"),
      address2: valueOf("companyAddress2"),
      ein: valueOf("companyEin"),
      state: valueOf("state"),
    };
    var existingIdx = companies.findIndex(function (c) {
      return c.id === company.id;
    });
    if (existingIdx >= 0) companies[existingIdx] = company;
    else companies.push(company);
    saveData(STORAGE_KEYS.companies, companies);
    hydrateSelects();
    companySelect.value = company.id;
    generateStub();
  }

  function clearCompanyForm() {
    companySelect.value = "";
    ["companyName", "companyAddress1", "companyAddress2", "companyEin"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("state").value = "IL";
    generateStub();
  }

  function applyCompany(company) {
    document.getElementById("companyName").value = company.name || "";
    document.getElementById("companyAddress1").value = company.address1 || "";
    document.getElementById("companyAddress2").value = company.address2 || "";
    document.getElementById("companyEin").value = company.ein || "";
    document.getElementById("state").value = company.state || "IL";
  }

  function saveEmployee() {
    var employee = {
      id: employeeSelect.value || crypto.randomUUID(),
      name: valueOf("employeeName"),
      employeeId: valueOf("employeeId"),
      federalFilingStatus: valueOf("federalFilingStatus"),
      federalAllowances: numberOf("federalAllowances"),
      stateExemptions: numberOf("stateExemptions"),
      isFederalExempt: valueOf("isFederalExempt"),
      isStateExempt: valueOf("isStateExempt"),
      isSocialSecurityExempt: valueOf("isSocialSecurityExempt"),
      isMedicareExempt: valueOf("isMedicareExempt"),
      additionalFederal: numberOf("additionalFederal"),
    };
    var existingIdx = employees.findIndex(function (e) {
      return e.id === employee.id;
    });
    if (existingIdx >= 0) employees[existingIdx] = employee;
    else employees.push(employee);
    saveData(STORAGE_KEYS.employees, employees);
    renderSelect(employeeSelect, employees, "Select employee");
    employeeSelect.value = employee.id;
    generateStub();
  }

  function clearEmployeeForm() {
    employeeSelect.value = "";
    [
      "employeeName",
      "employeeId",
      "hourlyRate",
      "regularHours",
      "overtimeHours",
      "pretaxDeductions",
      "postTaxDeductions",
      "stateTaxRateOverride",
      "additionalFederal",
    ].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.value = "";
    });
    document.getElementById("otMultiplier").value = "1.5";
    document.getElementById("federalTaxRate").value = "12";
    document.getElementById("federalAllowances").value = "0";
    document.getElementById("stateExemptions").value = "0";
    document.getElementById("federalFilingStatus").value = "single";
    document.getElementById("isFederalExempt").value = "no";
    document.getElementById("isStateExempt").value = "no";
    document.getElementById("isSocialSecurityExempt").value = "no";
    document.getElementById("isMedicareExempt").value = "no";
    generateStub();
  }

  function applyEmployee(employee) {
    document.getElementById("employeeName").value = employee.name || "";
    document.getElementById("employeeId").value = employee.employeeId || "";
    document.getElementById("federalFilingStatus").value = employee.federalFilingStatus || "single";
    document.getElementById("federalAllowances").value = String(employee.federalAllowances || 0);
    document.getElementById("stateExemptions").value = String(employee.stateExemptions || 0);
    document.getElementById("isFederalExempt").value = employee.isFederalExempt || "no";
    document.getElementById("isStateExempt").value = employee.isStateExempt || "no";
    document.getElementById("isSocialSecurityExempt").value = employee.isSocialSecurityExempt || "no";
    document.getElementById("isMedicareExempt").value = employee.isMedicareExempt || "no";
    document.getElementById("additionalFederal").value = String(employee.additionalFederal || 0);
  }

  function generateStub() {
    var stateCode = valueOf("state");
    var stateTaxConfig = STATE_CONFIG[stateCode] || STATE_CONFIG.IL;

    var hourlyRate = numberOf("hourlyRate");
    var regularHours = numberOf("regularHours");
    var overtimeHours = numberOf("overtimeHours");
    var otMultiplier = numberOf("otMultiplier", 1.5);
    var pretaxDeductions = numberOf("pretaxDeductions");
    var postTaxDeductions = numberOf("postTaxDeductions");
    var federalTaxRate = numberOf("federalTaxRate", 12);
    var stateTaxOverride = parseOptionalNumber("stateTaxRateOverride");

    var regularPay = regularHours * hourlyRate;
    var overtimeRate = hourlyRate * otMultiplier;
    var overtimePay = overtimeHours * overtimeRate;
    var grossPay = regularPay + overtimePay;
    var taxableWages = Math.max(0, grossPay - pretaxDeductions);

    var federalAllowanceAdjustment = numberOf("federalAllowances") * 20;
    var stateExemptionAdjustment = numberOf("stateExemptions") * 10;
    var additionalFederal = numberOf("additionalFederal");

    var federalExempt = valueOf("isFederalExempt") === "yes";
    var stateExempt = valueOf("isStateExempt") === "yes";
    var socialSecurityExempt = valueOf("isSocialSecurityExempt") === "yes";
    var medicareExempt = valueOf("isMedicareExempt") === "yes";

    var effectiveFederalTaxable = Math.max(0, taxableWages - federalAllowanceAdjustment);
    var federalWithholding = federalExempt
      ? 0
      : percentage(effectiveFederalTaxable, federalTaxRate) + additionalFederal;

    var stateRate = typeof stateTaxOverride === "number" ? stateTaxOverride : stateTaxConfig.defaultStateTaxRate;
    var effectiveStateTaxable = Math.max(0, taxableWages - stateExemptionAdjustment);
    var stateWithholding = stateExempt ? 0 : percentage(effectiveStateTaxable, stateRate);
    var socialSecurity = socialSecurityExempt ? 0 : percentage(taxableWages, SOCIAL_SECURITY_RATE);
    var medicare = medicareExempt ? 0 : percentage(taxableWages, MEDICARE_RATE);

    var deductionLines = [
      { label: "Federal Withholding", amount: federalWithholding },
      { label: stateTaxConfig.label + " State Tax", amount: stateWithholding },
      { label: "Social Security", amount: socialSecurity },
      { label: "Medicare", amount: medicare },
      { label: "Pre-tax Deductions", amount: pretaxDeductions },
      { label: "Post-tax Deductions", amount: postTaxDeductions },
    ];

    var totalDeductions = deductionLines.reduce(function (sum, line) {
      return sum + line.amount;
    }, 0);
    var netPay = Math.max(0, grossPay - totalDeductions);

    renderRows("earningsRows", [
      { desc: "Regular Pay", hours: regularHours, rate: hourlyRate, current: regularPay },
      { desc: "Overtime Pay", hours: overtimeHours, rate: overtimeRate, current: overtimePay },
    ]);

    renderDeductions("deductionRows", deductionLines);
    updateStubMeta({
      grossPay: grossPay,
      totalDeductions: totalDeductions,
      netPay: netPay,
      state: stateTaxConfig.label,
    });
  }

  function renderRows(targetId, lines) {
    var root = document.getElementById(targetId);
    root.innerHTML = "";
    lines.forEach(function (line) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        line.desc +
        "</td><td>" +
        formatNumber(line.hours) +
        "</td><td>" +
        formatCurrency(line.rate) +
        "</td><td>" +
        formatCurrency(line.current) +
        "</td>";
      root.appendChild(tr);
    });
  }

  function renderDeductions(targetId, lines) {
    var root = document.getElementById(targetId);
    root.innerHTML = "";
    lines.forEach(function (line) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + line.label + "</td><td>" + formatCurrency(line.amount) + "</td>";
      root.appendChild(tr);
    });
  }

  function updateStubMeta(data) {
    var filingMap = {
      single: "Single",
      married: "Married",
      head: "Head of household",
    };
    setText("stubCompanyName", valueOf("companyName") || "Company Name");
    setText("stubCompanyAddress1", valueOf("companyAddress1") || "Address line 1");
    setText("stubCompanyAddress2", valueOf("companyAddress2") || "Address line 2");
    setText("stubEin", "EIN: " + (valueOf("companyEin") || "--"));
    setText("stubEmployeeName", valueOf("employeeName") || "--");
    setText("stubEmployeeId", valueOf("employeeId") || "--");
    setText("stubFilingStatus", filingMap[valueOf("federalFilingStatus")] || "Single");
    setText("stubFederalAllowances", String(numberOf("federalAllowances")));
    setText("stubStateExemptions", String(numberOf("stateExemptions")));
    setText("stubFederalExempt", valueOf("isFederalExempt") === "yes" ? "Yes" : "No");
    setText("stubStateExempt", valueOf("isStateExempt") === "yes" ? "Yes" : "No");
    setText("stubPayDate", readableDate(valueOf("payDate")));
    setText(
      "stubPayPeriod",
      readableDate(valueOf("periodStart")) + " - " + readableDate(valueOf("periodEnd"))
    );
    setText("stubState", data.state);
    setText("stubGrossPay", formatCurrency(data.grossPay));
    setText("stubTotalDeductions", formatCurrency(data.totalDeductions));
    setText("stubNetPay", formatCurrency(data.netPay));
  }

  function readableDate(raw) {
    if (!raw) return "--";
    var date = new Date(raw + "T00:00:00");
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function percentage(base, rate) {
    return Math.max(0, base) * (Math.max(0, rate) / 100);
  }

  function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
    });
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function valueOf(id) {
    var input = document.getElementById(id);
    return input ? input.value.trim() : "";
  }

  function numberOf(id, fallback) {
    var input = document.getElementById(id);
    if (!input) return fallback || 0;
    var parsed = Number(input.value);
    if (Number.isFinite(parsed)) return parsed;
    return fallback || 0;
  }

  function parseOptionalNumber(id) {
    var input = document.getElementById(id);
    if (!input || input.value.trim() === "") return null;
    var value = Number(input.value);
    return Number.isFinite(value) ? value : null;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function loadData(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveData(key, payload) {
    localStorage.setItem(key, JSON.stringify(payload));
  }
})();
