from datetime import datetime, timedelta
import math
from models import db, Pharmacist, Pharmacy, JobRequest, LeaveRequest
from ml_models import ml_manager

def calculate_distance(lat1, lon1, lat2, lon2):
    # Haversine formula
    R = 3958.8  # Radius of Earth in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class ContinuitySimulator:
    @staticmethod
    def run_simulation(pharmacy_id, scenario_type, duration_days=7, absent_pharmacist_ids=None, holiday_multiplier=1.0):
        """
        Simulates workforce stability, closure risks, and generates recommendations.
        - scenario_type: 'staff_absence', 'holiday_demand', 'multiple_leaves', 'custom'
        - absent_pharmacist_ids: list of pharmacist IDs to simulate as unavailable
        - holiday_multiplier: scaling factor for staffing demands
        """
        pharmacy = Pharmacy.query.get(pharmacy_id)
        if not pharmacy:
            return {"error": "Pharmacy not found"}

        absent_pharmacist_ids = absent_pharmacist_ids or []
        start_date = datetime.utcnow().date()
        
        daily_simulations = []
        overall_health_sum = 0
        overall_closure_risk_sum = 0
        vulnerable_periods = []
        recommendations = []
        
        # Fetch active pharmacists associated with this pharmacy (e.g. within 30 miles)
        all_pharmacists = Pharmacist.query.filter_by(status='active', license_status='verified').all()
        nearby_pharmacists = []
        for p in all_pharmacists:
            dist = calculate_distance(pharmacy.latitude, pharmacy.longitude, p.latitude, p.longitude)
            if dist <= 30.0:
                nearby_pharmacists.append((p, dist))
        
        # Sort by distance
        nearby_pharmacists.sort(key=lambda x: x[1])
        active_nearby_count = len([p for p, _ in nearby_pharmacists if p.id not in absent_pharmacist_ids])

        # Step day-by-day through the simulation window
        for day_idx in range(duration_days):
            sim_date = start_date + timedelta(days=day_idx)
            weekday = sim_date.weekday()
            month = sim_date.month
            
            # 1. Determine base shifts and simulate vacancies
            # Fetch scheduled shifts for this day
            scheduled_shifts = JobRequest.query.filter(
                JobRequest.pharmacy_id == pharmacy_id,
                JobRequest.date == sim_date,
                JobRequest.status != 'cancelled'
            ).all()
            
            total_shifts_needed = len(scheduled_shifts)
            if total_shifts_needed == 0:
                # If no shifts are scheduled, forecast standard demand
                total_shifts_needed = int(round(ml_manager.predict_demand(month, weekday, False, 2.0) * holiday_multiplier))
                if total_shifts_needed == 0:
                    total_shifts_needed = 1  # baseline

            unfilled_shifts = 0
            has_emergency_unfilled = False
            simulated_absences = 0

            # Simulate absence impact on scheduled shifts
            for shift in scheduled_shifts:
                if shift.status == 'open' or not shift.matched_pharmacist_id:
                    unfilled_shifts += 1
                    if shift.is_emergency:
                        has_emergency_unfilled = True
                elif shift.matched_pharmacist_id in absent_pharmacist_ids:
                    unfilled_shifts += 1
                    simulated_absences += 1
                    if shift.is_emergency:
                        has_emergency_unfilled = True
            
            # Apply holiday demand scaling if active
            if scenario_type == 'holiday_demand':
                additional_demand = int(math.ceil(total_shifts_needed * (holiday_multiplier - 1.0)))
                total_shifts_needed += additional_demand
                unfilled_shifts += additional_demand

            # 2. Predict Metrics
            # Shortage prediction
            shortage_prob = ml_manager.predict_shortage(
                month=month,
                day_of_week=weekday,
                leave_requests_count=len(absent_pharmacist_ids) if scenario_type == 'multiple_leaves' else simulated_absences,
                active_pharmacists_count=active_nearby_count,
                last_week_shortage_rate=0.15
            )
            
            # Fulfillment rate
            fulfillment_rate = 100.0
            if total_shifts_needed > 0:
                fulfillment_rate = max(0.0, 100.0 * (1 - (unfilled_shifts / total_shifts_needed)))

            # Health score
            health_score = ml_manager.predict_health(
                active_pharmacists=active_nearby_count,
                shift_fulfillment_rate=fulfillment_rate,
                leave_requests_count=len(absent_pharmacist_ids) if scenario_type == 'multiple_leaves' else simulated_absences,
                predicted_shortage_prob=shortage_prob
            )
            
            # Closure risk
            closure_risk = ml_manager.predict_closure_risk(
                unfilled_shifts_count=unfilled_shifts,
                active_pharmacists_count=active_nearby_count,
                health_score=health_score,
                has_emergency_unfilled=has_emergency_unfilled
            )
            
            overall_health_sum += health_score
            overall_closure_risk_sum += (closure_risk * 100.0)

            # Record daily timeline data
            daily_simulations.append({
                "date": sim_date.strftime("%Y-%m-%d"),
                "day_name": sim_date.strftime("%a"),
                "shifts_needed": total_shifts_needed,
                "unfilled_shifts": unfilled_shifts,
                "simulated_absences": simulated_absences,
                "fulfillment_rate": round(fulfillment_rate, 1),
                "health_score": round(health_score, 1),
                "closure_risk": round(closure_risk * 100.0, 1),
                "shortage_probability": round(shortage_prob * 100.0, 1)
            })

            # Detect vulnerable periods
            if (closure_risk * 100.0) > 40.0:
                vulnerable_periods.append({
                    "date": sim_date.strftime("%Y-%m-%d"),
                    "closure_risk": round(closure_risk * 100.0, 1),
                    "unfilled_shifts": unfilled_shifts,
                    "reason": f"Critical staffing shortage. {unfilled_shifts} unfilled shift(s) on {sim_date.strftime('%A, %b %d')}"
                })

        # Calculate averages
        avg_health = round(overall_health_sum / duration_days, 1)
        avg_closure_risk = round(overall_closure_risk_sum / duration_days, 1)

        # 3. Generate Preventive Recommendations
        if avg_closure_risk > 15.0 or len(vulnerable_periods) > 0:
            if scenario_type == 'staff_absence' or len(absent_pharmacist_ids) > 0:
                recommendations.append({
                    "type": "immediate",
                    "text": "Detecting shift absences. Activate Auto-Replacement Engine to match back-up pharmacists for the vacant shifts."
                })
            
            if scenario_type == 'holiday_demand' or holiday_multiplier > 1.1:
                recommendations.append({
                    "type": "incentive",
                    "text": f"Holiday demand surge active ({int(holiday_multiplier*100)}%). We recommend posting shifts to the Emergency Marketplace with a 15% to 25% incentive bonus to attract pharmacists."
                })

            if active_nearby_count < 3:
                recommendations.append({
                    "type": "retention",
                    "text": "Your local pharmacist pool is critically low (< 3 verified matches). Consider updating your baseline hourly rate or expanding travel distance preferences to attract out-of-area coverage."
                })

            # Look for specific available candidates to recommend
            available_candidates = []
            for p, dist in nearby_pharmacists:
                if p.id not in absent_pharmacist_ids and len(available_candidates) < 3:
                    available_candidates.append({
                        "name": p.name,
                        "distance": round(dist, 1),
                        "trust_score": p.trust_score,
                        "rating": p.rating,
                        "specialties": p.skills or "General Pharmacy"
                    })
            
            if available_candidates:
                candidate_names = ", ".join([c["name"] for c in available_candidates])
                recommendations.append({
                    "type": "sourcing",
                    "text": f"Sourced {len(available_candidates)} nearby matching pharmacists: {candidate_names}. Click 'Auto-Match' to dispatch invitations."
                })
        else:
            recommendations.append({
                "type": "stable",
                "text": "Workforce capacity is stable. Maintain current staffing levels and monitor the continuity board."
            })

        return {
            "scenario": scenario_type,
            "duration_days": duration_days,
            "avg_health_score": avg_health,
            "avg_closure_risk_score": avg_closure_risk,
            "daily_timeline": daily_simulations,
            "vulnerable_periods": vulnerable_periods,
            "recommendations": recommendations
        }
