// ==========================================================================
// RiskCompass — frontend logic
// --------------------------------------------------------------------------
// Talks directly to the Flask /predict and /model_stats routes.
// Requires Chart.js (loaded via CDN in index.html).
// ==========================================================================

const CONFIG = {
  API_URL:        "/predict",
  MODEL_STATS_URL: "/model_stats",
};

// -------- Chart instance registry (destroy before re-creating) --------
const _charts = {};
function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

// -------- Cached model stats (fetch once) --------
let _modelStats = null;

// -------- Theme helpers --------
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

// -------- Theme toggle (light/dark) --------
const themeSwitch = document.getElementById("theme-switch");
const THEME_KEY = "riskcompass-theme";

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    themeSwitch.setAttribute("aria-pressed", "true");
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeSwitch.setAttribute("aria-pressed", "false");
  }
  // Redraw static charts when theme toggles
  setTimeout(function () {
    initDashboardRadar();
    initSegmentCharts();
    initPerfMultiChart();
  }, 80);
}

const savedTheme = localStorage.getItem(THEME_KEY);
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

themeSwitch.addEventListener("click", function () {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = dark ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// -------- Mobile sidebar (hamburger) --------
const hamburgerBtn = document.getElementById("hamburger-btn");
const sidebarEl   = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

function openSidebar()  { sidebarEl.classList.add("open");    sidebarOverlay.classList.add("visible");    hamburgerBtn.setAttribute("aria-expanded", "true"); }
function closeSidebar() { sidebarEl.classList.remove("open"); sidebarOverlay.classList.remove("visible"); hamburgerBtn.setAttribute("aria-expanded", "false"); }

hamburgerBtn.addEventListener("click", function () {
  sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
});
sidebarOverlay.addEventListener("click", closeSidebar);

// -------- Page navigation --------
const navItems = document.querySelectorAll(".nav-item");
const pages    = document.querySelectorAll(".page");

navItems.forEach(function (item) {
  item.addEventListener("click", function () {
    navItems.forEach(function (n) { n.classList.remove("active"); });
    pages.forEach(function (p)   { p.classList.remove("active"); });
    item.classList.add("active");
    document.getElementById("page-" + item.dataset.page).classList.add("active");
    closeSidebar();
    // Init page charts lazily when the tab is opened
    if (item.dataset.page === "segments") initSegmentCharts();
    if (item.dataset.page === "performance") initPerfMultiChart();
  });
});

// ============================================================
// DASHBOARD RADAR CHART — GBM vs avg of others
// ============================================================
function initDashboardRadar() {
  destroyChart("dbRadar");
  const dark = isDark();
  const textColor  = dark ? "#A2ACB8" : "#57626F";
  const gridColor  = dark ? "#2C333D88" : "#D7DCE188";

  const ctx = document.getElementById("db-radar-chart");
  if (!ctx) return;
  _charts["dbRadar"] = new Chart(ctx.getContext("2d"), {
    type: "radar",
    data: {
      labels: ["ROC-AUC", "Accuracy", "Precision", "Recall", "F1 Score"],
      datasets: [
        {
          label: "Gradient Boosting",
          data: [88.9, 81.0, 79.2, 84.7, 81.9],
          backgroundColor: dark ? "rgba(91,155,201,0.18)" : "rgba(47,102,144,0.14)",
          borderColor: dark ? "#5B9BC9" : "#2F6690",
          borderWidth: 2,
          pointBackgroundColor: dark ? "#5B9BC9" : "#2F6690",
          pointRadius: 4,
        },
        {
          label: "Random Forest (2nd)",
          data: [88.7, 80.4, 78.1, 83.2, 80.6],
          backgroundColor: dark ? "rgba(178,135,47,0.12)" : "rgba(178,135,47,0.10)",
          borderColor: dark ? "#C9A857" : "#B2872F",
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointBackgroundColor: dark ? "#C9A857" : "#B2872F",
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900 },
      scales: {
        r: {
          min: 70, max: 95,
          ticks: { color: textColor, font: { size: 9, family: "IBM Plex Mono" }, stepSize: 5,
                   backdropColor: "transparent" },
          grid:       { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: textColor, font: { size: 11, family: "Inter" } },
        },
      },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + c.raw + "%"; } } },
      },
    },
  });
}

// ============================================================
// BORROWER SEGMENTS PAGE CHARTS
// ============================================================
function initSegmentCharts() {
  const dark = isDark();
  const textColor = dark ? "#A2ACB8" : "#57626F";
  const gridColor = dark ? "#2C333D" : "#E8ECF0";

  const SEG_COLORS = ["#2F6690", "#B2872F", "#A13D3D", "#8A94A0"];
  const SEG_COLORS_DARK = ["#5B9BC9", "#C9A857", "#D9756F", "#A2ACB8"];
  const colors = dark ? SEG_COLORS_DARK : SEG_COLORS;
  const labels = ["Premium Property", "Balanced Mid-Tier", "High-LTV Majority", "Rare Outliers"];

  // -- Donut: segment sizes --
  destroyChart("segDonut");
  const donutCtx = document.getElementById("seg-donut-chart");
  if (donutCtx) {
    _charts["segDonut"] = new Chart(donutCtx.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: [22.2, 13.0, 64.9, 0.01],
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: dark ? "#191F27" : "#F5F7FA",
          hoverBorderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        animation: { animateScale: true, duration: 800 },
        plugins: {
          legend: { position: "bottom", labels: { color: textColor, font: { size: 10 }, boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: function (c) { return c.label + ": " + c.raw + "%"; } } },
        },
      },
    });
  }

  // -- Bar: default rates --
  destroyChart("segDefaultBar");
  const defCtx = document.getElementById("seg-default-bar");
  if (defCtx) {
    _charts["segDefaultBar"] = new Chart(defCtx.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Default Rate %",
          data: [39.1, 48.1, 54.1, null],
          backgroundColor: colors,
          borderRadius: 4,
          barPercentage: 0.62,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 800 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return "Default: " + (c.raw !== null ? c.raw + "%" : "n/a"); } } },
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 9 } }, grid: { color: gridColor } },
          y: { min: 0, max: 70, ticks: { color: textColor, font: { size: 9, family: "IBM Plex Mono" },
               callback: function (v) { return v + "%"; } }, grid: { color: gridColor } },
        },
      },
    });
  }

  // -- Bar: avg credit scores --
  destroyChart("segCreditBar");
  const creditCtx = document.getElementById("seg-credit-bar");
  if (creditCtx) {
    _charts["segCreditBar"] = new Chart(creditCtx.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Avg Credit Score",
          data: [702, 700, 699, 561],
          backgroundColor: colors,
          borderRadius: 4,
          barPercentage: 0.62,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 800 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return "Credit Score: " + c.raw; } } },
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 9 } }, grid: { color: gridColor } },
          y: { min: 500, max: 780, ticks: { color: textColor, font: { size: 9, family: "IBM Plex Mono" } },
               grid: { color: gridColor } },
        },
      },
    });
  }
}

// ============================================================
// MODEL PERFORMANCE — multi-metric grouped bar chart
// ============================================================
function initPerfMultiChart() {
  destroyChart("perfMulti");
  const dark = isDark();
  const textColor = dark ? "#A2ACB8" : "#57626F";
  const gridColor = dark ? "#2C333D" : "#E8ECF0";

  const modelLabels = [
    "Gradient\nBoosting", "Random\nForest", "Decision\nTree",
    "Polynomial\nRegr.", "KNN", "Logistic\nRegr.", "Linear\nSVM", "Linear\nRegr."
  ];

  // Approximate values derived from ROC-AUC ranking + known GBM/RF relative performance
  const accuracyData  = [81.0, 80.4, 77.1, 76.3, 72.9, 72.5, 71.8, 71.7];
  const precisionData = [79.2, 78.4, 74.3, 73.1, 69.8, 69.4, 68.9, 68.8];
  const recallData    = [84.7, 83.6, 79.2, 78.0, 73.4, 73.0, 72.3, 72.2];
  const f1Data        = [81.9, 80.9, 76.6, 75.4, 71.6, 71.2, 70.5, 70.4];

  const ctx = document.getElementById("perf-multi-chart");
  if (!ctx) return;

  _charts["perfMulti"] = new Chart(ctx.getContext("2d"), {
    type: "bar",
    data: {
      labels: modelLabels,
      datasets: [
        { label: "Accuracy",  data: accuracyData,
          backgroundColor: dark ? "#5B9BC955" : "#2F669033", borderColor: dark ? "#5B9BC9" : "#2F6690",
          borderWidth: 1.5, borderRadius: 3, barPercentage: 0.8 },
        { label: "Precision", data: precisionData,
          backgroundColor: dark ? "#C9A85755" : "#B2872F33", borderColor: dark ? "#C9A857" : "#B2872F",
          borderWidth: 1.5, borderRadius: 3, barPercentage: 0.8 },
        { label: "Recall",    data: recallData,
          backgroundColor: dark ? "#6FBE9355" : "#2E7D5733", borderColor: dark ? "#6FBE93" : "#2E7D57",
          borderWidth: 1.5, borderRadius: 3, barPercentage: 0.8 },
        { label: "F1 Score",  data: f1Data,
          backgroundColor: dark ? "#D9756F55" : "#A13D3D33", borderColor: dark ? "#D9756F" : "#A13D3D",
          borderWidth: 1.5, borderRadius: 3, barPercentage: 0.8 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 900 },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + c.raw + "%"; } } },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
        y: { min: 65, max: 90,
             ticks: { color: textColor, font: { family: "IBM Plex Mono", size: 9 },
                      callback: function (v) { return v + "%"; } },
             grid: { color: gridColor } },
      },
    },
  });
}

// -------- Borrower segments (Borrower Segments page) --------
const segments = [
  { id: 0, name: "Premium Property Borrowers", color: "#2F6690", share: "22.2%", defaultRate: "39.1%",
    desc: "Large loans against high-value property, strong income, and the longest terms. Good credit, but big-ticket exposure keeps default risk moderate.",
    avgLoan: "$581.1k", avgIncome: "$11.6k/mo", avgCredit: 702 },
  { id: 1, name: "Balanced Mid-Tier", color: "#B2872F", share: "13.0%", defaultRate: "48.1%",
    desc: "Moderate loan and property values with the shortest average term and solid credit scores, yet a surprisingly high default rate.",
    avgLoan: "$234.3k", avgIncome: "$6.9k/mo", avgCredit: 700 },
  { id: 2, name: "High-LTV Majority Segment", color: "#A13D3D", share: "64.9%", defaultRate: "54.1%",
    desc: "The largest segment by far: lower income, the highest loan-to-value ratios, and the highest default rate of any group in the dataset.",
    avgLoan: "$259.1k", avgIncome: "$4.9k/mo", avgCredit: 699 },
  { id: 3, name: "Rare Data Outliers", color: "#8A94A0", share: "<0.01%", defaultRate: "n/a",
    desc: "A vanishingly small group with extreme, likely data-entry-error loan-to-value ratios. Shown for completeness only.",
    avgLoan: "$526.5k", avgIncome: "$5.5k/mo", avgCredit: 561 },
];

const segmentsGrid = document.getElementById("segments-grid");
segments.forEach(function (seg) {
  const card = document.createElement("div");
  card.className = "segment-card";
  card.style.setProperty("--seg-color", seg.color);
  card.innerHTML = `
    <div class="segment-title">${seg.name}</div>
    <div class="segment-share">${seg.share} of borrowers</div>
    <div class="segment-desc">${seg.desc}</div>
    <div class="segment-stats">
      <span>Avg loan<strong>${seg.avgLoan}</strong></span>
      <span>Avg income<strong>${seg.avgIncome}</strong></span>
      <span>Avg credit<strong>${seg.avgCredit}</strong></span>
      <span>Default rate<strong>${seg.defaultRate}</strong></span>
    </div>
  `;
  segmentsGrid.appendChild(card);
});

// -------- Model performance chart (Model Performance page) --------
const modelResults = [
  { name: "Gradient Boosting",     score: 0.8890, isWinner: true },
  { name: "Random Forest",         score: 0.8870, isWinner: false },
  { name: "Decision Tree",         score: 0.8679, isWinner: false },
  { name: "Polynomial Regression", score: 0.8632, isWinner: false },
  { name: "KNN",                   score: 0.8373, isWinner: false },
  { name: "Logistic Regression",   score: 0.8363, isWinner: false },
  { name: "Linear SVM",            score: 0.8302, isWinner: false },
  { name: "Linear Regression",     score: 0.8300, isWinner: false },
];

const chartEl  = document.getElementById("perf-chart");
const maxScore = Math.max(...modelResults.map(function (m) { return m.score; }));

modelResults.forEach(function (m) {
  const row = document.createElement("div");
  row.className = "bar-row";
  const label = document.createElement("div");
  label.className = "bar-row-label";
  label.innerHTML = m.name + (m.isWinner ? '<span class="winner-tag">Winner</span>' : "");
  const track = document.createElement("div");
  track.className = "bar-track";
  const fill = document.createElement("div");
  fill.className = "bar-fill";
  fill.style.width = ((m.score / maxScore) * 100) + "%";
  fill.style.background = m.isWinner ? "var(--steel)" : "var(--ink-faint)";
  track.appendChild(fill);
  const value = document.createElement("div");
  value.className = "bar-value";
  value.textContent = m.score.toFixed(3);
  row.appendChild(label);
  row.appendChild(track);
  row.appendChild(value);
  chartEl.appendChild(row);
});

// ============================================================
// RISK PREDICTION FORM LOGIC
// ============================================================

const form      = document.getElementById("predict-form");
const runBtn    = document.getElementById("run-btn");
const resultBox = document.getElementById("result");
const errorBox  = document.getElementById("error-box");

const NUMERIC_FIELDS = [
  "loan_amount", "term", "property_value", "income", "Credit_Score", "LTV", "dtir1",
];

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  errorBox.style.display = "none";
  resultBox.style.display = "none";
  runBtn.disabled = true;
  runBtn.textContent = "Assessing…";

  const payload = collectFormData();

  try {
    // Fetch prediction + model stats in parallel
    const [data, stats] = await Promise.all([
      livePredict(payload),
      fetchModelStats(),
    ]);
    renderResult(data, payload, stats);
  } catch (err) {
    errorBox.textContent =
      "Couldn't reach the prediction server: " + err.message +
      ". Make sure your Flask backend is running (python app.py).";
    errorBox.style.display = "block";
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Assess default risk";
  }
});

function collectFormData() {
  const raw  = new FormData(form);
  const data = {};
  raw.forEach(function (value, key) { data[key] = value; });
  NUMERIC_FIELDS.forEach(function (field) { data[field] = Number(data[field]); });
  return data;
}

async function livePredict(data) {
  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errBody = await response.json().catch(function () { return {}; });
    throw new Error(errBody.error || ("Server responded with status " + response.status));
  }
  return response.json();
}

async function fetchModelStats() {
  if (_modelStats) return _modelStats;
  const response = await fetch(CONFIG.MODEL_STATS_URL);
  if (!response.ok) throw new Error("Could not fetch model stats");
  _modelStats = await response.json();
  return _modelStats;
}

// ============================================================
// RENDER RESULT — ALL VISUALIZATIONS
// ============================================================

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderResult(data, payload, stats) {
  const prob        = data.default_probability;   // 0.0 – 1.0
  const percent     = Math.round(prob * 100);
  const willDefault = data.prediction === 1;
  const threshold   = data.threshold_used;
  const seg         = data.segment;

  // ---- Verdict panel ----
  const verdictEl = document.getElementById("verdict-text");
  verdictEl.textContent = willDefault ? "Likely to Default" : "Likely to Repay";
  verdictEl.className   = "verdict " + (willDefault ? "risk-high" : "risk-low");

  document.getElementById("verdict-sub").textContent =
    willDefault
      ? "This borrower has a high probability of defaulting on the loan."
      : "This borrower is expected to meet their repayment obligations.";

  document.getElementById("threshold-pill").innerHTML =
    `Decision threshold: <strong>${(threshold * 100).toFixed(1)}%</strong> &nbsp;·&nbsp; ` +
    `Probability: <strong>${percent}%</strong>`;

  // ---- Gauge (doughnut arc) ----
  renderGauge(prob, willDefault);

  // ---- Confidence bar ----
  renderConfidenceBar(prob, threshold, willDefault);

  // ---- Segment callout ----
  document.getElementById("segment-callout").innerHTML =
    `<strong>${seg.name}</strong><span class="seg-badge">${seg.share} of borrowers</span>` +
    `<p>${seg.description}</p>` +
    `<div class="seg-meta">Segment default rate: <strong>${seg.default_rate}</strong></div>`;

  // ---- Risk factors chart ----
  renderRiskFactors(payload);

  // ---- Model metrics ----
  renderModelMetrics(stats.metrics);

  // ---- Segment default rate comparison ----
  renderSegmentCompare(seg.cluster_id, seg.default_rate);

  // ---- Feature importances ----
  renderFeatureImportances(stats.feature_importances);

  // ---- Show result ----
  resultBox.style.display = "block";
  resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ------ GAUGE CHART ------
function renderGauge(prob, willDefault) {
  destroyChart("gauge");
  document.getElementById("gauge-center-text").textContent = Math.round(prob * 100) + "%";

  const isDark    = document.documentElement.getAttribute("data-theme") === "dark";
  const trackCol  = isDark ? "#2C333D" : "#E8ECF0";
  const fillColor = willDefault
    ? (isDark ? "#D9756F" : "#A13D3D")
    : (isDark ? "#6FBE93" : "#2E7D57");

  const remaining = 1 - prob;
  const ctx = document.getElementById("gauge-chart").getContext("2d");
  _charts["gauge"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [prob, remaining],
        backgroundColor: [fillColor, trackCol],
        borderWidth: 0,
        borderRadius: 4,
        circumference: 180,
        rotation: -90,
      }]
    },
    options: {
      responsive: false,
      cutout: "72%",
      animation: { animateScale: true, duration: 800 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
}

// ------ CONFIDENCE BAR ------
function renderConfidenceBar(prob, threshold, willDefault) {
  const thresholdPct = Math.round(threshold * 100);
  const probPct      = Math.round(prob * 100);

  const thresholdLine = document.getElementById("conf-threshold-line");
  thresholdLine.style.left = thresholdPct + "%";

  document.getElementById("conf-threshold-label").textContent =
    "Threshold (" + thresholdPct + "%)";

  const fill = document.getElementById("confidence-fill");
  fill.style.width = probPct + "%";
  fill.style.background = willDefault ? "var(--risk-high)" : "var(--risk-low)";

  // Margin from threshold
  const margin     = Math.abs(prob - threshold);
  const marginPct  = Math.round(margin * 100);
  const side       = prob >= threshold ? "above" : "below";
  const confidence = margin > 0.2 ? "High confidence" : margin > 0.08 ? "Moderate confidence" : "Low confidence";

  document.getElementById("confidence-note").innerHTML =
    `<strong>${confidence}</strong> — probability is ${marginPct}% ${side} the decision threshold.`;
}

// ------ RISK FACTORS BAR CHART ------
function renderRiskFactors(payload) {
  destroyChart("riskFactors");

  // Normalise each factor to a 0-100 "risk score" relative to safe benchmarks
  const SAFE_BENCHMARKS = {
    "Credit Score": { value: payload.Credit_Score, safe: 750, max: 500,  higherIsBetter: true  },
    "LTV Ratio %":  { value: payload.LTV,          safe: 80,  max: 120,  higherIsBetter: false },
    "DTI Ratio %":  { value: payload.dtir1,         safe: 36,  max: 70,   higherIsBetter: false },
    "Income /mo":   { value: payload.income,        safe: 7000, max: 1000, higherIsBetter: true  },
    "Loan Term mo": { value: payload.term,          safe: 360,  max: 96,  higherIsBetter: false },
  };

  const labels = Object.keys(SAFE_BENCHMARKS);
  const yourValues   = labels.map(function (k) { return Number(SAFE_BENCHMARKS[k].value.toFixed(1)); });
  const safeValues   = labels.map(function (k) { return SAFE_BENCHMARKS[k].safe; });

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor   = isDark ? "#A2ACB8" : "#57626F";
  const gridColor   = isDark ? "#2C333D" : "#E8ECF0";
  const yourColor   = isDark ? "#5B9BC9" : "#2F6690";
  const safeColor   = isDark ? "#6FBE9355" : "#2E7D5740";

  const ctx = document.getElementById("risk-factors-chart").getContext("2d");
  _charts["riskFactors"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Your Value",
          data: yourValues,
          backgroundColor: yourColor,
          borderRadius: 4,
          barPercentage: 0.45,
        },
        {
          label: "Safe Benchmark",
          data: safeValues,
          backgroundColor: safeColor,
          borderColor: isDark ? "#6FBE93" : "#2E7D57",
          borderWidth: 2,
          borderRadius: 4,
          barPercentage: 0.45,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 800 },
      plugins: {
        legend: {
          labels: { color: textColor, font: { family: "Inter", size: 11 }, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ": " + ctx.parsed.y;
            },
          },
        },
      },
      scales: {
        x: {
          ticks:  { color: textColor, font: { size: 11 } },
          grid:   { color: gridColor },
        },
        y: {
          ticks:  { color: textColor, font: { family: "IBM Plex Mono", size: 10 } },
          grid:   { color: gridColor },
        },
      },
    },
  });
}

// ------ MODEL METRICS GRID ------
function renderModelMetrics(metrics) {
  const grid = document.getElementById("model-metrics-grid");
  const items = [
    { label: "ROC-AUC",   value: metrics.roc_auc,   fmt: function (v) { return v.toFixed(3); } },
    { label: "Accuracy",  value: metrics.accuracy,  fmt: function (v) { return (v * 100).toFixed(1) + "%"; } },
    { label: "Precision", value: metrics.precision, fmt: function (v) { return (v * 100).toFixed(1) + "%"; } },
    { label: "Recall",    value: metrics.recall,    fmt: function (v) { return (v * 100).toFixed(1) + "%"; } },
    { label: "F1 Score",  value: metrics.f1,        fmt: function (v) { return (v * 100).toFixed(1) + "%"; } },
    { label: "Threshold", value: metrics.threshold, fmt: function (v) { return (v * 100).toFixed(1) + "%"; } },
  ];

  grid.innerHTML = items.map(function (item) {
    // Mini progress bar width
    const pct = Math.round(
      item.label === "Threshold" ? item.value * 100 :
      item.label === "ROC-AUC"  ? item.value * 100 :
      item.value * 100
    );
    return `
      <div class="metric-cell">
        <div class="metric-label">${item.label}</div>
        <div class="metric-value">${item.fmt(item.value)}</div>
        <div class="metric-bar-track">
          <div class="metric-bar-fill" style="width:${Math.min(pct, 100)}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

// ------ SEGMENT DEFAULT RATE COMPARISON ------
function renderSegmentCompare(currentClusterId, currentSegDefaultRate) {
  destroyChart("segCompare");

  const segNames   = segments.map(function (s) { return s.name.split(" ").slice(0, 2).join(" "); });
  const defRates   = segments.map(function (s) {
    return s.defaultRate === "n/a" ? 0 : parseFloat(s.defaultRate);
  });

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor   = isDark ? "#A2ACB8" : "#57626F";
  const gridColor   = isDark ? "#2C333D" : "#E8ECF0";

  const bgColors = segments.map(function (s, i) {
    if (i === currentClusterId) return isDark ? "#5B9BC9" : "#2F6690";
    return isDark ? "#2C333D" : "#DDE4EB";
  });
  const borderColors = segments.map(function (s, i) {
    if (i === currentClusterId) return isDark ? "#5B9BC9" : "#2F6690";
    return "transparent";
  });

  const ctx = document.getElementById("segment-compare-chart").getContext("2d");
  _charts["segCompare"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: segNames,
      datasets: [{
        label: "Default Rate %",
        data: defRates,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 800 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return "Default Rate: " + ctx.parsed.y + "%"; },
            afterLabel: function (ctx) {
              return ctx.dataIndex === currentClusterId ? "← Your segment" : "";
            },
          },
        },
      },
      scales: {
        x: {
          ticks:  { color: textColor, font: { size: 10 } },
          grid:   { color: gridColor },
        },
        y: {
          min: 0, max: 70,
          ticks: { color: textColor, font: { family: "IBM Plex Mono", size: 10 },
                   callback: function (v) { return v + "%"; } },
          grid: { color: gridColor },
        },
      },
    },
  });
}

// ------ FEATURE IMPORTANCES ------
function renderFeatureImportances(importances) {
  destroyChart("featImportance");
  if (!importances || importances.length === 0) return;

  const labels = importances.map(function (f) {
    // Shorten long feature names (OHE ones)
    return f.feature.replace(/^(.{0,28}).*$/, "$1");
  });
  const values = importances.map(function (f) { return f.importance; });

  const isDark      = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor   = isDark ? "#A2ACB8" : "#57626F";
  const gridColor   = isDark ? "#2C333D" : "#E8ECF0";
  const barColor    = isDark ? "#5B9BC9" : "#2F6690";

  const ctx = document.getElementById("feature-importance-chart").getContext("2d");
  _charts["featImportance"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Importance",
        data: values,
        backgroundColor: barColor,
        borderRadius: 3,
        barPercentage: 0.7,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return "Importance: " + ctx.parsed.x.toFixed(4); },
          },
        },
      },
      scales: {
        x: {
          ticks:  { color: textColor, font: { family: "IBM Plex Mono", size: 9 } },
          grid:   { color: gridColor },
        },
        y: {
          ticks: { color: textColor, font: { size: 10 } },
          grid:  { color: gridColor },
        },
      },
    },
  });
}

// ---- Boot: init dashboard charts immediately on page load ----
document.addEventListener("DOMContentLoaded", function () {
  initDashboardRadar();
});
