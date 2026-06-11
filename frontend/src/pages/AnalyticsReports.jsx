import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Download, Calendar, Clock, Percent, Smile,
  RefreshCw, AlertCircle, Star, TrendingUp
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, AreaChart, Area
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5000/api';

const STATUS_COLORS = {
  Open:      '#00B7FF',
  Matched:   '#F59E0B',
  Completed: '#22C55E',
  Cancelled: '#EF4444',
};

function KpiCard({ label, value, sub, icon: Icon, iconColor, iconBg, loading }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between group hover:border-blue-200 transition-all duration-300">
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">{label}</span>
        {loading
          ? <span className="block w-20 h-6 bg-slate-100 rounded animate-pulse" />
          : <span className="text-2xl font-black text-slate-900 tracking-tight block">{value ?? '—'}</span>
        }
        <span className="text-[10px] text-slate-400 font-medium block">{sub}</span>
      </div>
      <div className={`p-3.5 rounded-xl ${iconBg} ${iconColor} shadow-xs group-hover:scale-105 transition-transform duration-300`}>
        <Icon size={18} strokeWidth={2.5} />
      </div>
    </div>
  );
}

export default function AnalyticsReports() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_BASE}/analytics/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // ---- Export: download the raw JSON as a report file ----
  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pharmasphere_report_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data ? [
    {
      label:     'Total Shifts (30d)',
      value:     data.kpis.total_shifts?.toLocaleString() ?? '—',
      sub:       'Last 30 days',
      icon:      BarChart3,
      iconColor: 'text-[#0057FF]',
      iconBg:    'bg-[#0057FF]/5',
    },
    {
      label:     'Shift Fill Rate',
      value:     data.kpis.fill_rate != null ? `${data.kpis.fill_rate}%` : '—',
      sub:       'Completed ÷ (Completed + Cancelled)',
      icon:      Percent,
      iconColor: 'text-[#22C55E]',
      iconBg:    'bg-[#22C55E]/5',
    },
    {
      label:     'Avg Response Time',
      value:     data.kpis.avg_response_min != null ? `${data.kpis.avg_response_min} min` : 'N/A',
      sub:       'Creation → match (sampled)',
      icon:      Clock,
      iconColor: 'text-[#F59E0B]',
      iconBg:    'bg-[#F59E0B]/5',
    },
    {
      label:     'Avg Pharmacist Rating',
      value:     data.kpis.avg_rating != null ? `${data.kpis.avg_rating} / 5` : '—',
      sub:       'All ratings on record',
      icon:      Smile,
      iconColor: 'text-[#7C3AED]',
      iconBg:    'bg-[#7C3AED]/5',
    },
  ] : [];

  return (
    <div className="bg-[#F8FAFC] text-slate-800 min-h-screen px-8 py-8 space-y-8 select-none animate-scale-in">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-slate-500 text-xs mt-1">
            Live workforce trends, shift completion data, and stability metrics from the database.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center space-x-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm text-slate-600 hover:border-blue-300 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExport}
            disabled={!data || loading}
            className="flex items-center space-x-2 bg-[#0057FF] hover:bg-[#00B7FF] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-[#0057FF]/10 cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center space-x-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-red-700 text-xs font-semibold">
          <AlertCircle size={15} />
          <span>Failed to load analytics: {error}</span>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs h-28 animate-pulse" />
            ))
          : kpis.map((k, i) => <KpiCard key={i} {...k} loading={false} />)
        }
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Daily shift volume — last 14 days */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Daily Shift Volume <span className="text-slate-400 font-normal">(last 14 days)</span></h3>
            <TrendingUp size={14} className="text-slate-400" />
          </div>
          <div className="h-64">
            {loading
              ? <div className="h-full bg-slate-50 rounded-xl animate-pulse" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.daily_shifts_chart ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="shiftGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#0057FF" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#0057FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="day" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px' }} labelStyle={{ fontWeight: 'bold', fontSize: '11px' }} />
                    <Area type="monotone" dataKey="Shifts" stroke="#0057FF" strokeWidth={2.5} fill="url(#shiftGrad)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )
            }
          </div>
        </div>

        {/* Status breakdown donut */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Shift Status Breakdown</h3>
          </div>
          <div className="h-48 relative flex items-center justify-center">
            {loading
              ? <div className="h-full w-full bg-slate-50 rounded-xl animate-pulse" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data?.status_breakdown ?? []} cx="50%" cy="50%"
                         innerRadius={52} outerRadius={68} paddingAngle={3} dataKey="value">
                      {(data?.status_breakdown ?? []).map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#94A3B8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {Object.entries(STATUS_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-slate-500 font-medium">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Top performing pharmacies (admin only) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Top Performing Pharmacies</h3>
          </div>
          {loading
            ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-slate-50 rounded-lg animate-pulse" />)}</div>
            : (data?.top_pharmacies?.length > 0
              ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="py-2">Pharmacy</th>
                        <th className="py-2">Fill Rate</th>
                        <th className="py-2">Rating</th>
                        <th className="py-2 text-right">Shifts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.top_pharmacies.map((pharm, idx) => (
                        <tr key={idx} className="text-xs text-slate-600 hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 font-bold text-slate-800">{pharm.name}</td>
                          <td className="py-3 font-semibold text-[#22C55E]">{pharm.fillRate}</td>
                          <td className="py-3">
                            <div className="flex items-center space-x-1">
                              <Star size={11} className="text-amber-400 fill-amber-400" />
                              <span className="font-bold">{pharm.rating}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-bold text-slate-800">{pharm.shifts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
              : <p className="text-slate-400 text-xs py-4 text-center">Pharmacy breakdown is visible to admins only.</p>
            )
          }
        </div>

        {/* Workforce health trend */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Workforce Health Trend</h3>
            <div className="flex space-x-3 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-[#0057FF]" /><span>Health</span></span>
              <span className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-[#22C55E]" /><span>Fill Rate</span></span>
            </div>
          </div>
          <div className="h-60">
            {loading
              ? <div className="h-full bg-slate-50 rounded-xl animate-pulse" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.health_trend ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="day" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px' }} />
                    <Line type="monotone" dataKey="HealthScore" stroke="#0057FF" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="FillRate"    stroke="#22C55E" strokeWidth={2}   dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </div>
        </div>
      </div>

    </div>
  );
}
