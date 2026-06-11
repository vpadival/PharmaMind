import os
from datetime import datetime, date, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity
from dotenv import load_dotenv

load_dotenv()

from models import (
    db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory,
    Availability, Rating, TrustScore, License, LeaveRequest,
    EmergencyRequest, WorkforceHealth, RiskScore, Notification
)
from auth import auth_bp
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager

def robust_parse_date(date_str):
    if not date_str:
        raise ValueError("Empty date string")
    normalized_str = date_str.replace('/', '-').strip()
    formats = [
        "%Y-%m-%d",  # YYYY-MM-DD
        "%d-%m-%Y",  # DD-MM-YYYY
        "%d-%m-%y",  # DD-MM-YY
        "%m-%d-%Y",  # MM-DD-YYYY
        "%m-%d-%y",  # MM-DD-YY
        "%Y-%m-%y",  # YYYY-MM-YY
    ]
    parsed_date = None
    for fmt in formats:
        try:
            dt = datetime.strptime(normalized_str, fmt).date()
            if dt.year >= 2000 and dt.year < 2100:
                return dt
            if parsed_date is None:
                parsed_date = dt
        except ValueError:
            continue
    if parsed_date:
        if parsed_date.year < 100:
            try:
                return date(2000 + parsed_date.year, parsed_date.month, parsed_date.day)
            except ValueError:
                pass
        return parsed_date
    raise ValueError(f"Cannot parse date: {date_str}")


def create_app():
    app = Flask(__name__)
    
    # Configure SQLite database path inside the current workspace
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pharmasphere.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    jwt_secret = os.environ.get('JWT_SECRET_KEY')
    if not jwt_secret:
        raise RuntimeError(
            "JWT_SECRET_KEY environment variable is not set. "
            "Copy .env.example to .env and set a strong secret before running."
        )
    app.config['JWT_SECRET_KEY'] = jwt_secret
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=12)

    # Allow only the frontend origin. Override via FRONTEND_ORIGIN env var.
    frontend_origin = os.environ.get('FRONTEND_ORIGIN', 'http://localhost:5173')
    CORS(app, origins=[frontend_origin], supports_credentials=True)
    db.init_app(app)
    JWTManager(app)
    
    # Register Auth Blueprint
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    
    # Custom helper: check if user is admin or owner
    def get_current_user_or_error():
        uid = get_jwt_identity()
        user = User.query.get(int(uid))
        if not user:
            return None, ("User not found", 404)
        return user, None

    # ==========================================
    # 1. Pharmacist Marketplace / Job Board
    # ==========================================
    
    @app.route('/api/jobs', methods=['GET'])
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

    @app.route('/api/jobs', methods=['POST'])
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

    @app.route('/api/jobs/<int:job_id>/accept', methods=['POST'])
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

    @app.route('/api/jobs/<int:job_id>/approve-application', methods=['POST'])
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

    @app.route('/api/jobs/<int:job_id>/decline-application', methods=['POST'])
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

    @app.route('/api/jobs/<int:job_id>/cancel', methods=['POST'])
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
                hourly_rate=job.hourly_rate + 10.0, # Suggest +$10 incentive automatically
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

    @app.route('/api/jobs/<int:job_id>/matches', methods=['GET'])
    @jwt_required()
    def get_job_matches(job_id):
        job = JobRequest.query.get(job_id)
        if not job:
            return jsonify({"error": "Shift not found"}), 404
            
        pharmacy = job.pharmacy
        
        # Sourcing matching pharmacists:
        # 1. Verified and active
        # 2. Within distance
        # 3. Available on the day of week (weekday)
        weekday = job.date.weekday()
        
        active_ph = Pharmacist.query.filter_by(status='active', license_status='verified').all()
        matches = []
        
        for p in active_ph:
            # Distance
            dist = calculate_distance(pharmacy.latitude, pharmacy.longitude, p.latitude, p.longitude)
            if dist > 40.0:  # limit search radius to 40 miles
                continue
                
            # Availability checking
            avail = Availability.query.filter_by(pharmacist_id=p.id, day_of_week=weekday).first()
            is_available = False
            if avail and avail.start_time <= job.start_time and avail.end_time >= job.end_time:
                is_available = True
                
            # Skills count
            skills_count = 0
            if p.skills and job.title:
                job_keywords = job.title.lower().split() + job.description.lower().split()
                skills_count = sum(1 for s in p.skills.split(',') if s.strip().lower() in job_keywords)
            
            # Predict acceptance rate
            acceptance_prob = ml_manager.predict_acceptance(
                hourly_rate=job.hourly_rate,
                distance_miles=dist,
                skills_match_count=skills_count,
                pharmacist_rating=p.rating,
                pharmacist_trust_score=p.trust_score
            )
            
            # Total Rank Score for display
            rank_score = (
                p.rating * 12.0 +
                p.trust_score * 0.4 +
                p.experience_years * 1.5 -
                dist * 0.8 +
                skills_count * 5.0
            )
            
            matches.append({
                "pharmacist_id": p.id,
                "name": p.name,
                "distance": round(dist, 1),
                "rating": p.rating,
                "trust_score": p.trust_score,
                "experience_years": p.experience_years,
                "skills": p.skills or "General",
                "is_available": is_available,
                "match_probability": round(acceptance_prob * 100.0, 1),
                "rank_score": round(rank_score, 1)
            })
            
        # Sort by rank score desc
        matches.sort(key=lambda x: x["rank_score"], reverse=True)
        return jsonify(matches), 200

    # ==========================================
    # 2. Auto-Replacement Candidate List
    # ==========================================
    @app.route('/api/jobs/<int:job_id>/auto-replacements', methods=['GET'])
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
    # 3. Continuity Dashboard & Forecasting
    # ==========================================
    @app.route('/api/continuity/dashboard', methods=['GET'])
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

    @app.route('/api/continuity/demand-forecast', methods=['GET'])
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
    # 4. Simulation Engine (Digital Twin / Continuity)
    # ==========================================
    @app.route('/api/simulator/run', methods=['POST'])
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
    # 5. Smart Leave Management
    # ==========================================
    @app.route('/api/leaves', methods=['GET'])
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

    @app.route('/api/leaves/request', methods=['POST'])
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

    @app.route('/api/leaves/<int:leave_id>/<action>', methods=['POST'])
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
    # 6. Shift Scheduling Optimizer endpoint
    # ==========================================
    @app.route('/api/schedule/optimize', methods=['POST'])
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
    # 7. Smart Incentive Recommendation Engine
    # ==========================================
    @app.route('/api/incentives/calculate', methods=['GET'])
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
    # 8. Admin Module & Fraud Detection
    # ==========================================
    @app.route('/api/admin/licenses', methods=['GET'])
    @jwt_required()
    def get_pending_licenses():
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]
            
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

    @app.route('/api/admin/licenses/<int:ph_id>/verify', methods=['POST'])
    @jwt_required()
    def verify_license(ph_id):
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]
            
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
                lic.verified_at = datetime.utcnow()
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

    @app.route('/api/admin/pharmacies', methods=['GET'])
    @jwt_required()
    def get_admin_pharmacies():
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]
            
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

    @app.route('/api/admin/pharmacies/<int:pharm_id>/verify', methods=['POST'])
    @jwt_required()
    def verify_pharmacy(pharm_id):
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]
            
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

    @app.route('/api/profile/update', methods=['POST'])
    @jwt_required()
    def update_profile():
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]
            
        data = request.get_json() or {}
        
        try:
            if user.role == 'owner' and user.pharmacy:
                pharm = user.pharmacy
                pharm.name = data.get('name', pharm.name)
                pharm.address = data.get('address', pharm.address)
                pharm.latitude = float(data.get('latitude', pharm.latitude))
                pharm.longitude = float(data.get('longitude', pharm.longitude))
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
                ph = user.pharmacist
                ph.name = data.get('name', ph.name)
                ph.license_number = data.get('license_number', ph.license_number)
                ph.license_state = data.get('license_state', ph.license_state)
                ph.skills = data.get('skills', ph.skills)
                ph.experience_years = int(data.get('experience_years', ph.experience_years))
                ph.latitude = float(data.get('latitude', ph.latitude))
                ph.longitude = float(data.get('longitude', ph.longitude))
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

    @app.route('/api/admin/fraud-audit', methods=['GET'])
    @jwt_required()
    def run_fraud_audit():
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]
            
        if user.role != 'admin':
            return jsonify({"error": "Unauthorized"}), 403
            
        flags = []
        
        # 1. Duplicate License Check
        # Query license numbers appearing more than once
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
        # Pharmacists with > 2 cancellations in history
        low_trust_ph = Pharmacist.query.filter(Pharmacist.trust_score <= 82.0).all()
        for lp in low_trust_ph:
            flags.append({
                "type": "HIGH_CANCELLATION_RATE",
                "severity": "WARNING",
                "details": f"Pharmacist {lp.name} has a Trust Score of {lp.trust_score}%. High risk of shift failure.",
                "action_required": "Flag profile, limit emergency dispatch access, and schedule reviews."
            })
            
        # 3. Geo-Location Outliers
        # Flag fake accounts with invalid coords (e.g. 0, 0)
        outliers = Pharmacist.query.filter((Pharmacist.latitude == 0) | (Pharmacist.longitude == 0)).all()
        for out in outliers:
            flags.append({
                "type": "INVALID_GEOLOCATION",
                "severity": "LOW",
                "details": f"Pharmacist {out.name} registered with coordinates (0,0).",
                "action_required": "Request address update."
            })
            
        return jsonify(flags), 200

    # ==========================================
    # 9. Notification Center
    # ==========================================
    @app.route('/api/notifications', methods=['GET'])
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

    @app.route('/api/notifications/<int:n_id>/read', methods=['POST'])
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
    @app.route('/api/analytics/summary', methods=['GET'])
    @jwt_required()
    def get_analytics_summary():
        """
        Returns live KPI aggregates and chart data for the Analytics & Reports page.
        Accessible by admin. Owners receive data scoped to their pharmacy.
        """
        user, err = get_current_user_or_error()
        if err:
            return jsonify({"error": err[0]}), err[1]

        today = datetime.utcnow().date()
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

    return app

if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_ENV', 'development') == 'development'
    app.run(port=5000, debug=debug_mode)