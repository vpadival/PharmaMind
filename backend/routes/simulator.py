
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta

from models import db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory, Availability, Rating, TrustScore, License, LeaveRequest, EmergencyRequest, WorkforceHealth, RiskScore, Notification
from utils import robust_parse_date, get_current_user_or_error
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager, ModelNotLoadedError

simulator_bp = Blueprint('simulator', __name__, url_prefix='')

# 4. Simulation Engine (Digital Twin / Continuity)
# ==========================================
@simulator_bp.route('/api/simulator/run', methods=['POST'])
@jwt_required()
def run_simulator():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json() or {}
    scenario_type = data.get('scenario_type', 'staff_absence')
    duration_days = int(data.get('duration_days', 7))
    absent_pharmacist_ids = data.get('absent_pharmacist_ids', [])
    holiday_multiplier = float(data.get('holiday_multiplier', 1.0))
    
    res = ContinuitySimulator.run_simulation(
        pharmacy_id=user.pharmacy.id,
        scenario_type=scenario_type,
        duration_days=duration_days,
        absent_pharmacist_ids=absent_pharmacist_ids,
        holiday_multiplier=holiday_multiplier
    )
    
    return jsonify(res), 200

# ==========================================
# 6. Shift Scheduling Optimizer endpoint
# ==========================================
@simulator_bp.route('/api/schedule/optimize', methods=['POST'])
@jwt_required()
def auto_schedule():
    user, err = get_current_user_or_error()
    if err:
        return jsonify({"error": err[0]}), err[1]
        
    if user.role != 'owner' or not user.pharmacy:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json() or {}
    start_date_str = data.get('start_date')
    end_date_str = data.get('end_date')
    
    if not start_date_str or not end_date_str:
        return jsonify({"error": "Start date and End date are required."}), 400
        
    try:
        start_date = robust_parse_date(start_date_str)
        end_date = robust_parse_date(end_date_str)
        
        res = ShiftSchedulerOptimizer.optimize_schedule(user.pharmacy.id, start_date, end_date)
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": f"Optimization failed: {str(e)}"}), 500

# ==========================================
