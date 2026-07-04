import React from 'react';
import { Settings as SettingsIcon, ShieldCheck, Heart, Sliders } from 'lucide-react';

const Settings = () => {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Platform Settings</h1>
        <p className="text-slate-400 text-xs mt-1">Configure global retry templates, heartbeats, and cluster preferences</p>
      </div>

      <div className="max-w-2xl bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6 glassmorphism space-y-6">
        
        {/* Cluster Setup */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="text-emerald-400" size={18} />
            <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Cluster Telemetry</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Heartbeat Threshold</label>
              <input
                type="text"
                disabled
                value="15 Seconds"
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-400 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Failover Check Interval</label>
              <input
                type="text"
                disabled
                value="5 Seconds"
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Retry Profiles */}
        <div className="border-t border-slate-800/60 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="text-emerald-400" size={18} />
            <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Default Retry Templates</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Max Retries</label>
              <input
                type="text"
                disabled
                value="3 Attempts"
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Backoff Base</label>
              <input
                type="text"
                disabled
                value="2 (Exponential)"
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Max Wait Delay</label>
              <input
                type="text"
                disabled
                value="60 Seconds"
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="border-t border-slate-800/60 pt-6 text-[10px] text-slate-500 font-medium">
          <p className="flex items-center gap-1.5 justify-center py-2.5 bg-[#0b0f19]/30 rounded-xl border border-slate-800/40">
            <Heart size={12} className="text-red-500" />
            <span>Orchestrix Cluster Orchestration Platform v1.0.0</span>
          </p>
        </div>

      </div>
    </div>
  );
};

export default Settings;
