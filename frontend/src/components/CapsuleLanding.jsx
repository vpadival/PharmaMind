import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sparkles, Play, Pill, ArrowRight, ShieldCheck, Activity, Award } from 'lucide-react';

const STARS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 1.5 + 0.5,
  delay: Math.random() * 5,
  duration: Math.random() * 3 + 2,
}));

export default function CapsuleLanding({ onComplete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const particlesRef = useRef([]);

  const triggerParticles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const colors = ['#0057FF', '#00B7FF', '#22C55E', '#7C3AED', '#FFFFFF', '#0B1E36'];
    const shapes = ['circle', 'cross', 'sparkle'];

    const list = [];
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10;
      list.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        alpha: 1.0,
        decay: 0.006 + Math.random() * 0.008,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        gravity: 0.03 + Math.random() * 0.05,
      });
    }
    particlesRef.current = list;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let active = false;

      particlesRef.current.forEach((p) => {
        if (p.alpha <= 0) return;
        active = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'cross') {
          ctx.fillRect(-p.size / 2, -p.size / 8, p.size, p.size / 4);
          ctx.fillRect(-p.size / 8, -p.size / 2, p.size / 4, p.size);
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.quadraticCurveTo(0, 0, p.size / 2, 0);
          ctx.quadraticCurveTo(0, 0, 0, p.size / 2);
          ctx.quadraticCurveTo(0, 0, -p.size / 2, 0);
          ctx.quadraticCurveTo(0, 0, 0, -p.size / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });

      if (active) {
        animationFrameRef.current = requestAnimationFrame(draw);
      }
    };
    animationFrameRef.current = requestAnimationFrame(draw);
  };

  const handleStartTransition = () => {
    if (isOpen || isTransitioning) return;
    setIsOpen(true);
    triggerParticles();

    setTimeout(() => setIsTransitioning(true), 1500);
    setTimeout(() => onComplete(), 2100);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#071426] text-white flex flex-col justify-between overflow-hidden z-50 select-none">
      
      {/* Star Field */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {STARS.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: 0.25,
              animation: `twinkle ${star.duration}s ${star.delay}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Decorative Blur Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="glow-spot glow-spot-indigo w-[600px] h-[600px] top-[-10%] left-[-10%] opacity-50 animate-float-slow" />
        <div className="glow-spot glow-spot-teal w-[500px] h-[500px] bottom-[10%] right-[-5%] opacity-40 animate-float-reverse" />
        
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(to right, #00B7FF 1px, transparent 1px), linear-gradient(to bottom, #00B7FF 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      {/* 1. Header Navigation */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-7xl mx-auto px-8 py-5 flex items-center justify-between z-20 relative"
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00B7FF] to-[#0057FF] flex items-center justify-center shadow-lg shadow-[#0057FF]/20">
            <Pill size={16} className="text-white transform rotate-45" />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-white">
            PharmaSphere <span className="text-[#00B7FF]">AI</span>
          </span>
        </div>

        {/* Navigation links removed - previously hardcoded dummy links */}

        {/* CTA Button */}
        <button
          onClick={handleStartTransition}
          className="bg-[#0057FF] hover:bg-[#00B7FF] text-white font-bold text-xs px-5 py-2 rounded-xl transition-all shadow-md shadow-[#0057FF]/20 hover:-translate-y-0.5 cursor-pointer"
        >
          Get Started
        </button>
      </motion.header>

      {/* 2. Hero Section */}
      <div className="w-full max-w-7xl mx-auto px-8 flex-1 grid md:grid-cols-12 gap-8 items-center z-10 relative">
        
        {/* Left Copy */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="md:col-span-6 space-y-6 text-left"
        >
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#00B7FF]/10 border border-[#00B7FF]/20 shadow-xs">
            <Sparkles size={11} className="text-[#00B7FF] animate-pulse" />
            <span className="text-[10px] font-bold text-[#00B7FF] uppercase tracking-wider">AI-Powered Continuity</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-white leading-[1.12] tracking-tight">
            Intelligent Pharmacy<br />
            Workforce<br />
            <span className="bg-gradient-to-r from-[#0057FF] to-[#00B7FF] bg-clip-text text-transparent">Continuity Platform</span>
          </h1>

          <p className="text-slate-400 text-[14px] leading-relaxed max-w-md">
            AI-powered matching, workforce analytics, and digital twin leave simulation to keep pharmacies fully staffed and operational without service interruptions.
          </p>

          {/* Action buttons */}
          <div className="flex items-center space-x-4 pt-2">
            <button
              onClick={handleStartTransition}
              className="flex items-center space-x-2 bg-gradient-to-r from-[#0057FF] to-[#00B7FF] hover:from-[#00B7FF] hover:to-[#0057FF] text-white px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#0057FF]/25 hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Explore Platform</span>
              <ArrowRight size={13} />
            </button>

            <button
              onClick={handleStartTransition}
              className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Play size={12} fill="white" className="text-white" />
              <span>Watch Demo</span>
            </button>
          </div>
        </motion.div>

        {/* Right Capsule Rendering */}
        <div className="md:col-span-6 h-full flex flex-col items-center justify-center relative min-h-[350px]">
          
          {/* Particle canvas */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />

          {/* 3D Hologram floor disk */}
          <div className="absolute bottom-[20%] w-[360px] h-[100px] flex items-center justify-center pointer-events-none">
            {/* Hologram rings with CSS perspective */}
            <div
              className="absolute w-[240px] h-[240px] rounded-full border border-[#00B7FF]/20 bg-[#00B7FF]/[0.03]"
              style={{ transform: 'rotateX(75deg) translateY(-20px)', filter: 'blur(4px)', boxShadow: '0 0 50px rgba(0,183,255,0.2)' }}
            />
            <div
              className="absolute w-[180px] h-[180px] rounded-full border-2 border-dashed border-[#00B7FF]/30 animate-spin"
              style={{ transform: 'rotateX(75deg) translateY(-20px)', animationDuration: '20s' }}
            />
            <div
              className="absolute w-[120px] h-[120px] rounded-full border border-[#0057FF]/30 bg-radial-gradient"
              style={{ transform: 'rotateX(75deg) translateY(-20px)' }}
            />
          </div>

          {/* Floating Wrapper to separate float keyframes from static hover scale */}
          <div className={`relative w-[340px] h-[340px] flex items-center justify-center ${
            !isOpen ? 'animate-float-slow hover:scale-[1.03] transition-transform duration-500' : ''
          }`}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={isOpen ? { scale: [1, 1.25, 1.15], rotate: [0, 1.5, -1.5, 0] } : { scale: 1, opacity: 1 }}
              transition={isOpen ? { duration: 0.8, ease: 'easeInOut' } : { delay: 0.4, duration: 1.2, type: 'spring' }}
              onClick={handleStartTransition}
              className="relative w-full h-full flex items-center justify-center cursor-pointer z-20"
            >
              <AnimatePresence mode="wait">
                {!isOpen ? (
                  <motion.img
                    key="closed"
                    src="/landing_capsule_hd.png"
                    alt="Capsule"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-72 h-72 object-contain filter drop-shadow-[0_15px_30px_rgba(0,183,255,0.25)]"
                  />
                ) : (
                  <motion.img
                    key="blasting"
                    src="/landing_capsule_blast_hd.png"
                    alt="Capsule Blast"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1.05 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="w-[310px] h-[310px] object-contain filter drop-shadow-[0_20px_40px_rgba(0,183,255,0.45)]"
                  />
                )}
              </AnimatePresence>

              {/* Glowing Core on split */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 2.2, opacity: 0.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.0, ease: 'easeOut' }}
                    className="absolute w-20 h-20 rounded-full z-10 blur-2xl"
                    style={{ background: 'radial-gradient(circle, rgba(0,183,255,0.9) 0%, rgba(0,87,255,0.4) 60%, transparent 100%)' }}
                  />
                )}
              </AnimatePresence>

              {!isOpen && (
                <div className="absolute z-30 pointer-events-none animate-pulse bg-white/10 rounded-full p-2.5 border border-white/20">
                  <Sparkles size={22} className="text-[#00B7FF]" />
                </div>
              )}
            </motion.div>
          </div>

          {/* Hologram Light Rays */}
          <div className="absolute bottom-[28%] w-[120px] h-[160px] bg-gradient-to-t from-[#00B7FF]/10 via-[#00B7FF]/[0.02] to-transparent pointer-events-none blur-md"
               style={{ clipPath: 'polygon(15% 100%, 85% 100%, 100% 0, 0 0)', transform: 'perspective(200px) rotateX(15deg)' }} />

        </div>

      </div>

      {/* 3. Stats Footer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="w-full bg-[#071426]/80 border-t border-white/[0.06] backdrop-blur-md z-20 relative"
      >
        <div className="max-w-7xl mx-auto px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: '2,500+', label: 'Pharmacies', icon: ShieldCheck, color: 'text-[#0057FF]' },
            { value: '12,000+', label: 'Pharmacists', icon: Activity, color: 'text-[#22C55E]' },
            { value: '98.6%', label: 'Uptime Stability', icon: Award, color: 'text-[#00B7FF]' },
            { value: '24/7', label: 'AI Assistance', icon: Sparkles, color: 'text-[#7C3AED]' }
          ].map((stat, idx) => (
            <div key={idx} className="space-y-1 md:border-r border-white/[0.06] last:border-none">
              <div className="text-xl lg:text-2xl font-black text-white tracking-tight flex items-center justify-center space-x-2">
                <span className={stat.color}>{stat.value}</span>
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">{stat.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Full-screen fade out transition */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 bg-[#071426] z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
