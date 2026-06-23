from datetime import datetime, date
from flask_jwt_extended import get_jwt_identity
from models import User

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

def get_current_user_or_error():
    uid = get_jwt_identity()
    user = User.query.get(int(uid))
    if not user:
        return None, ("User not found", 404)
    return user, None
