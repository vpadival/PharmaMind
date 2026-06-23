
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta, timezone

from models import db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory, Availability, Rating, TrustScore, License, LeaveRequest, EmergencyRequest, WorkforceHealth, RiskScore, Notification
from utils import robust_parse_date, get_current_user_or_error
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager, ModelNotLoadedError

admin_bp = Blueprint('admin', __name__, url_prefix='')

# 8. Admin Module & Fraud Detection
# ==========================================
@admin_bp.route('/api/admin/licenses', methods=['GET'])
@jwt_required()
def get_pending_licenses():
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500
        
    if user.role not in ['admin', 'owner']:
        return jsonify({"error": "Unauthorized"}), 403
        
    # Fetch pharmacists with licenses
    pharmacists = Pharmacist.query.order_by(Pharmacist.license_status.desc()).all()
    results = []
    for p in pharmacists:
        lic = License.query.filter_by(pharmacist_id=p.id).first()
        results.append({
            "pharmacist_id": p.id,
            "name": p.name,
            "license_number": p.license_number,
            "license_state": p.license_state,
            "license_status": p.license_status,
            "expiration_date": lic.expiration_date.strftime("%Y-%m-%d") if lic else "N/A"
        })
        
    return jsonify(results), 200

@admin_bp.route('/api/admin/licenses/<int:ph_id>/verify', methods=['POST'])
@jwt_required()
def verify_license(ph_id):
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500
        
    if user.role != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json() or {}
    approve = data.get('approve', True)
    
    ph = Pharmacist.query.get(ph_id)
    if not ph:
        return jsonify({"error": "Pharmacist not found"}), 404
        
    lic = License.query.filter_by(pharmacist_id=ph.id).first()
    
    try:
        status = 'verified' if approve else 'rejected'
        ph.license_status = status
        db.session.add(ph)
        
        if lic:
            lic.status = status
            lic.verified_at = datetime.now(timezone.utc)
            lic.verified_by = user.id
            db.session.add(lic)
            
        # Notify pharmacist
        notif = Notification(
            user_id=ph.user_id,
            title="License Verification Update",
            message=f"Your pharmacist license has been {status} by the admin."
        )
        db.session.add(notif)
        db.session.commit()
        
        return jsonify({"message": f"License successfully {status}"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@admin_bp.route('/api/admin/pharmacies', methods=['GET'])
@jwt_required()
def get_admin_pharmacies():
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500
        
    if user.role != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    pharmacies = Pharmacy.query.all()
    results = []
    for p in pharmacies:
        results.append({
            "id": p.id,
            "name": p.name,
            "address": p.address,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "approval_status": p.approval_status or 'pending',
            "owner_email": p.user.email if p.user else "N/A"
        })
    return jsonify(results), 200

@admin_bp.route('/api/admin/pharmacies/<int:pharm_id>/verify', methods=['POST'])
@jwt_required()
def verify_pharmacy(pharm_id):
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500
        
    if user.role != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json() or {}
    approve = data.get('approve', True)
    
    pharm = Pharmacy.query.get(pharm_id)
    if not pharm:
        return jsonify({"error": "Pharmacy not found"}), 404
        
    try:
        status = 'verified' if approve else 'rejected'
        pharm.approval_status = status
        db.session.add(pharm)
        
        # Notify owner
        notif = Notification(
            user_id=pharm.user_id,
            title="Pharmacy Verification Update",
            message=f"Your pharmacy profile status has been updated to {status} by the admin."
        )
        db.session.add(notif)
        db.session.commit()
        
        return jsonify({"message": f"Pharmacy successfully {status}"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@admin_bp.route('/api/profile/update', methods=['POST'])
@jwt_required()
def update_profile():
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500
        
    data = request.get_json() or {}
    
    try:
        if user.role == 'owner' and user.pharmacy:
            pharm: Pharmacy = user.pharmacy
            pharm.name = str(data.get('name', pharm.name))
            pharm.address = str(data.get('address', pharm.address))
            lat = data.get('latitude')
            if lat is not None: pharm.latitude = float(lat)
            lon = data.get('longitude')
            if lon is not None: pharm.longitude = float(lon)
            # Reset status to pending so admin can re-verify if details change
            pharm.approval_status = 'pending'
            db.session.add(pharm)
            db.session.commit()
            return jsonify({
                "message": "Pharmacy details updated successfully. Pending administrator approval.",
                "pharmacy": {
                    "id": pharm.id,
                    "name": pharm.name,
                    "address": pharm.address,
                    "latitude": pharm.latitude,
                    "longitude": pharm.longitude,
                    "approval_status": pharm.approval_status
                }
            }), 200
            
        elif user.role == 'pharmacist' and user.pharmacist:
            ph: Pharmacist = user.pharmacist
            ph.name = str(data.get('name', ph.name))
            ph.license_number = str(data.get('license_number', ph.license_number))
            ph.license_state = str(data.get('license_state', ph.license_state))
            ph.skills = str(data.get('skills', ph.skills))
            exp = data.get('experience_years')
            if exp is not None: ph.experience_years = int(exp)
            lat = data.get('latitude')
            if lat is not None: ph.latitude = float(lat)
            lon = data.get('longitude')
            if lon is not None: ph.longitude = float(lon)
            # Reset status to pending
            ph.license_status = 'pending'
            db.session.add(ph)
            
            # Check License table entry
            lic = License.query.filter_by(pharmacist_id=ph.id).first()
            if lic:
                lic.license_number = ph.license_number
                lic.state = ph.license_state
                lic.status = 'pending'
                db.session.add(lic)
            
            db.session.commit()
            return jsonify({
                "message": "Pharmacist details updated successfully. Pending administrator approval.",
                "pharmacist": {
                    "id": ph.id,
                    "name": ph.name,
                    "license_number": ph.license_number,
                    "license_status": ph.license_status,
                    "trust_score": ph.trust_score,
                    "rating": ph.rating,
                    "skills": ph.skills,
                    "experience_years": ph.experience_years,
                    "latitude": ph.latitude,
                    "longitude": ph.longitude
                }
            }), 200
            
        return jsonify({"error": "Profile not found or invalid role"}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update profile: {str(e)}"}), 500

@admin_bp.route('/api/admin/fraud-audit', methods=['GET'])
@jwt_required()
def run_fraud_audit():
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500
        
    if user.role != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
        
    flags = []
    
    # 1. Duplicate License Check
    lic_counts = db.session.query(License.license_number, db.func.count(License.id)).group_by(License.license_number).all()
    for number, count in lic_counts:
        if count > 1:
            dupes = Pharmacist.query.filter_by(license_number=number).all()
            names = ", ".join([d.name for d in dupes])
            flags.append({
                "type": "DUPLICATE_LICENSE",
                "severity": "CRITICAL",
                "details": f"License {number} is linked to multiple accounts: {names}.",
                "action_required": "Suspend account and request manual state registry verification."
            })
            
    # 2. Suspicious Activity Pattern: High Cancellations
    low_trust_ph = Pharmacist.query.filter(Pharmacist.trust_score <= 82.0).all()
    for lp in low_trust_ph:
        flags.append({
            "type": "HIGH_CANCELLATION_RATE",
            "severity": "WARNING",
            "details": f"Pharmacist {lp.name} has a Trust Score of {lp.trust_score}%. High risk of shift failure.",
            "action_required": "Flag profile, limit emergency dispatch access, and schedule reviews."
        })
        
    # 3. Geo-Location Outliers
    outliers = Pharmacist.query.filter((Pharmacist.latitude == 0) | (Pharmacist.longitude == 0)).all()
    for out in outliers:
        flags.append({
            "type": "INVALID_GEOLOCATION",
            "severity": "LOW",
            "details": f"Pharmacist {out.name} registered with coordinates (0,0).",
            "action_required": "Request address update."
        })
        
    return jsonify(flags), 200

# 9. Notification Center
# ==========================================
@admin_bp.route('/api/notifications', methods=['GET'])
@jwt_required()
def get_notifications():
    user_id = get_jwt_identity()
    notifs = Notification.query.filter_by(user_id=int(user_id)).order_by(Notification.created_at.desc()).all()
    return jsonify([{
        "id": n.id,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "created_at": n.created_at.strftime("%Y-%m-%d %H:%M")
    } for n in notifs]), 200

@admin_bp.route('/api/notifications/<int:n_id>/read', methods=['POST'])
@jwt_required()
def mark_notification_read(n_id):
    n = Notification.query.get(n_id)
    if n:
        n.is_read = True
        db.session.add(n)
        db.session.commit()
    return jsonify({"success": True}), 200

# ==========================================
# 10. Analytics & Reports (live data)
# ==========================================
@admin_bp.route('/api/analytics/summary', methods=['GET'])
@jwt_required()
def get_analytics_summary():
    """
    Returns live KPI aggregates and chart data for the Analytics & Reports page.
    Accessible by admin. Owners receive data scoped to their pharmacy.
    """
    user, err = get_current_user_or_error()
    if not user:
        return jsonify({"error": err[0] if err else "Unknown error"}), err[1] if err else 500

    today = datetime.now(timezone.utc).date()
    thirty_days_ago = today - timedelta(days=29)

    # --- Scope: admin sees all, owner sees their pharmacy only ---
    if user.role == 'admin':
        job_query  = JobRequest.query
        ph_query   = Pharmacist.query
        pharm_query = Pharmacy.query
    elif user.role == 'owner' and user.pharmacy:
        pid = user.pharmacy.id
        job_query  = JobRequest.query.filter_by(pharmacy_id=pid)
        ph_query   = Pharmacist.query  # all nearby — for pool context
        pharm_query = Pharmacy.query.filter_by(id=pid)
    else:
        return jsonify({"error": "Unauthorized"}), 403

    # --- KPI 1: Total shifts in last 30 days ---
    total_shifts = job_query.filter(JobRequest.date >= thirty_days_ago).count()

    # --- KPI 2: Shift fill rate (completed / (completed + cancelled)) ---
    completed = job_query.filter_by(status='completed').count()
    cancelled = job_query.filter_by(status='cancelled').count()
    fill_denom = completed + cancelled
    fill_rate = round(100.0 * completed / fill_denom, 1) if fill_denom > 0 else 0.0

    # --- KPI 3: Avg response time proxy (minutes between creation and match) ---
    # Use ShiftHistory records where we have timestamps
    matched_jobs = job_query.filter(
        JobRequest.status.in_(['matched', 'completed']),
        JobRequest.date >= thirty_days_ago
    ).all()
    response_times = []
    for j in matched_jobs:
        history = ShiftHistory.query.filter_by(job_request_id=j.id).first()
        if history:
            delta_minutes = (history.created_at - j.created_at).total_seconds() / 60.0
            if 0 < delta_minutes < 1440:  # ignore outliers > 24h
                response_times.append(delta_minutes)
    avg_response = round(sum(response_times) / len(response_times), 1) if response_times else None

    # --- KPI 4: Average pharmacist rating ---
    all_ratings = Rating.query.all() if user.role == 'admin' else \
                  Rating.query.filter_by(pharmacy_id=user.pharmacy.id).all()
    avg_rating = round(sum(r.score for r in all_ratings) / len(all_ratings), 2) if all_ratings else None

    # --- Chart: daily shift volume for last 14 days ---
    daily_shifts = []
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        count = job_query.filter(JobRequest.date == day).count()
        daily_shifts.append({"day": day.strftime("%b %d"), "Shifts": count})

    # --- Chart: shift status breakdown ---
    status_counts = {
        "Open":      job_query.filter_by(status='open').count(),
        "Matched":   job_query.filter_by(status='matched').count(),
        "Completed": completed,
        "Cancelled": cancelled,
    }
    status_chart = [{"name": k, "value": v} for k, v in status_counts.items() if v > 0]

    # --- Chart: workforce health trend (last 14 days from DB) ---
    health_rows = WorkforceHealth.query
    if user.role == 'owner':
        health_rows = health_rows.filter_by(pharmacy_id=user.pharmacy.id)
    health_rows = health_rows.filter(
        WorkforceHealth.date >= today - timedelta(days=13)
    ).order_by(WorkforceHealth.date.asc()).all()
    health_trend = [
        {
            "day": h.date.strftime("%b %d"),
            "HealthScore": round(h.health_score, 1),
            "FillRate": round(h.shift_fulfillment_rate, 1),
        }
        for h in health_rows
    ]

    # --- Table: top pharmacies by fill rate (admin only) ---
    top_pharmacies = []
    if user.role == 'admin':
        for pharm in pharm_query.all():
            p_completed = JobRequest.query.filter_by(pharmacy_id=pharm.id, status='completed').count()
            p_total     = JobRequest.query.filter(
                JobRequest.pharmacy_id == pharm.id,
                JobRequest.status.in_(['completed', 'cancelled'])
            ).count()
            p_fill = round(100.0 * p_completed / p_total, 1) if p_total > 0 else 0.0
            p_ratings = Rating.query.filter_by(pharmacy_id=pharm.id).all()
            p_avg_rating = round(sum(r.score for r in p_ratings) / len(p_ratings), 1) if p_ratings else 0.0
            total_pharm_shifts = JobRequest.query.filter_by(pharmacy_id=pharm.id).count()
            top_pharmacies.append({
                "name": pharm.name,
                "fillRate": f"{p_fill}%",
                "rating": p_avg_rating,
                "shifts": total_pharm_shifts,
            })
        top_pharmacies.sort(key=lambda x: x["shifts"], reverse=True)

    return jsonify({
        "kpis": {
            "total_shifts":   total_shifts,
            "fill_rate":      fill_rate,
            "avg_response_min": avg_response,
            "avg_rating":     avg_rating,
        },
        "daily_shifts_chart":  daily_shifts,
        "status_breakdown":    status_chart,
        "health_trend":        health_trend,
        "top_pharmacies":      top_pharmacies,
    }), 200

