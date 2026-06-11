from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'owner', 'pharmacist', 'admin'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    pharmacy = db.relationship('Pharmacy', backref='user', uselist=False, cascade="all, delete-orphan")
    pharmacist = db.relationship('Pharmacist', backref='user', uselist=False, cascade="all, delete-orphan")
    notifications = db.relationship('Notification', backref='user', lazy=True, cascade="all, delete-orphan")

class Pharmacy(db.Model):
    __tablename__ = 'pharmacies'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    approval_status = db.Column(db.String(20), default='pending')  # 'pending', 'verified', 'rejected'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    job_requests = db.relationship('JobRequest', backref='pharmacy', lazy=True, cascade="all, delete-orphan")
    ratings_given = db.relationship('Rating', backref='pharmacy', lazy=True)
    predictions = db.relationship('Prediction', backref='pharmacy', lazy=True, cascade="all, delete-orphan")
    workforce_health_history = db.relationship('WorkforceHealth', backref='pharmacy', lazy=True, cascade="all, delete-orphan")
    risk_scores = db.relationship('RiskScore', backref='pharmacy', lazy=True, cascade="all, delete-orphan")

class Pharmacist(db.Model):
    __tablename__ = 'pharmacists'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    license_number = db.Column(db.String(50), nullable=False)
    license_state = db.Column(db.String(2), nullable=False)
    license_status = db.Column(db.String(20), default='pending')  # 'pending', 'verified', 'rejected'
    skills = db.Column(db.Text, nullable=True)  # Comma-separated list: e.g. "Immunization, Oncology, MTM"
    experience_years = db.Column(db.Integer, default=0)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    trust_score = db.Column(db.Float, default=95.0)  # Starts at 95.0
    rating = db.Column(db.Float, default=5.0)
    status = db.Column(db.String(20), default='active')  # 'active', 'inactive' (for retention forecasting)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    availability = db.relationship('Availability', backref='pharmacist', lazy=True, cascade="all, delete-orphan")
    shift_history = db.relationship('ShiftHistory', backref='pharmacist', lazy=True, cascade="all, delete-orphan")
    ratings_received = db.relationship('Rating', backref='pharmacist', lazy=True, cascade="all, delete-orphan")
    trust_score_history = db.relationship('TrustScore', backref='pharmacist', lazy=True, cascade="all, delete-orphan")
    licenses = db.relationship('License', backref='pharmacist', lazy=True, cascade="all, delete-orphan")
    leave_requests = db.relationship('LeaveRequest', backref='pharmacist', primaryjoin="Pharmacist.id==LeaveRequest.pharmacist_id", lazy=True, cascade="all, delete-orphan")
    suggested_replacements = db.relationship('LeaveRequest', backref='suggested_replacement', primaryjoin="Pharmacist.id==LeaveRequest.replacement_suggested_id", lazy=True)
    emergency_acceptances = db.relationship('EmergencyRequest', backref='accepted_by', lazy=True)

class JobRequest(db.Model):
    __tablename__ = 'job_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacy_id = db.Column(db.Integer, db.ForeignKey('pharmacies.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)  # HH:MM
    end_time = db.Column(db.String(5), nullable=False)  # HH:MM
    hourly_rate = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default='open')  # 'open', 'matched', 'completed', 'cancelled'
    matched_pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=True)
    is_emergency = db.Column(db.Boolean, default=False)
    is_auto_replacement = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    matched_pharmacist = db.relationship('Pharmacist', backref='matched_jobs', primaryjoin="JobRequest.matched_pharmacist_id==Pharmacist.id")
    shift_history = db.relationship('ShiftHistory', backref='job_request', lazy=True, cascade="all, delete-orphan")
    emergency_details = db.relationship('EmergencyRequest', backref='job_request', uselist=False, cascade="all, delete-orphan")

class ShiftHistory(db.Model):
    __tablename__ = 'shift_history'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=False)
    job_request_id = db.Column(db.Integer, db.ForeignKey('job_requests.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'completed', 'cancelled'
    cancellation_reason = db.Column(db.String(200), nullable=True)
    is_late = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Availability(db.Model):
    __tablename__ = 'availability'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)  # 0 = Monday, 6 = Sunday
    start_time = db.Column(db.String(5), nullable=False)  # HH:MM
    end_time = db.Column(db.String(5), nullable=False)  # HH:MM

class Rating(db.Model):
    __tablename__ = 'ratings'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=False)
    pharmacy_id = db.Column(db.Integer, db.ForeignKey('pharmacies.id'), nullable=False)
    score = db.Column(db.Integer, nullable=False)  # 1 to 5
    comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class TrustScore(db.Model):
    __tablename__ = 'trust_scores'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=False)
    score = db.Column(db.Float, nullable=False)
    change_reason = db.Column(db.String(200), nullable=False)
    calculated_at = db.Column(db.DateTime, default=datetime.utcnow)

class License(db.Model):
    __tablename__ = 'licenses'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=False)
    license_number = db.Column(db.String(50), nullable=False)
    state = db.Column(db.String(2), nullable=False)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'verified', 'rejected'
    expiration_date = db.Column(db.Date, nullable=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    verified_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

class Prediction(db.Model):
    __tablename__ = 'predictions'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacy_id = db.Column(db.Integer, db.ForeignKey('pharmacies.id'), nullable=False)
    prediction_type = db.Column(db.String(50), nullable=False)  # 'shortage', 'demand'
    target_date = db.Column(db.Date, nullable=False)
    predicted_value = db.Column(db.Float, nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class LeaveRequest(db.Model):
    __tablename__ = 'leave_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacist_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'approved', 'rejected'
    impact_score = db.Column(db.Float, nullable=True)  # closure risk increase score (0-100)
    replacement_suggested_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=True)

class EmergencyRequest(db.Model):
    __tablename__ = 'emergency_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    job_request_id = db.Column(db.Integer, db.ForeignKey('job_requests.id'), nullable=False)
    base_rate = db.Column(db.Float, nullable=False)
    incentive_bonus = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default='open')  # 'open', 'accepted'
    accepted_by_id = db.Column(db.Integer, db.ForeignKey('pharmacists.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class WorkforceHealth(db.Model):
    __tablename__ = 'workforce_health'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacy_id = db.Column(db.Integer, db.ForeignKey('pharmacies.id'), nullable=False)
    health_score = db.Column(db.Float, nullable=False)  # 0 to 100
    active_staff_count = db.Column(db.Integer, nullable=False)
    shift_fulfillment_rate = db.Column(db.Float, nullable=False)  # percentage (0-100)
    date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class RiskScore(db.Model):
    __tablename__ = 'risk_scores'
    
    id = db.Column(db.Integer, primary_key=True)
    pharmacy_id = db.Column(db.Integer, db.ForeignKey('pharmacies.id'), nullable=False)
    closure_risk_score = db.Column(db.Float, nullable=False)  # 0 to 100
    details = db.Column(db.Text, nullable=True)  # description of risk factors
    date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Notification(db.Model):
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
