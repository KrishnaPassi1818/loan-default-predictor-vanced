"""
app.py
------
Flask backend for the Mortgage Loan Default Predictor (STProject).

Responsibilities:
  1. Serve the frontend (templates/index.html + static/style.css + static/script.js)
  2. Load the trained model + preprocessing artifacts ONCE at startup:
       - model.pkl          -> tuned Gradient Boosting classifier
       - scaler.pkl         -> StandardScaler fit on the 7 numeric features
       - encoder.pkl        -> OneHotEncoder fit on the 18 categorical features
       - feature_names.json -> exact column order the model expects
       - model_threshold.json -> F1-optimal decision threshold (not 0.5)
       - cluster_model.pkl / cluster_scaler.pkl -> K-Means borrower segmentation
       - pca_model.pkl      -> 2D projection of the same numeric features
  3. Expose POST /predict — takes a borrower's form data as JSON, runs it
     through the EXACT SAME preprocessing used in notebooks/preprocessing.ipynb,
     returns a default probability + prediction + nearest borrower segment.

Run locally with:
    python app.py
Then open http://127.0.0.1:5000 in your browser.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Load artifacts once at startup (not per-request).
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent

model = joblib.load(PROJECT_ROOT / "model.pkl")
scaler = joblib.load(PROJECT_ROOT / "scaler.pkl")
encoder = joblib.load(PROJECT_ROOT / "encoder.pkl")

with open(PROJECT_ROOT / "feature_names.json") as f:
    FEATURE_COLUMNS = json.load(f)

with open(PROJECT_ROOT / "model_threshold.json") as f:
    _threshold_info = json.load(f)
    THRESHOLD = _threshold_info["threshold"]
    MODEL_NAME = _threshold_info.get("model_name", "Gradient Boosting")

# Borrower segmentation artifacts (separate pipeline from the classifier)
cluster_model = joblib.load(PROJECT_ROOT / "cluster_model.pkl")
cluster_scaler = joblib.load(PROJECT_ROOT / "cluster_scaler.pkl")
pca_model = joblib.load(PROJECT_ROOT / "pca_model.pkl")

print(f"Loaded model ({MODEL_NAME}), scaler, encoder, {len(FEATURE_COLUMNS)} "
      f"feature columns, threshold={THRESHOLD:.3f}")
print("Loaded cluster_model, cluster_scaler, pca_model for borrower segmentation")

# ---------------------------------------------------------------------------
# Column groups — MUST exactly match notebooks/preprocessing.ipynb.
# ---------------------------------------------------------------------------

NUMERIC_COLS = [
    "loan_amount", "term", "property_value", "income",
    "Credit_Score", "LTV", "dtir1",
]

CATEGORICAL_COLS = [
    "loan_limit", "Gender", "approv_in_adv", "loan_type", "loan_purpose",
    "Credit_Worthiness", "open_credit", "business_or_commercial",
    "Neg_ammortization", "interest_only", "lump_sum_payment", "occupancy_type",
    "total_units", "credit_type", "co-applicant_credit_type", "age",
    "submission_of_application", "Region",
]

REQUIRED_FIELDS = NUMERIC_COLS + CATEGORICAL_COLS

# Same 7 numeric columns, same order, used by notebooks/clustering.ipynb
CLUSTER_NUMERIC_COLS = [
    "loan_amount", "property_value", "income", "Credit_Score", "LTV", "dtir1", "term",
]

# Human-readable borrower segments, derived from the real cluster centroids /
# default rates computed in notebooks/clustering.ipynb (see reports/clustering_map.png).
# Cluster 3 is a razor-thin (~0.004%) group of data outliers with near-zero
# property values, kept here only so the app never crashes if it's ever hit.
SEGMENT_PROFILES = {
    0: {
        "name": "Premium Property Borrowers",
        "share": "22.2%",
        "default_rate": "39.1%",
        "description": (
            "Large loans against high-value property, strong income, and the "
            "longest terms. Good credit, but big-ticket exposure keeps default "
            "risk moderate."
        ),
    },
    1: {
        "name": "Balanced Mid-Tier",
        "share": "13.0%",
        "default_rate": "48.1%",
        "description": (
            "Moderate loan and property values with the shortest average term "
            "and solid credit scores, yet a surprisingly high default rate — "
            "term length matters more than credit score alone here."
        ),
    },
    2: {
        "name": "High-LTV Majority Segment",
        "share": "64.9%",
        "default_rate": "54.1%",
        "description": (
            "The largest segment by far: lower income, the highest loan-to-value "
            "ratios, and the highest default rate of any group in the dataset."
        ),
    },
    3: {
        "name": "Rare Data Outliers",
        "share": "<0.01%",
        "default_rate": "n/a",
        "description": (
            "A vanishingly small group with extreme, likely data-entry-error "
            "loan-to-value ratios. Shown for completeness only."
        ),
    },
}


# ---------------------------------------------------------------------------
# Preprocessing — mirrors preprocessing.ipynb exactly, but for ONE row
# coming from the frontend form instead of a full training dataframe.
# ---------------------------------------------------------------------------

def preprocess_input(payload: dict) -> pd.DataFrame:
    """
    Takes the raw JSON payload from the frontend form and returns a
    single-row DataFrame with the exact same columns, in the exact same
    order, as the data the classifier was trained on.
    """
    row = pd.DataFrame([payload])

    # 1. One-hot encode categorical columns using the FITTED encoder
    #    (transform only — never fit here, or categories could shift)
    encoded = encoder.transform(row[CATEGORICAL_COLS])
    encoded_cols = encoder.get_feature_names_out(CATEGORICAL_COLS)
    encoded_df = pd.DataFrame(encoded, columns=encoded_cols, index=row.index)
    row = pd.concat([row.drop(columns=CATEGORICAL_COLS), encoded_df], axis=1)

    # 2. Scale numeric columns using the FITTED scaler
    row[NUMERIC_COLS] = scaler.transform(row[NUMERIC_COLS])

    # 3. Align to the exact training column order. Any one-hot category not
    #    present in this single row gets filled with 0 — handle_unknown='ignore'
    #    means genuinely unseen categories are already handled the same way.
    for col in FEATURE_COLUMNS:
        if col not in row.columns:
            row[col] = 0
    row = row[FEATURE_COLUMNS]

    return row


def get_segment(payload: dict) -> dict:
    """
    Runs the borrower's raw numeric fields through the SEPARATE clustering
    pipeline (its own scaler, fit only on those 7 numeric columns) to find
    their nearest borrower segment, plus a 2D PCA position for plotting.
    """
    cluster_row = pd.DataFrame([{col: payload[col] for col in CLUSTER_NUMERIC_COLS}])
    scaled = cluster_scaler.transform(cluster_row)

    cluster_id = int(cluster_model.predict(scaled)[0])
    pca_coords = pca_model.transform(scaled)[0]

    profile = SEGMENT_PROFILES.get(cluster_id, {
        "name": "Unclassified", "share": "n/a", "default_rate": "n/a", "description": "",
    })

    return {
        "cluster_id": cluster_id,
        "name": profile["name"],
        "share": profile["share"],
        "default_rate": profile["default_rate"],
        "description": profile["description"],
        "pca_x": round(float(pca_coords[0]), 3),
        "pca_y": round(float(pca_coords[1]), 3),
    }


def validate_payload(payload: dict):
    """Returns an error message string if the payload is invalid, else None."""
    missing = [f for f in REQUIRED_FIELDS if f not in payload or payload[f] in (None, "")]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    for col in NUMERIC_COLS:
        try:
            float(payload[col])
        except (TypeError, ValueError):
            return f"Field '{col}' must be a number, got: {payload[col]!r}"

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    payload = request.get_json(silent=True)

    if payload is None:
        return jsonify({"error": "Request body must be JSON"}), 400

    error = validate_payload(payload)
    if error:
        return jsonify({"error": error}), 400

    # Coerce numeric fields to float up front (form fields arrive as numbers
    # already from the frontend, but be defensive in case /predict is hit directly)
    for col in NUMERIC_COLS:
        payload[col] = float(payload[col])

    try:
        X_input = preprocess_input(payload)
        probability = float(model.predict_proba(X_input)[:, 1][0])
        prediction = int(probability >= THRESHOLD)
        segment = get_segment(payload)
    except Exception as e:
        # Don't leak stack traces to the frontend, but do log them
        # server-side so you can debug during development.
        app.logger.exception("Prediction failed")
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500

    return jsonify({
        "default_probability": round(probability, 4),
        "prediction": prediction,          # 1 = predicted default, 0 = predicted repay
        "threshold_used": round(THRESHOLD, 4),
        "model_name": MODEL_NAME,
        "segment": segment,
    })


@app.route("/model_stats")
def model_stats():
    """
    Returns pre-computed model performance metrics and top feature importances.
    These numbers come from modelTraining.ipynb / model evaluation — no re-fitting here.
    """
    # Real results from reports/model_comparison_results — held-out test set metrics
    metrics = {
        "roc_auc":   0.8890,
        "accuracy":  0.8102,
        "precision": 0.7918,
        "recall":    0.8471,
        "f1":        0.8185,
        "threshold": round(THRESHOLD, 4),
        "model_name": MODEL_NAME,
    }

    # Model comparison table (ROC-AUC on held-out test set)
    comparison = [
        {"name": "Gradient Boosting",     "roc_auc": 0.8890, "is_winner": True},
        {"name": "Random Forest",         "roc_auc": 0.8870, "is_winner": False},
        {"name": "Decision Tree",         "roc_auc": 0.8679, "is_winner": False},
        {"name": "Polynomial Regression", "roc_auc": 0.8632, "is_winner": False},
        {"name": "KNN",                   "roc_auc": 0.8373, "is_winner": False},
        {"name": "Logistic Regression",   "roc_auc": 0.8363, "is_winner": False},
        {"name": "Linear SVM",            "roc_auc": 0.8302, "is_winner": False},
        {"name": "Linear Regression",     "roc_auc": 0.8300, "is_winner": False},
    ]

    # Top 10 feature importances from the trained GBM
    feature_importances = []
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        indices = np.argsort(importances)[::-1][:10]
        feature_importances = [
            {"feature": FEATURE_COLUMNS[i], "importance": round(float(importances[i]), 4)}
            for i in indices
        ]

    return jsonify({
        "metrics": metrics,
        "comparison": comparison,
        "feature_importances": feature_importances,
    })


@app.route("/health")
def health():
    """Simple check Render (or you) can hit to confirm the app + models loaded."""
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "cluster_model_loaded": cluster_model is not None,
    })


# ---------------------------------------------------------------------------
# Local dev entry point. On Render, gunicorn runs this instead (see
# Procfile / requirements.txt), so this block only matters for your machine.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
