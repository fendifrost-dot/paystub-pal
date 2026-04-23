(function () {
  "use strict";

  // ===========================================================================
  // Constants
  // ===========================================================================
  var STORAGE_KEYS = {
    companies:       "paystub.companies",
    employees:       "paystub.employees",
    stubs:           "paystub.stubs",
    activeCompanyId: "paystub.activeCompanyId"
  };

  // State tax rates are baked in. Only Illinois for now — add more here to expand.
  var STATE_CONFIG = {
    IL: { label: "Illinois", code: "IL", defaultStateTaxRate: 4.95 }
  };

  var SOCIAL_SECURITY_RATE = 6.2;
  var MEDICARE_RATE        = 1.45;

  // Social Security wage base — once YTD taxable wages hit this, SS withholding
  // stops for the rest of the calendar year. Update as SSA announces new caps.
  // Source: SSA annual Fact Sheet (October prior year).
  var SS_WAGE_BASE_BY_YEAR = {
    2024: 168600,
    2025: 176100,
    2026: 184500   // estimate; replace with official figure when announced
  };
  var SS_WAGE_BASE_FALLBACK = 184500;

  var FREQUENCY_DAYS = {
    weekly:      7,
    biweekly:    14,
    semimonthly: 15,
    monthly:     30,
    yearly:      365
  };

  var FREQUENCY_LABEL = {
    weekly:      "Weekly",
    biweekly:    "Bi-Weekly",
    semimonthly: "Semi-Monthly",
    monthly:     "Monthly",
    yearly:      "Yearly"
  };

  var FILING_ABBREV = { single: "S", married: "M", head: "H" };
  var FILING_LABEL  = { single: "Single", married: "Married", head: "Head of household" };

  var SEED_YTD_FIELDS = [
    "seedYtdHours", "seedYtdGross",
    "seedYtdFederal", "seedYtdState",
    "seedYtdSocialSecurity", "seedYtdMedicare",
    "seedYtdPretax", "seedYtdPosttax",
    "seedYtdNet"
  ];

  // ===========================================================================
  // State (in memory)
  // ===========================================================================
  var companies       = loadData(STORAGE_KEYS.companies);
  var employees       = loadData(STORAGE_KEYS.employees);
  var stubs           = loadData(STORAGE_KEYS.stubs);
  var activeCompanyId = loadString(STORAGE_KEYS.activeCompanyId);

  // Cached element references
  var form           = document.getElementById("paystub-form");
  var companySelect  = document.getElementById("companySelect");
  var employeeSelect = document.getElementById("employeeSelect");

  // ===========================================================================
  // Init
  // ===========================================================================
  migrateLegacyData();
  bindEvents();
  setDefaultDates();
  hydrateCompanySelect();
  hydrateEmployeeSelect();
  updateContext();
  generateStub();

  // ===========================================================================
  // Migrations
  // ===========================================================================
  //
  // Old shape: employees were a flat list with no companyId.
  // New shape: every employee belongs to a company. Assign orphans to the first
  // saved company so no data is lost.
  function migrateLegacyData() {
    if (!employees.length) return;
    var firstCompanyId = companies.length ? companies[0].id : null;

    var touched = false;
    employees.forEach(function (e) {
      if (!e.companyId) {
        e.companyId = firstCompanyId;
        touched = true;
      }
    });
    if (touched) saveData(STORAGE_KEYS.employees, employees);
  }

  // ===========================================================================
  // Event wiring
  // ===========================================================================
  function bindEvents() {
    // Prevent accidental form submission (e.g. pressing Enter in an input).
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      generateStub();
    });
    form.setAttribute("onsubmit", "return false;");

    // Company
    document.getElementById("saveCompanyBtn").addEventListener("click", saveCompany);
    document.getElementById("newCompanyBtn").addEventListener("click", newCompanyForm);
    document.getElementById("deleteCompanyBtn").addEventListener("click", deleteActiveCompany);
    companySelect.addEventListener("change", onCompanyChange);

    // Employee
    document.getElementById("saveEmployeeBtn").addEventListener("click", saveEmployee);
    document.getElementById("newEmployeeBtn").addEventListener("click", newEmployeeForm);
    document.getElementById("deleteEmployeeBtn").addEventListener("click", deleteActiveEmployee);
    employeeSelect.addEventListener("change", onEmployeeChange);

    // Pay period / state
    document.getElementById("payDate").addEventListener("change", function () {
      autoCalcPeriod(); generateStub();
    });
    document.getElementById("payFrequency").addEventListener("change", function () {
      autoCalcPeriod(); generateStub();
    });
    document.getElementById("state").addEventListener("change", generateStub);

    // Primary actions
    document.getElementById("saveStubBtn").addEventListener("click", saveStubToHistory);
    document.getElementById("generatePdfBtn").addEventListener("click", generatePDF);

    // Data backup
    document.getElementById("exportBtn").addEventListener("click", exportJSON);
    document.getElementById("importBtn").addEventListener("click", function () {
      document.getElementById("importFileInput").click();
    });
    document.getElementById("importFileInput").addEventListener("change", importJSON);

    // Live-update on any input (except readonly period fields)
    form.addEventListener("input", function (e) {
      if (!e.target || !e.target.id) return;
      if (e.target.id === "periodStart" || e.target.id === "periodEnd") return;
      generateStub();
    });
  }

  // ===========================================================================
  // Period auto-calc
  // ===========================================================================
  function autoCalcPeriod() {
    var raw  = valueOf("payDate");
    var freq = valueOf("payFrequency") || "biweekly";
    if (!raw) return;

    var payDate = new Date(raw + "T00:00:00");
    if (isNaN(payDate.getTime())) return;

    var end = new Date(payDate);
    end.setDate(end.getDate() - 2);

    var span = FREQUENCY_DAYS[freq] || FREQUENCY_DAYS.biweekly;
    var start = new Date(end);
    start.setDate(start.getDate() - (span - 1));

    document.getElementById("periodStart").value = toInputDate(start);
    document.getElementById("periodEnd").value   = toInputDate(end);
  }

  function setDefaultDates() {
    var today = new Date();
    document.getElementById("payDate").value = toInputDate(today);
    autoCalcPeriod();
  }

  // ===========================================================================
  // Company CRUD
  // ===========================================================================
  function hydrateCompanySelect() {
    renderSelect(companySelect, companies, "Select company");
    if (activeCompanyId && companies.find(function (c) { return c.id === activeCompanyId; })) {
      companySelect.value = activeCompanyId;
      applyCompany(getActiveCompany());
    } else if (companies.length) {
      activeCompanyId = companies[0].id;
      saveString(STORAGE_KEYS.activeCompanyId, activeCompanyId);
      companySelect.value = activeCompanyId;
      applyCompany(companies[0]);
    }
    refreshCompanyButtons();
    refreshEmptyState();
  }

  function refreshCompanyButtons() {
    document.getElementById("deleteCompanyBtn").hidden = !getActiveCompany();
  }

  function refreshEmptyState() {
    document.getElementById("emptyState").hidden = companies.length > 0;
  }

  function onCompanyChange() {
    activeCompanyId = companySelect.value || null;
    saveString(STORAGE_KEYS.activeCompanyId, activeCompanyId || "");
    var c = getActiveCompany();
    if (c) applyCompany(c); else clearCompanyFields();
    hydrateEmployeeSelect();  // employee list depends on active company
    updateContext();
    refreshCompanyButtons();
    generateStub();
  }

  function saveCompany() {
    try {
      if (!valueOf("companyName")) {
        flashButton("saveCompanyBtn", "Name required", true);
        return;
      }
      var company = {
        id:       companySelect.value || genId(),
        name:     valueOf("companyName"),
        address1: valueOf("companyAddress1"),
        address2: valueOf("companyAddress2"),
        ein:      valueOf("companyEin"),
        state:    valueOf("state"),
        website:  valueOf("companyWebsite")
      };
      var idx = companies.findIndex(function (c) { return c.id === company.id; });
      if (idx >= 0) companies[idx] = company; else companies.push(company);
      saveData(STORAGE_KEYS.companies, companies);

      activeCompanyId = company.id;
      saveString(STORAGE_KEYS.activeCompanyId, activeCompanyId);

      hydrateCompanySelect();
      companySelect.value = activeCompanyId;
      hydrateEmployeeSelect();
      updateContext();
      generateStub();
      flashButton("saveCompanyBtn", "Saved \u2713", false);
    } catch (err) {
      console.error("saveCompany failed:", err);
      flashButton("saveCompanyBtn", "Save failed", true);
    }
  }

  function newCompanyForm() {
    companySelect.value = "";
    activeCompanyId = null;
    saveString(STORAGE_KEYS.activeCompanyId, "");
    clearCompanyFields();
    hydrateEmployeeSelect();
    refreshCompanyButtons();
    updateContext();
    generateStub();
    document.getElementById("companyName").focus();
  }

  function deleteActiveCompany() {
    var c = getActiveCompany();
    if (!c) return;
    var empCount = employees.filter(function (e) { return e.companyId === c.id; }).length;
    var stubCount = stubs.filter(function (s) { return s.companyId === c.id; }).length;
    var msg = "Delete \"" + c.name + "\"?\n\n" +
              "This will also remove " + empCount + " employee(s) and " +
              stubCount + " saved stub(s) for this company.";
    if (!window.confirm(msg)) return;

    companies = companies.filter(function (x) { return x.id !== c.id; });
    employees = employees.filter(function (e) { return e.companyId !== c.id; });
    stubs     = stubs.filter(function (s) { return s.companyId !== c.id; });
    saveData(STORAGE_KEYS.companies, companies);
    saveData(STORAGE_KEYS.employees, employees);
    saveData(STORAGE_KEYS.stubs,     stubs);

    activeCompanyId = companies.length ? companies[0].id : null;
    saveString(STORAGE_KEYS.activeCompanyId, activeCompanyId || "");

    hydrateCompanySelect();
    hydrateEmployeeSelect();
    updateContext();
    generateStub();
  }

  function applyCompany(c) {
    document.getElementById("companyName").value     = c.name || "";
    document.getElementById("companyAddress1").value = c.address1 || "";
    document.getElementById("companyAddress2").value = c.address2 || "";
    document.getElementById("companyEin").value      = c.ein || "";
    document.getElementById("state").value           = c.state || "IL";
    document.getElementById("companyWebsite").value  = c.website || "";
  }

  function clearCompanyFields() {
    ["companyName", "companyAddress1", "companyAddress2", "companyEin", "companyWebsite"].forEach(function (id) {
      document.getElementById(id).value = "";
    });
    document.getElementById("state").value = "IL";
  }

  function getActiveCompany() {
    return companies.find(function (c) { return c.id === activeCompanyId; }) || null;
  }

  // ===========================================================================
  // Employee CRUD
  // ===========================================================================
  function hydrateEmployeeSelect() {
    var list = employees.filter(function (e) { return e.companyId === activeCompanyId; });
    renderSelect(employeeSelect, list, list.length ? "Select employee" : "(no employees yet)");
    if (list.length) {
      employeeSelect.value = list[0].id;
      applyEmployee(list[0]);
    } else {
      employeeSelect.value = "";
      clearEmployeeFields();
    }
    refreshEmployeeButtons();
    renderStubHistory();
  }

  function refreshEmployeeButtons() {
    var hasSelection = !!employeeSelect.value;
    document.getElementById("deleteEmployeeBtn").hidden = !hasSelection;
    // Disable save/new when no company is selected
    var disabled = !activeCompanyId;
    document.getElementById("saveEmployeeBtn").disabled = disabled;
    document.getElementById("newEmployeeBtn").disabled = disabled;
    document.getElementById("saveStubBtn").disabled = disabled || !hasSelection;
  }

  function onEmployeeChange() {
    var emp = getActiveEmployee();
    if (emp) applyEmployee(emp); else clearEmployeeFields();
    refreshEmployeeButtons();
    renderStubHistory();
    updateContext();
    generateStub();
  }

  function saveEmployee() {
    try {
      if (!activeCompanyId) {
        flashButton("saveEmployeeBtn", "Pick a company first", true);
        return;
      }
      if (!valueOf("employeeName")) {
        flashButton("saveEmployeeBtn", "Name required", true);
        return;
      }
      var existing = getActiveEmployee();
      var employee = {
        id:                     employeeSelect.value || genId(),
        companyId:              activeCompanyId,
        name:                   valueOf("employeeName"),
        employeeId:             valueOf("employeeId"),
        employeeAddress1:       valueOf("employeeAddress1"),
        employeeAddress2:       valueOf("employeeAddress2"),
        ssnLast4:               valueOf("ssnLast4"),
        federalFilingStatus:    valueOf("federalFilingStatus"),
        federalAllowances:      numberOf("federalAllowances"),
        stateExemptions:        numberOf("stateExemptions"),
        isFederalExempt:        valueOf("isFederalExempt"),
        isStateExempt:          valueOf("isStateExempt"),
        isSocialSecurityExempt: valueOf("isSocialSecurityExempt"),
        isMedicareExempt:       valueOf("isMedicareExempt"),
        additionalFederal:      numberOf("additionalFederal"),
        // Preserve existing YTD seed if no new values entered
        seedYtd: readSeedYtd(existing && existing.seedYtd)
      };
      var idx = employees.findIndex(function (e) { return e.id === employee.id; });
      if (idx >= 0) employees[idx] = employee; else employees.push(employee);
      saveData(STORAGE_KEYS.employees, employees);

      hydrateEmployeeSelect();
      employeeSelect.value = employee.id;
      applyEmployee(employee);
      refreshEmployeeButtons();
      updateContext();
      generateStub();
      flashButton("saveEmployeeBtn", "Saved \u2713", false);
    } catch (err) {
      console.error("saveEmployee failed:", err);
      flashButton("saveEmployeeBtn", "Save failed", true);
    }
  }

  function newEmployeeForm() {
    if (!activeCompanyId) return;
    employeeSelect.value = "";
    clearEmployeeFields();
    refreshEmployeeButtons();
    updateContext();
    generateStub();
    document.getElementById("employeeName").focus();
  }

  function deleteActiveEmployee() {
    var emp = getActiveEmployee();
    if (!emp) return;
    var n = stubs.filter(function (s) { return s.employeeId === emp.id; }).length;
    var msg = "Delete employee \"" + emp.name + "\"?\n\n" +
              "This will also remove " + n + " saved stub(s).";
    if (!window.confirm(msg)) return;

    employees = employees.filter(function (x) { return x.id !== emp.id; });
    stubs     = stubs.filter(function (s) { return s.employeeId !== emp.id; });
    saveData(STORAGE_KEYS.employees, employees);
    saveData(STORAGE_KEYS.stubs,     stubs);

    hydrateEmployeeSelect();
    updateContext();
    generateStub();
  }

  function applyEmployee(e) {
    document.getElementById("employeeName").value        = e.name || "";
    document.getElementById("employeeId").value          = e.employeeId || "";
    document.getElementById("employeeAddress1").value    = e.employeeAddress1 || "";
    document.getElementById("employeeAddress2").value    = e.employeeAddress2 || "";
    document.getElementById("ssnLast4").value            = e.ssnLast4 || "";
    document.getElementById("federalFilingStatus").value = e.federalFilingStatus || "single";
    document.getElementById("federalAllowances").value   = String(e.federalAllowances || 0);
    document.getElementById("stateExemptions").value     = String(e.stateExemptions || 0);
    document.getElementById("isFederalExempt").value        = e.isFederalExempt || "no";
    document.getElementById("isStateExempt").value          = e.isStateExempt || "no";
    document.getElementById("isSocialSecurityExempt").value = e.isSocialSecurityExempt || "no";
    document.getElementById("isMedicareExempt").value       = e.isMedicareExempt || "no";
    document.getElementById("additionalFederal").value      = String(e.additionalFederal || 0);
    applySeedYtd(e.seedYtd);
  }

  function clearEmployeeFields() {
    [
      "employeeName", "employeeId",
      "employeeAddress1", "employeeAddress2", "ssnLast4"
    ].forEach(function (id) { document.getElementById(id).value = ""; });
    document.getElementById("federalFilingStatus").value = "single";
    document.getElementById("federalAllowances").value = "0";
    document.getElementById("stateExemptions").value = "0";
    document.getElementById("additionalFederal").value = "0";
    document.getElementById("isFederalExempt").value = "no";
    document.getElementById("isStateExempt").value = "no";
    document.getElementById("isSocialSecurityExempt").value = "no";
    document.getElementById("isMedicareExempt").value = "no";
    applySeedYtd(null);
  }

  function getActiveEmployee() {
    return employees.find(function (e) {
      return e.id === employeeSelect.value && e.companyId === activeCompanyId;
    }) || null;
  }

  // ===========================================================================
  // Seed-YTD (one-time starting balance per employee)
  // ===========================================================================
  function readSeedYtd(existing) {
    var out = existing ? Object.assign({}, existing) : {};
    var anySet = false;
    SEED_YTD_FIELDS.forEach(function (id) {
      var raw = valueOf(id);
      var key = id.replace("seedYtd", "").toLowerCase();
      if (raw !== "") {
        out[key] = Number(raw) || 0;
        anySet = true;
      }
    });
    return anySet || existing ? out : null;
  }

  function applySeedYtd(seed) {
    SEED_YTD_FIELDS.forEach(function (id) {
      var key = id.replace("seedYtd", "").toLowerCase();
      var el = document.getElementById(id);
      if (!el) return;
      el.value = (seed && seed[key] != null) ? String(seed[key]) : "";
    });
  }

  // ===========================================================================
  // Core calculation + render
  // ===========================================================================
  function generateStub() {
    var stateCode = valueOf("state");
    var stateCfg  = STATE_CONFIG[stateCode] || STATE_CONFIG.IL;

    // This-period inputs
    var hourlyRate     = numberOf("hourlyRate");
    var regularHours   = numberOf("regularHours");
    var overtimeHours  = numberOf("overtimeHours");
    var otMultiplier   = numberOf("otMultiplier", 1.5);
    var pretax         = numberOf("pretaxDeductions");
    var posttax        = numberOf("postTaxDeductions");
    var federalRate    = numberOf("federalTaxRate", 12);
    var additionalFed  = numberOf("additionalFederal");
    var fedAllow       = numberOf("federalAllowances");
    var stExemptNum    = numberOf("stateExemptions");

    var fedExempt = valueOf("isFederalExempt")        === "yes";
    var stExempt  = valueOf("isStateExempt")          === "yes";
    var ssExempt  = valueOf("isSocialSecurityExempt") === "yes";
    var mcExempt  = valueOf("isMedicareExempt")       === "yes";

    // Year = the payDate's calendar year; fallback to current year if payDate missing/bad.
    var payDateStr = valueOf("payDate");
    var year       = yearFromInputDate(payDateStr) || (new Date()).getFullYear();

    // Roll up prior-year stubs EXCLUDING any stub that matches the current payDate.
    // This exclusion is what fixes the post-save double-count.
    var roll = rollupYtd(activeCompanyId, employeeSelect.value, year, payDateStr);

    // -- This period --
    var regularPay   = regularHours  * hourlyRate;
    var overtimeRate = hourlyRate    * otMultiplier;
    var overtimePay  = overtimeHours * overtimeRate;
    var grossPay     = regularPay + overtimePay;
    var taxableWages = Math.max(0, grossPay - pretax);

    var fedAdj     = fedAllow * 20;
    var stateAdj   = stExemptNum * 10;
    var fedTaxable = Math.max(0, taxableWages - fedAdj);
    var federalWH  = fedExempt ? 0 : percentage(fedTaxable, federalRate) + additionalFed;
    var stTaxable  = Math.max(0, taxableWages - stateAdj);
    var stateWH    = stExempt ? 0 : percentage(stTaxable, stateCfg.defaultStateTaxRate);

    // Social Security with wage-base cap.
    // YTD taxable wages for SS before this period = prior gross - prior pretax.
    var ssWageBase        = SS_WAGE_BASE_BY_YEAR[year] || SS_WAGE_BASE_FALLBACK;
    var ytdSsWagesBefore  = (roll.regularPay + roll.overtimePay) - roll.pretax;
    var ssCapRemaining    = Math.max(0, ssWageBase - Math.max(0, ytdSsWagesBefore));
    var ssTaxableThisRun  = Math.min(taxableWages, ssCapRemaining);
    var socSec            = ssExempt ? 0 : percentage(ssTaxableThisRun, SOCIAL_SECURITY_RATE);

    var medicare  = mcExempt ? 0 : percentage(taxableWages, MEDICARE_RATE);

    var totalDed = federalWH + stateWH + socSec + medicare + pretax + posttax;
    var netPay   = Math.max(0, grossPay - totalDed);
    var totalHrs = regularHours + overtimeHours;

    // YTD = rollup (seed + prior saved stubs, excluding current payDate) + this period.
    var ytd = {
      regularHours:  roll.regularHours  + regularHours,
      regularPay:    roll.regularPay    + regularPay,
      overtimeHours: roll.overtimeHours + overtimeHours,
      overtimePay:   roll.overtimePay   + overtimePay,
      federalWH:     roll.federalWH     + federalWH,
      stateWH:       roll.stateWH       + stateWH,
      socSec:        roll.socSec        + socSec,
      medicare:      roll.medicare      + medicare,
      pretax:        roll.pretax        + pretax,
      posttax:       roll.posttax       + posttax,
      netPay:        roll.netPay        + netPay
    };
    ytd.totalHours = ytd.regularHours + ytd.overtimeHours;
    ytd.grossPay   = ytd.regularPay + ytd.overtimePay;
    ytd.totalDed   = ytd.federalWH + ytd.stateWH + ytd.socSec + ytd.medicare + ytd.pretax + ytd.posttax;

    // Earnings rows
    var earningsLines = [];
    if (hourlyRate > 0 || regularHours > 0 || ytd.regularPay > 0) {
      earningsLines.push({
        desc: "Hourly",
        hours: regularHours, rate: hourlyRate, current: regularPay,
        ytdHours: ytd.regularHours, ytd: ytd.regularPay
      });
    }
    if (overtimeHours > 0 || overtimePay > 0 || ytd.overtimePay > 0) {
      earningsLines.push({
        desc: "Overtime",
        hours: overtimeHours, rate: overtimeRate, current: overtimePay,
        ytdHours: ytd.overtimeHours, ytd: ytd.overtimePay
      });
    }
    if (earningsLines.length === 0) {
      earningsLines.push({ desc: "Hourly", hours: 0, rate: 0, current: 0, ytdHours: 0, ytd: 0 });
    }
    renderEarnings("earningsRows", earningsLines);

    // Withholdings rows
    var fedStatusCode  = FILING_ABBREV[valueOf("federalFilingStatus")] || "S";
    var fedStatusLabel = fedStatusCode + " " + fedAllow;
    var stStatusLabel  = stExemptNum > 0 ? String(stExemptNum) : "0 0";

    var whLines = [
      { label: "Social Security",              filing: "",              amount: socSec,    ytd: ytd.socSec    },
      { label: "Medicare",                     filing: "",              amount: medicare,  ytd: ytd.medicare  },
      { label: "Fed Income Tax",               filing: fedStatusLabel,  amount: federalWH, ytd: ytd.federalWH },
      { label: stateCfg.code + " Income Tax",  filing: stStatusLabel,   amount: stateWH,   ytd: ytd.stateWH   }
    ];
    if (pretax  > 0 || ytd.pretax  > 0) whLines.push({ label: "Pre-tax Deductions",  filing: "", amount: pretax,  ytd: ytd.pretax  });
    if (posttax > 0 || ytd.posttax > 0) whLines.push({ label: "Post-tax Deductions", filing: "", amount: posttax, ytd: ytd.posttax });
    renderWithholdings("deductionRows", whLines);

    updateStubMeta({
      stateLabel: stateCfg.label, stateCode: stateCfg.code,
      grossPay: grossPay, totalDeductions: totalDed, netPay: netPay,
      totalHours: totalHrs,
      ytdGross: ytd.grossPay, ytdTotDed: ytd.totalDed, ytdNet: ytd.netPay, ytdHours: ytd.totalHours
    });
  }

  function renderEarnings(targetId, lines) {
    var root = document.getElementById(targetId);
    root.innerHTML = "";
    lines.forEach(function (line) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + esc(line.desc) + "</td>" +
        "<td class='num'>" + formatHours(line.hours) + "</td>" +
        "<td class='num'>" + formatRate(line.rate)   + "</td>" +
        "<td class='num'>" + formatMoney(line.current) + "</td>" +
        "<td class='num'>" + formatHours(line.ytdHours) + "</td>" +
        "<td class='num'>" + formatMoney(line.ytd)    + "</td>";
      root.appendChild(tr);
    });
  }

  function renderWithholdings(targetId, lines) {
    var root = document.getElementById(targetId);
    root.innerHTML = "";
    lines.forEach(function (line) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + esc(line.label) + "</td>" +
        "<td>" + esc(line.filing || "") + "</td>" +
        "<td class='num'>" + formatMoney(line.amount) + "</td>" +
        "<td class='num'>" + formatMoney(line.ytd)    + "</td>";
      root.appendChild(tr);
    });
  }

  function updateStubMeta(d) {
    var companyName = (valueOf("companyName") || "Company Name").toUpperCase();
    setText("stubCompanyName",     companyName);
    setText("stubCompanyAddress1", (valueOf("companyAddress1") || "Address line 1").toUpperCase());
    setText("stubCompanyAddress2", (valueOf("companyAddress2") || "Address line 2").toUpperCase());
    setText("stubEin",             "EIN: " + (valueOf("companyEin") || "--"));
    setText("stubLoc",             "LOC: " + (d.stateCode || "--"));
    setText("stubEeDd",            "EE ID: " + (valueOf("employeeId") || "--") + " DD");

    setText("stubEeNameUpper",  (valueOf("employeeName")     || "--").toUpperCase());
    setText("stubEeAddrUpper1", (valueOf("employeeAddress1") || "--").toUpperCase());
    setText("stubEeAddrUpper2", (valueOf("employeeAddress2") || "--").toUpperCase());

    setText("stubEmployeeName",      valueOf("employeeName")     || "--");
    setText("stubEmployeeAddr1",     valueOf("employeeAddress1") || "--");
    setText("stubEmployeeAddr2",     valueOf("employeeAddress2") || "--");
    setText("stubEmployeeId",        valueOf("employeeId")       || "--");
    setText("stubSsn",               formatSsn(valueOf("ssnLast4")));
    setText("stubFilingStatus",      FILING_LABEL[valueOf("federalFilingStatus")] || "Single");
    setText("stubFederalAllowances", String(numberOf("federalAllowances")));
    setText("stubStateExemptions",   String(numberOf("stateExemptions")));
    setText("stubFederalExempt",     valueOf("isFederalExempt") === "yes" ? "Yes" : "No");
    setText("stubStateExempt",       valueOf("isStateExempt")   === "yes" ? "Yes" : "No");

    setText("stubPayDate",       readableDate(valueOf("payDate")));
    setText("stubPayPeriod",     readableDate(valueOf("periodStart")) + " to " + readableDate(valueOf("periodEnd")));
    setText("stubPayFrequency",  FREQUENCY_LABEL[valueOf("payFrequency")] || "--");
    setText("stubState",         d.stateLabel);

    setText("stubGrossPay",            formatMoney(d.grossPay));
    setText("stubTotalDeductions",     formatMoney(d.totalDeductions));
    setText("stubNetPay",              formatMoney(d.netPay));
    setText("stubTotalHours",          formatHours(d.totalHours));
    setText("stubTotalHrsWorked",      formatHours(d.totalHours));
    setText("stubYtdGross",            formatMoney(d.ytdGross));
    setText("stubYtdTotalDeductions",  formatMoney(d.ytdTotDed));
    setText("stubYtdNet",              formatMoney(d.ytdNet));
    setText("stubYtdTotalHours",       formatHours(d.ytdHours));

    // Footer strip: Company • Address line 2 • website (all optional)
    var co       = valueOf("companyName") || "";
    var cityLine = valueOf("companyAddress2") || "";
    var web      = (valueOf("companyWebsite") || "").replace(/^https?:\/\//i, "");
    var footerParts = [co, cityLine, web].filter(function (p) { return p; });
    setText("stubFooter", footerParts.length ? footerParts.join(" \u2022 ") : "\u00A0");
  }

  // ===========================================================================
  // Stub history + YTD rollup
  // ===========================================================================
  // Sum YTD contributions from seed + all saved stubs for (company, employee, year),
  // EXCLUDING any stub whose payDate matches `excludePayDate`. This exclusion fixes
  // a double-count that occurred after saving: the saved stub landed in history,
  // then generateStub() added it AGAIN via the current-period fields. By excluding
  // the matching payDate here, generateStub can safely always add `current` on top.
  function rollupYtd(companyId, employeeId, year, excludePayDate) {
    var emp = employees.find(function (e) { return e.id === employeeId; });
    var seed = (emp && emp.seedYtd) ? emp.seedYtd : {};

    // Seed represents prior YTD carried forward (typically a mid-year hire's
    // previous-employer totals). The UX optimization here: the user only has to
    // enter ONE value — seed YTD hours — and everything else derives from the
    // employee's current rate + tax profile. Any field they explicitly fill
    // overrides the derived value.
    //
    // Precedence: explicit seed value (if entered) > derived (hours × rate × profile).
    var rate       = numberOf("hourlyRate");
    var fedRate    = numberOf("federalTaxRate", 12);
    var stateCfg   = STATE_CONFIG[valueOf("state")] || STATE_CONFIG.IL;
    var stRate     = stateCfg.defaultStateTaxRate;
    var ssBase     = SS_WAGE_BASE_BY_YEAR[year] || SS_WAGE_BASE_FALLBACK;

    var has = function (k) { return seed[k] != null && seed[k] !== ""; };
    var vf  = function (k) { return Number(seed[k] || 0); };

    var seedHours    = vf("hours");
    var seedGross    = has("gross")          ? vf("gross")          : seedHours * rate;
    var seedPretax   = vf("pretax");
    var seedPosttax  = vf("posttax");
    var seedTaxable  = Math.max(0, seedGross - seedPretax);
    var seedFederal  = has("federal")        ? vf("federal")        : percentage(seedTaxable, fedRate);
    var seedState    = has("state")          ? vf("state")          : percentage(seedTaxable, stRate);
    var seedSocSec   = has("socialsecurity") ? vf("socialsecurity") : percentage(Math.min(seedTaxable, ssBase), SOCIAL_SECURITY_RATE);
    var seedMedicare = has("medicare")       ? vf("medicare")       : percentage(seedTaxable, MEDICARE_RATE);
    var seedNet      = has("net")
      ? vf("net")
      : Math.max(0, seedGross - (seedFederal + seedState + seedSocSec + seedMedicare + seedPretax + seedPosttax));

    var acc = {
      regularHours:  seedHours,
      regularPay:    seedGross,
      overtimeHours: 0,
      overtimePay:   0,

      federalWH: seedFederal,
      stateWH:   seedState,
      socSec:    seedSocSec,
      medicare:  seedMedicare,
      pretax:    seedPretax,
      posttax:   seedPosttax,
      netPay:    seedNet
    };

    stubs.forEach(function (s) {
      if (s.companyId !== companyId) return;
      if (s.employeeId !== employeeId) return;
      if (yearFromInputDate(s.payDate) !== year) return;
      if (excludePayDate && s.payDate === excludePayDate) return;
      acc.regularHours  += num(s.regularHours);
      acc.regularPay    += num(s.regularPay);
      acc.overtimeHours += num(s.overtimeHours);
      acc.overtimePay   += num(s.overtimePay);
      acc.federalWH     += num(s.federalWH);
      acc.stateWH       += num(s.stateWH);
      acc.socSec        += num(s.socSec);
      acc.medicare      += num(s.medicare);
      acc.pretax        += num(s.pretax);
      acc.posttax       += num(s.posttax);
      acc.netPay        += num(s.netPay);
    });
    return acc;
  }

  function saveStubToHistory() {
    try {
      if (!activeCompanyId) { flashButton("saveStubBtn", "Pick a company", true); return; }
      if (!employeeSelect.value) { flashButton("saveStubBtn", "Pick an employee", true); return; }

      var stateCfg = STATE_CONFIG[valueOf("state")] || STATE_CONFIG.IL;
      var hourlyRate    = numberOf("hourlyRate");
      var regularHours  = numberOf("regularHours");
      var overtimeHours = numberOf("overtimeHours");
      var otMultiplier  = numberOf("otMultiplier", 1.5);
      var pretax        = numberOf("pretaxDeductions");
      var posttax       = numberOf("postTaxDeductions");
      var federalRate   = numberOf("federalTaxRate", 12);
      var additionalFed = numberOf("additionalFederal");
      var fedAllow      = numberOf("federalAllowances");
      var stExemptNum   = numberOf("stateExemptions");

      var regularPay   = regularHours * hourlyRate;
      var overtimeRate = hourlyRate * otMultiplier;
      var overtimePay  = overtimeHours * overtimeRate;
      var grossPay     = regularPay + overtimePay;
      var taxableWages = Math.max(0, grossPay - pretax);

      var fedExempt = valueOf("isFederalExempt")        === "yes";
      var stExempt  = valueOf("isStateExempt")          === "yes";
      var ssExempt  = valueOf("isSocialSecurityExempt") === "yes";
      var mcExempt  = valueOf("isMedicareExempt")       === "yes";

      var payDate = valueOf("payDate");
      if (!payDate) { flashButton("saveStubBtn", "Pay date required", true); return; }

      // Apply SS wage-base cap when persisting (same rule as generateStub).
      var year              = yearFromInputDate(payDate) || (new Date()).getFullYear();
      var rollForCap        = rollupYtd(activeCompanyId, employeeSelect.value, year, payDate);
      var ssWageBase        = SS_WAGE_BASE_BY_YEAR[year] || SS_WAGE_BASE_FALLBACK;
      var ytdSsWagesBefore  = (rollForCap.regularPay + rollForCap.overtimePay) - rollForCap.pretax;
      var ssCapRemaining    = Math.max(0, ssWageBase - Math.max(0, ytdSsWagesBefore));
      var ssTaxableThisRun  = Math.min(taxableWages, ssCapRemaining);

      var federalWH = fedExempt ? 0 : percentage(Math.max(0, taxableWages - fedAllow * 20), federalRate) + additionalFed;
      var stateWH   = stExempt  ? 0 : percentage(Math.max(0, taxableWages - stExemptNum * 10), stateCfg.defaultStateTaxRate);
      var socSec    = ssExempt  ? 0 : percentage(ssTaxableThisRun, SOCIAL_SECURITY_RATE);
      var medicare  = mcExempt  ? 0 : percentage(taxableWages, MEDICARE_RATE);
      var totalDed  = federalWH + stateWH + socSec + medicare + pretax + posttax;
      var netPay    = Math.max(0, grossPay - totalDed);

      // Idempotent: same company+employee+payDate replaces prior record.
      var existingIdx = stubs.findIndex(function (s) {
        return s.companyId === activeCompanyId &&
               s.employeeId === employeeSelect.value &&
               s.payDate === payDate;
      });

      var stub = {
        id:           existingIdx >= 0 ? stubs[existingIdx].id : genId(),
        companyId:    activeCompanyId,
        employeeId:   employeeSelect.value,
        payDate:      payDate,
        periodStart:  valueOf("periodStart"),
        periodEnd:    valueOf("periodEnd"),
        payFrequency: valueOf("payFrequency"),
        hourlyRate: hourlyRate, otMultiplier: otMultiplier,
        regularHours: regularHours, regularPay: regularPay,
        overtimeHours: overtimeHours, overtimePay: overtimePay,
        grossPay: grossPay, pretax: pretax, posttax: posttax,
        federalWH: federalWH, stateWH: stateWH, socSec: socSec, medicare: medicare,
        totalDeductions: totalDed, netPay: netPay,
        savedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) stubs[existingIdx] = stub; else stubs.push(stub);
      saveData(STORAGE_KEYS.stubs, stubs);
      renderStubHistory();
      generateStub();
      flashButton("saveStubBtn", existingIdx >= 0 ? "Updated \u2713" : "Saved \u2713", false);
    } catch (err) {
      console.error("saveStubToHistory failed:", err);
      flashButton("saveStubBtn", "Save failed", true);
    }
  }

  function renderStubHistory() {
    var root = document.getElementById("stubHistory");
    var yearLabel = document.getElementById("historyYearLabel");
    var year = yearFromInputDate(valueOf("payDate"));
    yearLabel.textContent = year ? String(year) : "";

    var list = stubs
      .filter(function (s) {
        return s.companyId === activeCompanyId &&
               s.employeeId === employeeSelect.value &&
               yearFromInputDate(s.payDate) === year;
      })
      .sort(function (a, b) { return b.payDate.localeCompare(a.payDate); });

    if (!list.length) {
      root.innerHTML = '<p class="empty-note">No saved stubs yet. Click <strong>Save stub to history</strong> after generating to start accumulating YTD.</p>';
      return;
    }

    root.innerHTML = "";
    list.forEach(function (s) {
      var row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML =
        '<span class="h-date">' + readableDate(s.payDate) + '</span>' +
        '<span class="h-amounts">Gross <strong>' + formatMoney(s.grossPay) +
        '</strong> &nbsp;&bull;&nbsp; Net <strong>' + formatMoney(s.netPay) + '</strong></span>' +
        '<button type="button" class="h-load" data-id="' + s.id + '">Load</button>' +
        '<button type="button" class="h-delete" data-id="' + s.id + '">Delete</button>';
      root.appendChild(row);
    });

    root.querySelectorAll(".h-load").forEach(function (btn) {
      btn.addEventListener("click", function () { loadStubFromHistory(btn.dataset.id); });
    });
    root.querySelectorAll(".h-delete").forEach(function (btn) {
      btn.addEventListener("click", function () { deleteStubFromHistory(btn.dataset.id); });
    });
  }

  function loadStubFromHistory(id) {
    var s = stubs.find(function (x) { return x.id === id; });
    if (!s) return;
    document.getElementById("payDate").value       = s.payDate || "";
    document.getElementById("periodStart").value   = s.periodStart || "";
    document.getElementById("periodEnd").value     = s.periodEnd || "";
    document.getElementById("payFrequency").value  = s.payFrequency || "biweekly";
    document.getElementById("hourlyRate").value    = String(s.hourlyRate || "");
    document.getElementById("regularHours").value  = String(s.regularHours || "");
    document.getElementById("overtimeHours").value = String(s.overtimeHours || "");
    document.getElementById("otMultiplier").value  = String(s.otMultiplier || 1.5);
    document.getElementById("pretaxDeductions").value  = String(s.pretax || 0);
    document.getElementById("postTaxDeductions").value = String(s.posttax || 0);
    generateStub();
  }

  function deleteStubFromHistory(id) {
    var s = stubs.find(function (x) { return x.id === id; });
    if (!s) return;
    if (!window.confirm("Delete the stub dated " + readableDate(s.payDate) + "?")) return;
    stubs = stubs.filter(function (x) { return x.id !== id; });
    saveData(STORAGE_KEYS.stubs, stubs);
    renderStubHistory();
    generateStub();
  }

  // ===========================================================================
  // Generate PDF (clean, no browser URL/timestamp)
  // ===========================================================================
  //
  // Uses html2pdf.js (loaded from CDN in index.html). Renders the on-screen
  // stub-paper element directly to PDF at US-Letter dimensions, then triggers
  // a download named by employee + pay date. Unlike window.print(), this
  // bypasses Chrome's auto-added page header/footer entirely.
  function generatePDF() {
    try {
      if (typeof html2pdf === "undefined") {
        flashButton("generatePdfBtn", "PDF library not ready", true);
        return;
      }
      if (!activeCompanyId) {
        flashButton("generatePdfBtn", "Pick a company", true);
        return;
      }
      if (!employeeSelect.value) {
        flashButton("generatePdfBtn", "Pick an employee", true);
        return;
      }

      // Ensure preview is up to date with current form state.
      generateStub();

      var stubEl = document.querySelector(".stub-paper");
      if (!stubEl) {
        flashButton("generatePdfBtn", "Stub not found", true);
        return;
      }

      // Strip screen-only styling (shadow, border, rounded corners) during render
      // so the output looks like a clean document page.
      stubEl.classList.add("pdf-rendering");

      var emp = getActiveEmployee();
      var safeName = (emp && emp.name ? emp.name : "employee")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      var payDate = valueOf("payDate") || toInputDate(new Date());
      var filename = "paystub-" + safeName + "-" + payDate + ".pdf";

      var opt = {
        margin:      [0.25, 0.25, 0.25, 0.25],
        filename:    filename,
        image:       { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF:       { unit: "in", format: "letter", orientation: "portrait" }
      };

      flashButton("generatePdfBtn", "Rendering\u2026", false);

      html2pdf().set(opt).from(stubEl).save()
        .then(function () {
          stubEl.classList.remove("pdf-rendering");
          flashButton("generatePdfBtn", "PDF saved \u2713", false);
        })
        .catch(function (err) {
          stubEl.classList.remove("pdf-rendering");
          console.error("PDF generation failed:", err);
          flashButton("generatePdfBtn", "PDF failed", true);
        });
    } catch (err) {
      console.error("generatePDF error:", err);
      flashButton("generatePdfBtn", "PDF failed", true);
    }
  }

  // ===========================================================================
  // Export / Import JSON
  // ===========================================================================
  function exportJSON() {
    var payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      companies: companies,
      employees: employees,
      stubs: stubs
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "paystub-pal-backup-" + toInputDate(new Date()) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    flashButton("exportBtn", "Exported \u2713", false);
  }

  function importJSON(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data || typeof data !== "object") throw new Error("Invalid JSON");

        var mode = window.confirm(
          "Import " +
          (Array.isArray(data.companies) ? data.companies.length : 0) + " companies, " +
          (Array.isArray(data.employees) ? data.employees.length : 0) + " employees, " +
          (Array.isArray(data.stubs) ? data.stubs.length : 0) + " stubs.\n\n" +
          "OK = Merge (keep existing, add/replace by ID)\n" +
          "Cancel = Abort"
        );
        if (!mode) return;

        if (Array.isArray(data.companies)) companies = mergeById(companies, data.companies);
        if (Array.isArray(data.employees)) employees = mergeById(employees, data.employees);
        if (Array.isArray(data.stubs))     stubs     = mergeById(stubs,     data.stubs);
        saveData(STORAGE_KEYS.companies, companies);
        saveData(STORAGE_KEYS.employees, employees);
        saveData(STORAGE_KEYS.stubs,     stubs);

        if (!activeCompanyId && companies.length) {
          activeCompanyId = companies[0].id;
          saveString(STORAGE_KEYS.activeCompanyId, activeCompanyId);
        }
        hydrateCompanySelect();
        hydrateEmployeeSelect();
        updateContext();
        generateStub();
        flashButton("importBtn", "Imported \u2713", false);
      } catch (err) {
        console.error("importJSON failed:", err);
        flashButton("importBtn", "Import failed", true);
        window.alert("Could not import that file. It should be a paystub-pal JSON export.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function mergeById(existing, incoming) {
    var byId = {};
    existing.forEach(function (x) { byId[x.id] = x; });
    incoming.forEach(function (x) { if (x && x.id) byId[x.id] = x; });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  // ===========================================================================
  // Context indicator
  // ===========================================================================
  function updateContext() {
    var c = getActiveCompany();
    var emp = getActiveEmployee();
    var line = document.getElementById("contextLine");
    var sub = document.getElementById("fsEmployeeSub");

    if (!c) {
      line.hidden = true;
      sub.textContent = "";
      return;
    }
    line.hidden = false;
    var parts = ["<strong>" + esc(c.name) + "</strong>"];
    if (emp) parts.push("<strong>" + esc(emp.name) + "</strong>");
    line.innerHTML = parts.join(" &rsaquo; ");
    sub.textContent = "under " + c.name;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================
  function genId() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function flashButton(id, text, isError) {
    var btn = document.getElementById(id);
    if (!btn) return;
    if (btn.dataset.flashOriginal == null) btn.dataset.flashOriginal = btn.textContent;
    btn.textContent = text;
    btn.classList.toggle("is-error",   !!isError);
    btn.classList.toggle("is-success", !isError);
    clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(function () {
      btn.textContent = btn.dataset.flashOriginal;
      btn.classList.remove("is-error", "is-success");
    }, 1600);
  }

  function toInputDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function yearFromInputDate(raw) {
    if (!raw) return null;
    var parts = String(raw).split("-");
    if (parts.length !== 3) return null;
    return Number(parts[0]) || null;
  }

  function readableDate(raw) {
    if (!raw) return "--";
    var parts = String(raw).split("-");
    if (parts.length !== 3) return "--";
    var yy = parts[0].slice(-2);
    return parts[1] + "/" + parts[2] + "/" + yy;
  }

  function percentage(base, rate) {
    return Math.max(0, base) * (Math.max(0, rate) / 100);
  }

  function formatMoney(n) {
    return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatHours(n) { return Number(n || 0).toFixed(4); }
  function formatRate(n)  { return Number(n || 0).toFixed(2); }

  function formatSsn(last4) {
    var digits = String(last4 || "").replace(/\D/g, "").slice(-4);
    if (digits.length < 4) digits = digits.padStart(4, "-");
    return "xxx-xx-" + digits;
  }

  function valueOf(id) {
    var el = document.getElementById(id);
    return el ? (el.value || "").trim() : "";
  }

  function numberOf(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback || 0;
    var v = Number(el.value);
    return Number.isFinite(v) ? v : (fallback || 0);
  }

  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderSelect(selectEl, list, placeholder) {
    selectEl.innerHTML = "";
    var base = document.createElement("option");
    base.value = "";
    base.textContent = placeholder;
    selectEl.appendChild(base);
    list.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      selectEl.appendChild(opt);
    });
  }

  function loadData(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function saveData(key, payload) {
    try { localStorage.setItem(key, JSON.stringify(payload)); }
    catch (err) { console.warn("localStorage write failed for " + key + ":", err); }
  }

  function loadString(key) {
    try { return localStorage.getItem(key) || ""; }
    catch (_) { return ""; }
  }

  function saveString(key, value) {
    try { localStorage.setItem(key, value || ""); }
    catch (err) { console.warn("localStorage write failed for " + key + ":", err); }
  }

})();
