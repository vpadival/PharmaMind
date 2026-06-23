
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta

from models import db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory, Availability, Rating, TrustScore, License, LeaveRequest, EmergencyRequest, WorkforceHealth, RiskScore, Notification
from utils import robust_parse_date, get_current_user_or_error
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager, ModelNotLoadedError

jobs_bp = Blueprint('jobs', __name__, url_prefix='')

# 1. Pharmacist Marketplace / Job Board
# ==========================================

@jobs_bp.route('/api/jobs', methods=['GET'])
@jwt_required()
def get_jobs():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    status_filter = request.args.get('status')
    emergency_filter = request.args.get('is_emergency')
    
    query = JobRequest.query
    
    # Role-based scoping
    if user.role == 'owner' and user.pharmacy:
        query = query.filter_by(pharmacy_id=user.pharmacy.id)
    elif user.role == 'pharmacist':
        # Pharmacists see available open shifts, or their own matched shifts
        ph_filter = request.args.get('scope') # 'my-shifts' or 'marketplace'
        if ph_filter == 'my-shifts':
            query = query.filter_by(matched_pharmacist_id=user.pharmacist.id)
        else:
            # Marketplace shows open shifts (only upcoming shifts on or after today)
            today = datetime.utcnow().date()
            query = query.filter_by(status='open').filter(JobRequest.date >= today)
            
    if status_filter:
        query = query.filter_by(status=status_filter)
    if emergency_filter:
        is_emerg = emergency_filter.lower() == 'true'
        query = query.filter_by(is_emergency=is_emerg)
        
    jobs = query.order_by(JobRequest.date.asc(), JobRequest.start_time.asc()).all()
    
    results = []
    for j in jobs:
        pharm = j.pharmacy
        matched_ph = j.matched_pharmacist
        
        dist = None
        if user.role == 'pharmacist' and user.pharmacist and pharm:
            dist = calculate_distance(user.pharmacist.latitude, user.pharmacist.longitude, pharm.latitude, pharm.longitude)
            
        job_dict = {
            "id": j.id,
            "pharmacy_id": j.pharmacy_id,
            "pharmacy_name": pharm.name if pharm else "Unknown",
            "pharmacy_address": pharm.address if pharm else "",
            "title": j.title,
            "description": j.description,
            "date": j.date.strftime("%Y-%m-%d"),
            "start_time": j.start_time,
            "end_time": j.end_time,
            "hourly_rate": j.hourly_rate,
            "status": j.status,
            "is_emergency": j.is_emergency,
            "is_auto_replacement": j.is_auto_replacement,
            "distance_miles": round(dist, 1) if dist is not None else None,
            "matched_pharmacist": {
                "id": matched_ph.id,
                "name": matched_ph.name,
                "rating": matched_ph.rating,
                "trust_score": matched_ph.trust_score
            } if matched_ph else None
        }
        results.append(job_dict)
        
    return jsonify(results), 200

@jobs_bp.route('/api/jobs', methods=['POST'])
@jwt_required()
def create_job():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized. Only pharmacy owners can post shifts."}), 403
        
    data = request.get_json() or {}
    title = data.get('title')
    description = data.get('description', '')
    date_str = data.get('date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    hourly_rate = data.get('hourly_rate')
    is_emergency = data.get('is_emergency', False)
    
    if not title or not date_str or not start_time or not end_time or not hourly_rate:
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        job_date = robust_parse_date(date_str)
        job = JobRequest(
            pharmacy_id=user.pharmacy.id,
            title=title,
            description=description,
            date=job_date,
            start_time=start_time,
            end_time=end_time,
            hourly_rate=float(hourly_rate),
            status='open',
            is_emergency=bool(is_emergency)
        )
        db.session.add(job)
        db.session.commit()
        
        # If emergency, bind to emergency board
        if is_emergency:
            er = EmergencyRequest(
                job_request_id=job.id,
                base_rate=float(hourly_rate) - 15.0,
                incentive_bonus=15.0,
                status='open'
            )
            db.session.add(er)
            db.session.commit()
            
            # Notify nearest pharmacists of emergency shift!
            all_ph = Pharmacist.query.filter_by(status='active', license_status='verified').all()
            for ph in all_ph:
                dist = calculate_distance(user.pharmacy.latitude, user.pharmacy.longitude, ph.latitude, ph.longitude)
                if dist <= 20.0:  # within 20 miles
                    notif = Notification(
                        user_id=ph.user_id,
                        title="EMERGENCY SHIFT BROADCAST",
                        message=f"Urgent shift posted at {user.pharmacy.name}: {title} ({date_str}). One-click accept available."
                    )
                    db.session.add(notif)
            db.session.commit()

        return jsonify({"message": "Staffing request posted successfully", "job_id": job.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create shift: {str(e)}"}), 500

@jobs_bp.route('/api/jobs/<int:job_id>/accept', methods=['POST'])
@jwt_required()
def accept_job(job_id):
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'pharmacist' or not user.pharmacist:
        return jsonify({"error": "Unauthorized. Only pharmacists can apply for shifts."}), 403
        
    ph = user.pharmacist
    if ph.license_status != 'verified':
        return jsonify({"error": "License pending verification. You cannot apply for shifts until verified."}), 403
        
    job = JobRequest.query.get(job_id)
    if not job:
        return jsonify({"error": "Shift not found"}), 404
        
    if job.status != 'open':
        return jsonify({"error": "Shift is already filled, pending, or completed"}), 400
        
    try:
        # Shift state changes to 'applied' (pending owner review)
        job.status = 'applied'
        job.matched_pharmacist_id = ph.id
        db.session.add(job)
        
        # Notify owner of application
        notif = Notification(
            user_id=job.pharmacy.user.id,
            title="Shift Application Received",
            message=f"Pharmacist {ph.name} (Trust Score: {ph.trust_score}%) has requested to book your shift: {job.title} on {job.date.strftime('%Y-%m-%d')}. Review and approve inside your dashboard."
        )
        db.session.add(notif)
        
        db.session.commit()
        return jsonify({"message": "Application submitted successfully. Pending owner approval."}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Application failed: {str(e)}"}), 500

@jobs_bp.route('/api/jobs/<int:job_id>/approve-application', methods=['POST'])
@jwt_required()
def approve_application(job_id):
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized. Only pharmacy owners can approve applications."}), 403
        
    job = JobRequest.query.get(job_id)
    if not job:
        return jsonify({"error": "Shift not found"}), 404
        
    if job.pharmacy_id != user.pharmacy.id:
        return jsonify({"error": "Unauthorized. You do not own this pharmacy."}), 403
        
    if job.status != 'applied' or not job.matched_pharmacist_id:
        return jsonify({"error": "No pending application found for this shift."}), 400
        
    try:
        # Finalize booking: change status to 'matched'
        job.status = 'matched'
        db.session.add(job)
        
        # Create ShiftHistory record
        sh = ShiftHistory(
            pharmacist_id=job.matched_pharmacist_id,
            job_request_id=job.id,
            date=job.date,
            status='completed'  # provisionally completed; becomes permanent on shift date
        )
        db.session.add(sh)
        
        # If emergency, update EmergencyRequest status
        er = EmergencyRequest.query.filter_by(job_request_id=job.id).first()
        if er:
            er.status = 'accepted'
            er.accepted_by_id = job.matched_pharmacist_id
            db.session.add(er)
            
        # Notify pharmacist of approval and reward trust score (+2, capped at 100)
        ph = Pharmacist.query.get(job.matched_pharmacist_id)
        if ph:
            ph.trust_score = min(100.0, ph.trust_score + 2.0)
            db.session.add(ph)
            db.session.add(TrustScore(
                pharmacist_id=ph.id,
                score=ph.trust_score,
                change_reason=f"Shift booking confirmed: {job.title} on {job.date.strftime("%Y-%m-%d")} (+2 pts)"
            ))
            db.session.add(Notification(
                user_id=ph.user_id,
                title="Shift Booking Confirmed",
                message=f"Pharmacy owner at {job.pharmacy.name} has approved your booking for {job.title} on {job.date.strftime("%Y-%m-%d")}. Trust score +2."
            ))
        db.session.commit()
        return jsonify({"message": "Application approved successfully. Shift is now booked."}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Approval failed: {str(e)}"}), 500

@jobs_bp.route('/api/jobs/<int:job_id>/decline-application', methods=['POST'])
@jwt_required()
def decline_application(job_id):
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized. Only pharmacy owners can decline applications."}), 403
        
    job = JobRequest.query.get(job_id)
    if not job:
        return jsonify({"error": "Shift not found"}), 404
        
    if job.pharmacy_id != user.pharmacy.id:
        return jsonify({"error": "Unauthorized. You do not own this pharmacy."}), 403
        
    if job.status != 'applied' or not job.matched_pharmacist_id:
        return jsonify({"error": "No pending application found for this shift."}), 400
        
    try:
        ph_id = job.matched_pharmacist_id
        
        # Revert status to 'open' and remove pharmacist
        job.status = 'open'
        job.matched_pharmacist_id = None
        db.session.add(job)
        
        # Notify pharmacist of decline
        ph = Pharmacist.query.get(ph_id)
        notif = Notification(
            user_id=ph.user_id,
            title="Shift Booking Declined",
            message=f"Pharmacy owner at {job.pharmacy.name} has declined your booking request for {job.title} on {job.date.strftime('%Y-%m-%d')}."
        )
        db.session.add(notif)
        
        db.session.commit()
        return jsonify({"message": "Application declined successfully. Shift returned to open marketplace."}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Decline failed: {str(e)}"}), 500

@jobs_bp.route('/api/jobs/<int:job_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_job(job_id):
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    job = JobRequest.query.get(job_id)
    if not job:
        return jsonify({"error": "Shift not found"}), 404
        
    try:
        previous_status = job.status
        pharmacist_id = job.matched_pharmacist_id
        
        # Determine who cancelled
        canceller = user.role
        
        job.status = 'cancelled'
        db.session.add(job)
        
        if pharmacist_id:
            # Update pharmacist's trust score (cancellation penalty!)
            ph = Pharmacist.query.get(pharmacist_id)
            if ph and canceller == 'pharmacist':
                penalty = 12.0  # -12 points for cancellation
                ph.trust_score = max(0.0, ph.trust_score - penalty)
                db.session.add(ph)
                
                # Log to TrustScore history
                ts_log = TrustScore(
                    pharmacist_id=ph.id,
                    score=ph.trust_score,
                    change_reason=f"Cancellation penalty for shift on {job.date.strftime('%Y-%m-%d')}"
                )
                db.session.add(ts_log)
                
                # Log in ShiftHistory
                sh = ShiftHistory.query.filter_by(
                    pharmacist_id=ph.id,
                    job_request_id=job.id
                ).first()
                if sh:
                    sh.status = 'cancelled'
                    sh.cancellation_reason = "Cancelled by Pharmacist"
                    db.session.add(sh)
        
        # Auto-Replacement Engine trigger:
        # If cancelled, we want to immediately post an open auto-replacement request,
        # notify the owner, and offer a set of alternative matching pharmacists.
        replacement_job = JobRequest(
            pharmacy_id=job.pharmacy_id,
            title=f"[REPLACEMENT] {job.title}",
            description=f"Auto-replacement coverage request for cancelled shift.",
            date=job.date,
            start_time=job.start_time,
            end_time=job.end_time,
            hourly_rate=job.hourly_rate + 10.0, # Suggest +₹10 incentive automatically
            status='open',
            is_emergency=True, # upgrade to emergency for immediate coverage
            is_auto_replacement=True
        )
        db.session.add(replacement_job)
        db.session.flush()
        
        # Alert owner of cancellation and replacement post
        owner_notif = Notification(
            user_id=job.pharmacy.user_id,
            title="SHIFT CANCELLED - Auto-Replacement Dispatched",
            message=f"Pharmacist cancelled the shift on {job.date.strftime('%Y-%m-%d')}. "
                    f"An auto-replacement shift has been posted on the Emergency board."
        )
        db.session.add(owner_notif)
        
        db.session.commit()
        return jsonify({
            "message": "Shift cancelled. Auto-replacement shift successfully posted.",
            "replacement_job_id": replacement_job.id
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Cancellation failed: {str(e)}"}), 500

@jobs_bp.route('/api/jobs/<int:job_id>/matches', methods=['GET'])
@jwt_required()
def get_job_matches(job_id):
    job = JobRequest.query.get(job_id)
    if not job:
        return jsonify({"error": "Shift not found"}), 404
        
    pharmacy = job.pharmacy
    
    # Sourcing matching pharmacists:
# 2. Auto-Replacement Candidate List
# ==========================================
@jobs_bp.route('/api/jobs/<int:job_id>/auto-replacements', methods=['GET'])
@jwt_required()
def get_auto_replacements(job_id):
    job = JobRequest.query.get(job_id)
    if not job:
        return jsonify({"error": "Shift not found"}), 404
        
    # Get alternative pharmacists who match this shift
    weekday = job.date.weekday()
    pharm = job.pharmacy
    
    candidates = Pharmacist.query.filter_by(status='active', license_status='verified').all()
    recommendations = []
    
    for c in candidates:
        # check distance
        dist = calculate_distance(pharm.latitude, pharm.longitude, c.latitude, c.longitude)
        if dist > 35.0:
            continue
            
        # check availability
        avail = Availability.query.filter_by(pharmacist_id=c.id, day_of_week=weekday).first()
        is_avail = True if (avail and avail.start_time <= job.start_time and avail.end_time >= job.end_time) else False
        
        # Derive shift_completion_rate from actual ShiftHistory records.
        # Using trust_score as a proxy was incorrect — they are different metrics.
        total_shifts_c = ShiftHistory.query.filter_by(pharmacist_id=c.id).count()
        completed_shifts_c = ShiftHistory.query.filter_by(pharmacist_id=c.id, status='completed').count()
        completion_rate_c = (100.0 * completed_shifts_c / total_shifts_c) if total_shifts_c > 0 else 95.0
        cancels_30d_c = ShiftHistory.query.filter(
            ShiftHistory.pharmacist_id == c.id,
            ShiftHistory.status == 'cancelled'
        ).count()

        # Predict cancellation risk score using correct features
        cancel_risk = ml_manager.predict_trust_risk(
            shift_completion_rate=completion_rate_c,
            cancellation_count_last_30d=min(cancels_30d_c, 7),
            avg_rating=c.rating,
            punctuality_rate=95.0
        )
        
        rank_score = (
            c.rating * 15.0 +
            c.trust_score * 0.5 +
            (1.0 - cancel_risk) * 20.0 -
            dist * 0.5
        )
        
        recommendations.append({
            "pharmacist_id": c.id,
            "name": c.name,
            "distance": round(dist, 1),
            "rating": c.rating,
            "trust_score": c.trust_score,
            "cancellation_risk": round(cancel_risk * 100.0, 1),
            "rank_score": round(rank_score, 1),
            "is_available": is_avail
        })
        
    recommendations.sort(key=lambda x: x["rank_score"], reverse=True)
    return jsonify(recommendations[:5]), 200

# ==========================================
