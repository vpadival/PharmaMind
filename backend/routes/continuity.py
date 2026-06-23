
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta

from models import db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory, Availability, Rating, TrustScore, License, LeaveRequest, EmergencyRequest, WorkforceHealth, RiskScore, Notification
from utils import robust_parse_date, get_current_user_or_error
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager, ModelNotLoadedError

continuity_bp = Blueprint('continuity', __name__, url_prefix='')

# 3. Continuity Dashboard & Forecasting
# ==========================================
@continuity_bp.route('/api/continuity/dashboard', methods=['GET'])
@jwt_required()
def get_continuity_dashboard():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized. Owner only."}), 403
        
    pharm = user.pharmacy
    
    # Calculate current status
    # Get active local pool (within 25 miles)
    all_ph = Pharmacist.query.filter_by(status='active', license_status='verified').all()
    local_pool_size = sum(1 for p in all_ph if calculate_distance(pharm.latitude, pharm.longitude, p.latitude, p.longitude) <= 25.0)
    
    # Get open leave requests impact
    pending_leaves = LeaveRequest.query.filter_by(status='pending').all()
    
    # Predict daily metrics for today
    today = datetime.utcnow().date()
    weekday = today.weekday()
    month = today.month
    
    shortage_prob = ml_manager.predict_shortage(
        month=month,
        day_of_week=weekday,
        leave_requests_count=len(pending_leaves),
        active_pharmacists_count=local_pool_size,
        last_week_shortage_rate=0.10
    )
    
    # Fetch upcoming shifts to evaluate health
    unfilled_count = JobRequest.query.filter(
        JobRequest.pharmacy_id == pharm.id,
        JobRequest.date >= today,
        JobRequest.status == 'open'
    ).count()
    
    completed_shifts = JobRequest.query.filter(
        JobRequest.pharmacy_id == pharm.id,
        JobRequest.status == 'completed'
    ).count()
    
    cancelled_shifts = JobRequest.query.filter(
        JobRequest.pharmacy_id == pharm.id,
        JobRequest.status == 'cancelled'
    ).count()
    
    total_historical = completed_shifts + cancelled_shifts
    fulfillment_rate = 100.0
    if total_historical > 0:
        fulfillment_rate = 100.0 * (completed_shifts / total_historical)
        
    health_score = ml_manager.predict_health(
        active_pharmacists=local_pool_size,
        shift_fulfillment_rate=fulfillment_rate,
        leave_requests_count=len(pending_leaves),
        predicted_shortage_prob=shortage_prob
    )
    
    closure_risk = ml_manager.predict_closure_risk(
        unfilled_shifts_count=unfilled_count,
        active_pharmacists_count=local_pool_size,
        health_score=health_score,
        has_emergency_unfilled=(unfilled_count > 0)
    )
    
    # Fetch last 5 records of health and risk scores for charts
    health_history = WorkforceHealth.query.filter_by(pharmacy_id=pharm.id).order_by(WorkforceHealth.date.desc()).limit(8).all()
    risk_history = RiskScore.query.filter_by(pharmacy_id=pharm.id).order_by(RiskScore.date.desc()).limit(8).all()
    
    health_chart = [{
        "date": h.date.strftime("%b %d"),
        "score": h.health_score,
        "fulfillment": h.shift_fulfillment_rate
    } for h in reversed(health_history)]
    
    risk_chart = [{
        "date": r.date.strftime("%b %d"),
        "score": r.closure_risk_score
    } for r in reversed(risk_history)]
    
    return jsonify({
        "health_score": round(health_score, 1),
        "closure_risk_score": round(closure_risk * 100.0, 1),
        "shortage_probability": round(shortage_prob * 100.0, 1),
        "local_pharmacist_pool": local_pool_size,
        "open_vacancies": unfilled_count,
        "health_history": health_chart,
        "risk_history": risk_chart
    }), 200

@continuity_bp.route('/api/continuity/demand-forecast', methods=['GET'])
@jwt_required()
def get_demand_forecast():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized"}), 403
        
    # Predict demand for the next 7 days
    today = datetime.utcnow().date()
    forecast = []
    
    for i in range(7):
        forecast_day = today + timedelta(days=i)
        weekday = forecast_day.weekday()
        month = forecast_day.month
        
        # Predict demand count
        pred_count = ml_manager.predict_demand(
            month=month,
            day_of_week=weekday,
            is_holiday=1 if month == 12 and forecast_day.day in [24, 25, 31] else 0,
            rolling_avg_demand_30d=2.4
        )
        
        forecast.append({
            "date": forecast_day.strftime("%Y-%m-%d"),
            "day_name": forecast_day.strftime("%a"),
            "predicted_shifts": round(pred_count, 1)
        })
        
    return jsonify(forecast), 200

# ==========================================
# 7. Smart Incentive Recommendation Engine
# ==========================================
@continuity_bp.route('/api/incentives/calculate', methods=['GET'])
@jwt_required()
def calculate_incentive():
    # Heuristic calculation for incentives
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Date is required"}), 400
        
    try:
        parsed_date = robust_parse_date(date_str)
    except Exception as e:
        return jsonify({"error": f"Invalid date: {str(e)}"}), 400
        
    weekday = parsed_date.weekday()
    # High base index if weekend or holiday
    shortage_multiplier = 1.0
    if weekday in [5, 6]:
        shortage_multiplier = 1.25
        
    # Get pending open shifts count
    open_shifts = JobRequest.query.filter_by(status='open', date=parsed_date).count()
    if open_shifts > 2:
        shortage_multiplier += 0.2
        
    suggested_bonus = 0.0
    if shortage_multiplier > 1.1:
        suggested_bonus = round(15.0 * shortage_multiplier, 2)
        
    return jsonify({
        "base_suggested_bonus": suggested_bonus,
        "shortage_factor": shortage_multiplier,
        "recommended_hourly_rate": round(65.0 + suggested_bonus, 2)
    }), 200

# ==========================================
