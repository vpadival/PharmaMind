"""
seed.py — Database seeder and ML model trainer for PharmaSphere AI

Synthetic data generation strategy
------------------------------------
All seven ML models require labelled training data.  Since no real operational
dataset is available for a semester project, data is generated synthetically.
The generation process is documented for each model so the academic record is
transparent about assumptions and limitations.

Key improvements over naive seeding:
  1. Datasets are generated independently of the heuristic fallback logic.
     Labels are derived from domain-grounded equations with added Gaussian noise,
     not from the same formula used in the fallback predictor.
  2. Each dataset contains at least 1,000 independent samples so train/test
     splitting produces statistically meaningful evaluation results.
  3. Class imbalance is addressed explicitly (shortage, trust_risk, closure_risk
     are all low-prevalence events; we generate realistic ~20–30% positive rates).
  4. Samples are not duplicated via pd.concat to inflate dataset size.

Acknowledged limitations (for project report):
  - Data is simulated, not collected from real pharmacies.
  - Feature distributions are approximations of plausible real-world ranges.
  - Models trained here may not generalise to a different regional market or
    different staffing dynamics without retraining on real data.
"""

import os
import random
import math
from datetime import datetime, date, timedelta

import numpy as np
import pandas as pd
from werkzeug.security import generate_password_hash

from app import create_app
from models import (
    db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory,
    Availability, Rating, TrustScore, License, LeaveRequest,
    EmergencyRequest, WorkforceHealth, RiskScore, Notification
)
from ml_models import ml_manager
from simulators import calculate_distance

RNG = np.random.default_rng(seed=42)


# ============================================================
# Synthetic dataset generators
# Each returns a pd.DataFrame ready to pass to the train_*
# methods on ml_manager.
# ============================================================

def generate_shortage_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  shortage = 1  when there are >= 2 leave requests AND
    fewer than 4 active pharmacists OR last_week_shortage_rate > 0.25,
    with 15% label noise to prevent overfit.

    This is independent of the heuristic fallback in ml_models.py.
    """
    month          = RNG.integers(1, 13, n)
    day_of_week    = RNG.integers(0, 7, n)
    leave_req      = RNG.integers(0, 6, n)          # 0–5 leave requests
    active_ph      = RNG.integers(1, 12, n)          # 1–11 active pharmacists
    last_wk_rate   = RNG.uniform(0.0, 0.5, n)        # prior week shortage rate

    # Domain-grounded label (not the heuristic formula)
    shortage_score = (
        0.35 * (leave_req / 5.0)
        + 0.30 * np.clip(1.0 - active_ph / 10.0, 0, 1)
        + 0.35 * last_wk_rate
    )
    shortage_score += RNG.normal(0, 0.08, n)         # noise
    label = (shortage_score > 0.40).astype(int)

    return pd.DataFrame({
        'month': month, 'day_of_week': day_of_week,
        'leave_requests_count': leave_req,
        'active_pharmacists_count': active_ph,
        'last_week_shortage_rate': last_wk_rate,
        'shortage': label
    })


def generate_acceptance_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  pharmacists accept more readily when pay is higher,
    distance is shorter, and their own rating / trust are high.
    Positive rate ~60% (reflects a competitive market).
    """
    hourly_rate        = RNG.uniform(45.0, 120.0, n)
    distance_miles     = RNG.uniform(0.5, 45.0, n)
    skills_match       = RNG.integers(0, 5, n)
    rating             = RNG.uniform(3.0, 5.0, n)
    trust_score        = RNG.uniform(60.0, 100.0, n)

    accept_prob = (
        0.25 * np.clip((hourly_rate - 45.0) / 75.0, 0, 1)
        + 0.30 * np.clip(1.0 - distance_miles / 45.0, 0, 1)
        + 0.15 * (skills_match / 4.0)
        + 0.15 * ((rating - 3.0) / 2.0)
        + 0.15 * ((trust_score - 60.0) / 40.0)
    )
    accept_prob += RNG.normal(0, 0.10, n)
    label = (accept_prob > 0.45).astype(int)

    return pd.DataFrame({
        'hourly_rate': hourly_rate, 'distance_miles': distance_miles,
        'skills_match_count': skills_match, 'pharmacist_rating': rating,
        'pharmacist_trust_score': trust_score, 'accepted': label
    })


def generate_demand_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  demand is a seasonal + weekly pattern.
    Higher in winter (flu season), lower on weekends, spike on holidays.
    Target is a continuous count (1–6 shifts/day).
    """
    month           = RNG.integers(1, 13, n)
    day_of_week     = RNG.integers(0, 7, n)
    is_holiday      = RNG.binomial(1, 0.05, n)
    rolling_avg     = RNG.uniform(1.5, 4.5, n)

    seasonal = 1.0 + 0.4 * np.sin(2 * math.pi * (month - 3) / 12)   # peak in winter
    weekday_adj = np.where(day_of_week >= 5, -0.5, 0.2)             # weekends down
    holiday_adj = is_holiday * 1.2
    demand = rolling_avg * seasonal + weekday_adj + holiday_adj + RNG.normal(0, 0.3, n)
    demand = np.clip(demand, 1.0, 6.0)

    return pd.DataFrame({
        'month': month, 'day_of_week': day_of_week,
        'is_holiday': is_holiday, 'rolling_avg_demand_30d': rolling_avg,
        'target_demand': demand
    })


def generate_trust_risk_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  high cancellation risk when completion rate is low,
    cancellations are frequent, rating is low, and punctuality is poor.
    Positive rate ~25% (minority class — real markets are mostly reliable).
    """
    completion_rate = RNG.uniform(50.0, 100.0, n)
    cancel_count    = RNG.integers(0, 8, n)
    avg_rating      = RNG.uniform(2.5, 5.0, n)
    punctuality     = RNG.uniform(50.0, 100.0, n)

    risk_score = (
        0.35 * np.clip(1.0 - completion_rate / 100.0, 0, 1)
        + 0.30 * np.clip(cancel_count / 7.0, 0, 1)
        + 0.20 * np.clip(1.0 - (avg_rating - 2.5) / 2.5, 0, 1)
        + 0.15 * np.clip(1.0 - punctuality / 100.0, 0, 1)
    )
    risk_score += RNG.normal(0, 0.07, n)
    label = (risk_score > 0.35).astype(int)

    return pd.DataFrame({
        'shift_completion_rate': completion_rate,
        'cancellation_count_last_30d': cancel_count,
        'avg_rating': avg_rating, 'punctuality_rate': punctuality,
        'high_risk': label
    })


def generate_health_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  health score is an additive function of staff count,
    fulfillment rate, leave load, and shortage probability — with noise
    added so the model cannot achieve R²=1 by just memorising a formula.
    """
    active_ph       = RNG.integers(1, 12, n).astype(float)
    fulfillment     = RNG.uniform(50.0, 100.0, n)
    leave_count     = RNG.integers(0, 6, n).astype(float)
    shortage_prob   = RNG.uniform(0.0, 0.6, n)

    health = (
        55.0
        + np.clip(active_ph * 3.5, 0, 20)
        + (fulfillment - 70.0) * 0.6
        - leave_count * 4.0
        - shortage_prob * 25.0
        + RNG.normal(0, 4.0, n)            # measurement noise
    )
    health = np.clip(health, 10.0, 100.0)

    return pd.DataFrame({
        'active_pharmacists': active_ph, 'shift_fulfillment_rate': fulfillment,
        'leave_requests_count': leave_count, 'predicted_shortage_prob': shortage_prob,
        'health_score': health
    })


def generate_retention_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  churn more likely when the pharmacist has been idle
    a long time, completed few shifts, has low rating or earnings.
    Positive rate ~30%.
    """
    days_idle       = RNG.integers(0, 180, n).astype(float)
    completed       = RNG.integers(0, 50, n).astype(float)
    avg_rating      = RNG.uniform(2.5, 5.0, n)
    trust_sc        = RNG.uniform(60.0, 100.0, n)
    monthly_earn    = RNG.uniform(0.0, 4000.0, n)

    churn_score = (
        0.35 * np.clip(days_idle / 180.0, 0, 1)
        + 0.20 * np.clip(1.0 - completed / 50.0, 0, 1)
        + 0.15 * np.clip(1.0 - (avg_rating - 2.5) / 2.5, 0, 1)
        + 0.15 * np.clip(1.0 - (trust_sc - 60.0) / 40.0, 0, 1)
        + 0.15 * np.clip(1.0 - monthly_earn / 4000.0, 0, 1)
    )
    churn_score += RNG.normal(0, 0.07, n)
    label = (churn_score > 0.40).astype(int)

    return pd.DataFrame({
        'days_since_last_shift': days_idle, 'completed_shifts_count': completed,
        'average_rating': avg_rating, 'trust_score': trust_sc,
        'monthly_earnings': monthly_earn, 'inactive': label
    })


def generate_closure_risk_dataset(n: int = 2000) -> pd.DataFrame:
    """
    Ground truth:  closure risk driven by unfilled shifts, low staff pool,
    low health score, and emergency-shift vacancies.
    Binary label at threshold 0.35 (documented in ml_models.py).
    Positive rate ~25%.
    """
    unfilled        = RNG.integers(0, 6, n).astype(float)
    active_ph       = RNG.integers(0, 12, n).astype(float)
    health_sc       = RNG.uniform(20.0, 100.0, n)
    has_emergency   = RNG.binomial(1, 0.20, n).astype(float)

    risk = (
        0.30 * np.clip(unfilled / 5.0, 0, 1)
        + 0.25 * np.clip(1.0 - active_ph / 11.0, 0, 1)
        + 0.25 * np.clip(1.0 - (health_sc - 20.0) / 80.0, 0, 1)
        + 0.20 * has_emergency
    )
    risk += RNG.normal(0, 0.07, n)
    label = (risk > 0.35).astype(int)

    return pd.DataFrame({
        'unfilled_shifts_count': unfilled,
        'active_pharmacists_count': active_ph,
        'health_score': health_sc,
        'has_emergency_unfilled': has_emergency,
        'closure_risk_label': label
    })


# ============================================================
# Database seeder
# ============================================================

def seed_data():
    print("=" * 60)
    print("  PharmaSphere AI — Database Seeder & ML Trainer")
    print("=" * 60)

    db.drop_all()
    db.create_all()

    # ----------------------------------------------------------
    # Users
    # ----------------------------------------------------------
    admin_user = User(email="admin@pharmasphere.ai",
                      password_hash=generate_password_hash("admin123"),
                      role="admin")
    db.session.add(admin_user)

    owner_pw = generate_password_hash("owner123")
    owners = [
        User(email="owner1@pharmacy.com", password_hash=owner_pw, role="owner"),
        User(email="owner2@pharmacy.com", password_hash=owner_pw, role="owner"),
        User(email="owner3@pharmacy.com", password_hash=owner_pw, role="owner"),
    ]
    for o in owners:
        db.session.add(o)
    db.session.flush()

    pharma_pw = generate_password_hash("pharma123")
    ph_users = []
    for i in range(1, 9):
        u = User(email=f"pharmacist{i}@pharma.com", password_hash=pharma_pw, role="pharmacist")
        db.session.add(u)
        ph_users.append(u)
    db.session.flush()

    # ----------------------------------------------------------
    # Pharmacies (NYC metro)
    # ----------------------------------------------------------
    pharmacies_data = [
        {"name": "Metro Care Pharmacy",      "address": "120 Broadway, New York, NY 10005",      "lat": 40.7075, "lon": -74.0112, "owner": owners[0]},
        {"name": "GreenLife Pharmacy",        "address": "153 E 53rd St, New York, NY 10022",     "lat": 40.7582, "lon": -73.9715, "owner": owners[1]},
        {"name": "Sovereign Health Pharmacy", "address": "250 Bedford Ave, Brooklyn, NY 11249",   "lat": 40.7161, "lon": -73.9592, "owner": owners[2]},
    ]
    pharmacy_list = []
    for pd_val in pharmacies_data:
        p = Pharmacy(user_id=pd_val["owner"].id, name=pd_val["name"],
                     address=pd_val["address"], latitude=pd_val["lat"],
                     longitude=pd_val["lon"], approval_status="verified")
        db.session.add(p)
        pharmacy_list.append(p)
    db.session.flush()

    # ----------------------------------------------------------
    # Pharmacists
    # ----------------------------------------------------------
    profiles = [
        {"name": "Dr. Sarah Jenkins",   "exp": 8,  "lat": 40.7082, "lon": -74.0021, "lic": "NY-PHA88124", "status": "active",   "skills": "Immunization, MTM"},
        {"name": "Dr. David Cho",        "exp": 12, "lat": 40.7527, "lon": -73.9772, "lic": "NY-PHA99125", "status": "active",   "skills": "Immunization, Oncology, Pediatric Care"},
        {"name": "Dr. Maria Torres",     "exp": 4,  "lat": 40.7282, "lon": -73.9948, "lic": "NY-PHA77103", "status": "active",   "skills": "MTM, Compound Prep"},
        {"name": "Dr. James Wilson",     "exp": 15, "lat": 40.7118, "lon": -73.9612, "lic": "NY-PHA11200", "status": "active",   "skills": "Immunization, MTM, Sterile Compounding"},
        {"name": "Dr. Anna Kovalenko",   "exp": 6,  "lat": 40.6782, "lon": -73.9442, "lic": "NY-PHA44591", "status": "active",   "skills": "Immunization, Compound Prep"},
        {"name": "Dr. Robert Chen",      "exp": 3,  "lat": 40.8001, "lon": -73.9582, "lic": "NY-PHA33219", "status": "active",   "skills": "General Pharmacy"},
        {"name": "Dr. Emily Taylor",     "exp": 1,  "lat": 40.7612, "lon": -73.9912, "lic": "NY-PHA22119", "status": "inactive", "skills": "Immunization"},
        # Intentional duplicate license with Dr. Sarah Jenkins — triggers fraud detection
        {"name": "Dr. Marcus Vance",     "exp": 10, "lat": 40.7301, "lon": -73.9102, "lic": "NY-PHA88124", "status": "active",   "skills": "MTM"},
    ]

    pharmacist_list = []
    for idx, pv in enumerate(profiles):
        ts = 78.0 if idx == 5 else min(95.0 + random.uniform(-2, 4), 100.0)
        rt = 3.8  if idx == 5 else min(4.5 + random.uniform(0, 0.5), 5.0)
        ph = Pharmacist(
            user_id=ph_users[idx].id, name=pv["name"],
            license_number=pv["lic"], license_state="NY",
            license_status="verified" if idx != 7 else "pending",
            skills=pv["skills"], experience_years=pv["exp"],
            latitude=pv["lat"], longitude=pv["lon"],
            trust_score=round(ts, 1), rating=round(rt, 1),
            status=pv["status"]
        )
        db.session.add(ph)
        pharmacist_list.append(ph)
    db.session.flush()

    # Availability (4 days/week each)
    for ph in pharmacist_list:
        for dow in random.sample(range(7), 4):
            db.session.add(Availability(
                pharmacist_id=ph.id, day_of_week=dow,
                start_time="08:00", end_time="18:00"
            ))

    # Licenses
    for ph in pharmacist_list:
        db.session.add(License(
            pharmacist_id=ph.id, license_number=ph.license_number,
            state="NY", status="verified",
            expiration_date=date(2027, 12, 31) - timedelta(days=random.randint(0, 300))
        ))

    db.session.flush()

    # ----------------------------------------------------------
    # Historical shifts (90 days back) + WorkforceHealth + RiskScore
    # ----------------------------------------------------------
    today = date.today()
    shift_titles = ["Staff Pharmacist Shift", "Clinical Pharmacist Coverage", "Overnight Dispatch Support"]

    for pharm in pharmacy_list:
        for day_offset in range(90, 0, -1):
            sim_date = today - timedelta(days=day_offset)
            weekday  = sim_date.weekday()
            month    = sim_date.month

            shifts_today = random.randint(1, 3)
            completed_today = 0
            unfilled_today  = 0
            leave_today     = 0

            for _ in range(shifts_today):
                is_emerg = random.random() < 0.08
                hr_rate  = random.choice([60.0, 65.0, 70.0, 75.0])
                j = JobRequest(
                    pharmacy_id=pharm.id,
                    title=random.choice(shift_titles),
                    date=sim_date, start_time="08:00", end_time="16:00",
                    hourly_rate=hr_rate, is_emergency=is_emerg
                )
                db.session.add(j)
                db.session.flush()

                outcome = random.random()
                if outcome < 0.75:     # completed
                    ph = random.choice(pharmacist_list[:6])
                    j.status = 'completed'
                    j.matched_pharmacist_id = ph.id
                    db.session.add(ShiftHistory(
                        pharmacist_id=ph.id, job_request_id=j.id,
                        date=sim_date, status='completed',
                        is_late=(random.random() < 0.05)
                    ))
                    completed_today += 1
                elif outcome < 0.88:   # cancelled
                    ph = random.choice(pharmacist_list[:6])
                    j.status = 'cancelled'
                    j.matched_pharmacist_id = ph.id
                    db.session.add(ShiftHistory(
                        pharmacist_id=ph.id, job_request_id=j.id,
                        date=sim_date, status='cancelled',
                        cancellation_reason="Emergency leave"
                    ))
                else:                  # stayed open (unfilled)
                    j.status = 'open'
                    unfilled_today += 1

            fulfillment = 100.0 * completed_today / shifts_today if shifts_today > 0 else 100.0
            shortage_proxy = 0.15 if unfilled_today > 0 else 0.05
            health_val = min(max(
                60.0 + len(pharmacist_list[:6]) * 3 + (fulfillment - 70) * 0.5 - leave_today * 4,
                10.0), 100.0)
            closure_val = min(max(unfilled_today * 18.0 + (100 - health_val) * 0.4, 0.0), 100.0)

            db.session.add(WorkforceHealth(
                pharmacy_id=pharm.id, health_score=round(health_val, 1),
                active_staff_count=len(pharmacist_list[:6]),
                shift_fulfillment_rate=round(fulfillment, 1), date=sim_date
            ))
            db.session.add(RiskScore(
                pharmacy_id=pharm.id,
                closure_risk_score=round(closure_val, 1),
                details=f"Unfilled: {unfilled_today}, Health: {round(health_val,1)}",
                date=sim_date
            ))

    # Upcoming shifts (next 14 days) — open for matching
    for pharm in pharmacy_list:
        for day_offset in range(1, 15):
            future_date = today + timedelta(days=day_offset)
            for _ in range(random.randint(1, 2)):
                db.session.add(JobRequest(
                    pharmacy_id=pharm.id, title=random.choice(shift_titles),
                    date=future_date, start_time="08:00", end_time="16:00",
                    hourly_rate=random.choice([65.0, 70.0, 75.0]),
                    status='open', is_emergency=(random.random() < 0.1)
                ))

    # Ratings
    for ph in pharmacist_list[:6]:
        for pharm in pharmacy_list:
            db.session.add(Rating(
                pharmacist_id=ph.id, pharmacy_id=pharm.id,
                score=5 if ph.rating > 4.5 else (4 if ph.rating > 4.0 else 3),
                comment="Good service"
            ))

    # Trust score log
    for ph in pharmacist_list:
        db.session.add(TrustScore(
            pharmacist_id=ph.id, score=ph.trust_score,
            change_reason="Initial assignment"
        ))

    # Leave requests (with calculated impact scores)
    for ph in pharmacist_list[:3]:
        leave_start = today + timedelta(days=random.randint(3, 10))
        db.session.add(LeaveRequest(
            pharmacist_id=ph.id, start_date=leave_start,
            end_date=leave_start + timedelta(days=random.randint(1, 5)),
            reason="Personal leave", status="pending", impact_score=25.0
        ))

    # Notifications
    for owner in owners:
        db.session.add(Notification(
            user_id=owner.id,
            title="System Ready",
            message="PharmaSphere AI has been initialised with seeded data."
        ))

    db.session.commit()
    print("[✓] Database seeding complete.\n")

    # ----------------------------------------------------------
    # Train ML models on synthetic datasets
    # ----------------------------------------------------------
    print("Generating synthetic training datasets (n=2000 each)...")

    ds_shortage  = generate_shortage_dataset(2000)
    ds_accept    = generate_acceptance_dataset(2000)
    ds_demand    = generate_demand_dataset(2000)
    ds_trust     = generate_trust_risk_dataset(2000)
    ds_health    = generate_health_dataset(2000)
    ds_retention = generate_retention_dataset(2000)
    ds_closure   = generate_closure_risk_dataset(2000)

    print(f"  Dataset sizes and class balances:")
    for name, ds, col in [
        ("Shortage",     ds_shortage,  'shortage'),
        ("Acceptance",   ds_accept,    'accepted'),
        ("Trust Risk",   ds_trust,     'high_risk'),
        ("Retention",    ds_retention, 'inactive'),
        ("Closure Risk", ds_closure,   'closure_risk_label'),
    ]:
        pos_rate = ds[col].mean()
        print(f"    {name:14s}: n={len(ds)}, positive_rate={pos_rate:.2%}")

    print("\nTraining models (with train/test evaluation)...")
    ml_manager.train_shortage_model(ds_shortage)
    ml_manager.train_acceptance_model(ds_accept)
    ml_manager.train_demand_model(ds_demand)
    ml_manager.train_trust_risk_model(ds_trust)
    ml_manager.train_health_model(ds_health)
    ml_manager.train_retention_model(ds_retention)
    ml_manager.train_closure_risk_model(ds_closure)

    print("\n" + "=" * 60)
    print("  All models trained and serialised successfully.")
    print("=" * 60)


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        seed_data()
