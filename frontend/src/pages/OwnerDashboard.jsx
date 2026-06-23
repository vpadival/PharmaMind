import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, Activity, Users, Plus, Calendar, AlertTriangle,
  Play, Check, X, Star, MapPin, Sparkles, TrendingUp, TrendingDown, Clock, Search, Bell, Store, ShieldCheck, Lock, Terminal, Settings
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';

const INPUT_CLS = `w-full bg-slate-50 border border-slate-200/80 focus:border-[#0057FF] focus:bg-white 
  text-slate-800 placeholder:text-slate-400 rounded-xl text-[12px] outline-none 
  focus:ring-2 focus:ring-[#0057FF]/15 transition-all duration-200 px-4 py-2.5`;

const statusBadgeCls = (status) => {
  if (status === 'open')     return 'bg-[#00B7FF]/10 text-[#00B7FF] border border-[#00B7FF]/20';
  if (status === 'applied')  return 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20';
  if (status === 'matched')  return 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20';
  if (status === 'cancelled')return 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20';
  return 'bg-[#00B7FF]/10 text-[#00B7FF] border border-[#00B7FF]/20';
};

export default function OwnerDashboard({ user, activeTab, setActiveTab, API_BASE }) {
  const [metrics, setMetrics] = useState(null);
  const [toast, setToast] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [pharmacists, setPharmacists] = useState([]);

  const [showAddShift, setShowAddShift] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [matchingCandidates, setMatchingCandidates] = useState([]);
  const [showOptimizerSummary, setShowOptimizerSummary] = useState(false);
  const [optimizerResults, setOptimizerResults] = useState(null);

  const [shiftTitle, setShiftTitle] = useState('Staff Pharmacist Shift');
  const [shiftDate, setShiftDate] = useState('');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [shiftRate, setShiftRate] = useState(65);
  const [shiftIsEmergency, setShiftIsEmergency] = useState(false);

  const [simScenario, setSimScenario] = useState('staff_absence');
  const [simDuration, setSimDuration] = useState(7);
  const [simAbsentPhs, setSimAbsentPhs] = useState([]);
  const [simHolidayMult, setSimHolidayMult] = useState(1.0);
  const [simResults, setSimResults] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simStep, setSimStep] = useState(1);
  const [simStageText, setSimStageText] = useState('');

  const token = localStorage.getItem('token');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const handleUnread = (e) => setUnreadCount(e.detail);
    window.addEventListener('unread-notifications', handleUnread);
    return () => window.removeEventListener('unread-notifications', handleUnread);
  }, []);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [mRes, fRes, sRes, phRes] = await Promise.all([
        fetch(`${API_BASE}/continuity/dashboard`, { headers }),
        fetch(`${API_BASE}/continuity/demand-forecast`, { headers }),
        fetch(`${API_BASE}/jobs`, { headers }),
        fetch(`${API_BASE}/admin/licenses`, { headers }),
      ]);
      if (mRes.ok) setMetrics(await mRes.json());
      if (fRes.ok) setForecast(await fRes.json());
      if (sRes.ok) setShifts(await sRes.json());
      if (phRes.ok) {
        const phData = await phRes.json();
        setPharmacists(phData.filter(p => p.license_status === 'verified'));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddShift = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: shiftTitle, date: shiftDate, start_time: shiftStart, end_time: shiftEnd, hourly_rate: shiftRate, is_emergency: shiftIsEmergency })
      });
      if (res.ok) { setShowAddShift(false); fetchData(); }
      else { const body = await res.json().catch(() => ({})); setToast({ msg: body.error || "Failed to post shift", type: "error" }); }
    } catch (e) { console.error(e); }
  };

  const handleOpenMatches = async (shift) => {
    setSelectedShift(shift);
    setShowMatchModal(true);
    try {
      const res = await fetch(`${API_BASE}/jobs/${shift.id}/matches`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setMatchingCandidates(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleAssignCandidate = async (pharmacistId) => {
    try {
      const optRes = await fetch(`${API_BASE}/schedule/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ start_date: selectedShift.date, end_date: selectedShift.date })
      });
      if (optRes.ok) { setShowMatchModal(false); fetchData(); }
    } catch (e) { console.error(e); }
  };

  const handleRunOptimizer = async () => {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date(); future.setDate(future.getDate() + 14);
    const endDateStr = future.toISOString().split('T')[0];
    try {
      const res = await fetch(`${API_BASE}/schedule/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ start_date: today, end_date: endDateStr })
      });
      if (res.ok) { const result = await res.json(); setOptimizerResults(result); setShowOptimizerSummary(true); fetchData(); }
    } catch (e) { console.error(e); }
  };

  const handleCancelShift = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}/cancel`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) fetchData();
    } catch (e) { console.error(e); }
  };

  const handleApproveApplication = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}/approve-application`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) { fetchData(); setToast({ msg: "Application approved. Shift is now booked.", type: "success" }); }
    } catch (e) { console.error(e); }
  };

  const handleDeclineApplication = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}/decline-application`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) { fetchData(); setToast({ msg: "Application declined. Shift returned to open board.", type: "info" }); }
    } catch (e) { console.error(e); }
  };

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimStep(3);
    const stages = [
      'Initializing Monte-Carlo engine...',
      'Mapping historical shift distributions...',
      'Simulating key staff absences & leaves...',
      'Calculating local replacement pool rates...',
    ];
    for (const stage of stages) {
      setSimStageText(stage);
      await new Promise(r => setTimeout(r, 600));
    }
    try {
      const res = await fetch(`${API_BASE}/simulator/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          scenario_type: simScenario,
          duration_days: simDuration,
          absent_pharmacist_ids: simAbsentPhs.map(id => parseInt(id)),
          holiday_multiplier: parseFloat(simHolidayMult),
        })
      });
      if (res.ok) setSimResults(await res.json());
    } catch (e) { console.error(e); }
    finally { setSimLoading(false); }
  };

  const toggleAbsentPh = (id) => setSimAbsentPhs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const activeShifts = shifts.filter(s => s.status !== 'cancelled');

  /* ─── Drawer component ─── */
  const Drawer = ({ show, onClose, children, width = 'max-w-md' }) => (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50" />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            className={`fixed top-0 right-0 h-screen w-full ${width} bg-[#0B1E36] border-l border-[#1E293B] shadow-2xl z-50 flex flex-col overflow-y-auto text-white`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="bg-[#F8FAFC] text-slate-800 min-h-screen select-none animate-scale-in">
      
      {/* Search Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-xs">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full bg-slate-50 border border-slate-200/80 focus:border-[#0057FF] focus:bg-white rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 outline-none transition-all"
          />
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('open-notifications'))}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl relative cursor-pointer"
          >
            <Bell size={16} />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0057FF] animate-pulse" />}
          </button>
          <div className="w-[1px] h-6 bg-slate-200" />
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0057FF] text-white font-black text-xs flex items-center justify-center shadow-md shadow-blue-500/10">
              {(user?.pharmacy?.name || user?.email || "OW").substring(0, 2).toUpperCase()}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800 block">{user?.pharmacy?.name || user?.email || "Owner"}</span>
              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Pharmacy Owner</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="p-8 space-y-6">

        {/* Dashboard Tab */}
        {(activeTab === 'Dashboard' || !activeTab) && (
          <div className="space-y-6">
            
            {/* Greeting Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/60">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Welcome back, {user?.pharmacy?.name || user?.email || "Owner"}!</h2>
                <p className="text-slate-400 text-xs mt-1">Monitor real-time continuity metrics, run digital twin simulations, and optimize pharmacist schedules.</p>
              </div>

              <div className="flex space-x-3 self-start md:self-auto">
                <button
                  onClick={handleRunOptimizer}
                  className="flex items-center space-x-2 bg-[#0057FF]/5 hover:bg-[#0057FF]/10 text-[#0057FF] border border-[#0057FF]/15 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Sparkles size={13} className="text-[#0057FF] animate-pulse" />
                  <span>AI Auto-Schedule</span>
                </button>
                <button
                  onClick={() => setShowAddShift(true)}
                  className="flex items-center space-x-2 bg-[#0057FF] hover:bg-[#00B7FF] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-[#0057FF]/10 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Post New Shift</span>
                </button>
              </div>
            </div>

            {/* KPI Cards Row */}
            {metrics && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Closure Risk */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-blue-200 transition-all duration-300">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Closure Risk Score</span>
                    <div className="flex items-baseline space-x-0.5 mt-1">
                      <span className="text-2xl font-black text-slate-900 tracking-tight">{metrics.closure_risk_score}</span>
                      <span className="text-[10px] text-slate-400 font-bold">/100</span>
                    </div>
                    <span className={`text-[10px] font-bold mt-1.5 block ${metrics.closure_risk_score > 40 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                      {metrics.closure_risk_score > 40 ? 'High Risk' : 'Low Risk / Optimal'}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#00B7FF]/10 text-[#00B7FF]">
                    <ShieldAlert size={18} strokeWidth={2.5} />
                  </div>
                </div>
 
                {/* Workforce Health */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-blue-200 transition-all duration-300">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Workforce Health</span>
                    <span className="text-2xl font-black text-slate-900 tracking-tight block mt-1">{metrics.health_score}</span>
                    <span className="text-[10px] font-bold text-[#22C55E] mt-1.5 block">Good / Healthy</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#22C55E]/10 text-[#22C55E]">
                    <ShieldCheck size={18} strokeWidth={2.5} />
                  </div>
                </div>
 
                {/* Active Requests */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-blue-200 transition-all duration-300">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active Requests</span>
                    <span className="text-2xl font-black text-slate-900 tracking-tight block mt-1">{metrics.open_vacancies}</span>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0057FF]/10 text-[#0057FF]">+2</span>
                      <span className="text-[10px] text-slate-400">from yesterday</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0057FF]/10 text-[#0057FF]">
                    <Calendar size={18} strokeWidth={2.5} />
                  </div>
                </div>
 
                {/* Filled Shifts */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-blue-200 transition-all duration-300">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Filled Shifts</span>
                    <span className="text-2xl font-black text-slate-900 tracking-tight block mt-1">28</span>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">+5</span>
                      <span className="text-[10px] text-slate-400">vs last week</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#22C55E]/10 text-[#22C55E]">
                    <Activity size={18} strokeWidth={2.5} />
                  </div>
                </div>
              </div>
            )}

            {/* Main Panel Grid */}
            <div className="grid lg:grid-cols-12 gap-6">
              
              {/* Left Column (col-span-7) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* AI Recommended Pharmacists */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Recommended Pharmacists</h3>
                    <span className="text-[10px] text-slate-400 font-semibold">{pharmacists.length} Active Candidates</span>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {pharmacists.length === 0 ? (
                       <p className="text-slate-400 text-xs text-center py-12">No recommended pharmacists available.</p>
                    ) : (
                      pharmacists.slice(0, 3).map((ph, idx) => (
                        <div key={idx} className="p-3 border border-slate-100 hover:border-blue-100 rounded-xl transition-all flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-[#00B7FF]/10 text-[#00B7FF] font-black text-xs flex items-center justify-center">
                              {ph.name?.substring(0, 2).toUpperCase() || 'PH'}
                            </div>
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="text-xs font-bold text-slate-800">{ph.name}</span>
                                <div className="flex items-center text-amber-500">
                                  <Star size={10} fill="currentColor" />
                                  <span className="text-[9px] font-bold ml-0.5">4.8</span>
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-500 block">Proximity: 2.2 mi away</span>
                            </div>
                          </div>
                          <button
                            onClick={() => setToast({ msg: `Invite dispatched to ${ph.name}. Awaiting response.`, type: "info" })}
                            className="bg-[#0057FF]/5 hover:bg-[#0057FF]/10 text-[#0057FF] font-bold text-[10px] px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            Invite & Assign
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Demand Forecast Heatmap */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Demand Forecast (Next 7 Days)</h3>
                    <div className="flex space-x-2 text-[9px] font-bold text-slate-400">
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded bg-slate-100 border border-slate-200" /><span>Low</span></span>
                      <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded bg-[#00B7FF]" /><span>High</span></span>
                    </div>
                  </div>

                  {/* Heatmap Grid */}
                  <div className="grid grid-cols-8 gap-1 pt-2">
                    <div />
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <span key={day} className="text-[10px] font-bold text-slate-400 text-center">{day}</span>
                    ))}

                    {['8 AM', '12 PM', '4 PM', '8 PM'].map((time, rowIdx) => (
                      <React.Fragment key={time}>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center">{time}</span>
                        {Array.from({ length: 7 }).map((_, colIdx) => {
                          const intensity = (rowIdx + colIdx) % 3;
                          const bgClass = intensity === 0 ? 'bg-slate-100' : intensity === 1 ? 'bg-[#00B7FF]/20' : 'bg-[#00B7FF]/60';
                          return (
                            <div key={colIdx} className={`h-8 rounded-lg ${bgClass} border border-white hover:border-[#0057FF] transition-all cursor-pointer`} title="Predicted Shifts Required" />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Column (col-span-5) */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Active Shifts Board */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Shifts Board</h3>
                    <span className="text-[10px] text-slate-400 font-semibold">{activeShifts.length} Shifts</span>
                  </div>

                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {activeShifts.length === 0 ? (
                      <p className="text-slate-400 text-xs text-center py-12">No active shifts on board.</p>
                    ) : (
                      activeShifts.map((s, idx) => (
                        <div key={idx} className="p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl relative overflow-hidden transition-all">
                          <div className={`absolute top-0 bottom-0 left-0 w-[3px] ${
                            s.status === 'open' ? 'bg-[#00B7FF]' : s.status === 'applied' ? 'bg-[#F59E0B]' : 'bg-[#22C55E]'
                          }`} />
                          
                          <div className="flex items-start justify-between pl-1">
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">{s.title}</span>
                              <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">{s.date} · {s.start_time} - {s.end_time}</span>
                            </div>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${statusBadgeCls(s.status)}`}>
                              {s.status}
                            </span>
                          </div>
 
                          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-2.5 pl-1">
                            <div>
                              <span className="text-[9px] text-slate-400 block font-semibold">Rate</span>
                              <span className="text-xs font-black text-slate-800">₹{s.hourly_rate}/hr</span>
                            </div>
 
                            {s.status === 'applied' ? (
                              <div className="flex space-x-1.5">
                                <button
                                  onClick={() => handleApproveApplication(s.id)}
                                  className="bg-[#22C55E] hover:bg-[#22C55E]/90 text-white text-[9px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-all"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleDeclineApplication(s.id)}
                                  className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white text-[9px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-all"
                                >
                                  Decline
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenMatches(s)}
                                className="bg-[#0057FF]/5 hover:bg-[#0057FF]/10 text-[#0057FF] font-bold text-[9px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                              >
                                Find Candidates
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
 
                {/* Continuity Simulator Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Continuity Simulator</h3>
                    <span className="bg-[#0057FF]/10 text-[#0057FF] text-[8px] font-black px-2 py-0.5 rounded-full">AI Twin</span>
                  </div>
 
                  <div className="space-y-3 text-xs">
                    {[
                      { title: '2 Pharmacists on Leave', score: '35 /100', color: 'text-[#F59E0B]' },
                      { title: 'High Demand (Festival)', score: '62 /100', color: 'text-[#F59E0B]' },
                      { title: 'Low Staff Availability', score: '78 /100', color: 'text-[#EF4444]' },
                    ].map((sim, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-none">
                        <span className="text-slate-600 font-medium">{sim.title}</span>
                        <div className="text-right">
                          <span className={`font-bold block text-xs ${sim.color}`}>{sim.score}</span>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setActiveTab && setActiveTab('Simulator')}
                      className="w-full mt-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[11px] py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <span>Run New Simulation</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Panel: User Management */}
        {activeTab === 'User Management' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Pharmacy Staff & Users</h3>
            <p className="text-xs text-slate-400">View roster of associated pharmacists and technicians.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    <th>Name</th>
                    <th>Role</th>
                    <th>Trust Score</th>
                    <th className="text-right">Roster Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pharmacists.map((ph, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-slate-800">{ph.name}</td>
                      <td className="py-3 text-slate-500 font-medium">Pharmacist</td>
                      <td className="py-3 font-bold text-[#0057FF]">{ph.trust_score}%</td>
                      <td className="py-3 text-right">
                        <span className="bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 text-[9px] font-bold px-2 py-0.5 rounded-full">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Panel: Simulator (Monte Carlo Simulator) */}
        {activeTab === 'Continuity Simulator' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Monte-Carlo Workforce Simulator</h3>
              <p className="text-xs text-slate-400">Model absences, surges, and leaves to determine closure risk forecasts.</p>
            </div>
                   {simStep === 1 && (
              <div className="space-y-4 animate-fade-up">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Select Simulation Scenario</span>
                {[
                  { key: 'staff_absence', title: 'Key Staff Absence / Call-outs', desc: 'Model closure risk when specific pharmacists call out sick.' },
                  { key: 'holiday_demand', title: 'Holiday Demand Surge', desc: 'Model staffing gaps under flu seasons or surge volumes.' },
                  { key: 'multiple_leaves', title: 'Overlapping Leave Approvals', desc: 'Test continuity when multiple staff submit leaves for the same week.' }
                ].map((scen) => (
                  <div
                    key={scen.key}
                    onClick={() => { setSimScenario(scen.key); setSimStep(2); }}
                    className={`p-4 border rounded-xl cursor-pointer hover:border-blue-300 transition-all ${
                      simScenario === scen.key ? 'border-[#0057FF] bg-[#0057FF]/5' : 'border-slate-200 bg-slate-50/30'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-800 block">{scen.title}</span>
                    <span className="text-[10px] text-slate-500 block mt-1">{scen.desc}</span>
                  </div>
                ))}
              </div>
            )}
 
            {simStep === 2 && (
              <div className="space-y-4 animate-fade-up">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Configure Scenario Parameters</span>
                  <button onClick={() => setSimStep(1)} className="text-xs font-bold text-[#0057FF] hover:text-[#00B7FF]">Back</button>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Simulation Duration (Days)</label>
                    <input type="range" min={5} max={14} value={simDuration} onChange={e => setSimDuration(parseInt(e.target.value))} className="w-full accent-[#0057FF]" />
                    <span className="text-[10px] text-slate-500 block mt-0.5">{simDuration} Days</span>
                  </div>
                  <button
                    onClick={handleRunSimulation}
                    className="w-full bg-[#0057FF] hover:bg-[#00B7FF] text-white font-bold py-2.5 rounded-xl transition-all shadow-md shadow-[#0057FF]/10 cursor-pointer text-center"
                  >
                    Run Digital Twin simulation
                  </button>
                </div>
              </div>
            )}

            {simStep === 3 && (
              <div className="space-y-4 text-xs animate-fade-up">
                {simLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-[#0057FF] rounded-full animate-spin" />
                    <span className="text-slate-500 font-medium animate-pulse">{simStageText}</span>
                  </div>
                ) : simResults ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Sim Health</span>
                        <span className="text-lg font-black text-[#22C55E] block mt-1">{simResults.avg_health_score}%</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Closure Risk</span>
                        <span className="text-lg font-black text-[#EF4444] block mt-1">{simResults.avg_closure_risk_score}%</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Vulnerabilities</span>
                        <span className="text-lg font-black text-[#F59E0B] block mt-1">{simResults.vulnerable_periods.length} Days</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Simulation Recommendations</span>
                      <ul className="space-y-2">
                        {simResults.recommendations.map((rec, i) => (
                          <li key={i} className="text-slate-600 leading-relaxed font-medium list-disc ml-3">{rec.text}</li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => { setSimStep(1); setSimResults(null); }}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl transition-all text-center cursor-pointer border border-slate-200"
                    >
                      Reset Simulator
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Tab Panel: Logs */}
        {activeTab === 'System Logs' && (
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 font-mono text-slate-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Simulation Logs Console</span>
              <span className="w-2 h-2 rounded-full bg-[#00B7FF] animate-pulse" />
            </div>
            <div className="space-y-2 text-xs h-96 overflow-y-auto pr-1">
              <p className="text-slate-500">[2026-06-10 22:35:10] Initialize twin optimizer environment...</p>
              <p className="text-slate-500">[2026-06-10 22:35:12] Query local pharmacist registry within 35 miles...</p>
              <p className="text-[#00B7FF]">[2026-06-10 22:35:15] Found 12 active verified pharmacists.</p>
              <p className="text-[#22C55E]">[2026-06-10 22:35:18] Monte-Carlo Simulation success. Closure risk: 24% (Low Risk).</p>
            </div>
          </div>
        )}

        {/* Tab Panel: Settings */}
        {activeTab === 'Settings' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Pharmacy configurations</h3>
              <p className="text-xs text-slate-400">Modify address, name, and auto-scheduling options.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6 text-xs text-slate-700">
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Default Hourly Rate (₹/hr)</label>
                <input type="number" defaultValue={65} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]" />
              </div>
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Auto-Assign Replacements</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]">
                  <option>Enabled (Auto-dispatch matched)</option>
                  <option>Disabled (Manual dispatch review)</option>
                </select>
              </div>
            </div>
            <button onClick={() => setToast({ msg: "Settings saved.", type: "success" })} className="bg-[#0057FF] hover:bg-[#00B7FF] text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer">Save configurations</button>
          </div>
        )}

       {/* Post Shift Drawer */}
      <Drawer show={showAddShift} onClose={() => setShowAddShift(false)}>
        <div className="p-6 space-y-6 flex flex-col h-full bg-[#0B1E36] text-white">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold">Post Staffing Request</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">List a new shift on the local pharmacist marketplace.</p>
            </div>
            <button onClick={() => setShowAddShift(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"><X size={16} /></button>
          </div>
 
          <form onSubmit={handleAddShift} className="space-y-4 flex-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shift Title</label>
              <input type="text" required value={shiftTitle} onChange={e => setShiftTitle(e.target.value)} className="w-full bg-white/5 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[#0057FF]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</label>
                <input type="date" required value={shiftDate} onChange={e => setShiftDate(e.target.value)} className="w-full bg-white/5 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[#0057FF]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hourly Rate (₹)</label>
                <input type="number" required min={40} value={shiftRate} onChange={e => setShiftRate(e.target.value)} className="w-full bg-white/5 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[#0057FF]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Start Time</label>
                <input type="text" required placeholder="08:00" value={shiftStart} onChange={e => setShiftStart(e.target.value)} className="w-full bg-white/5 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[#0057FF]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">End Time</label>
                <input type="text" required placeholder="16:00" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} className="w-full bg-white/5 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[#0057FF]" />
              </div>
            </div>
            <label className="flex items-center space-x-3 p-3.5 rounded-xl bg-white/5 border border-slate-800 cursor-pointer hover:border-slate-700 transition-all group">
              <div
                onClick={() => setShiftIsEmergency(v => !v)}
                className={`w-5 h-5 rounded-[5px] border flex items-center justify-center cursor-pointer transition-all flex-shrink-0
                  ${shiftIsEmergency ? 'bg-[#0057FF] border-[#0057FF]' : 'border-slate-800 bg-white/5 hover:border-[#00B7FF]/50'}`}
              >
                {shiftIsEmergency && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
              <div>
                <span className="text-[11px] text-white font-bold block">Emergency Shift Coverage</span>
                <span className="text-[10px] text-slate-400">Eligible for incentive bonus pay</span>
              </div>
            </label>
            <button type="submit"
              className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-[#0057FF] to-[#7C3AED] hover:from-[#00B7FF] hover:to-[#7C3AED] text-white font-bold text-[12px] transition-all shadow-lg shadow-[#0057FF]/20 cursor-pointer hover:-translate-y-0.5">
              Post to Marketplace
            </button>
          </form>
        </div>
      </Drawer>        {/* Smart Match Drawer */}
      <Drawer show={showMatchModal && !!selectedShift} onClose={() => setShowMatchModal(false)} width="max-w-lg">
        <div className="p-6 space-y-5 bg-[#0B1E36] text-white h-full flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold">AI Smart Match Sourcing</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{selectedShift?.title} · {selectedShift?.date}</p>
            </div>
            <button onClick={() => setShowMatchModal(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"><X size={16} /></button>
          </div>
 
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1 flex-1">
            {matchingCandidates.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-[12px]">No matching verified pharmacists available.</div>
            ) : (
              matchingCandidates.map(c => (
                <div key={c.pharmacist_id}
                  className="bg-white/5 border border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-slate-700 transition-all group">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00B7FF] to-[#0057FF] flex items-center justify-center text-white text-[10px] font-black">
                        {c.name?.substring(0, 2).toUpperCase() || 'PH'}
                      </div>
                      <span className="text-[12px] font-bold">{c.name}</span>
                      <div className="flex items-center text-amber-500">
                        <Star size={10} fill="currentColor" />
                        <span className="text-[10px] font-bold ml-0.5">{c.rating}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="bg-[#22C55E]/10 text-[#22C55E] text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-0.5">
                        <MapPin size={8} /><span>{c.distance} mi</span>
                      </span>
                      <span className="bg-white/5 border border-slate-800 text-slate-400 text-[9px] font-bold px-2 py-0.5 rounded-full">
                        Trust: {c.trust_score}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <span className="text-[9px] text-slate-500 block">Match Score</span>
                      <span className="text-[13px] font-black text-[#00B7FF]">{c.match_probability}%</span>
                    </div>
                    <button
                      onClick={() => handleAssignCandidate(c.pharmacist_id)}
                      className="bg-[#0057FF] hover:bg-[#00B7FF] text-white text-[10px] font-bold px-3 py-2 rounded-xl transition-all cursor-pointer shadow-md shadow-[#0057FF]/20"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Drawer>

      {/* Toast notification */}
      {toast && (
        <div
          className={"fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-5 py-3 rounded-2xl shadow-xl text-white text-xs font-bold animate-scale-in " +
            (toast.type === "success" ? "bg-[#22C55E]" : toast.type === "error" ? "bg-[#EF4444]" : "bg-[#0057FF]")}
          ref={el => { if (el) setTimeout(() => setToast(null), 3000); }}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">x</button>
        </div>
      )}
    </div>
  </div>
  );
}