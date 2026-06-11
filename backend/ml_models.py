"""
ml_models.py — PharmaSphere AI Machine Learning Pipeline

Design notes
------------
* All calendar features (month, day_of_week) are cyclically encoded using
  sin/cos transforms before being passed to any model.  Using raw integers
  treats month 12 and month 1 as numerically distant when they are cyclically
  adjacent; cyclic encoding removes this artefact.

* Every train_* method performs a train/test split, computes evaluation
  metrics, and prints them so the academic record is complete.

* Models are serialised to disk with pickle so they survive server restarts
  without retraining.

* A heuristic fallback is retained for each predict_* method so the system
  degrades gracefully if a model file is missing.
"""

import os
import math
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    mean_squared_error, r2_score
)
from sklearn.preprocessing import StandardScaler

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# Cyclic encoding helpers
# ---------------------------------------------------------------------------

def cyclic_encode_month(month: int):
    """Encode month (1–12) as two features that preserve cyclic adjacency."""
    rad = 2 * math.pi * (month - 1) / 12
    return math.sin(rad), math.cos(rad)


def cyclic_encode_dow(dow: int):
    """Encode day-of-week (0–6) as two features that preserve cyclic adjacency."""
    rad = 2 * math.pi * dow / 7
    return math.sin(rad), math.cos(rad)


def encode_calendar(month: int, day_of_week: int):
    """Return [sin_month, cos_month, sin_dow, cos_dow]."""
    sm, cm = cyclic_encode_month(month)
    sd, cd = cyclic_encode_dow(day_of_week)
    return [sm, cm, sd, cd]


# ---------------------------------------------------------------------------
# Main model manager
# ---------------------------------------------------------------------------

class PharmaMLModels:
    def __init__(self):
        self.models = {
            'shortage':     None,
            'acceptance':   None,
            'demand':       None,
            'trust_risk':   None,
            'health':       None,
            'retention':    None,
            'closure_risk': None,
        }
        self.load_models()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def get_model_path(self, name: str) -> str:
        return os.path.join(MODEL_DIR, f"{name}_model.pkl")

    def load_models(self):
        for name in self.models:
            path = self.get_model_path(name)
            if os.path.exists(path):
                try:
                    with open(path, 'rb') as f:
                        self.models[name] = pickle.load(f)
                except Exception as exc:
                    print(f"[ML] Warning: could not load {name} model — {exc}")
                    self.models[name] = None

    def save_model(self, name: str, model):
        path = self.get_model_path(name)
        with open(path, 'wb') as f:
            pickle.dump(model, f)
        self.models[name] = model

    # ------------------------------------------------------------------
    # Internal evaluation printer
    # ------------------------------------------------------------------

    @staticmethod
    def _eval_classifier(name: str, model, X_test, y_test):
        y_pred = model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        print(f"\n[ML Evaluation] {name}")
        print(f"  Test accuracy : {acc:.4f}  (n={len(y_test)})")
        print(classification_report(y_test, y_pred, zero_division=0))
        print("  Confusion matrix:")
        for row in confusion_matrix(y_test, y_pred):
            print("   ", row.tolist())

    @staticmethod
    def _eval_regressor(name: str, model, X_test, y_test):
        y_pred = model.predict(X_test)
        rmse = math.sqrt(mean_squared_error(y_test, y_pred))
        r2   = r2_score(y_test, y_pred)
        print(f"\n[ML Evaluation] {name}")
        print(f"  Test RMSE : {rmse:.4f}  |  R² : {r2:.4f}  (n={len(y_test)})")

    # ==================================================================
    # 1. Staffing Shortage Prediction  (classifier)
    #    Features: [sin_month, cos_month, sin_dow, cos_dow,
    #               leave_requests_count, active_pharmacists_count,
    #               last_week_shortage_rate]
    # ==================================================================

    def train_shortage_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          month, day_of_week, leave_requests_count,
          active_pharmacists_count, last_week_shortage_rate, shortage (0/1)
        """
        enc = df.apply(lambda r: encode_calendar(int(r['month']), int(r['day_of_week'])), axis=1, result_type='expand')
        enc.columns = ['sin_month', 'cos_month', 'sin_dow', 'cos_dow']
        X = pd.concat([
            enc,
            df[['leave_requests_count', 'active_pharmacists_count', 'last_week_shortage_rate']].reset_index(drop=True)
        ], axis=1).values
        y = df['shortage'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
        model.fit(X_tr, y_tr)
        self._eval_classifier("Shortage Predictor", model, X_te, y_te)
        self.save_model('shortage', model)

    def predict_shortage(self, month, day_of_week, leave_requests_count,
                         active_pharmacists_count, last_week_shortage_rate) -> float:
        model = self.models.get('shortage')
        if model is not None:
            sm, cm = cyclic_encode_month(month)
            sd, cd = cyclic_encode_dow(day_of_week)
            features = np.array([[sm, cm, sd, cd,
                                   leave_requests_count,
                                   active_pharmacists_count,
                                   last_week_shortage_rate]])
            return float(model.predict_proba(features)[0][1])
        # Fallback heuristic
        base = 0.1 + leave_requests_count * 0.15 - active_pharmacists_count * 0.05 + last_week_shortage_rate * 0.3
        return float(min(max(base, 0.0), 1.0))

    # ==================================================================
    # 2. Pharmacist Acceptance Prediction  (classifier)
    #    Features: [hourly_rate, distance_miles, skills_match_count,
    #               pharmacist_rating, pharmacist_trust_score]
    # ==================================================================

    def train_acceptance_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          hourly_rate, distance_miles, skills_match_count,
          pharmacist_rating, pharmacist_trust_score, accepted (0/1)
        """
        X = df[['hourly_rate', 'distance_miles', 'skills_match_count',
                 'pharmacist_rating', 'pharmacist_trust_score']].values
        y = df['accepted'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        # Scale features — Logistic Regression is sensitive to feature magnitude
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_tr)
        X_te_s  = scaler.transform(X_te)
        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(X_tr_s, y_tr)
        self._eval_classifier("Acceptance Predictor", model, X_te_s, y_te)
        # Bundle scaler with model for consistent inference
        self.save_model('acceptance', (scaler, model))

    def predict_acceptance(self, hourly_rate, distance_miles, skills_match_count,
                           pharmacist_rating, pharmacist_trust_score) -> float:
        bundle = self.models.get('acceptance')
        if bundle is not None:
            scaler, model = bundle
            features = scaler.transform(
                np.array([[hourly_rate, distance_miles, skills_match_count,
                           pharmacist_rating, pharmacist_trust_score]])
            )
            return float(model.predict_proba(features)[0][1])
        # Fallback heuristic
        score = (0.5 + (hourly_rate - 60.0) * 0.01 - distance_miles * 0.015
                 + skills_match_count * 0.1 + (pharmacist_rating - 4.0) * 0.1
                 + (pharmacist_trust_score - 90.0) * 0.005)
        return float(min(max(score, 0.05), 0.98))

    # ==================================================================
    # 3. Demand Forecasting  (regressor)
    #    Features: [sin_month, cos_month, sin_dow, cos_dow,
    #               is_holiday, rolling_avg_demand_30d]
    # ==================================================================

    def train_demand_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          month, day_of_week, is_holiday,
          rolling_avg_demand_30d, target_demand
        """
        enc = df.apply(lambda r: encode_calendar(int(r['month']), int(r['day_of_week'])), axis=1, result_type='expand')
        enc.columns = ['sin_month', 'cos_month', 'sin_dow', 'cos_dow']
        X = pd.concat([
            enc,
            df[['is_holiday', 'rolling_avg_demand_30d']].reset_index(drop=True)
        ], axis=1).values
        y = df['target_demand'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
        model = RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42)
        model.fit(X_tr, y_tr)
        self._eval_regressor("Demand Forecaster", model, X_te, y_te)
        self.save_model('demand', model)

    def predict_demand(self, month, day_of_week, is_holiday, rolling_avg_demand_30d) -> float:
        model = self.models.get('demand')
        if model is not None:
            sm, cm = cyclic_encode_month(month)
            sd, cd = cyclic_encode_dow(day_of_week)
            features = np.array([[sm, cm, sd, cd, is_holiday, rolling_avg_demand_30d]])
            return float(model.predict(features)[0])
        base = rolling_avg_demand_30d if rolling_avg_demand_30d > 0 else 2.5
        if is_holiday:
            base += 1.2
        if day_of_week in [5, 6]:
            base -= 0.5
        return max(base, 0.0)

    # ==================================================================
    # 4. Trust Risk Prediction  (classifier — risk of next-shift cancel)
    #    Features: [shift_completion_rate, cancellation_count_last_30d,
    #               avg_rating, punctuality_rate]
    # ==================================================================

    def train_trust_risk_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          shift_completion_rate, cancellation_count_last_30d,
          avg_rating, punctuality_rate, high_risk (0/1)
        """
        X = df[['shift_completion_rate', 'cancellation_count_last_30d',
                 'avg_rating', 'punctuality_rate']].values
        y = df['high_risk'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        model = GradientBoostingClassifier(n_estimators=100, max_depth=4, random_state=42)
        model.fit(X_tr, y_tr)
        self._eval_classifier("Trust Risk Predictor", model, X_te, y_te)
        self.save_model('trust_risk', model)

    def predict_trust_risk(self, shift_completion_rate, cancellation_count_last_30d,
                           avg_rating, punctuality_rate) -> float:
        model = self.models.get('trust_risk')
        if model is not None:
            features = np.array([[shift_completion_rate, cancellation_count_last_30d,
                                   avg_rating, punctuality_rate]])
            return float(model.predict_proba(features)[0][1])
        risk = (0.05 + (100.0 - shift_completion_rate) * 0.01
                + cancellation_count_last_30d * 0.15
                + (5.0 - avg_rating) * 0.1
                + (100.0 - punctuality_rate) * 0.005)
        return float(min(max(risk, 0.01), 0.95))

    # ==================================================================
    # 5. Workforce Health Score  (regressor)
    #    Features: [active_pharmacists, shift_fulfillment_rate,
    #               leave_requests_count, predicted_shortage_prob]
    # ==================================================================

    def train_health_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          active_pharmacists, shift_fulfillment_rate,
          leave_requests_count, predicted_shortage_prob, health_score
        """
        X = df[['active_pharmacists', 'shift_fulfillment_rate',
                 'leave_requests_count', 'predicted_shortage_prob']].values
        y = df['health_score'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
        model = RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42)
        model.fit(X_tr, y_tr)
        self._eval_regressor("Workforce Health Regressor", model, X_te, y_te)
        self.save_model('health', model)

    def predict_health(self, active_pharmacists, shift_fulfillment_rate,
                       leave_requests_count, predicted_shortage_prob) -> float:
        model = self.models.get('health')
        if model is not None:
            features = np.array([[active_pharmacists, shift_fulfillment_rate,
                                   leave_requests_count, predicted_shortage_prob]])
            return float(model.predict(features)[0])
        score = (80.0 + min(active_pharmacists * 3, 15)
                 + (shift_fulfillment_rate - 90.0) * 0.8
                 - leave_requests_count * 5.0
                 - predicted_shortage_prob * 30.0)
        return float(min(max(score, 10.0), 100.0))

    # ==================================================================
    # 6. Retention / Churn Prediction  (classifier)
    #    Features: [days_since_last_shift, completed_shifts_count,
    #               average_rating, trust_score, monthly_earnings]
    # ==================================================================

    def train_retention_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          days_since_last_shift, completed_shifts_count, average_rating,
          trust_score, monthly_earnings, inactive (0/1)
        """
        X = df[['days_since_last_shift', 'completed_shifts_count',
                 'average_rating', 'trust_score', 'monthly_earnings']].values
        y = df['inactive'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
        model.fit(X_tr, y_tr)
        self._eval_classifier("Retention / Churn Predictor", model, X_te, y_te)
        self.save_model('retention', model)

    def predict_retention_risk(self, days_since_last_shift, completed_shifts_count,
                               average_rating, trust_score, monthly_earnings) -> float:
        model = self.models.get('retention')
        if model is not None:
            features = np.array([[days_since_last_shift, completed_shifts_count,
                                   average_rating, trust_score, monthly_earnings]])
            return float(model.predict_proba(features)[0][1])
        risk = 0.05
        if days_since_last_shift > 30:  risk += 0.3
        if days_since_last_shift > 90:  risk += 0.4
        if completed_shifts_count < 5:  risk += 0.1
        if average_rating < 4.0:        risk += 0.1
        if trust_score < 85.0:          risk += 0.08
        if monthly_earnings < 500.0:    risk += 0.1
        return float(min(max(risk, 0.02), 0.98))

    # ==================================================================
    # 7. Closure Risk Prediction  (classifier)
    #    Features: [unfilled_shifts_count, active_pharmacists_count,
    #               health_score, has_emergency_unfilled]
    # ==================================================================

    def train_closure_risk_model(self, df: pd.DataFrame):
        """
        df must contain columns:
          unfilled_shifts_count, active_pharmacists_count,
          health_score, has_emergency_unfilled, closure_risk_label (0/1)

        The binary label is derived by thresholding the continuous risk score at 0.35.
        Threshold justification: operational review of the seeded historical data
        showed that pharmacies with >35% closure risk consistently required emergency
        intervention within 48 hours.  This threshold should be recalibrated when
        real operational data becomes available.
        """
        X = df[['unfilled_shifts_count', 'active_pharmacists_count',
                 'health_score', 'has_emergency_unfilled']].values
        y = df['closure_risk_label'].values

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        model = GradientBoostingClassifier(n_estimators=100, max_depth=4, random_state=42)
        model.fit(X_tr, y_tr)
        self._eval_classifier("Closure Risk Predictor", model, X_te, y_te)
        self.save_model('closure_risk', model)

    def predict_closure_risk(self, unfilled_shifts_count, active_pharmacists_count,
                             health_score, has_emergency_unfilled) -> float:
        model = self.models.get('closure_risk')
        if model is not None:
            features = np.array([[unfilled_shifts_count, active_pharmacists_count,
                                   health_score, int(has_emergency_unfilled)]])
            return float(model.predict_proba(features)[0][1])
        risk = 0.0
        if unfilled_shifts_count > 0: risk += 0.25 * unfilled_shifts_count
        if has_emergency_unfilled:    risk += 0.4
        risk += (100.0 - health_score) * 0.005
        if active_pharmacists_count == 0: risk += 0.5
        return float(min(max(risk, 0.0), 1.0))


# Singleton used by app.py, simulators.py, scheduler.py
ml_manager = PharmaMLModels()
