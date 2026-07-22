// ==========================================================================
// RiskCompass — frontend logic
// --------------------------------------------------------------------------
// Talks directly to the Flask /predict route. There is no mock mode here —
// app.py must be running (python app.py) since predictions require the
// real model.pkl / scaler.pkl / encoder.pkl / cluster_model.pkl artifacts.
// ==========================================================================

const CONFIG = {
  API_URL: "/predict", // relative path — works since Flask serves this frontend too
};

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
}

// On load: use saved preference, or fall back to the OS-level setting
const savedTheme = localStorage.getItem(THEME_KEY);
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

themeSwitch.addEventListener("click", function () {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// -------- Mobile sidebar (hamburger) --------
const hamburgerBtn = document.getElementById("hamburger-btn");
const sidebarEl = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

function openSidebar() {
  sidebarEl.classList.add("open");
  sidebarOverlay.classList.add("visible");
  hamburgerBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  hamburgerBtn.setAttribute("aria-expanded", "false");
}

hamburgerBtn.addEventListener("click", function () {
  const isOpen = sidebarEl.classList.contains("open");
  isOpen ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener("click", closeSidebar);

// -------- Page navigation --------
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");

navItems.forEach(function (item) {
  item.addEventListener("click", function () {
    navItems.forEach(function (n) { n.classList.remove("active"); });
    pages.forEach(function (p) { p.classList.remove("active"); });
    item.classList.add("active");
    document.getElementById("page-" + item.dataset.page).classList.add("active");
    closeSidebar();
  });
});

// -------- Borrower segments --------
// Real cluster centroids + default rates, computed from cluster_model.pkl /
// cluster_scaler.pkl in notebooks/clustering.ipynb (k=4 on 7 numeric features).
const segments = [
  {
    id: 0,
    name: "Premium Property Borrowers",
    color: "#2F6690",
    share: "22.2%",
    defaultRate: "39.1%",
    desc: "Large loans against high-value property, strong income, and the longest terms. Good credit, but big-ticket exposure keeps default risk moderate.",
    avgLoan: "$581.1k",
    avgIncome: "$11.6k/mo",
    avgCredit: 702,
  },
  {
    id: 1,
    name: "Balanced Mid-Tier",
    color: "#B2872F",
    share: "13.0%",
    defaultRate: "48.1%",
    desc: "Moderate loan and property values with the shortest average term and solid credit scores, yet a surprisingly high default rate.",
    avgLoan: "$234.3k",
    avgIncome: "$6.9k/mo",
    avgCredit: 700,
  },
  {
    id: 2,
    name: "High-LTV Majority Segment",
    color: "#A13D3D",
    share: "64.9%",
    defaultRate: "54.1%",
    desc: "The largest segment by far: lower income, the highest loan-to-value ratios, and the highest default rate of any group in the dataset.",
    avgLoan: "$259.1k",
    avgIncome: "$4.9k/mo",
    avgCredit: 699,
  },
  {
    id: 3,
    name: "Rare Data Outliers",
    color: "#8A94A0",
    share: "<0.01%",
    defaultRate: "n/a",
    desc: "A vanishingly small group with extreme, likely data-entry-error loan-to-value ratios. Shown for completeness only.",
    avgLoan: "$526.5k",
    avgIncome: "$5.5k/mo",
    avgCredit: 561,
  },
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

// -------- Model performance chart (REAL results from modelTraining.ipynb) --------
// Metric shown is ROC-AUC on the held-out test set (see reports/model_comparison_results.csv).
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

const chartEl = document.getElementById("perf-chart");
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
  // Width relative to the strongest model, not an absolute 0-1 scale.
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

// -------- Risk prediction form logic --------
const form = document.getElementById("predict-form");
const runBtn = document.getElementById("run-btn");
const resultBox = document.getElementById("result");
const errorBox = document.getElementById("error-box");

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
    const data = await livePredict(payload);
    renderResult(data);
  } catch (err) {
    errorBox.textContent = "Couldn't reach the prediction server: " + err.message +
      ". Make sure your Flask backend is running (python app.py).";
    errorBox.style.display = "block";
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Assess default risk";
  }
});

function collectFormData() {
  const raw = new FormData(form);
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

function renderResult(data) {
  const percent = Math.round(data.default_probability * 100);
  const willDefault = data.prediction === 1;

  const verdictEl = document.getElementById("verdict-text");
  verdictEl.textContent = willDefault ? "Likely to default" : "Likely to repay";
  verdictEl.className = "verdict " + (willDefault ? "risk-high" : "risk-low");

  document.getElementById("prob-number").textContent = percent + "%";

  const seg = data.segment;
  document.getElementById("segment-callout").innerHTML =
    `<strong>${seg.name}</strong> — ${seg.description} (segment default rate: ${seg.default_rate})`;

  resultBox.style.display = "block";
  resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
