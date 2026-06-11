import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Navbar from './components/Navbar';
import OwnerDashboard from './pages/OwnerDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AnalyticsReports from './pages/AnalyticsReports';
import PendingVerification from './pages/PendingVerification';
import CapsuleLanding from './components/CapsuleLanding';
import { AnimatePresence, motion } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000/api";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasCompletedLanding, setHasCompletedLanding] = useState(false);
  const [activeTab, setActiveTab] = useState('Dashboard');

  // Token Verification
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsVerifying(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          localStorage.removeItem('token');
        }
      } catch (e) {
        console.error('Token verification failed', e);
      } finally {
        setIsVerifying(false);
      }
    };
    verifyToken();
  }, []);

  // Progress Bar Simulation
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        const next = prev + Math.floor(Math.random() * 8) + 4;
        return next > 100 ? 100 : next;
      });
    }, 120);

    return () => clearInterval(progressInterval);
  }, []);

  // Release loading screen only when both progress is 100% and token check is complete
  useEffect(() => {
    if (progress === 100 && !isVerifying) {
      const timer = setTimeout(() => {
        setLoading(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [progress, isVerifying]);

  useEffect(() => {
    if (user) {
      if (user.role === 'pharmacist') {
        setActiveTab('Available Jobs');
      } else {
        setActiveTab('Dashboard');
      }
    }
  }, [user]);

  const handleLoginSuccess = (userData) => setUser(userData);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setHasCompletedLanding(true);
  };

  // Premium HD Splash/Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#071426] relative overflow-hidden select-none">
        {/* Background glow effects */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#0057FF]/10 blur-3xl" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#00B7FF]/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: 'linear-gradient(to right, #00B7FF 1px, transparent 1px), linear-gradient(to bottom, #00B7FF 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        {/* Splash Content Card */}
        <div className="flex flex-col items-center max-w-lg px-6 text-center relative z-10">
          {/* HD Floating Capsule Frame */}
          <div className="relative w-72 h-72 mb-8 flex items-center justify-center animate-float-slow">
            {/* Outer rotating light ring */}
            <div className="absolute w-[260px] h-[260px] rounded-full border border-dashed border-[#00B7FF]/25 animate-spin" style={{ animationDuration: '30s' }} />
            {/* Glowing blur backing */}
            <div className="absolute w-[180px] h-[180px] rounded-full bg-[#00B7FF]/10 blur-2xl" />
            
            {/* HD Image Asset */}
            <img
              src="/landing_capsule_hd.png"
              alt="PharmaSphere Capsule"
              className="w-56 h-56 object-contain relative z-10 filter drop-shadow-[0_15px_30px_rgba(0,183,255,0.3)]"
            />
            
            {/* Hologram bottom plate */}
            <div className="absolute bottom-4 w-40 h-6 bg-[#00B7FF]/20 rounded-full blur-md" style={{ transform: 'scaleY(0.2)' }} />
          </div>

          {/* Typography */}
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            PharmaSphere <span className="bg-gradient-to-r from-[#00B7FF] to-[#0057FF] bg-clip-text text-transparent">AI</span>
          </h1>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-[#00B7FF] mb-6">
            Intelligent Pharmacy Workforce Continuity Platform
          </p>

          {/* Custom Sleek Progress Loader */}
          <div className="w-64 space-y-2">
            <div className="w-full h-[3px] bg-white/5 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-[#0057FF] to-[#00B7FF] rounded-full transition-all duration-150 ease-out shadow-[0_0_8px_#00B7FF]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] text-slate-500 font-bold uppercase tracking-wider">
              <span>System Initialization</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AnimatePresence mode="wait">
        {!hasCompletedLanding ? (
          <motion.div key="landing" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <CapsuleLanding onComplete={() => setHasCompletedLanding(true)} />
          </motion.div>
        ) : (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full"
          >
            <Login onLoginSuccess={handleLoginSuccess} API_BASE={API_BASE} />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const isPending = user && (
    (user.role === 'pharmacist' && user.pharmacist && user.pharmacist.license_status !== 'verified') ||
    (user.role === 'owner' && user.pharmacy && user.pharmacy.approval_status !== 'verified')
  );

  if (isPending) {
    return (
      <PendingVerification 
        user={user} 
        onLogout={handleLogout} 
        API_BASE={API_BASE} 
        onRefreshUser={setUser} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#071426] text-slate-800 flex flex-row overflow-hidden">
      <Navbar user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} API_BASE={API_BASE} />
      <main className="flex-1 overflow-y-auto h-screen bg-[#F8FAFC]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${user.role}-${activeTab}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            {activeTab === 'Reports & Analytics' ? (
              <AnalyticsReports />
            ) : (
              <>
                {user.role === 'owner'      && <OwnerDashboard user={user} activeTab={activeTab} setActiveTab={setActiveTab} API_BASE={API_BASE} />}
                {user.role === 'pharmacist' && <PharmacistDashboard user={user} activeTab={activeTab} API_BASE={API_BASE} />}
                {user.role === 'admin'      && <AdminDashboard user={user} activeTab={activeTab} API_BASE={API_BASE} />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;