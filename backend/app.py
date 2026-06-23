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
from ml_models import ml_manager, ModelNotLoadedError

from routes.jobs import jobs_bp
from routes.continuity import continuity_bp
from routes.simulator import simulator_bp
from routes.leaves import leaves_bp
from routes.admin import admin_bp

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
    
    # Register API Blueprints
    app.register_blueprint(jobs_bp)
    app.register_blueprint(continuity_bp)
    app.register_blueprint(simulator_bp)
    app.register_blueprint(leaves_bp)
    app.register_blueprint(admin_bp)

    @app.errorhandler(ModelNotLoadedError)
    def handle_model_not_loaded(e):
        return jsonify({"error": str(e), "message": "A required ML model is not loaded. Please run seed.py to train models."}), 503

    return app

if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_ENV', 'development') == 'development'
    app.run(port=5000, debug=debug_mode)