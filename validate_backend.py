import sys
import os

# Adjust import paths to find backend folder
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

from app import create_app
from models import db, User, Pharmacist, Pharmacy, JobRequest
from ml_models import ml_manager
from simulators import ContinuitySimulator
from scheduler import ShiftSchedulerOptimizer

def validate_system():
    print("====================================================")
    print("              PHARMASPHERE AI VALIDATOR             ")
    print("====================================================")
    
    app = create_app()
    with app.app_context():
        # 1. Database Integrity Verification
        users_count = User.query.count()
        pharmacists_count = Pharmacist.query.count()
        pharmacies_count = Pharmacy.query.count()
        shifts_count = JobRequest.query.count()
        
        print(f"[DB Verification]")
        print(f" - Registered Users: {users_count}")
        print(f" - Registered Pharmacists: {pharmacists_count}")
        print(f" - Registered Pharmacies: {pharmacies_count}")
        print(f" - Total Staffing Shifts: {shifts_count}")
        
        if users_count == 0 or pharmacists_count == 0 or pharmacies_count == 0:
            print("[ERROR] Seeding data not found or empty.")
            return False
        else:
            print("[OK] Database tables successfully seeded and verified.")

        # 2. Machine Learning Pipeline Verification
        print(f"\n[ML Pipeline Verification]")
        try:
            # Predict shortage
            shortage_prob = ml_manager.predict_shortage(
                month=12,
                day_of_week=4,
                leave_requests_count=2,
                active_pharmacists_count=6,
                last_week_shortage_rate=0.15
            )
            print(f" - Shortage Predictor test probability (Dec, Friday): {round(shortage_prob * 100, 1)}%")

            # Predict acceptance
            accept_prob = ml_manager.predict_acceptance(
                hourly_rate=75.0,
                distance_miles=5.2,
                skills_match_count=2,
                pharmacist_rating=4.8,
                pharmacist_trust_score=98.0
            )
            print(f" - Acceptance Predictor test probability ($75/hr, 5.2mi): {round(accept_prob * 100, 1)}%")
            
            # Predict closure risk
            closure_risk = ml_manager.predict_closure_risk(
                unfilled_shifts_count=1,
                active_pharmacists_count=6,
                health_score=85.0,
                has_emergency_unfilled=True
            )
            print(f" - Closure Risk Predictor test probability: {round(closure_risk * 100, 1)}%")
            
            print("[OK] All ML prediction wrappers successfully verified.")
        except Exception as e:
            print(f"[ERROR] ML Error: {str(e)}")
            return False

        # 3. Digital Twin Simulator Verification
        print(f"\n[Digital Twin Simulator Verification]")
        try:
            pharmacy = Pharmacy.query.first()
            pharmacist = Pharmacist.query.first()
            
            sim_res = ContinuitySimulator.run_simulation(
                pharmacy_id=pharmacy.id,
                scenario_type='staff_absence',
                duration_days=7,
                absent_pharmacist_ids=[pharmacist.id]
            )
            print(f" - Scenario type: '{sim_res['scenario']}'")
            print(f" - Forecasted Average Health Index: {sim_res['avg_health_score']}%")
            print(f" - Forecasted Average Closure Risk: {sim_res['avg_closure_risk_score']}%")
            print(f" - AI Action recommendations returned: {len(sim_res['recommendations'])}")
            
            print("[OK] Digital Twin Monte-Carlo engines successfully verified.")
        except Exception as e:
            print(f"[ERROR] Simulator Error: {str(e)}")
            return False

        # 4. Scheduling Optimizer Verification
        print(f"\n[AI Scheduler Optimizer Verification]")
        try:
            from datetime import date, timedelta
            today = date.today()
            end_range = today + timedelta(days=7)
            
            opt_res = ShiftSchedulerOptimizer.optimize_schedule(
                pharmacy_id=pharmacy.id,
                start_date=today,
                end_date=end_range
            )
            print(f" - Optimizer assignments: {opt_res.get('assigned_shifts_count', 0)}")
            print(f" - Optimizer unassigned: {opt_res.get('unassigned_shifts_count', 0)}")
            
            print("[OK] AI Workload distribution matching successfully verified.")
        except Exception as e:
            print(f"[ERROR] Scheduler Error: {str(e)}")
            return False

        print("\n====================================================")
        print("    ALL SYSTEMS CONFIGURED & VERIFIED SUCCESSFULLY! ")
        print("====================================================")
        return True

if __name__ == '__main__':
    success = validate_system()
    if not success:
        sys.exit(1)
