(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Storage, constants, config
  // ---------------------------------------------------------------------------
  var STORAGE_KEYS = {
    companies: "paystub.companies",
    employees: "paystub.employees"
  };

  var STATE_CONFIG = {
    IL: { label: "Illinois", code: "IL", defaultStateTaxRate: 4.95 },
    TX: { label: "Texas",    code: "TX", defaultStateTaxRate: 0.0  }
  };

  var SOCIAL_SECURITY_RATE = 6.2;
  var MEDICARE_RATE        = 1.45;

  // Period length in days for each frequency (used as end - (days-1) = start).
  var FREQUENCY_DAYS = {
    weekly:       7,
    biweekly:     14,
    semimonthly:  15,
    monthly:      30,
    yearly:       365
  };

  var FREQUENCY_LABEL = {
    weekly:      "Weekly",
    biweekly:    "Bi-Weekly",
    semimonthly: "Semi-Monthly",
    monthly:     "Monthly",
    yearly:      "Yearly"
  };

  var FILING_ABBREV = {
    single:  "S",
    married: "M",
    head:    "H"
  };

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  var form           = document.getElementById("paystub-form");
  var companySelect  = document.getElementById("companySelect");
  var employeeSelect = document.getElementById("employeeSelect");

  var companies = loadData(STORAGE_KEYS.companies);
  var employees = loadData(STORAGE_KEYS.employees);

  seedDefaultOptions();
  bindEvents();
  setDefaultDates();
  hydrateSelects();
  generateStub();

  function bindEvents() {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
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
      var c = companies.find(function (x) { return x.id === companySelect.value; });
      if (c) applyCompany(c);
      generateStub();
    });

    employeeSelect.addEventListener("change", function () {
      var emp = employees.find(function (x) { return x.id === employeeSelect.value; });
      if (emp) applyEmployee(emp);
      generateStub();
    });

    // Any field change re-renders. Pay date/frequency also re-lock the period.
    ["payDate", "payFrequency"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        autoCalcPeriod();
        generateStub();
      });
    });

    document.getElementById("state").addEventListener("change", generateStub);

    // Live-update on any numeric/text input that drives the stub.
    form.addEventListener("input", function (e) {
      if (!e.target || !e.target.id) return;
      // Don't loop on the readonly period fields.
      if (e.target.id === "periodStart" || e.target.id === "periodEnd") return;
      generateStub();
    });
  }

  // ---------------------------------------------------------------------------
  // Pay period auto-calc (HARD LOCK)
  // ---------------------------------------------------------------------------
  // periodEnd = payDate - 2 days (2-day payroll lag, industry standard)
  // periodStart = periodEnd - (FREQUENCY_DAYS[freq] - 1)
  //
  // The period inputs are readonly in the DOM; this is the single source.
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

  // ---------------------------------------------------------------------------
  // Saved records
  // ---------------------------------------------------------------------------
  function seedDefaultOptions() {
    if (!companies.length) {
      companies.push({
        id: crypto.randomUUID(),
        name: "Sample Company LLC",
        address1: "123 Main St",
        address2: "Chicago, IL 60601",
        ein: "00-0000000",
        state: "IL"
      });
      saveData(STORAGE_KEYS.companies, companies);
    }
  }

  function hydrateSelects() {
    renderSelect(companySelect,  companies, "Select company");
    renderSelect(employeeSelect, employees, "Select employee");
    if (companies.length) {
      companySelect.value = companies[0].id;
      applyCompany(companies[0]);
    }
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

  function saveCompany() {
    var company = {
      id: companySelect.value || crypto.randomUUID(),
      name:     valueOf("companyName"),
      address1: valueOf("companyAddress1"),
      address2: valueOf("companyAddress2"),
      ein:      valueOf("companyEin"),
      state:    valueOf("state")
    };
    var idx = companies.findIndex(function (c) { return c.id === company.id; });
    if (idx >= 0) companies[idx] = company; else companies.push(company);
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

  function applyCompany(c) {
    document.getElementById("companyName").value     = c.name || "";
    document.getElementById("companyAddress1").value = c.address1 || "";
    document.getElementById("companyAddress2").value = c.address2 || "";
    document.getElementById("companyEin").value      = c.ein || "";
    document.getElementById("state").value           = c.state || "IL";
  }

  function saveEmployee() {
    var employee = {
      id: employeeSelect.value || crypto.randomUUID(),
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
      additionalFederal:      numberOf("additionalFederal")
    };
    var idx = employees.findIndex(function (e) { return e.id === employee.id; });
    if (idx >= 0) employees[idx] = employee; else employees.push(employee);
    saveData(STORAGE_KEYS.employees, employees);
    renderSelect(employeeSelect, employees, "Select employee");
    employeeSelect.value = employee.id;
    generateStub();
  }

  function clearEmployeeForm() {
    employeeSelect.value = "";
    [
      "employeeName", "employeeId",
      "employeeAddress1", "employeeAddress2", "ssnLast4",
      "hourlyRate", "regularHours", "overtimeHours",
      "pretaxDeductions", "postTaxDeductions",
      "stateTaxRateOverride", "additionalFederal",
      "ytdRegularPay", "ytdRegularHours",
      "ytdOvertimePay", "ytdOvertimeHours",
      "ytdFederal", "ytdState",
      "ytdSocialSecurity", "ytdMedicare",
      "ytdPretax", "ytdPosttax"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("otMultiplier").value         = "1.5";
    document.getElementById("federalTaxRate").value       = "12";
    document.getElementById("federalAllowances").value    = "0";
    document.getElementById("stateExemptions").value      = "0";
    document.getElementById("federalFilingStatus").value  = "single";
    document.getElementById("isFederalExempt").value      = "no";
    document.getElementById("isStateExempt").value        = "no";
    document.getElementById("isSocialSecurityExempt").value = "no";
    document.getElementById("isMedicareExempt").value     = "no";
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
  }

  // ---------------------------------------------------------------------------
  // Core calculation + render
  // ---------------------------------------------------------------------------
  function generateStub() {
    // --- calcs (unchanged business logic) ---
    var stateCode      = valueOf("state");
    var stateCfg       = STATE_CONFIG[stateCode] || STATE_CONFIG.IL;

    var hourlyRate     = numberOf("hourlyRate");
    var regularHours   = numberOf("regularHours");
    var overtimeHours  = numberOf("overtimeHours");
    var otMultiplier   = numberOf("otMultiplier", 1.5);
    var pretax         = numberOf("pretaxDeductions");
    var posttax        = numberOf("postTaxDeductions");
    var federalRate    = numberOf("federalTaxRate", 12);
    var stateOverride  = optionalNumber("stateTaxRateOverride");
    var additionalFed  = numberOf("additionalFederal");
    var fedAllow       = numberOf("federalAllowances");
    var stateExempt    = numberOf("stateExemptions");

    var regularPay     = regularHours  * hourlyRate;
    var overtimeRate   = hourlyRate    * otMultiplier;
    var overtimePay    = overtimeHours * overtimeRate;
    var grossPay       = regularPay + overtimePay;
    var taxableWages   = Math.max(0, grossPay - pretax);

    var fedExempt      = valueOf("isFederalExempt")        === "yes";
    var stExempt       = valueOf("isStateExempt")          === "yes";
    var ssExempt       = valueOf("isSocialSecurityExempt") === "yes";
    var mcExempt       = valueOf("isMedicareExempt")       === "yes";

    var fedAdj         = fedAllow * 20;
    var stateAdj       = stateExempt * 10;

    var fedTaxable     = Math.max(0, taxableWages - fedAdj);
    var federalWH      = fedExempt ? 0 : percentage(fedTaxable, federalRate) + additionalFed;

    var stateRate      = (stateOverride !== null) ? stateOverride : stateCfg.defaultStateTaxRate;
    var stTaxable      = Math.max(0, taxableWages - stateAdj);
    var stateWH        = stExempt ? 0 : percentage(stTaxable, stateRate);
    var socSec         = ssExempt ? 0 : percentage(taxableWages, SOCIAL_SECURITY_RATE);
    var medicare       = mcExempt ? 0 : percentage(taxableWages, MEDICARE_RATE);

    var totalDeductions = federalWH + stateWH + socSec + medicare + pretax + posttax;
    var netPay          = Math.max(0, grossPay - totalDeductions);
    var totalHours      = regularHours + overtimeHours;

    // --- YTD (user-entered; fall back to this period's values) ---
    var ytdRegHrs   = numberOrFallback("ytdRegularHours",  regularHours);
    var ytdRegPay   = numberOrFallback("ytdRegularPay",    regularPay);
    var ytdOtHrs    = numberOrFallback("ytdOvertimeHours", overtimeHours);
    var ytdOtPay    = numberOrFallback("ytdOvertimePay",   overtimePay);
    var ytdFederal  = numberOrFallback("ytdFederal",       federalWH);
    var ytdState    = numberOrFallback("ytdState",         stateWH);
    var ytdSocSec   = numberOrFallback("ytdSocialSecurity", socSec);
    var ytdMc       = numberOrFallback("ytdMedicare",      medicare);
    var ytdPretax   = numberOrFallback("ytdPretax",        pretax);
    var ytdPosttax  = numberOrFallback("ytdPosttax",       posttax);

    var ytdGross  = ytdRegPay + ytdOtPay;
    var ytdHours  = ytdRegHrs + ytdOtHrs;
    var ytdTotDed = ytdFederal + ytdState + ytdSocSec + ytdMc + ytdPretax + ytdPosttax;
    var ytdNet    = Math.max(0, ytdGross - ytdTotDed);

    // --- earnings rows ---
    var earningsLines = [];
    // Only show the "Hourly" row if there are regular hours/rate to display.
    if (hourlyRate > 0 || regularHours > 0 || ytdRegPay > 0) {
      earningsLines.push({
        desc:     "Hourly",
        hours:    regularHours,
        rate:     hourlyRate,
        current:  regularPay,
        ytdHours: ytdRegHrs,
        ytd:      ytdRegPay
      });
    }
    if (overtimeHours > 0 || overtimePay > 0 || ytdOtPay > 0) {
      earningsLines.push({
        desc:     "Overtime",
        hours:    overtimeHours,
        rate:     overtimeRate,
        current:  overtimePay,
        ytdHours: ytdOtHrs,
        ytd:      ytdOtPay
      });
    }
    if (earningsLines.length === 0) {
      // Always render at least one Hourly line for a clean look
      earningsLines.push({ desc: "Hourly", hours: 0, rate: 0, current: 0, ytdHours: 0, ytd: 0 });
    }
    renderEarnings("earningsRows", earningsLines);

    // --- withholdings rows (filing-status column populated for fed/state) ---
    var fedStatus   = FILING_ABBREV[valueOf("federalFilingStatus")] || "S";
    var fedStatusLabel   = fedStatus + " " + fedAllow;          // e.g. "S 0"
    var stateStatusLabel = stateExempt > 0 ? String(stateExempt) : "0 0";

    var whLines = [
      { label: "Social Security",                       filing: "",               amount: socSec,     ytd: ytdSocSec },
      { label: "Medicare",                              filing: "",               amount: medicare,   ytd: ytdMc     },
      { label: "Fed Income Tax",                        filing: fedStatusLabel,   amount: federalWH,  ytd: ytdFederal },
      { label: stateCfg.code + " Income Tax",           filing: stateStatusLabel, amount: stateWH,    ytd: ytdState   }
    ];
    if (pretax  > 0 || ytdPretax  > 0) whLines.push({ label: "Pre-tax Deductions",  filing: "", amount: pretax,  ytd: ytdPretax  });
    if (posttax > 0 || ytdPosttax > 0) whLines.push({ label: "Post-tax Deductions", filing: "", amount: posttax, ytd: ytdPosttax });

    renderWithholdings("deductionRows", whLines);

    // --- stub meta ---
    updateStubMeta({
      stateLabel:       stateCfg.label,
      stateCode:        stateCfg.code,
      grossPay:         grossPay,
      totalDeductions:  totalDeductions,
      netPay:           netPay,
      totalHours:       totalHours,
      ytdGross:         ytdGross,
      ytdTotDed:        ytdTotDed,
      ytdNet:           ytdNet,
      ytdHours:         ytdHours
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
    var filingMap = { single: "Single", married: "Married", head: "Head of household" };
    var freq      = valueOf("payFrequency");

    var companyName = (valueOf("companyName") || "Company Name").toUpperCase();
    setText("stubCompanyName",     companyName);
    setText("stubCompanyAddress1", (valueOf("companyAddress1") || "Address line 1").toUpperCase());
    setText("stubCompanyAddress2", (valueOf("companyAddress2") || "Address line 2").toUpperCase());
    setText("stubEin",             "EIN: " + (valueOf("companyEin") || "--"));
    setText("stubLoc",             "LOC: " + (d.stateCode || "--"));
    setText("stubEeDd",            "EE ID: " + (valueOf("employeeId") || "--") + " DD");

    // Upper mailing block (Paychex-style, ALL CAPS name + address)
    setText("stubEeNameUpper",  (valueOf("employeeName")     || "--").toUpperCase());
    setText("stubEeAddrUpper1", (valueOf("employeeAddress1") || "--").toUpperCase());
    setText("stubEeAddrUpper2", (valueOf("employeeAddress2") || "--").toUpperCase());

    // Personal & check info block (normal case)
    setText("stubEmployeeName",     valueOf("employeeName")     || "--");
    setText("stubEmployeeAddr1",    valueOf("employeeAddress1") || "--");
    setText("stubEmployeeAddr2",    valueOf("employeeAddress2") || "--");
    setText("stubEmployeeId",       valueOf("employeeId")       || "--");
    setText("stubSsn",              formatSsn(valueOf("ssnLast4")));
    setText("stubFilingStatus",     filingMap[valueOf("federalFilingStatus")] || "Single");
    setText("stubFederalAllowances", String(numberOf("federalAllowances")));
    setText("stubStateExemptions",   String(numberOf("stateExemptions")));
    setText("stubFederalExempt",     valueOf("isFederalExempt") === "yes" ? "Yes" : "No");
    setText("stubStateExempt",       valueOf("isStateExempt")   === "yes" ? "Yes" : "No");

    // Dates & frequency
    setText("stubPayDate",       readableDate(valueOf("payDate")));
    setText("stubPayPeriod",     readableDate(valueOf("periodStart")) + " to " + readableDate(valueOf("periodEnd")));
    setText("stubPayFrequency",  FREQUENCY_LABEL[freq] || "--");
    setText("stubState",         d.stateLabel);

    // Totals
    setText("stubGrossPay",            formatMoney(d.grossPay));
    setText("stubTotalDeductions",     formatMoney(d.totalDeductions));
    setText("stubNetPay",              formatMoney(d.netPay));
    setText("stubTotalHours",          formatHours(d.totalHours));
    setText("stubTotalHrsWorked",      formatHours(d.totalHours));
    setText("stubYtdGross",            formatMoney(d.ytdGross));
    setText("stubYtdTotalDeductions",  formatMoney(d.ytdTotDed));
    setText("stubYtdNet",              formatMoney(d.ytdNet));
    setText("stubYtdTotalHours",       formatHours(d.ytdHours));

    // Footer strip (subtle address echo)
    var co = valueOf("companyName") || "";
    var cityLine = valueOf("companyAddress2") || "";
    setText("stubFooter", co && cityLine ? (co + " \u2022 " + cityLine) : "\u00A0");
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function toInputDate(date) {
    // Local-time YYYY-MM-DD (avoids UTC off-by-one)
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // MM/DD/YY, locale-proof (hard-locked format).
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

  // Money — no currency symbol in cells; thousands sep + 2 decimals (stub style).
  function formatMoney(n) {
    var v = Number(n || 0);
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatHours(n) {
    return Number(n || 0).toFixed(4);
  }

  function formatRate(n) {
    return Number(n || 0).toFixed(2);
  }

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

  // Returns the input value if blank OR invalid; otherwise returns the fallback.
  // Used for YTD fields that should fall back to this period's value when blank.
  function numberOrFallback(id, fallback) {
    var el = document.getElementById(id);
    if (!el || el.value.trim() === "") return fallback || 0;
    var v = Number(el.value);
    return Number.isFinite(v) ? v : (fallback || 0);
  }

  function optionalNumber(id) {
    var el = document.getElementById(id);
    if (!el || el.value.trim() === "") return null;
    var v = Number(el.value);
    return Number.isFinite(v) ? v : null;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function loadData(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveData(key, payload) {
    localStorage.setItem(key, JSON.stringify(payload));
  }
})();
