
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta

from models import db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory, Availability, Rating, TrustScore, License, LeaveRequest, EmergencyRequest, WorkforceHealth, RiskScore, Notification
from utils import robust_parse_date, get_current_user_or_error
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager, ModelNotLoadedError

leaves_bp = Blueprint('leaves', __name__, url_prefix='')

# 5. Smart Leave Management
# ==========================================
@leaves_bp.route('/api/leaves', methods=['GET'])
@jwt_required()
def get_leaves():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role == 'owner' and user.pharmacy:
        # Owner sees leaves submitted by nearby pharmacists
        # Filter leaves by active pharmacists in area
        leaves = LeaveRequest.query.order_by(LeaveRequest.start_date.asc()).all()
        results = []
        for lv in leaves:
            ph = lv.pharmacist
            dist = calculate_distance(user.pharmacy.latitude, user.pharmacy.longitude, ph.latitude, ph.longitude)
            if dist <= 30.0:  # within 30 miles
                results.append({
                    "id": lv.id,
                    "pharmacist_id": ph.id,
                    "pharmacist_name": ph.name,
                    "rating": ph.rating,
                    "trust_score": ph.trust_score,
                    "start_date": lv.start_date.strftime("%Y-%m-%d"),
                    "end_date": lv.end_date.strftime("%Y-%m-%d"),
                    "reason": lv.reason,
                    "status": lv.status,
                    "impact_score": lv.impact_score,
                    "suggested_replacement": lv.suggested_replacement.name if lv.suggested_replacement else None
                })
        return jsonify(results), 200
        
    elif user.role == 'pharmacist':
        leaves = LeaveRequest.query.filter_by(pharmacist_id=user.pharmacist.id).order_by(LeaveRequest.start_date.asc()).all()
        return jsonify([{
            "id": lv.id,
            "start_date": lv.start_date.strftime("%Y-%m-%d"),
            "end_date": lv.end_date.strftime("%Y-%m-%d"),
            "reason": lv.reason,
            "status": lv.status,
            "impact_score": lv.impact_score,
            "suggested_replacement": lv.suggested_replacement.name if lv.suggested_replacement else None
        } for lv in leaves]), 200
        
    return jsonify([]), 200

@leaves_bp.route('/api/leaves/request', methods=['POST'])
@jwt_required()
def request_leave():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'pharmacist' or not user.pharmacist:
        return jsonify({"error": "Unauthorized"}), 403
        
    ph = user.pharmacist
    data = request.get_json() or {}
    start_date_str = data.get('start_date')
    end_date_str = data.get('end_date')
    reason = data.get('reason')
    
    if not start_date_str or not end_date_str:
        return jsonify({"error": "Dates are required"}), 400
        
    try:
        start_date = robust_parse_date(start_date_str)
        end_date = robust_parse_date(end_date_str)
        
        # Predict leave impact score
        # Higher score if the pharmacist is already scheduled for shifts in this period
        scheduled_shifts_in_range = JobRequest.query.filter(
            JobRequest.matched_pharmacist_id == ph.id,
            JobRequest.date >= start_date,
            JobRequest.date <= end_date,
            JobRequest.status == 'matched'
        ).all()
        
        impact = 10.0
        if scheduled_shifts_in_range:
            # 30% risk boost per scheduled shift impacted
            impact += len(scheduled_shifts_in_range) * 25.0
        impact = min(impact, 100.0)
        
        # Auto-suggest replacement pharmacist:
        # Find a nearby verified pharmacist who is available
        replacement_ph = None
        all_active = Pharmacist.query.filter(
            Pharmacist.status == 'active',
            Pharmacist.license_status == 'verified',
            Pharmacist.id != ph.id
        ).all()
        
        for candidate in all_active:
            # Check coordinates distance from pharmacist's typical work area
            dist = calculate_distance(ph.latitude, ph.longitude, candidate.latitude, candidate.longitude)
            if dist <= 15.0: # Close replacement candidate
                # Ensure availability is registered
                # checking availability on the start date weekday
                avail = Availability.query.filter_by(pharmacist_id=candidate.id, day_of_week=start_date.weekday()).first()
                if avail:
                    replacement_ph = candidate
                    break
        
        lv = LeaveRequest(
            pharmacist_id=ph.id,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
            status='pending',
            impact_score=impact,
            replacement_suggested_id=replacement_ph.id if replacement_ph else None
        )
        db.session.add(lv)
        db.session.commit()
        
        return jsonify({
            "message": "Leave request submitted successfully",
            "impact_score": impact,
            "suggested_replacement": replacement_ph.name if replacement_ph else None
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Submission failed: {str(e)}"}), 500

@leaves_bp.route('/api/leaves/<int:leave_id>/<action>', methods=['POST'])
@jwt_required()
def handle_leave_action(leave_id, action):
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner':
        return jsonify({"error": "Unauthorized"}), 403
        
    lv = LeaveRequest.query.get(leave_id)
    if not lv:
        return jsonify({"error": "Leave request not found"}), 404
        
    if action not in ['approve', 'reject']:
        return jsonify({"error": "Invalid action"}), 400
        
    try:
        lv.status = 'approved' if action == 'approve' else 'rejected'
        db.session.add(lv)
        
        # If approved, we need to cancel any matched shifts for this pharmacist in this date range
        if action == 'approve':
            shifts = JobRequest.query.filter(
                JobRequest.matched_pharmacist_id == lv.pharmacist_id,
                JobRequest.date >= lv.start_date,
                JobRequest.date <= lv.end_date,
                JobRequest.status == 'matched'
            ).all()
            
            for sh in shifts:
                sh.status = 'open'  # put back to open marketplace
                sh.matched_pharmacist_id = None
                
                # Auto-assign the pre-suggested replacement if available
                if lv.replacement_suggested_id:
                    sh.status = 'matched'
                    sh.matched_pharmacist_id = lv.replacement_suggested_id
                    
                db.session.add(sh)
                
        # Notify pharmacist
        notif = Notification(
            user_id=lv.pharmacist.user.id,
            title=f"Leave Request {action.capitalize()}d",
            message=f"Your leave request for {lv.start_date.strftime('%Y-%m-%d')} has been {action}d."
        )
        db.session.add(notif)
        db.session.commit()
        
        return jsonify({"message": f"Leave request {action}d successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Action failed: {str(e)}"}), 500

# ==========================================
