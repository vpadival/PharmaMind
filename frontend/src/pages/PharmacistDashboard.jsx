import React, { useState, useEffect } from 'react';
import {
  Award, Calendar, ShieldCheck, Clock, MapPin, Search, Star,
  AlertCircle, FileText, CheckCircle, Sparkles, Send, TrendingUp, Bell, ArrowUpRight, Shield, MessageSquare, BookOpen, Settings
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const INPUT_CLS = `w-full bg-slate-50 border border-slate-200/80 focus:border-[#0057FF] focus:bg-white 
  text-slate-800 placeholder:text-slate-400 rounded-xl text-[12px] outline-none 
  focus:ring-2 focus:ring-[#0057FF]/15 transition-all duration-200 px-3.5 py-2.5`;

export default function PharmacistDashboard({ user, activeTab, API_BASE }) {
  const [profile, setProfile] = useState(user.pharmacist || null);
  const [toast, setToast] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [leaves, setLeaves] = useState([]);

  const [availability, setAvailability] = useState([]);
  const [editingAvail, setEditingAvail] = useState(false);
  const [availDays, setAvailDays] = useState({
    Mon: true, Tue: false, Wed: true, Thu: false, Fri: true, Sat: false, Sun: false,
  });

  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveImpact, setLeaveImpact] = useState(null);
  const [leaveReplacement, setLeaveReplacement] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [rateFilter, setRateFilter] = useState('');
  const [activeFilterPill, setActiveFilterPill] = useState('all');

  const token = localStorage.getItem('token');

  const fetchDashboardData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const pRes = await fetch(`${API_BASE}/auth/me`, { headers });
      if (pRes.ok) {
        const pData = await pRes.json();
        setProfile(pData.pharmacist);
      }
      const sRes = await fetch(`${API_BASE}/jobs?scope=marketplace`, { headers });
      if (sRes.ok) setShifts(await sRes.json());

      const msRes = await fetch(`${API_BASE}/jobs?scope=my-shifts`, { headers });
      if (msRes.ok) setMyShifts(await msRes.json());

      const lRes = await fetch(`${API_BASE}/leaves`, { headers });
      if (lRes.ok) setLeaves(await lRes.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const handleAcceptShift = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}/accept`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchDashboardData();
        setToast({ msg: 'Application submitted. Awaiting owner approval.', type: 'success' });
      } else {
        const err = await res.json();
        setToast({ msg: err.error || 'Failed to submit request', type: 'error' });
      }
    } catch (e) { console.error(e); }
  };

  const handleCancelShift = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}/cancel`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchDashboardData();
    } catch (e) { console.error(e); }
  };

  const handleRequestLeave = async (e) => {
    e.preventDefault();
    setSubmittingLeave(true);
    try {
      const res = await fetch(`${API_BASE}/leaves/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ start_date: leaveStart, end_date: leaveEnd, reason: leaveReason })
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveImpact(data.impact_score);
        setLeaveReplacement(data.suggested_replacement || 'None available');
        setLeaveStart(''); setLeaveEnd(''); setLeaveReason('');
        fetchDashboardData();
      }
    } catch (e) { console.error(e); }
    finally { setSubmittingLeave(false); }
  };

  const isRetentionRisk = profile && (profile.trust_score < 85.0 || profile.license_status === 'pending');

  const filteredShifts = shifts.filter(s => {
    const matchesSearch = s.pharmacy_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRate = rateFilter ? s.hourly_rate >= parseFloat(rateFilter) : true;
    let matchesPill = true;
    if (activeFilterPill === 'emergency') matchesPill = s.is_emergency;
    else if (activeFilterPill === 'high-paying') matchesPill = s.hourly_rate >= 70;
    else if (activeFilterPill === 'close-range') matchesPill = s.distance_miles !== null && s.distance_miles < 10;
    return matchesSearch && matchesRate && matchesPill;
  });

  const emergencyShifts = filteredShifts.filter(s => s.is_emergency);
  const regularShifts = filteredShifts.filter(s => !s.is_emergency);

  const initials = profile?.name ? profile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'PH';

  // Earnings Chart Data
  const earningsData = [
    { month: 'Dec', Earnings: 18000 },
    { month: 'Jan', Earnings: 24000 },
    { month: 'Feb', Earnings: 31000 },
    { month: 'Mar', Earnings: 29000 },
    { month: 'Apr', Earnings: 42000 },
    { month: 'May', Earnings: 48750 },
  ];

  // Calendar days mock helper
  const calendarDays = Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    hasShift: [5, 12, 18, 22].includes(i + 1),
    isToday: i + 1 === 10
  }));

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
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl relative cursor-pointer">
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0057FF]" />
          </button>
          <div className="w-[1px] h-6 bg-slate-200" />
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#7C3AED] text-white font-black text-xs flex items-center justify-center shadow-md shadow-purple-500/10">
              {initials}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800 block">{profile?.name || user?.pharmacist?.name || 'Pharmacist'}</span>
              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Licensed Pharmacist</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        
        {/* Retention Incentive Banner */}
        {isRetentionRisk && (
          <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-[#22C55E]/20 text-[#22C55E] flex-shrink-0">
                <Sparkles size={16} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Workforce Retention Incentive Active</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  You qualify for a <strong className="text-[#22C55E]">+$10/hr bonus incentive</strong> on emergency shifts this week.
                </p>
              </div>
            </div>
            <span className="bg-[#22C55E] text-white text-[9px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider flex-shrink-0">
              Active Bonus
            </span>
          </div>
        )}

        {/* Dashboard Tab */}
        {(activeTab === 'Available Jobs' || activeTab === 'Dashboard' || !activeTab) && (
          <div className="space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Welcome, {profile?.name || user?.pharmacist?.name || 'Doctor'}!</h2>
                <p className="text-slate-400 text-xs mt-1">Manage your digital passport, set availability, request leaves, and secure shift bookings.</p>
              </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              
              {/* Trust Score */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-[#00B7FF]/50 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Trust Score</span>
                  <div className="flex items-baseline space-x-0.5 mt-1">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">{profile?.trust_score ?? '—'}</span>
                    <span className="text-[10px] text-slate-400 font-bold">/100</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#22C55E] mt-1.5 block">Excellent Stability</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#22C55E]/10 text-[#22C55E]">
                  <ShieldCheck size={18} strokeWidth={2.5} />
                </div>
              </div>
 
              {/* Total Earnings */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-[#00B7FF]/50 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Earnings</span>
                  <span className="text-2xl font-black text-slate-900 tracking-tight block mt-1">₹ 48,750</span>
                  <div className="flex items-center space-x-1.5 mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E]">+12%</span>
                    <span className="text-[10px] text-slate-400">this month</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#7C3AED]/10 text-[#7C3AED]">
                  <TrendingUp size={18} strokeWidth={2.5} />
                </div>
              </div>
 
              {/* Completed Shifts */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-[#00B7FF]/50 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Completed Shifts</span>
                  <span className="text-2xl font-black text-slate-900 tracking-tight block mt-1">36</span>
                  <div className="flex items-center space-x-1.5 mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0057FF]/10 text-[#0057FF]">+8</span>
                    <span className="text-[10px] text-slate-400">this month</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0057FF]/10 text-[#0057FF]">
                  <Clock size={18} strokeWidth={2.5} />
                </div>
              </div>
 
              {/* Ratings */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-[#00B7FF]/50 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ratings</span>
                  <div className="flex items-baseline space-x-0.5 mt-1">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">{profile?.rating ?? '—'}</span>
                    <span className="text-[10px] text-slate-400 font-bold">/5.0</span>
                  </div>
                  <div className="flex items-center text-amber-500 mt-1.5">
                    <Star size={10} fill="currentColor" />
                    <Star size={10} fill="currentColor" />
                    <Star size={10} fill="currentColor" />
                    <Star size={10} fill="currentColor" />
                    <Star size={10} fill="currentColor" className="opacity-40" />
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F59E0B]/10 text-[#F59E0B]">
                  <Award size={18} strokeWidth={2.5} />
                </div>
              </div>

            </div>

            {/* Layout Grid */}
            <div className="grid lg:grid-cols-12 gap-6">
              
              {/* Left Column (col-span-7) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Available Jobs Marketplace */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Jobs Marketplace</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Apply for open clinical shifts with matching credentials.</p>
                    </div>

                    {/* Inputs filters */}
                    <div className="flex space-x-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                        <input
                          type="text"
                          placeholder="Filter Pharmacy..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="bg-slate-50 border border-slate-200 text-slate-800 pl-7 pr-2.5 py-1.5 rounded-lg text-[10px] outline-none w-32 focus:border-[#0057FF]"
                        />
                      </div>
                      <input
                        type="number"
                        placeholder="Min Rate..."
                        value={rateFilter}
                        onChange={e => setRateFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg text-[10px] outline-none w-20 focus:border-[#0057FF]"
                      />
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: 'All Shifts' },
                      { id: 'emergency', label: 'Emergency Core' },
                      { id: 'high-paying', label: 'High Pay ≥$70' },
                      { id: 'close-range', label: 'Near Me <10mi' },
                    ].map(pill => (
                      <button
                        key={pill.id}
                        onClick={() => setActiveFilterPill(pill.id)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                          activeFilterPill === pill.id
                            ? 'bg-[#00B7FF] text-white border-[#00B7FF] shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>

                  {/* Shifts List */}
                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {/* Emergency priority board */}
                    {emergencyShifts.length > 0 && activeFilterPill !== 'high-paying' && (
                      <div className="p-3 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-xl space-y-2.5">
                        <span className="text-[9px] font-black uppercase text-[#EF4444] tracking-wider flex items-center space-x-1">
                          <AlertCircle size={10} className="animate-bounce" />
                          <span>Emergency High-Priority Coverage</span>
                        </span>
                        {emergencyShifts.map((s, idx) => (
                          <div key={idx} className="bg-white border border-[#EF4444]/20 p-3.5 rounded-lg flex items-center justify-between hover:shadow-xs transition-all">
                            <div>
                              <span className="text-xs font-bold text-slate-800 block">{s.title}</span>
                              <span className="text-[10px] font-semibold text-[#EF4444] block mt-0.5">{s.pharmacy_name}</span>
                              <span className="text-[9px] text-slate-400 block mt-0.5">{s.date} · {s.start_time} - {s.end_time}</span>
                            </div>
                            <div className="text-right space-y-2">
                              <span className="text-xs font-black text-[#EF4444] block">${s.hourly_rate}/hr</span>
                              <button
                                onClick={() => handleAcceptShift(s.id)}
                                className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white font-bold text-[9px] px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs"
                              >
                                Accept Shift
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
 
                    {/* Regular Shifts */}
                    {regularShifts.length === 0 && emergencyShifts.length === 0 ? (
                      <p className="text-slate-400 text-xs text-center py-12">No open shifts matching filters.</p>
                    ) : (
                      regularShifts.map((s, idx) => (
                        <div key={idx} className="p-3.5 border border-slate-100 hover:border-[#00B7FF]/50 rounded-xl flex items-center justify-between transition-all">
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">{s.title}</span>
                            <span className="text-[10px] font-semibold text-slate-500 block mt-0.5">{s.pharmacy_name}</span>
                            <div className="flex items-center space-x-2 text-[9px] text-slate-400 mt-1 font-medium">
                              <span className="flex items-center space-x-0.5"><Calendar size={9} /><span>{s.date}</span></span>
                              <span className="flex items-center space-x-0.5"><Clock size={9} /><span>{s.start_time} - {s.end_time}</span></span>
                            </div>
                          </div>
                          <div className="text-right space-y-2 flex-shrink-0 ml-4">
                            <span className="text-xs font-black text-slate-800 block">${s.hourly_rate}/hr</span>
                            <button
                              onClick={() => handleAcceptShift(s.id)}
                              className="bg-[#0057FF]/5 hover:bg-[#0057FF]/10 text-[#0057FF] border border-[#0057FF]/10 font-bold text-[9px] px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                            >
                              Request
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Right Column (col-span-5) */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* My Schedule Calendar Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">My Schedule (May 2024)</h3>
                    <span className="text-[10px] text-slate-400 font-semibold">4 Shifts Scheduled</span>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                      <span key={idx} className="text-slate-400 py-1 block">{day}</span>
                    ))}
                    {calendarDays.map((item, idx) => (
                      <div
                        key={idx}
                        className={`py-2 rounded-lg relative font-semibold transition-all cursor-pointer ${
                          item.hasShift
                            ? 'bg-[#00B7FF] text-white shadow-xs font-bold'
                            : item.isToday
                            ? 'bg-[#0057FF]/10 border border-[#0057FF]/20 text-[#0057FF]'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{item.day}</span>
                        {item.hasShift && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white animate-pulse" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Earnings Line Chart */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Earnings Overview</h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={earningsData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="month" stroke="#94A3B8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="Earnings" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Tab Panel: My Schedule */}
        {activeTab === 'My Schedule' && (
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* Confirmed Roster */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800">My Confirmed Bookings</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {myShifts.filter(s => s.status === 'matched').length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-12">No confirmed shifts scheduled.</p>
                ) : (
                  myShifts.filter(s => s.status === 'matched').map((s, idx) => (
                    <div key={idx} className="p-4 border-l-4 border-l-[#22C55E] border border-slate-100 rounded-xl hover:border-slate-200 transition-all flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">{s.title}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">{s.pharmacy_name}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">{s.date} · {s.start_time} - {s.end_time}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-black text-[#22C55E]">${s.hourly_rate}/hr</span>
                        <button
                          onClick={() => handleCancelShift(s.id)}
                          className="bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] font-bold text-[10px] px-3 py-1.5 rounded-lg cursor-pointer transition-all border border-[#EF4444]/20"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pending Requests */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Pending Booking Requests</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {myShifts.filter(s => s.status === 'applied').length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-12">No pending booking requests.</p>
                ) : (
                  myShifts.filter(s => s.status === 'applied').map((s, idx) => (
                    <div key={idx} className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">{s.title}</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">{s.pharmacy_name}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">{s.date} · {s.start_time} - {s.end_time}</span>
                      </div>
                      <div className="text-right space-y-1.5">
                        <span className="text-xs font-black text-slate-800 block">${s.hourly_rate}/hr</span>
                        <span className="bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider block">Applied</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab Panel: Availability Calendar */}
        {activeTab === 'Availability Calendar' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">My Standard Weekly Availability</h3>
                <p className="text-xs text-slate-400">Specify which weekdays you are typically available for shift dispatches.</p>
              </div>
              <button
                onClick={() => setEditingAvail(!editingAvail)}
                className="bg-[#0057FF]/5 hover:bg-[#0057FF]/10 text-[#0057FF] font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer border border-[#0057FF]/10"
              >
                {editingAvail ? 'Save Settings' : 'Edit Weekly availability'}
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center pt-2">
              {Object.entries(availDays).map(([day, active]) => (
                <button
                  key={day}
                  disabled={!editingAvail}
                  onClick={() => setAvailDays(prev => ({ ...prev, [day]: !prev[day] }))}
                  className={`py-3.5 rounded-xl text-xs font-bold border transition-all ${
                    active
                      ? 'bg-[#00B7FF] text-white border-[#00B7FF] shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                  } ${editingAvail ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Panel: Leave Requests */}
        {activeTab === 'Leave Requests' && (
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* Leave request form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <FileText size={16} className="text-[#0057FF]" />
                <span>Submit Leave/Absence Request</span>
              </h3>
              <form onSubmit={handleRequestLeave} className="space-y-4 text-xs text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-600">Start Date</label>
                    <input type="date" required value={leaveStart} onChange={e => setLeaveStart(e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-600">End Date</label>
                    <input type="date" required value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} className={INPUT_CLS} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-600">Absence Reason</label>
                  <textarea
                    required
                    placeholder="Attending clinical conference, vacation, etc."
                    value={leaveReason}
                    onChange={e => setLeaveReason(e.target.value)}
                    className={INPUT_CLS + ' h-20 resize-none'}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingLeave}
                  className="w-full bg-[#0057FF] hover:bg-[#00B7FF] text-white font-bold py-2.5 rounded-xl transition-all shadow-md shadow-[#0057FF]/10 cursor-pointer text-center"
                >
                  {submittingLeave ? 'Analyzing impact...' : 'Forecast & Submit leave request'}
                </button>
              </form>
 
              {/* Leave impact analysis */}
              {leaveImpact !== null && (
                <div className="bg-[#00B7FF]/5 border border-[#00B7FF]/20 p-4 rounded-xl space-y-2.5 animate-fade-up">
                  <span className="text-[10px] font-black uppercase text-[#00B7FF] tracking-wider block">AI Impact Analysis</span>
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Closure Risk Increase:</span>
                      <span className={`font-bold ${leaveImpact > 40 ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>+{leaveImpact}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Suggested Replacement:</span>
                      <span className="font-bold text-[#0057FF]">{leaveReplacement}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Leave History */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Leave History Logs</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {leaves.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-12">No leave logs recorded.</p>
                ) : (
                  leaves.map((l, idx) => (
                    <div key={idx} className="p-4 border border-slate-100 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Absence: {l.reason}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{l.start_date} to {l.end_date}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        l.status === 'approved' ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20' : 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                      }`}>{l.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab Panel: Profile / Earnings / Scores / Settings */}
        {activeTab === 'My Profile' && profile && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-xl space-y-6">
            <div className="flex items-center space-x-4 border-b border-slate-100 pb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00B7FF] to-[#7C3AED] text-white font-black text-lg flex items-center justify-center shadow-lg shadow-[#7C3AED]/20">
                {initials}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">{profile.name}</h3>
                <span className="bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 text-[9px] font-bold px-2.5 py-0.5 rounded-full block w-max mt-1 uppercase tracking-wider">License Verified</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">License Reference</span>
                <span className="font-bold text-slate-800 block font-mono">{profile.license_number}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">License State</span>
                <span className="font-bold text-slate-800 block">{profile.license_state}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Experience</span>
                <span className="font-bold text-slate-800 block">{profile.experience_years} Years</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Specialties</span>
                <span className="font-bold text-slate-800 block">{profile.skills || 'Clinical Pharmacy'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Panel: Settings */}
        {activeTab === 'Settings' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-xl space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Account Preferences</h3>
              <p className="text-xs text-slate-400">Configure notifications preferences and dispatch options.</p>
            </div>
                  <div className="grid md:grid-cols-2 gap-6 text-xs text-slate-700">
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Notification Alerts</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]">
                  <option>Email & In-App Alerts</option>
                  <option>In-App Alerts Only</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Emergency Dispatch Auto-Opt-In</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]">
                  <option>Enabled (Receive broadcasts within 20mi)</option>
                  <option>Disabled (Manual search only)</option>
                </select>
              </div>
            </div>
 
            <button onClick={() => setToast({ msg: 'Settings saved.', type: 'success' })} className="bg-[#0057FF] hover:bg-[#00B7FF] text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer">Save Configurations</button>
          </div>
        )}

      </div>
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-5 py-3 rounded-2xl shadow-xl text-white text-xs font-bold animate-scale-in ${
          toast.type === 'success' ? 'bg-[#22C55E]' :
          toast.type === 'error'   ? 'bg-[#EF4444]' : 'bg-[#0057FF]'
        }`}
          ref={el => { if (el) setTimeout(() => setToast(null), 3000); }}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}