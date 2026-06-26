import React, { useState } from 'react';
import { Key, Mail, ShieldCheck, MapPin, Award, Briefcase, Heart, Plus, Shield, Eye, EyeOff, Zap, Store, User, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const INPUT_CLS = `w-full bg-white/[0.03] border border-white/10 focus:border-[#00B7FF]/60 
  text-white placeholder:text-slate-500 rounded-xl text-[13px] outline-none 
  focus:ring-2 focus:ring-[#00B7FF]/15 transition-all duration-200 px-4 py-3`;

const LABEL_CLS = "text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5";

export default function Login({ onLoginSuccess, API_BASE }) {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('owner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [name, setName] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('NY');
  const [skills, setSkills] = useState('');
  const [experienceYears, setExperienceYears] = useState(3);

  const getMockCoords = () => ({
    lat: 40.7 + Math.random() * 0.1,
    lon: -73.9 - Math.random() * 0.1
  });

  const handleLogin = async (e, quickEmail, quickPassword) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    const loginEmail = quickEmail || email;
    const loginPassword = quickPassword || password;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        if (rememberMe) localStorage.setItem('remembered_email', loginEmail);
        localStorage.setItem('token', data.token);
        onLoginSuccess(data.user);
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch {
      setError('Connection refused. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const coords = getMockCoords();
    const payload = { email, password, role, latitude: coords.lat, longitude: coords.lon };
    if (role === 'owner') {
      payload.pharmacy_name = pharmacyName;
      payload.address = address;
    } else if (role === 'pharmacist') {
      payload.name = name;
      payload.license_number = licenseNumber;
      payload.license_state = licenseState;
      payload.skills = skills;
      payload.experience_years = parseInt(experienceYears);
    }
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        onLoginSuccess(data.user);
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch {
      setError('Server error during registration.');
    } finally {
      setLoading(false);
    }
  };

  const triggerQuickLogin = (emailVal, passVal) => {
    setEmail(emailVal);
    setPassword(passVal);
    handleLogin(null, emailVal, passVal);
  };

  const quickLogins = [
    { label: 'Admin', icon: Shield, email: 'admin@pharmamind.ai', pass: 'admin123' },
    { label: 'Owner', icon: Store, email: 'owner1@pharmacy.com', pass: 'owner123' },
    { label: 'Pharmacist', icon: User, email: 'pharmacist1@pharma.com', pass: 'pharma123' },
  ];

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative bg-cover bg-center overflow-y-auto px-4 py-10"
      style={{ backgroundImage: `linear-gradient(rgba(7, 20, 38, 0.5), rgba(7, 20, 38, 0.65)), url('/pharmacy_bg_dark.png')` }}
    >
      <div className="absolute inset-0 bg-[#071426]/40 backdrop-blur-xs pointer-events-none" />

      {/* Main Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-[440px] bg-[#0B1E36]/80 border border-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10 my-auto"
      >
        {/* Glow indicator at the top */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#00B7FF]/15 rounded-full blur-2xl pointer-events-none" />

        {/* Card Header */}
        <div className="flex flex-col items-center text-center mb-6 pb-4 border-b border-white/[0.06]">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#00B7FF] to-[#0057FF] flex items-center justify-center shadow-lg shadow-[#0057FF]/20 mb-3">
            <Shield size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-extrabold text-xl text-white tracking-tight">PharmaMind AI</h1>
          <p className="text-[12px] text-slate-400 mt-1 font-semibold uppercase tracking-wider">Welcome Back!</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isRegister ? 'Create an account to join the platform' : 'Login to continue to your account'}
          </p>
        </div>

        {/* Errors */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center space-x-2"
            >
              <span>⚠</span>
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={isRegister ? handleRegister : handleLogin} className="space-y-4">
          
          {/* Role selector on register */}
          {isRegister && (
            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Account Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: 'owner', label: 'Pharmacy Owner', icon: Store },
                  { val: 'pharmacist', label: 'Pharmacist', icon: User },
                ].map(({ val, label, icon: Icon }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRole(val)}
                    className={`py-2.5 px-3 rounded-xl border text-[11px] font-bold transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer
                      ${role === val
                        ? 'bg-[#0057FF]/10 border-[#0057FF] text-[#00B7FF] shadow-md'
                        : 'bg-white/[0.02] border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'
                      }`}
                  >
                    <Icon size={12} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Registration Fields */}
          {isRegister && role === 'pharmacist' && (
            <div className="grid grid-cols-2 gap-3 animate-fade-up">
              <div className="col-span-2 space-y-1.5">
                <label className={LABEL_CLS}>Full Name</label>
                <input type="text" required placeholder="Dr. Sarah Johnson" value={name}
                  onChange={e => setName(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>License Reference</label>
                <input type="text" required placeholder="NY-PHA88221" value={licenseNumber}
                  onChange={e => setLicenseNumber(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>State Code</label>
                <input type="text" required placeholder="NY" maxLength={2} value={licenseState}
                  onChange={e => setLicenseState(e.target.value.toUpperCase())} className={INPUT_CLS} />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>Specialties</label>
                <input type="text" placeholder="Immunization, MTM" value={skills}
                  onChange={e => setSkills(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>Exp (Years)</label>
                <input type="number" required min={0} value={experienceYears}
                  onChange={e => setExperienceYears(e.target.value)} className={INPUT_CLS} />
              </div>
            </div>
          )}

          {isRegister && role === 'owner' && (
            <div className="space-y-3 animate-fade-up">
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>Pharmacy Name</label>
                <input type="text" required placeholder="Avenue Medical Pharmacy" value={pharmacyName}
                  onChange={e => setPharmacyName(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>Street Address</label>
                <input type="text" required placeholder="50 Madison Ave, New York, NY" value={address}
                  onChange={e => setAddress(e.target.value)} className={INPUT_CLS} />
              </div>
            </div>
          )}

          {/* Email input with icon */}
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`${INPUT_CLS} pl-10`}
              />
            </div>
          </div>

          {/* Password input with icon */}
          <div className="space-y-1.5">
            <label className={LABEL_CLS}>Password</label>
            <div className="relative">
              <Key className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`${INPUT_CLS} pl-10 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Remember me & forgot password */}
          {!isRegister && (
            <div className="flex items-center justify-between text-[11px] py-0.5 select-none">
              <label className="flex items-center space-x-2 cursor-pointer group">
                <div
                  onClick={() => setRememberMe(v => !v)}
                  className={`w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer transition-all
                    ${rememberMe ? 'bg-[#0057FF] border-[#0057FF]' : 'border-white/20 bg-white/5 hover:border-[#00B7FF]/50'}`}
                >
                  {rememberMe && <span className="text-white text-[9px] font-bold">✓</span>}
                </div>
                <span className="text-slate-400 group-hover:text-slate-300 font-medium">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Please contact administrator for credentials recovery.')}
                className="text-[#00B7FF] hover:text-[#0057FF] font-semibold cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-[#0057FF] to-[#00B7FF] hover:from-[#00B7FF] hover:to-[#0057FF] text-white font-bold text-[13px] transition-all shadow-lg shadow-[#0057FF]/20 hover:shadow-[#0057FF]/30 hover:-translate-y-0.5 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processing...</span>
              </span>
            ) : (
              <span>{isRegister ? 'Sign Up' : 'Login'}</span>
            )}
          </button>
        </form>

        {/* Quick evaluation logins */}
        {!isRegister && (
          <div className="mt-6 pt-5 border-t border-white/[0.06]">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block mb-3 text-center">
              or continue with
            </span>
            <div className="grid grid-cols-3 gap-2">
              {quickLogins.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.label}
                    onClick={() => triggerQuickLogin(q.email, q.pass)}
                    className="flex flex-col items-center justify-center py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.05] hover:border-[#00B7FF]/20 transition-all duration-200 cursor-pointer"
                  >
                    <Icon size={14} className="text-slate-400 mb-1 group-hover:text-[#00B7FF]" />
                    <span className="text-[10px] font-bold text-slate-400">{q.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sign up / Sign in Toggle */}
        <div className="mt-6 text-center text-xs">
          <span className="text-slate-500">
            {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            onClick={() => { setIsRegister(v => !v); setError(''); }}
            className="text-[#00B7FF] hover:text-[#0057FF] font-bold hover:underline cursor-pointer"
          >
            {isRegister ? 'Sign In' : 'Sign Up'}
          </button>
        </div>

      </motion.div>
    </div>
  );
}
