from datetime import datetime, time as dt_time
from models import db, Pharmacist, Pharmacy, JobRequest, Availability
from simulators import calculate_distance

class ShiftSchedulerOptimizer:
    @staticmethod
    def parse_time(time_str):
        """Parse 'HH:MM' string into a datetime.time object for safe comparison."""
        return datetime.strptime(time_str, "%H:%M").time()

    @staticmethod
    def is_time_overlapping(start1, end1, start2, end2):
        """Return True if two HH:MM time ranges overlap."""
        s1 = ShiftSchedulerOptimizer.parse_time(start1)
        e1 = ShiftSchedulerOptimizer.parse_time(end1)
        s2 = ShiftSchedulerOptimizer.parse_time(start2)
        e2 = ShiftSchedulerOptimizer.parse_time(end2)
        return not (e1 <= s2 or e2 <= s1)

    @staticmethod
    def optimize_schedule(pharmacy_id, start_date, end_date):
        """
        Auto-allocates pharmacists to open shifts within a date range for a specific pharmacy.
        """
        pharmacy = Pharmacy.query.get(pharmacy_id)
        if not pharmacy:
            return {"error": "Pharmacy not found"}

        # Fetch all open shifts for this pharmacy in the date range
        open_shifts = JobRequest.query.filter(
            JobRequest.pharmacy_id == pharmacy_id,
            JobRequest.date >= start_date,
            JobRequest.date <= end_date,
            JobRequest.status == 'open'
        ).order_by(JobRequest.date, JobRequest.start_time).all()

        if not open_shifts:
            return {"message": "No open shifts found in the specified range", "assigned_shifts_count": 0}

        # Fetch all verified, active pharmacists
        pharmacists = Pharmacist.query.filter_by(status='active', license_status='verified').all()
        
        assignments = []
        unassigned_shifts = []
        conflicts_flagged = []
        assigned_pharmacists_today = {}  # key: (pharmacist_id, date_str), value: list of (start_time, end_time)

        # Pre-populate already assigned shifts for these pharmacists in the range
        existing_matches = JobRequest.query.filter(
            JobRequest.date >= start_date,
            JobRequest.date <= end_date,
            JobRequest.status == 'matched',
            JobRequest.matched_pharmacist_id.isnot(None)
        ).all()

        for match in existing_matches:
            date_str = match.date.strftime("%Y-%m-%d")
            key = (match.matched_pharmacist_id, date_str)
            if key not in assigned_pharmacists_today:
                assigned_pharmacists_today[key] = []
            assigned_pharmacists_today[key].append((match.start_time, match.end_time))

        # Core scheduling loop
        for shift in open_shifts:
            date_str = shift.date.strftime("%Y-%m-%d")
            weekday = shift.date.weekday()
            
            candidates = []
            for p in pharmacists:
                # 1. Check if pharmacist has registered availability on this weekday covering the shift hours
                availabilities = Availability.query.filter_by(pharmacist_id=p.id, day_of_week=weekday).all()
                is_available = False
                for av in availabilities:
                    # Use datetime.time objects for correct numerical comparison.
                    # String comparison of "HH:MM" works for zero-padded times but
                    # datetime.time is explicit and safe against edge cases.
                    av_start = ShiftSchedulerOptimizer.parse_time(av.start_time)
                    av_end   = ShiftSchedulerOptimizer.parse_time(av.end_time)
                    sh_start = ShiftSchedulerOptimizer.parse_time(shift.start_time)
                    sh_end   = ShiftSchedulerOptimizer.parse_time(shift.end_time)
                    if av_start <= sh_start and av_end >= sh_end:
                        is_available = True
                        break
                
                if not is_available:
                    continue

                # 2. Check for time overlap conflicts on this day
                conflict = False
                key = (p.id, date_str)
                if key in assigned_pharmacists_today:
                    for prev_start, prev_end in assigned_pharmacists_today[key]:
                        if ShiftSchedulerOptimizer.is_time_overlapping(shift.start_time, shift.end_time, prev_start, prev_end):
                            conflict = True
                            break
                if conflict:
                    continue

                # 3. Calculate distance
                dist = calculate_distance(pharmacy.latitude, pharmacy.longitude, p.latitude, p.longitude)
                if dist > 45.0:  # ignore pharmacists further than 45 miles for regular scheduler
                    continue

                # Multi-criteria greedy ranking score.
                # Coefficient rationale:
                #   rating (0–5 scale)      × 12.0  → max contribution: 60 pts
                #     Patient safety and reliability are the primary concern;
                #     this gives rating the dominant weight in candidate selection.
                #   trust_score (0–100)     × 0.4   → max contribution: 40 pts
                #     Tracks cancellation history; weighted to be meaningful but
                #     secondary to a consistently high rating.
                #   experience_years        × 1.5   → typically 0–20 pts
                #     Moderate bonus; experience matters but is not a substitute
                #     for current performance metrics.
                #   distance_miles          × 0.8   → penalty, typically 0–36 pts
                #     Penalises distant candidates; calibrated so that a 45-mile
                #     candidate loses ~36 pts, roughly equal to half a rating star.
                #
                # TODO: Replace hand-tuned weights with coefficients derived
                # empirically from historical acceptance/outcome data (e.g.,
                # logistic regression on shift success as the target).
                rank_score = (
                    p.rating * 12.0 +
                    p.trust_score * 0.4 +
                    p.experience_years * 1.5 -
                    dist * 0.8
                )
                
                candidates.append((p, rank_score, dist))

            if not candidates:
                unassigned_shifts.append({
                    "shift_id": shift.id,
                    "date": date_str,
                    "time": f"{shift.start_time}-{shift.end_time}",
                    "reason": "No active pharmacists available during these hours / within distance limit"
                })
                continue

            # Sort by rank score in descending order
            candidates.sort(key=lambda x: x[1], reverse=True)
            best_candidate, best_score, best_dist = candidates[0]

            # Assign shift to best candidate
            shift.status = 'matched'
            shift.matched_pharmacist_id = best_candidate.id
            db.session.add(shift)

            # Record assignment to avoid conflict in subsequent loop iterations
            key = (best_candidate.id, date_str)
            if key not in assigned_pharmacists_today:
                assigned_pharmacists_today[key] = []
            assigned_pharmacists_today[key].append((shift.start_time, shift.end_time))

            assignments.append({
                "shift_id": shift.id,
                "date": date_str,
                "title": shift.title,
                "time": f"{shift.start_time}-{shift.end_time}",
                "pharmacist": best_candidate.name,
                "pharmacist_id": best_candidate.id,
                "distance_miles": round(best_dist, 1),
                "trust_score": best_candidate.trust_score,
                "rating": best_candidate.rating,
                "hourly_rate": shift.hourly_rate
            })

        try:
            db.session.commit()
            return {
                "message": "Optimization completed successfully",
                "assigned_shifts": assignments,
                "unassigned_shifts": unassigned_shifts,
                "assigned_shifts_count": len(assignments),
                "unassigned_shifts_count": len(unassigned_shifts)
            }
        except Exception as e:
            db.session.rollback()
            return {"error": f"Failed to commit schedules: {str(e)}"}
