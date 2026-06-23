import os

app_path = 'backend/app.py'
with open(app_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# We want to keep everything before "# =========================================="
# and everything after "    return app"
# But we also need to change the imports in app.py to register blueprints.

header_end_idx = 0
for i, line in enumerate(lines):
    if "# ==========================================" in line:
        header_end_idx = i
        break

footer_start_idx = 0
for i in range(len(lines)-1, -1, -1):
    if "return app" in lines[i]:
        footer_start_idx = i
        break

header = lines[:header_end_idx]
body = lines[header_end_idx:footer_start_idx]
footer = lines[footer_start_idx:]

# Find section boundaries in body
sections = {}
current_section = None
current_content = []

for line in body:
    if line.strip().startswith("# =========================================="):
        # We might have a comment block
        pass
    if line.strip().startswith("# ") and ". " in line and "==========" not in line:
        # e.g., "# 1. Pharmacist Marketplace / Job Board"
        if current_section:
            sections[current_section] = current_content
        current_section = line.strip().split(". ")[1]
        current_content = []
    
    current_content.append(line)

if current_section:
    sections[current_section] = current_content

# We have sections:
# Pharmacist Marketplace / Job Board
# Auto-Replacement Candidate List
# Continuity Dashboard & Forecasting
# Simulation Engine (Digital Twin / Continuity)
# Smart Leave Management
# Shift Scheduling Optimizer endpoint
# Smart Incentive Recommendation Engine
# Admin Module & Fraud Detection
# Notification Center
# Analytics & Reports (live data)

blueprint_map = {
    'jobs': ['Pharmacist Marketplace / Job Board', 'Auto-Replacement Candidate List'],
    'continuity': ['Continuity Dashboard & Forecasting', 'Smart Incentive Recommendation Engine'],
    'simulator': ['Simulation Engine (Digital Twin / Continuity)', 'Shift Scheduling Optimizer endpoint'],
    'leaves': ['Smart Leave Management'],
    'admin': ['Admin Module & Fraud Detection', 'Notification Center', 'Analytics & Reports (live data)']
}

os.makedirs('backend/routes', exist_ok=True)
with open('backend/routes/__init__.py', 'w', encoding='utf-8') as f:
    f.write("")

blueprint_imports = """
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta

from models import db, User, Pharmacist, Pharmacy, JobRequest, ShiftHistory, Availability, Rating, TrustScore, License, LeaveRequest, EmergencyRequest, WorkforceHealth, RiskScore, Notification
from utils import robust_parse_date, get_current_user_or_error
from simulators import ContinuitySimulator, calculate_distance
from scheduler import ShiftSchedulerOptimizer
from ml_models import ml_manager, ModelNotLoadedError

"""

for bp_name, section_titles in blueprint_map.items():
    with open(f'backend/routes/{bp_name}.py', 'w', encoding='utf-8') as f:
        f.write(blueprint_imports)
        f.write(f"{bp_name}_bp = Blueprint('{bp_name}', __name__, url_prefix='/api')\n\n")
        
        for title in section_titles:
            content = sections.get(title, [])
            for line in content:
                # Replace @app.route with @bp.route
                if "@app.route" in line:
                    line = line.replace("@app.route", f"@{bp_name}_bp.route")
                # Fix indentation (remove one level of indent since it's no longer inside create_app)
                if line.startswith("    "):
                    line = line[4:]
                f.write(line)

# Now rewrite app.py
new_app = []
for line in header:
    if "def get_current_user_or_error():" in line:
        break # We stop before the inner helper
    new_app.append(line)

# Add utils import
# Actually we moved it, so we don't need it here.
# But we need to register blueprints
register_bps = """
    from routes.jobs import jobs_bp
    from routes.continuity import continuity_bp
    from routes.simulator import simulator_bp
    from routes.leaves import leaves_bp
    from routes.admin import admin_bp

    app.register_blueprint(jobs_bp)
    app.register_blueprint(continuity_bp)
    app.register_blueprint(simulator_bp)
    app.register_blueprint(leaves_bp)
    app.register_blueprint(admin_bp)

"""

new_app.append(register_bps)
new_app.extend(footer)

# Let's remove the get_current_user_or_error logic from new_app, wait, 
# I did "break" when finding it, but let's make sure we removed it cleanly.
# The header goes up to:
#     # Custom helper: check if user is admin or owner
#     def get_current_user_or_error():
#         uid = get_jwt_identity()

clean_app = []
skip = False
for line in new_app:
    if "# Custom helper: check if user is admin or owner" in line or "def get_current_user_or_error" in line:
        skip = True
    if skip and line.strip() == "return app" or line.strip() == "from routes.jobs import jobs_bp":
        skip = False
    
    if not skip:
        clean_app.append(line)

with open(app_path, 'w', encoding='utf-8') as f:
    f.writelines(clean_app)

print("Refactoring complete.")
