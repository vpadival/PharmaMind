# PharmaMind

**Intelligent Pharmacy Workforce Continuity Platform**

PharmaMind is a full-stack workforce management system for independent pharmacies.
It combines a React/Vite frontend, a Flask REST API backend, SQLite persistence, and
seven scikit-learn models that predict staffing shortages, demand, pharmacist retention,
and pharmacy closure risk.

---

## Architecture

```
PharmaMind/
├── backend/               Flask API + ML pipeline
│   ├── app.py             All API routes (10 sections)
│   ├── auth.py            JWT auth blueprint
│   ├── models.py          SQLAlchemy ORM models
│   ├── ml_models.py       7 ML models (train + predict)
│   ├── simulators.py      Digital twin / continuity simulator
│   ├── scheduler.py       Greedy shift-assignment optimiser
│   ├── seed.py            DB seeder + synthetic dataset generator
│   └── validate_backend.py  End-to-end smoke test
├── frontend/              React 19 + Vite + Tailwind CSS
│   └── src/
│       ├── App.jsx
│       ├── pages/         AdminDashboard, OwnerDashboard, PharmacistDashboard,
│       │                  AnalyticsReports, Login, PendingVerification
│       └── components/    Navbar, CapsuleLanding
└── README.md
```

---

## Setup

### Prerequisites

- Python ≥ 3.14
- Node.js ≥ 18

### Backend

```bash
cd backend

# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure secrets (REQUIRED)
cp .env.example .env
# Edit .env and set a strong JWT_SECRET_KEY:
#   python -c "import secrets; print(secrets.token_hex(32))"

# 3. Seed the database and train all ML models
python seed.py

# 4. Start the API server
python app.py
# Runs on http://localhost:5000
```

### Frontend

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure API base URL
cp .env.example .env.local
# Edit .env.local if your backend runs on a different host/port

# 3. Start the dev server
npm run dev
# Runs on http://localhost:5173

# Build for production
npm run build
```

---

## Demo credentials

| Role        | Email                       | Password   |
|-------------|-----------------------------|------------|
| Admin       | admin@pharmasphere.ai       | admin123   |
| Owner 1     | owner1@pharmacy.com         | owner123   |
| Owner 2     | owner2@pharmacy.com         | owner123   |
| Pharmacist 1| pharmacist1@pharma.com      | pharma123  |
| Pharmacist 2| pharmacist2@pharma.com      | pharma123  |

---

## ML Models

Seven models are trained in `seed.py` on independently generated synthetic datasets
(n = 2,000 samples each) and evaluated with train/test splits:

| # | Model                | Type         | Algorithm             | Target                          |
|---|----------------------|--------------|-----------------------|---------------------------------|
| 1 | Shortage Predictor   | Classifier   | Random Forest         | Will there be a staffing gap?   |
| 2 | Acceptance Predictor | Classifier   | Logistic Regression   | Will a pharmacist accept offer? |
| 3 | Demand Forecaster    | Regressor    | Random Forest         | How many shifts are needed?     |
| 4 | Trust Risk           | Classifier   | Gradient Boosting     | Risk of next-shift cancellation |
| 5 | Workforce Health     | Regressor    | Random Forest         | Health score (0–100)            |
| 6 | Retention / Churn    | Classifier   | Random Forest         | Will pharmacist go inactive?    |
| 7 | Closure Risk         | Classifier   | Gradient Boosting     | Risk of pharmacy closure        |

Calendar features (month, day-of-week) are **cyclically encoded** using sin/cos
transforms before being passed to any model. Evaluation metrics (accuracy,
classification report, confusion matrix, RMSE, R²) are printed during `seed.py`.

---

## Running the smoke test

```bash
cd PharmaMind
python validate_backend.py
```

---

## Security notes

- JWT secrets are loaded from environment variables — never hardcoded.
- Admin accounts cannot be self-registered via the public API.
- CORS is restricted to the configured `FRONTEND_ORIGIN`.
- JWT tokens expire after 12 hours.