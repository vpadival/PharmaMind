import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, Store, UserCheck, ShieldCheck,
  ShieldAlert, BarChart3, Terminal, Bell, Settings, LogOut,
  Briefcase, Calendar, DollarSign, Clock, FileText, User,
  Award, MessageSquare, Shield, ChevronLeft, ChevronRight, Activity, Pill, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';

const menuConfigs = {
  owner: [
    { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'User Management', label: 'User Management', icon: Users },
    { id: 'Continuity Simulator', label: 'Continuity Simulator', icon: Activity },
    { id: 'System Logs', label: 'System Logs', icon: Terminal },
    { id: 'Notifications', label: 'Notifications', icon: Bell, hasBadge: true },
    { id: 'Settings', label: 'Settings', icon: Settings },
  ],
  admin: [
    { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'User Management', label: 'User Management', icon: Users },
    { id: 'Pharmacy Management', label: 'Pharmacy Management', icon: Store },
    { id: 'Pharmacist Verification', label: 'Pharmacist Verification', icon: UserCheck },
    { id: 'License Verification', label: 'License Verification', icon: ShieldCheck },
    { id: 'Fraud Detection', label: 'Fraud Detection', icon: ShieldAlert },
    { id: 'Reports & Analytics', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'System Logs', label: 'System Logs', icon: Terminal },
    { id: 'Notifications', label: 'Notifications', icon: Bell, hasBadge: true },
    { id: 'Settings', label: 'Settings', icon: Settings },
  ],
  pharmacist: [
    { id: 'Available Jobs', label: 'Available Jobs', icon: Briefcase },
    { id: 'My Schedule', label: 'My Schedule', icon: Calendar },
    { id: 'My Earnings', label: 'My Earnings', icon: DollarSign },
    { id: 'Availability Calendar', label: 'Availability Calendar', icon: Clock },
    { id: 'Leave Requests', label: 'Leave Requests', icon: FileText },
    { id: 'My Profile', label: 'My Profile', icon: User },
    { id: 'Trust Score', label: 'Trust Score', icon: Shield },
    { id: 'Certificates', label: 'Certificates', icon: Award },
    { id: 'Messages', label: 'Messages', icon: MessageSquare },
    { id: 'Settings', label: 'Settings', icon: Settings },
  ]
};

const roleConfig = {
  owner: {
    label: 'Owner',
    gradient: 'from-[#0057FF] to-[#00B7FF]', /* Royal Blue to Electric Blue */
    glow: 'rgba(0, 87, 255, 0.25)',
  },
  pharmacist: {
    label: 'Pharmacist',
    gradient: 'from-[#00B7FF] to-[#7C3AED]', /* Electric Blue to Purple */
    glow: 'rgba(0, 183, 255, 0.25)',
  },
  admin: {
    label: 'Admin',
    gradient: 'from-[#EF4444] to-[#7C3AED]', /* Red to Purple */
    glow: 'rgba(239, 68, 68, 0.25)',
  },
};

export default function Navbar({ user, activeTab, setActiveTab, onLogout, API_BASE }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const rc = roleConfig[user.role] || roleConfig.owner;
  const menuItems = menuConfigs[user.role] || menuConfigs.owner;

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    // Broadcast unread count to other components
    window.dispatchEvent(new CustomEvent('unread-notifications', { detail: unreadCount }));
  }, [unreadCount]);

  useEffect(() => {
    const handleOpenNotif = () => setShowNotif(true);
    window.addEventListener('open-notifications', handleOpenNotif);
    return () => window.removeEventListener('open-notifications', handleOpenNotif);
  }, []);
  const initials = (user.email || 'U').substring(0, 2).toUpperCase();

  const handleTabClick = (item) => {
    if (item.id === 'Notifications') {
      setShowNotif(prev => !prev);
    } else {
      setActiveTab(item.id);
    }
  };

  return (
    <div className="flex relative z-40 select-none">
      {/* Sidebar Container */}
      <motion.div
        animate={{ width: isCollapsed ? 76 : 256 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="bg-[#071426] border-r border-[#1E293B] h-screen flex flex-col sticky top-0 overflow-visible"
        style={{ minWidth: isCollapsed ? 76 : 256 }}
      >
        {/* Brand/Logo Area */}
        <div className="flex items-center px-4 pt-6 pb-6 min-h-[76px] overflow-hidden border-b border-[#1E293B]/60">
          <div className="flex items-center space-x-3 w-full">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#00B7FF] to-[#0057FF] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Pill size={18} className="text-white transform rotate-45" />
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                  className="leading-tight overflow-hidden"
                >
                  <span className="font-extrabold text-sm text-white tracking-tight block">PharmaMind <span className="text-[#00B7FF]">AI</span></span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Workforce Platform</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Menu Items Container */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item)}
                className={`w-full flex items-center rounded-xl py-2.5 px-3 transition-all duration-200 group cursor-pointer relative ${
                  isActive
                    ? 'bg-[#0057FF] text-white font-bold shadow-md shadow-blue-600/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                } ${isCollapsed ? 'justify-center' : 'space-x-3'}`}
              >
                {/* Active Indicator Line */}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-2 bottom-2 w-1 bg-[#00B7FF] rounded-r-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}

                <IconComponent
                  size={18}
                  className={`flex-shrink-0 transition-transform group-hover:scale-105 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-[#00B7FF]'
                  }`}
                />

                {!isCollapsed && (
                  <span className="text-[12px] tracking-wide font-medium">{item.label}</span>
                )}

                {/* Badge for Notifications item */}
                {item.hasBadge && unreadCount > 0 && (
                  <span className={`absolute flex-shrink-0 ${isCollapsed ? 'top-1.5 right-1.5' : 'right-3'}`}>
                    <span className="relative flex h-4 w-4">
                      <span className="animate-ping-glow absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60" />
                      <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-rose-500 text-white text-[8px] font-black">
                        {unreadCount}
                      </span>
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* User Profile & Logout at Bottom */}
        <div className="p-3 border-t border-[#1E293B]/60 space-y-2 bg-[#071426]">
          {/* User profile capsule */}
          <div className={`flex items-center rounded-xl p-2 bg-[#0B1E36] border border-[#1E293B]/40 overflow-hidden ${
            isCollapsed ? 'justify-center' : 'space-x-3'
          }`}>
            <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${rc.gradient} text-white text-[11px] font-black shadow-md`}>
              {initials}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-slate-300 block truncate">{user.email}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{rc.label}</span>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center rounded-xl px-3 py-2 text-slate-400 hover:text-white hover:bg-[#00B7FF]/10 border border-transparent hover:border-[#00B7FF]/20 text-xs font-semibold transition-all duration-200 cursor-pointer group ${
              isCollapsed ? 'justify-center' : 'space-x-3'
            }`}
          >
            {theme === 'dark' ? (
              <Sun size={14} className="flex-shrink-0 group-hover:text-yellow-400 transition-colors" />
            ) : (
              <Moon size={14} className="flex-shrink-0 group-hover:text-blue-400 transition-colors" />
            )}
            {!isCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* Sign Out Button */}
          <button
            onClick={onLogout}
            className={`w-full flex items-center rounded-xl px-3 py-2 text-rose-400/80 hover:text-white hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-xs font-semibold transition-all duration-200 cursor-pointer group ${
              isCollapsed ? 'justify-center' : 'space-x-3'
            }`}
          >
            <LogOut size={14} className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>

        {/* Collapse Sidebar Toggle */}
        <button
          onClick={() => setIsCollapsed(v => !v)}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-[#0F172A] border border-[#1E293B] flex items-center justify-center text-slate-400 hover:text-white shadow-lg hover:border-blue-500/50 hover:bg-blue-500/10 transition-all duration-200 cursor-pointer z-50"
        >
          {isCollapsed ? <ChevronRight size={12} strokeWidth={2.5} /> : <ChevronLeft size={12} strokeWidth={2.5} />}
        </button>
      </motion.div>

      {/* Floating Notification Drawer (For cases where notification is clicked or in collapsed state) */}
      <AnimatePresence>
        {showNotif && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs" onClick={() => setShowNotif(false)} />
            <motion.div
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-24 left-20 w-80 bg-[#111827] border border-[#1E293B] rounded-2xl p-4 z-50 shadow-2xl max-h-[70vh] flex flex-col text-white"
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1E293B]/60">
                <span className="text-xs font-bold flex items-center space-x-2">
                  <Bell size={13} className="text-blue-400 animate-pulse" />
                  <span>Notifications Drawer</span>
                </span>
                <button onClick={() => setShowNotif(false)} className="text-[10px] text-slate-400 hover:text-white font-medium">
                  Dismiss
                </button>
              </div>
              <div className="overflow-y-auto space-y-2 flex-1 scrollbar-thin">
                {notifications.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-8">No notifications yet.</p>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => !n.is_read && markRead(n.id)}
                      className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                        n.is_read ? 'bg-white/[0.02] opacity-60 border border-[#1E293B]/20' : 'bg-blue-600/10 border border-blue-500/25 hover:border-blue-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[11px] font-bold ${n.is_read ? 'text-slate-400' : 'text-white'}`}>
                          {n.title}
                        </span>
                        {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-0.5 animate-pulse" />}
                      </div>
                      <p className="text-slate-400 text-[10px] mt-1 leading-relaxed">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
