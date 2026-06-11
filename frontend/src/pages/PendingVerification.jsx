import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, LogOut, Save, MapPin, Award, User, Store, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PendingVerification({ user, onLogout, API_BASE, onRefreshUser }) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form states based on role
  const isOwner = user.role === 'owner';
  
  // Owner profile states
  const [pharmacyName, setPharmacyName] = useState(user.pharmacy?.name || '');
  const [address, setAddress] = useState(user.pharmacy?.address || '');
  const [ownerLat, setOwnerLat] = useState(user.pharmacy?.latitude || 40.7128);
  const [ownerLon, setOwnerLon] = useState(user.pharmacy?.longitude || -74.0060);

  // Pharmacist profile states
  const [fullName, setFullName] = useState(user.pharmacist?.name || '');
  const [licenseNumber, setLicenseNumber] = useState(user.pharmacist?.license_number || '');
  const [licenseState, setLicenseState] = useState(user.pharmacist?.license_state || 'NY');
  const [skills, setSkills] = useState(user.pharmacist?.skills || '');
  const [experienceYears, setExperienceYears] = useState(user.pharmacist?.experience_years || 0);
  const [phLat, setPhLat] = useState(user.pharmacist?.latitude || 40.7306);
  const [phLon, setPhLon] = useState(user.pharmacist?.longitude || -73.9352);

  const status = isOwner 
    ? (user.pharmacy?.approval_status || 'pending')
    : (user.pharmacist?.license_status || 'pending');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    const token = localStorage.getItem('token');
    const payload = isOwner 
      ? { name: pharmacyName, address, latitude: parseFloat(ownerLat), longitude: parseFloat(ownerLon) }
      : { 
          name: fullName, 
          license_number: licenseNumber, 
          license_state: licenseState, 
          skills, 
          experience_years: parseInt(experienceYears),
          latitude: parseFloat(phLat),
          longitude: parseFloat(phLon)
        };

    try {
      const res = await fetch(`${API_BASE}/profile/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || 'Profile details updated successfully.');
        // Refresh session
        handleRefresh();
      } else {
        setErrorMsg(data.error || 'Failed to update profile.');
      }
    } catch (err) {
      setErrorMsg('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        onRefreshUser(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center bg-cover bg-center overflow-y-auto px-4 py-10 relative select-none"
      style={{ backgroundImage: `linear-gradient(rgba(7, 20, 38, 0.72), rgba(7, 20, 38, 0.8)), url('/pharmacy_bg_dark.png')` }}
    >
      <div className="absolute inset-0 bg-[#071426]/50 backdrop-blur-xs pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-[#0B1E36]/90 border border-white/10 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl relative z-10 my-auto"
      >
        {/* Glow indicator at the top */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-72 h-32 bg-[#F59E0B]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Card Header */}
        <div className="flex flex-col items-center text-center mb-6 pb-5 border-b border-white/[0.06]">
          <div className="w-12 h-12 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-center shadow-lg shadow-[#F59E0B]/5 mb-4 animate-pulse">
            <ShieldAlert size={24} className="text-[#F59E0B]" />
          </div>
          <h1 className="font-extrabold text-2xl text-white tracking-tight">Access Restricted</h1>
          <p className="text-[12px] text-amber-500 mt-1.5 font-bold uppercase tracking-wider">
            Verification Status: {status.toUpperCase()}
          </p>
          <p className="text-[12px] text-slate-400 mt-2 max-w-md">
            Your credentials are currently undergoing review by our administrators. Please review and complete your details below. You will be unlocked once approved.
          </p>
        </div>

        {/* Status indicator alerts */}
        {status === 'rejected' && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            <span className="font-extrabold block text-[13px] mb-1">Application Declined</span>
            Please review the details below, correct any errors, and click Save Details to re-submit your registration for verification.
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            ✓ {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            ⚠ {errorMsg}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-5">
            {isOwner ? (
              // Owner edit fields
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Pharmacy Name</label>
                  <div className="relative">
                    <Store className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
                    <input
                      type="text"
                      required
                      placeholder="Pharmacy Name"
                      value={pharmacyName}
                      onChange={(e) => setPharmacyName(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none pl-10 pr-4 py-3"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Street Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
                    <input
                      type="text"
                      required
                      placeholder="Address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none pl-10 pr-4 py-3"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Coordinates Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={ownerLat}
                    onChange={(e) => setOwnerLat(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Coordinates Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={ownerLon}
                    onChange={(e) => setOwnerLon(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>
              </>
            ) : (
              // Pharmacist edit fields
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
                    <input
                      type="text"
                      required
                      placeholder="Dr. Full Name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none pl-10 pr-4 py-3"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">License Number</label>
                  <div className="relative">
                    <Award className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
                    <input
                      type="text"
                      required
                      placeholder="License Ref"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none pl-10 pr-4 py-3"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">License State Code</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="State (e.g. NY)"
                    value={licenseState}
                    onChange={(e) => setLicenseState(e.target.value.toUpperCase())}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Years of Experience</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Specialties & Skills</label>
                  <input
                    type="text"
                    placeholder="Immunization, MTM, Oncology (comma separated)"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Latitude Coord</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={phLat}
                    onChange={(e) => setPhLat(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Longitude Coord</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={phLon}
                    onChange={(e) => setPhLon(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 focus:border-[#00B7FF]/60 text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none px-4 py-3"
                  />
                </div>
              </>
            )}
          </div>

          {/* Action Button Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all cursor-pointer w-full sm:w-auto justify-center"
            >
              <LogOut size={13} />
              <span>Log Out</span>
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all cursor-pointer w-full sm:w-auto justify-center disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>Check Approval</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 bg-gradient-to-r from-[#0057FF] to-[#00B7FF] hover:from-[#00B7FF] hover:to-[#0057FF] text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-[#0057FF]/15 cursor-pointer w-full sm:w-auto justify-center disabled:opacity-60"
              >
                <Save size={13} />
                <span>{loading ? 'Saving...' : 'Save & Re-submit'}</span>
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
