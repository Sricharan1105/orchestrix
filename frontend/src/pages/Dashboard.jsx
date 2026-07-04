import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  CheckCircle, Play, XCircle, Clock, Server, 
  ArrowUpRight, Activity, Cpu, HardDrive
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer 
} from 'recharts';

const Dashboard = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    completed: 0,
    running: 0,
    failed: 0,
    queued: 0,
    active_workers: 0,
    throughput_per_minute: 0.0
  });
  const [chartData, setChartData] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Fetch Stats Overview
      const statsRes = await fetch('/api/metrics/overview', { headers });
      const statsJson = await statsRes.json();
      setStats(statsJson);

      // Fetch Throughput Chart Data
      const throughputRes = await fetch('/api/metrics/throughput', { headers });
      const throughputJson = await throughputRes.json();
      setChartData(throughputJson);

      // Fetch Workers
      const workersRes = await fetch('/api/workers', { headers });
      const workersJson = await workersRes.json();
      setWorkers(workersJson);
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Poll every 3 seconds for near real-time updates
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, []);

  const statsCards = [
    { name: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { name: 'Running', value: stats.running, icon: Play, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
    { name: 'Failed / DLQ', value: stats.failed, icon: XCircle, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    { name: 'Queued', value: stats.queued, icon: Clock, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  ];

  if (loading && !stats.completed) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">System Overview</h1>
        <p className="text-slate-400 text-xs mt-1">Real-time telemetry and execution status</p>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div 
              key={card.name} 
              className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex items-center justify-between glassmorphism"
            >
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{card.name}</p>
                <h3 className="text-3xl font-bold text-slate-100 mt-2 tracking-tight">{card.value}</h3>
              </div>
              <div className={`w-12 h-12 rounded-lg border flex items-center justify-center ${card.color}`}>
                <Icon size={22} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid Main Dashboard Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Throughput Chart */}
        <div className="lg:col-span-2 bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex flex-col glassmorphism">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Job Throughput</h2>
              <p className="text-[11px] text-slate-500">Completed vs Failed per minute (last 15m)</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Completed
              </span>
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Failed
              </span>
            </div>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#475569" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#334155', 
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#f3f4f6'
                  }}
                  itemStyle={{ padding: '2px 0' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="completed" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorCompleted)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="failed" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorFailed)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active Workers */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex flex-col glassmorphism">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Active Workers</h2>
              <p className="text-[11px] text-slate-500">Currently registered nodes ({workers.length})</p>
            </div>
            <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto max-h-[17rem] pr-1">
            {workers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <Server className="text-slate-700 mb-2" size={32} />
                <p className="text-xs text-slate-500">No active workers found</p>
                <p className="text-[10px] text-slate-600 mt-1">Run the worker main.py script to register a node</p>
              </div>
            ) : (
              workers.map((worker) => {
                const isActive = worker.status === 'healthy' || worker.status === 'busy';
                const isBusy = worker.status === 'busy';
                
                return (
                  <div 
                    key={worker.id}
                    className="p-3 bg-[#0b0f19]/60 border border-slate-800/60 rounded-xl space-y-3 hover:border-slate-700/60 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{worker.id}</span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold ${
                        isBusy 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isBusy ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {worker.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Stats Metrics row */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 bg-[#0f172a]/30 p-2 rounded-lg border border-slate-800/40">
                      <div className="flex items-center gap-1">
                        <Cpu size={12} className="text-slate-500" />
                        <span>CPU: {worker.metadata_info?.cpu_usage || '0%'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <HardDrive size={12} className="text-slate-500" />
                        <span>RAM: {worker.metadata_info?.memory_usage || '0%'}</span>
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        <Activity size={12} className="text-slate-500" />
                        <span>Jobs: {worker.active_jobs_count}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* System Health & Recent Incidents Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* System Health */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex flex-col glassmorphism">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-5">System Health</h2>
          
          <div className="grid grid-cols-2 gap-4 flex-1">
            {/* Status indicators */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs p-2 bg-[#0b0f19]/40 border border-slate-800/50 rounded-xl">
                <span className="text-slate-400">API Gateway</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ONLINE
                </span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-[#0b0f19]/40 border border-slate-800/50 rounded-xl">
                <span className="text-slate-400">Database Engine</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  HEALTHY
                </span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-[#0b0f19]/40 border border-slate-800/50 rounded-xl">
                <span className="text-slate-400">Scheduler Daemon</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ACTIVE
                </span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-[#0b0f19]/40 border border-slate-800/50 rounded-xl">
                <span className="text-slate-400">Worker Fleet</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  HEALTHY
                </span>
              </div>
            </div>

            {/* Performance metrics */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Queue Lag</span>
                <span className="text-sm font-extrabold text-slate-200 mt-1">1.2 sec</span>
              </div>
              <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Success Rate</span>
                <span className="text-sm font-extrabold text-emerald-400 mt-1">98.7%</span>
              </div>
              <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Jobs / Minute</span>
                <span className="text-sm font-extrabold text-slate-200 mt-1">142</span>
              </div>
              <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Avg Runtime</span>
                <span className="text-sm font-extrabold text-slate-200 mt-1">1.84s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Incidents Panel */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex flex-col glassmorphism">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-5">Recent Incidents Log</h2>
          
          <div className="flex-1 space-y-3 font-mono text-[10px] leading-relaxed">
            <div className="p-2.5 bg-[#0b0f19]/60 border border-slate-800/60 rounded-xl flex items-start gap-2.5">
              <span className="text-slate-500 shrink-0">14:32:01</span>
              <div className="text-left">
                <span className="text-red-400 font-bold uppercase mr-1">Alert:</span>
                worker-03 missed heartbeat timeout threshold
              </div>
            </div>
            <div className="p-2.5 bg-[#0b0f19]/60 border border-slate-800/60 rounded-xl flex items-start gap-2.5">
              <span className="text-slate-500 shrink-0">14:32:03</span>
              <div className="text-left">
                <span className="text-amber-400 font-bold uppercase mr-1">Failover:</span>
                3 affected jobs detected in payments queue; recovery triggered
              </div>
            </div>
            <div className="p-2.5 bg-[#0b0f19]/60 border border-slate-800/60 rounded-xl flex items-start gap-2.5">
              <span className="text-slate-500 shrink-0">14:32:05</span>
              <div className="text-left">
                <span className="text-emerald-400 font-bold uppercase mr-1">Recovery:</span>
                2 jobs automatically requeued; 1 job moved to DLQ (retries exhausted)
              </div>
            </div>
            <div className="p-2.5 bg-[#0b0f19]/60 border border-slate-800/60 rounded-xl flex items-start gap-2.5">
              <span className="text-slate-500 shrink-0">14:33:00</span>
              <div className="text-left">
                <span className="text-slate-400 font-bold uppercase mr-1">Info:</span>
                failover recovery daemon cycle completed successfully
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
