from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User, Pharmacist, Pharmacy

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    role = data.get('role')  # accepted values: 'owner', 'pharmacist'

    if not email or not password or not role:
        return jsonify({"error": "Missing required fields"}), 400

    if role not in ['owner', 'pharmacist']:
        # Admin accounts must be created directly in the database or via a
        # separate privileged endpoint. Allowing 'admin' self-registration
        # through the public API is a critical security vulnerability.
        return jsonify({"error": "Invalid role. Self-registration is limited to 'owner' and 'pharmacist'."}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "User with this email already exists"}), 400

    try:
        # Create user
        password_hash = generate_password_hash(password)
        user = User(email=email, password_hash=password_hash, role=role)
        db.session.add(user)
        db.session.flush()  # to get the user.id

        if role == 'owner':
            pharmacy_name = data.get('pharmacy_name')
            address = data.get('address')
            latitude = data.get('latitude', 40.7128)  # default NYC lat
            longitude = data.get('longitude', -74.0060)  # default NYC lon

            if not pharmacy_name or not address:
                db.session.rollback()
                return jsonify({"error": "Owner registration requires pharmacy name and address"}), 400

            pharmacy = Pharmacy(
                user_id=user.id,
                name=pharmacy_name,
                address=address,
                latitude=float(latitude),
                longitude=float(longitude)
            )
            db.session.add(pharmacy)

        elif role == 'pharmacist':
            name = data.get('name')
            license_number = data.get('license_number')
            license_state = data.get('license_state')
            skills = data.get('skills', '')
            experience_years = data.get('experience_years', 0)
            latitude = data.get('latitude', 40.7306)
            longitude = data.get('longitude', -73.9352)

            if not name or not license_number or not license_state:
                db.session.rollback()
                return jsonify({"error": "Pharmacist registration requires name, license number, and license state"}), 400

            # Check duplicate license
            # Fraud detection check!
            existing_license = Pharmacist.query.filter_by(license_number=license_number).first()
            if existing_license:
                db.session.rollback()
                return jsonify({"error": "License number is already registered. Duplicate licenses are flagged as potential fraud."}), 400

            pharmacist = Pharmacist(
                user_id=user.id,
                name=name,
                license_number=license_number,
                license_state=license_state,
                license_status='pending',  # admin needs to verify
                skills=skills,
                experience_years=int(experience_years),
                latitude=float(latitude),
                longitude=float(longitude)
            )
            db.session.add(pharmacist)

        db.session.commit()
        
        # Issue token immediately on successful registration
        access_token = create_access_token(identity=str(user.id))
        return jsonify({
            "message": "User registered successfully",
            "token": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "role": user.role
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=str(user.id))

    user_info = {
        "id": user.id,
        "email": user.email,
        "role": user.role
    }

    if user.role == 'owner' and user.pharmacy:
        user_info["pharmacy"] = {
            "id": user.pharmacy.id,
            "name": user.pharmacy.name,
            "address": user.pharmacy.address,
            "approval_status": user.pharmacy.approval_status or 'pending'
        }
    elif user.role == 'pharmacist' and user.pharmacist:
        user_info["pharmacist"] = {
            "id": user.pharmacist.id,
            "name": user.pharmacist.name,
            "license_number": user.pharmacist.license_number,
            "license_status": user.pharmacist.license_status,
            "trust_score": user.pharmacist.trust_score,
            "rating": user.pharmacist.rating
        }

    return jsonify({
        "token": access_token,
        "user": user_info
    }), 200

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404

    user_info = {
        "id": user.id,
        "email": user.email,
        "role": user.role
    }

    if user.role == 'owner' and user.pharmacy:
        user_info["pharmacy"] = {
            "id": user.pharmacy.id,
            "name": user.pharmacy.name,
            "address": user.pharmacy.address,
            "latitude": user.pharmacy.latitude,
            "longitude": user.pharmacy.longitude,
            "approval_status": user.pharmacy.approval_status or 'pending'
        }
    elif user.role == 'pharmacist' and user.pharmacist:
        user_info["pharmacist"] = {
            "id": user.pharmacist.id,
            "name": user.pharmacist.name,
            "license_number": user.pharmacist.license_number,
            "license_status": user.pharmacist.license_status,
            "trust_score": user.pharmacist.trust_score,
            "rating": user.pharmacist.rating,
            "skills": user.pharmacist.skills,
            "experience_years": user.pharmacist.experience_years,
            "latitude": user.pharmacist.latitude,
            "longitude": user.pharmacist.longitude
        }

    return jsonify(user_info), 200
