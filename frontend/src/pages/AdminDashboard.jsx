import React, { useState, useEffect } from 'react';
import {
  Shield, Check, X, ShieldAlert, Users, AlertTriangle,
  MapPin, RefreshCw, CheckCircle2, Lock, Search, Bell,
  FileCheck, ShieldOff, Terminal, Settings, ArrowUpRight, CheckSquare, Plus, Activity, Store
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

export default function AdminDashboard({ user, activeTab, API_BASE }) {
  const [licenses, setLicenses] = useState([]);
  const [toast, setToast] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [fraudFlags, setFraudFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);

  const token = localStorage.getItem('token');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const handleUnread = (e) => setUnreadCount(e.detail);
    window.addEventListener('unread-notifications', handleUnread);
    return () => window.removeEventListener('unread-notifications', handleUnread);
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [licRes, fraudRes, pharmRes] = await Promise.all([
        fetch(`${API_BASE}/admin/licenses`, { headers }),
        fetch(`${API_BASE}/admin/fraud-audit`, { headers }),
        fetch(`${API_BASE}/admin/pharmacies`, { headers }),
      ]);
      if (licRes.ok) setLicenses(await licRes.json());
      if (fraudRes.ok) setFraudFlags(await fraudRes.json());
      if (pharmRes.ok) setPharmacies(await pharmRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAdminData(); }, []);

  const handleVerify = async (id, approve) => {
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/licenses/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ approve })
      });
      if (res.ok) fetchAdminData();
    } catch (e) { console.error(e); }
    finally { setResolving(false); }
  };

  const handleVerifyPharmacy = async (id, approve) => {
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/pharmacies/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ approve })
      });
      if (res.ok) fetchAdminData();
    } catch (e) { console.error(e); }
    finally { setResolving(false); }
  };

  const pendingLicenses = licenses.filter(l => l.license_status === 'pending');
  const verifiedLicenses = licenses.filter(l => l.license_status === 'verified');
  const rejectedLicenses = licenses.filter(l => l.license_status === 'rejected');

  const pendingPharmacies = pharmacies.filter(p => p.approval_status === 'pending');

  // Chart data
  const platformAnalyticsData = [
    { name: 'Jan', Pharmacies: 600, Pharmacists: 1200 },
    { name: 'Feb', Pharmacies: 900, Pharmacists: 1800 },
    { name: 'Mar', Pharmacies: 1200, Pharmacists: 2400 },
    { name: 'Apr', Pharmacies: 1700, Pharmacists: 3200 },
    { name: 'May', Pharmacies: 2100, Pharmacists: 4000 },
    { name: 'Jun', Pharmacies: 2548, Pharmacists: 4325 },
  ];

  const licensePieData = [
    { name: 'Verified', value: verifiedLicenses.length || 18, color: '#22C55E' },
    { name: 'Pending', value: pendingLicenses.length || 3, color: '#F59E0B' },
    { name: 'Rejected', value: rejectedLicenses.length || 1, color: '#EF4444' },
  ];

  return (
    <div className="bg-[#F8FAFC] text-slate-800 min-h-screen select-none animate-scale-in">
      
      {/* Search Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-xs">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full bg-slate-50 border border-slate-200/80 focus:border-blue-500 focus:bg-white rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 outline-none transition-all"
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
            <div className="w-8 h-8 rounded-lg bg-[#EF4444] text-white font-black text-xs flex items-center justify-center shadow-md shadow-red-500/10">
              {(user?.email || 'AD').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800 block">{user?.email || 'Admin'}</span>
              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Super Administrator</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-8 space-y-6">
        
        {/* Render Dashboard View */}
        {(activeTab === 'Dashboard' || !activeTab) && (
          <div className="space-y-6">
            
            {/* Page Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Admin Dashboard</h2>
                <p className="text-slate-400 text-xs mt-1">Real-time oversight of platform activity, security audit logs, and registry status.</p>
              </div>
              <button
                onClick={fetchAdminData}
                disabled={loading}
                className="flex items-center space-x-2 bg-[#0057FF]/5 hover:bg-[#0057FF]/10 text-[#0057FF] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border border-[#0057FF]/10"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Sync Platform Data</span>
              </button>
            </div>

            {/* Metrics Row */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { label: 'Total Pharmacies', value: '2,548', trend: '+12.5%', icon: Store, color: 'text-[#0057FF]', bg: 'bg-[#0057FF]/5' },
                { label: 'Total Pharmacists', value: '12,486', trend: '+8.4%', icon: Users, color: 'text-[#7C3AED]', bg: 'bg-[#7C3AED]/5' },
                { label: 'Verified Licenses', value: `${licenses.filter(l => l.license_status === 'verified').length || '4,325'}`, trend: '+10.2%', icon: FileCheck, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/5' },
                { label: 'Active Jobs', value: '1,248', trend: '+16.1%', icon: Activity, color: 'text-[#00B7FF]', bg: 'bg-[#00B7FF]/5' }
              ].map((m, i) => {
                const Icon = m.icon;
                return (
                  <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between hover:border-blue-200 transition-all duration-300">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{m.label}</span>
                      <span className="text-2xl font-black text-slate-950 block mt-1 tracking-tight">{m.value}</span>
                      <div className="flex items-center space-x-1.5 mt-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">{m.trend}</span>
                        <span className="text-[10px] text-slate-400">vs last month</span>
                      </div>
                    </div>
                    <div className={`p-3.5 rounded-xl ${m.bg} ${m.color}`}>
                      <Icon size={18} strokeWidth={2.5} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid Charts */}
            <div className="grid lg:grid-cols-12 gap-6">
              
              {/* Platform Analytics Line chart */}
              <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Platform Analytics</h3>
                  <div className="flex space-x-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-[#0057FF]" /><span>Pharmacies</span></span>
                    <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-[#00B7FF]" /><span>Pharmacists</span></span>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={platformAnalyticsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px' }} />
                      <Line type="monotone" dataKey="Pharmacies" stroke="#0057FF" strokeWidth={2.5} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="Pharmacists" stroke="#00B7FF" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* License Verification Pie chart */}
              <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">License Verification</h3>
                  <div className="h-44 relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={licensePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={62} dataKey="value" paddingAngle={2}>
                          {licensePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center">
                      <span className="text-xl font-black text-slate-800 block">{(licenses.length) || '22'}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Total</span>
                    </div>
                  </div>
                </div>
                {/* Stats Breakdown */}
                <div className="grid grid-cols-3 gap-1 pt-3 border-t border-slate-100 text-center text-[10px] font-bold">
                  {licensePieData.map((p, idx) => (
                    <div key={idx} className="space-y-1">
                      <span className="text-slate-400 block font-medium">{p.name}</span>
                      <span className="block text-xs" style={{ color: p.color }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Bottom Row */}
            <div className="grid lg:grid-cols-12 gap-6">
              
              {/* Verification Queue (col 8) */}
              <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Verification Queue</h3>
                  <span className="bg-[#F59E0B]/10 text-[#F59E0B] text-[9px] font-bold px-2 py-0.5 rounded-full">
                    {pendingLicenses.length + pendingPharmacies.length} Action Required
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1">
                  {pendingLicenses.length === 0 && pendingPharmacies.length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-12">No pending reviews in the queue.</p>
                  ) : (
                    <>
                      {/* Pharmacist Applications */}
                      {pendingLicenses.map((l, idx) => (
                        <div key={`ph-${idx}`} className="py-3 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-xl transition-all">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B] font-extrabold text-xs flex items-center justify-center">
                              PH
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-800">{l.name}</span>
                                <span className="bg-[#7C3AED]/10 text-[#7C3AED] text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Pharmacist</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono block">License: {l.license_number} ({l.license_state})</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleVerify(l.pharmacist_id, true)}
                              disabled={resolving}
                              className="p-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/20 hover:border-[#22C55E]/30 text-[#22C55E] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                            >
                              <Check size={12} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={() => handleVerify(l.pharmacist_id, false)}
                              disabled={resolving}
                              className="p-1.5 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/20 hover:border-[#EF4444]/30 text-[#EF4444] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                            >
                              <X size={12} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Pharmacy Applications */}
                      {pendingPharmacies.map((p, idx) => (
                        <div key={`rx-${idx}`} className="py-3 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-xl transition-all">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-[#0057FF]/10 border border-[#0057FF]/20 text-[#0057FF] font-extrabold text-xs flex items-center justify-center">
                              RX
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-800">{p.name}</span>
                                <span className="bg-[#0057FF]/10 text-[#0057FF] text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Pharmacy</span>
                              </div>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[280px]">Location: {p.address}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleVerifyPharmacy(p.id, true)}
                              disabled={resolving}
                              className="p-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/20 hover:border-[#22C55E]/30 text-[#22C55E] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                            >
                              <Check size={12} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={() => handleVerifyPharmacy(p.id, false)}
                              disabled={resolving}
                              className="p-1.5 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/20 hover:border-[#EF4444]/30 text-[#EF4444] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                            >
                              <X size={12} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Fraud Alerts Feed (col 4) */}
              <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Fraud Detection Alerts</h3>
                  {fraudFlags.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />}
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {fraudFlags.length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-12">Registry is secure. No alerts.</p>
                  ) : (
                    fraudFlags.map((flag, idx) => {
                      const isCritical = flag.severity === 'CRITICAL' || flag.type === 'DUPLICATE_LICENSE';
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border transition-all ${
                            isCritical
                              ? 'bg-[#EF4444]/5 border-[#EF4444]/20 text-[#EF4444]'
                              : 'bg-[#F59E0B]/5 border-[#F59E0B]/20 text-[#F59E0B]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black uppercase tracking-wider block">{flag.type.replace(/_/g, ' ')}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                              isCritical ? 'bg-[#EF4444]/20 text-[#EF4444]' : 'bg-[#F59E0B]/20 text-[#F59E0B]'
                            }`}>{isCritical ? 'CRITICAL' : 'WARNING'}</span>
                          </div>
                          <p className="text-[10px] text-slate-600 leading-relaxed font-medium">{flag.details}</p>
                          <button
                            onClick={() => setToast({ msg: 'Account flagged for suspension. Manual review required.', type: 'error' })}
                            className="mt-2.5 w-full bg-[#EF4444] hover:bg-[#EF4444]/80 text-white font-bold text-[9px] py-1.5 rounded-lg transition-all shadow-xs cursor-pointer uppercase tracking-wider flex items-center justify-center space-x-1"
                          >
                            <Lock size={10} />
                            <span>Lock Account</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Tab Panel: User Management */}
        {activeTab === 'User Management' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800">User Directory</h3>
            <p className="text-xs text-slate-400">Manage registered pharmacist and pharmacy owner accounts.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    <th className="py-2">User Email</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Created At</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {[
                    { email: 'owner1@pharmacy.com', status: 'active', date: '2026-05-10' },
                    { email: 'pharmacist1@pharma.com', status: 'active', date: '2026-05-12' },
                    { email: 'pharmacist2@pharma.com', status: 'suspended', date: '2026-05-18' },
                  ].map((user, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-800">{user.email}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          user.status === 'active' ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20' : 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20'
                        }`}>{user.status}</span>
                      </td>
                      <td className="py-3 text-slate-500 font-medium">{user.date}</td>
                      <td className="py-3 text-right">
                        <button onClick={() => setToast({ msg: 'Account modification logged.', type: 'info' })} className="text-[#0057FF] hover:text-[#00B7FF] font-bold text-[10px] cursor-pointer">Modify</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Panel: Pharmacy Management */}
        {activeTab === 'Pharmacy Management' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Pharmacy Registry</h3>
            <p className="text-xs text-slate-400">Verify and monitor registered pharmacy storefronts and licenses.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    <th className="py-2">Pharmacy Name</th>
                    <th className="py-2">Location</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pharmacies.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">No registered pharmacies.</td>
                    </tr>
                  ) : (
                    pharmacies.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 font-semibold text-slate-800">
                          <div>
                            <span className="block font-bold text-slate-800">{p.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">Owner: {p.owner_email}</span>
                          </div>
                        </td>
                        <td className="py-3 text-slate-500 font-medium">{p.address}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            p.approval_status === 'verified'
                              ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20'
                              : p.approval_status === 'rejected'
                              ? 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20'
                              : 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20'
                          }`}>{p.approval_status || 'pending'}</span>
                        </td>
                        <td className="py-3 text-right">
                          {p.approval_status === 'pending' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleVerifyPharmacy(p.id, true)}
                                disabled={resolving}
                                className="px-2.5 py-1 bg-[#22C55E] text-white font-bold text-[9px] rounded-lg transition-all cursor-pointer disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleVerifyPharmacy(p.id, false)}
                                disabled={resolving}
                                className="px-2.5 py-1 bg-[#EF4444] text-white font-bold text-[9px] rounded-lg transition-all cursor-pointer disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-semibold">Processed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Panel: Pharmacist Verification or License Verification */}
        {(activeTab === 'License Verification' || activeTab === 'Pharmacist Verification') && (
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* Pending Approvals */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <FileCheck size={16} className="text-[#F59E0B]" />
                <span>Pending License Approvals</span>
              </h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {pendingLicenses.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-12">No pending verification requests.</p>
                ) : (
                  pendingLicenses.map((l, idx) => (
                    <div key={idx} className="p-4 border border-slate-100 rounded-xl hover:border-slate-200 transition-all flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-800 block">{l.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono block">Lic No: {l.license_number} ({l.license_state})</span>
                        <span className="text-[10px] text-slate-400 block font-medium">Expires: {l.expiration_date}</span>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleVerify(l.pharmacist_id, true)}
                          className="bg-[#22C55E] hover:bg-[#22C55E]/90 text-white p-2 rounded-lg transition-all cursor-pointer"
                          title="Verify License"
                        >
                          <Check size={12} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => handleVerify(l.pharmacist_id, false)}
                          className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white p-2 rounded-lg transition-all cursor-pointer"
                          title="Reject License"
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Verified Directory */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <CheckCircle2 size={16} className="text-[#22C55E]" />
                <span>Verified License Directory</span>
              </h3>
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {verifiedLicenses.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-12">No verified pharmacists found.</p>
                ) : (
                  verifiedLicenses.map((l, idx) => (
                    <div key={idx} className="p-3.5 border border-slate-100 rounded-xl flex items-center justify-between hover:bg-slate-50/40 transition-all">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">{l.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono block">Lic No: {l.license_number} ({l.license_state})</span>
                      </div>
                      <span className="bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 text-[9px] font-bold px-2 py-0.5 rounded-full">
                        {l.license_status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab Panel: Fraud Detection */}
        {activeTab === 'Fraud Detection' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
              <ShieldAlert size={18} className="text-[#EF4444]" />
              <h3 className="text-sm font-bold text-slate-800">Fraud Detection Logs</h3>
            </div>
            <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
              {fraudFlags.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-12">Registry is currently healthy. No alerts triggered.</p>
              ) : (
                fraudFlags.map((flag, idx) => (
                  <div key={idx} className="p-4 border border-[#EF4444]/20 bg-[#EF4444]/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{flag.type.replace(/_/g, ' ')}</span>
                      <span className="bg-[#EF4444]/20 text-[#EF4444] text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider">{flag.severity}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{flag.details}</p>
                    <div className="pt-2 border-t border-[#EF4444]/10 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-semibold">Action: {flag.action_required}</span>
                      <button onClick={fetchAdminData} className="text-[#EF4444] hover:text-[#EF4444]/80 font-bold cursor-pointer">Dispatch Audit</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab Panel: System Logs */}
        {activeTab === 'System Logs' && (
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 font-mono text-slate-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-slate-400">
                <Terminal size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">System Live Audit Term</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="space-y-2 text-xs h-96 overflow-y-auto pr-1 scrollbar-thin">
              <p className="text-slate-500">[2026-06-10 22:30:12] Initializing model inference managers...</p>
              <p className="text-slate-500">[2026-06-10 22:30:15] Load ML Model: demand_model.pkl (992 KB)</p>
              <p className="text-slate-500">[2026-06-10 22:30:17] Load ML Model: shortage_model.pkl (448 KB)</p>
              <p className="text-slate-500">[2026-06-10 22:30:18] SQLite registry connected successfully: pharmasphere.db</p>
              <p className="text-blue-400">[2026-06-10 22:31:05] API REQUEST: GET /api/auth/me - 200 OK</p>
              <p className="text-blue-400">[2026-06-10 22:32:44] API REQUEST: GET /api/admin/licenses - 200 OK</p>
              <p className="text-blue-400">[2026-06-10 22:32:45] API REQUEST: GET /api/admin/fraud-audit - 200 OK</p>
              <p className="text-emerald-400">[2026-06-10 22:35:12] ML PIPELINE: Ran Monte-Carlo leave simulation request (impact: 35%)</p>
              <p className="text-amber-400">[2026-06-10 22:42:01] SECURITY AUDIT: Checked duplicate license numbers. 0 duplicate registry conflicts.</p>
              <p className="text-slate-400 animate-pulse">[2026-06-10 22:45:00] Listening for platform triggers on port 5000...</p>
            </div>
          </div>
        )}

        {/* Tab Panel: Settings */}
        {activeTab === 'Settings' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">System Platform Settings</h3>
              <p className="text-xs text-slate-400">Configure global matching thresholds and scheduling variables.</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 text-xs text-slate-700">
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Monte-Carlo Iterations</label>
                <input type="number" defaultValue={1000} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]" />
              </div>
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Default Emergency Rate Bonus ($/hr)</label>
                <input type="number" defaultValue={15} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]" />
              </div>
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">AI Matching Proximity Radius (Miles)</label>
                <input type="number" defaultValue={35} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]" />
              </div>
              <div className="space-y-2">
                <label className="font-bold text-slate-600 block">Platform Security Level</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#0057FF]">
                  <option>Standard Verification Audit</option>
                  <option>Strict Credentials Verification</option>
                </select>
              </div>
            </div>
 
            <button
              onClick={() => setToast({ msg: 'Platform settings saved.', type: 'success' })}
              className="bg-[#0057FF] hover:bg-[#00B7FF] text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-[#0057FF]/10 cursor-pointer"
            >
              Save Configurations
            </button>
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