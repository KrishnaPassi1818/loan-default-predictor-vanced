# ◈ RiskCompass — Mortgage Default Risk Intelligence

A full-stack machine learning web application that predicts mortgage loan default risk and segments borrowers into behavioral archetypes — built end-to-end from raw data to a deployed Flask app.

> Built as a summer training project covering the complete ML lifecycle: data cleaning, exploratory analysis, preprocessing, supervised classification, unsupervised segmentation, and full-stack deployment.

---

## 📌 Overview

RiskCompass takes a borrower's loan, property, and credit profile and returns two things:

1. **A default probability** — how likely this borrower is to default, from a tuned Gradient Boosting classifier
2. **A borrower segment** — which of 4 risk archetypes (discovered via K-Means clustering) this borrower most resembles

The two models are trained completely independently. The classifier predicts risk; the clustering model adds *context* around that prediction — it's descriptive, not part of the prediction pipeline itself.

---

## ✨ Features

- **Interactive risk prediction form** — 25 input fields across loan, applicant, credit, and structural details
- **Real-time inference** — Flask backend runs the exact same preprocessing pipeline used in training
- **Borrower segmentation** — every prediction is paired with the borrower's nearest risk archetype and that segment's real default rate
- **Model performance dashboard** — live comparison of 8 trained models by ROC-AUC
- **Light/dark theme** — persisted across sessions via `localStorage`
- **Fully responsive** — mobile hamburger navigation, stacked layouts, touch-friendly form fields
- **Leakage-safe** — fields only known *after* loan approval (interest rate, rate spread, upfront charges) are deliberately excluded from the model

---

## 🧠 How It Works

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Borrower  │ --> │   Preprocessing   │ --> │   Gradient       │ --> │  Default     │
│   form data │     │  (encode + scale) │     │   Boosting model │     │  probability │
└─────────────┘     └──────────────────┘     └─────────────────┘     └──────────────┘
       │
       ▼
┌──────────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Cluster scaler   │ --> │  K-Means    │ --> │  Nearest borrower │
│  (7 numeric cols) │     │  (k=4)      │     │  segment          │
└──────────────────┘     └─────────────┘     └──────────────────┘
```

1. **Input** — the borrower's profile is submitted from the Risk Prediction page
2. **Preprocess** — categorical fields are one-hot encoded and numeric fields are scaled, using the *exact fitted* encoder/scaler saved from training (never refit at inference time)
3. **Predict** — the tuned Gradient Boosting classifier outputs a default probability, thresholded at the F1-optimal cutoff (not the default 0.5)
4. **Segment** — the same raw numeric fields are run through a separate K-Means pipeline to find the borrower's nearest archetype

---

## 📊 Dataset

- **Type**: HMDA-style mortgage application data, cleaned and class-balanced (~50/50 Default vs. Paid)
- **Target**: `Status` — binary (1 = Default, 0 = Paid)
- **Leakage guard**: `rate_of_interest`, `Interest_rate_spread`, and `Upfront_charges` are dropped before training — these are only known *after* a loan is approved, so including them would let the model "cheat"
- **Features used**: 25 fields spanning loan terms, property details, applicant demographics, credit profile, and application metadata

---

## 🤖 Model Performance

8 models were trained and compared via `GridSearchCV` with stratified 3-fold cross-validation, optimizing for ROC-AUC:

| Model | ROC-AUC |
|---|---|
| **Gradient Boosting** 🏆 | **0.889** |
| Random Forest | 0.887 |
| Decision Tree | 0.868 |
| Polynomial Regression | 0.863 |
| KNN | 0.837 |
| Logistic Regression | 0.836 |
| Linear SVM | 0.830 |
| Linear Regression | 0.830 |

**Winning model**: Gradient Boosting (`learning_rate=0.1`, `n_estimators=200`)
**Decision threshold**: `0.353` (tuned to maximize F1 on the default class, instead of the default 0.5)

---

## 🧩 Borrower Segments

Discovered via K-Means (k=4) on 7 scaled numeric features — loan amount, property value, income, credit score, LTV, DTI ratio, and term — then visualized in 2D with PCA.

| Segment | Share | Default Rate | Profile |
|---|---|---|---|
| **Premium Property Borrowers** | 22.2% | 39.1% | Large loans, high-value property, strong income, longest terms |
| **Balanced Mid-Tier** | 13.0% | 48.1% | Moderate loans, shortest average term, solid credit |
| **High-LTV Majority Segment** | 64.9% | 54.1% | Largest group — lower income, highest loan-to-value ratios |
| **Rare Data Outliers** | <0.01% | n/a | Extreme LTV values, likely data-entry artifacts |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom, no framework), vanilla JavaScript |
| Backend | Flask (Python) |
| Classification | Gradient Boosting (`scikit-learn`, GridSearchCV-tuned) |
| Segmentation | K-Means + PCA (`scikit-learn`) |
| Data processing | Pandas, NumPy |
| Model persistence | Joblib |
| Deployment | Render (Gunicorn WSGI server) |

---

## 📁 Project Structure

```
STProject/
├── app.py                    # Flask backend — routes, preprocessing, inference
├── requirements.txt          # Python dependencies
├── Procfile                  # Render/Gunicorn start command
├── model.pkl                 # Trained Gradient Boosting classifier
├── scaler.pkl                # StandardScaler fit on 7 numeric classifier features
├── encoder.pkl                # OneHotEncoder fit on 18 categorical features
├── feature_names.json        # Exact column order the model expects
├── model_threshold.json      # F1-optimal decision threshold
├── cluster_model.pkl         # K-Means borrower segmentation model
├── cluster_scaler.pkl        # StandardScaler fit for clustering (separate from classifier scaler)
├── pca_model.pkl             # 2D projection model for cluster visualization
├── templates/
│   └── index.html            # Single-page app shell (dashboard, form, segments, performance, about)
├── static/
│   ├── style.css             # Theming, layout, responsive breakpoints
│   └── script.js             # Navigation, theming, form submission, result rendering
├── notebooks/
│   ├── dataCleaning.ipynb
│   ├── eda.ipynb
│   ├── preprocessing.ipynb
│   ├── modelTraining.ipynb
│   └── clustering.ipynb
├── dataset/                  # Raw, cleaned, and train/test split CSVs
└── reports/                  # Saved charts and model comparison results
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- pip

### Installation

```bash
git clone https://github.com/<your-username>/STProject.git
cd STProject
pip install -r requirements.txt
```

### Run locally

```bash
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

> ⚠️ **Version note**: the `.pkl` model files were saved with `numpy>=2.0` and `scikit-learn==1.7.2`. If you hit a `BitGenerator module` error on load, upgrade numpy to match:
> ```bash
> pip install --upgrade "numpy>=2.0" "scikit-learn==1.7.2"
> ```

### API

**`POST /predict`**

Request body (JSON) — all 25 fields required:

```json
{
  "loan_amount": 286500, "term": 360, "property_value": 398000,
  "loan_limit": "cf", "loan_type": "type1", "business_or_commercial": "nob/c",
  "occupancy_type": "pr", "total_units": "1U", "Region": "North",
  "Gender": "Male", "age": "35-44", "income": 5460,
  "approv_in_adv": "nopre", "submission_of_application": "to_inst",
  "Credit_Score": 700, "Credit_Worthiness": "l1", "credit_type": "CIB",
  "co-applicant_credit_type": "CIB", "open_credit": "nopc",
  "LTV": 76.16, "dtir1": 40, "loan_purpose": "p1",
  "Neg_ammortization": "not_neg", "interest_only": "not_int",
  "lump_sum_payment": "not_lpsm"
}
```

Response:

```json
{
  "default_probability": 0.258,
  "prediction": 0,
  "threshold_used": 0.3534,
  "model_name": "Gradient Boosting",
  "segment": {
    "cluster_id": 2,
    "name": "High-LTV Majority Segment",
    "share": "64.9%",
    "default_rate": "54.1%",
    "description": "...",
    "pca_x": -0.33,
    "pca_y": 0.347
  }
}
```

**`GET /health`** — returns `{"status": "ok", "model_loaded": true, "cluster_model_loaded": true}`

---

## ☁️ Deployment

Deployed on **Render** as a Gunicorn-served web service:

- **Build command**: `pip install -r requirements.txt`
- **Start command**: `gunicorn app:app`

The free tier sleeps after inactivity — the first request after idle time may take 30–50 seconds to wake the server.

---

## ⚠️ Disclaimer

- Built for **educational and academic submission purposes only**
- Predictions reflect historical statistical patterns, not lending guarantees or financial advice
- Not a substitute for real underwriting judgment or regulated credit decisioning

---

## 👤 Author

Built by **Krishna** as a summer training project — B.Tech, Computer Science, Amritsar Group of Colleges.

---

## 📄 License

This project is submitted for academic purposes. Feel free to reference or extend it for learning — please credit the original author if reused.