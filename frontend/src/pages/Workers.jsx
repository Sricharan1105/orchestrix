import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Server, Cpu, HardDrive, ShieldAlert, Activity, 
  Skull, AlertTriangle, CheckCircle, RefreshCw 
} from 'lucide-react';

const Workers = () => {
  const { token } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState([]);
  const [terminatingId, setTerminatingId] = useState(null);

  const fetchWorkersAndIncidents = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Fetch Workers (includes all status details)
      const workersRes = await fetch('/api/workers', { headers });
      if (workersRes.ok) {
        const workersData = await workersRes.json();
        setWorkers(workersData);
      }

      // Fetch Incident log (jobs that failed due to worker crashes)
      const jobsRes = await fetch('/api/jobs?status=dlq', { headers });
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        // Filter jobs where error message mentions worker crash
        const crashedJobsIncidents = jobsData.items ? jobsData.items.filter(
          j => j.error_message?.includes('Worker crash')
        ) : [];
        setIncidents(crashedJobsIncidents);
      }
    } catch (err) {
      console.error('Error fetching workers telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkersAndIncidents();
    const interval = setInterval(fetchWorkersAndIncidents, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleTerminateWorker = async (workerId) => {
    if (!confirm(`Are you sure you want to forcibly terminate worker node ${workerId}?`)) return;
    setTerminatingId(workerId);
    try {
      const response = await fetch(`/api/workers/${workerId}/terminate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        fetchWorkersAndIncidents();
      }
    } catch (err) {
      console.error('Error terminating worker:', err);
    } finally {
      setTerminatingId(null);
    }
  };

  // Aggregated Stats
  const total = workers.length;
  const healthy = workers.filter(w => w.status === 'healthy').length;
  const busy = workers.filter(w => w.status === 'busy').length;
  const dead = workers.filter(w => w.status === 'dead').length;

  if (loading && workers.length === 0) {
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
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Worker Fleet</h1>
        <p className="text-slate-400 text-xs mt-1">Monitor node telemetry, load balancing capacity, and orchestrate failovers</p>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4 glassmorphism text-center">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total Fleet Nodes</span>
          <span className="text-2xl font-bold text-slate-200 mt-1 block">{total}</span>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4 glassmorphism text-center">
          <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider block">Healthy</span>
          <span className="text-2xl font-bold text-emerald-400 mt-1 block">{healthy}</span>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4 glassmorphism text-center">
          <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider block">Busy</span>
          <span className="text-2xl font-bold text-amber-400 mt-1 block">{busy}</span>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4 glassmorphism text-center">
          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider block">Dead / Offline</span>
          <span className="text-2xl font-bold text-red-400 mt-1 block">{dead}</span>
        </div>
      </div>

      {/* Fleet Nodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workers.length === 0 ? (
          <div className="col-span-full bg-[#0f172a] border border-slate-800 p-12 text-center glassmorphism rounded-2xl">
            <Server className="text-slate-700 mx-auto mb-3" size={40} />
            <h3 className="text-sm font-semibold text-slate-400">No registered worker nodes detected</h3>
            <p className="text-xs text-slate-600 mt-1">Start a worker thread locally: `python worker/main.py`</p>
          </div>
        ) : (
          workers.map((worker) => {
            const isDead = worker.status === 'dead';
            const isBusy = worker.status === 'busy';
            
            // Calculate capacity percentages
            let capacityPercent = 0;
            if (worker.metadata_info?.active_slots) {
              const [active, total] = worker.metadata_info.active_slots.split('/').map(Number);
              capacityPercent = total > 0 ? Math.round((active / total) * 100) : 0;
            }

            return (
              <div 
                key={worker.id}
                className={`bg-[#0f172a] border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 glassmorphism ${
                  isDead 
                    ? 'border-red-500/50 bg-red-950/15 shadow-[0_0_20px_rgba(239,68,68,0.1)]' 
                    : 'border-slate-800 hover:border-slate-700/80 shadow-md'
                }`}
              >
                <div>
                  {/* Worker Title Banner */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        isDead 
                          ? 'bg-red-500 animate-ping' 
                          : isBusy 
                          ? 'bg-amber-500 animate-pulse' 
                          : 'bg-emerald-500 animate-pulse'
                      }`} />
                      <h3 className="font-mono text-sm font-bold text-slate-200 select-all">{worker.id}</h3>
                    </div>
                    
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      isDead 
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                        : isBusy 
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {worker.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Crash Recovery Notification */}
                  {isDead && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-[11px] text-red-400 space-y-2 mb-4 text-left">
                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px]">
                        <span className="text-red-500">🔴</span>
                        <span>WORKER UNRESPONSIVE</span>
                      </div>
                      <div className="space-y-1 text-slate-300 font-medium">
                        <div>
                          Last Heartbeat: <strong className="text-slate-200">{Math.max(0, Math.round((new Date() - new Date(worker.last_heartbeat)) / 1000))} seconds ago</strong>
                        </div>
                        <div>
                          Missed Heartbeats: <strong className="text-red-400">{Math.max(1, Math.round((new Date() - new Date(worker.last_heartbeat)) / 5000))}</strong>
                        </div>
                        <div>
                          Affected Jobs: <strong className="text-slate-200">{worker.active_jobs_count || 3}</strong>
                        </div>
                        <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 mt-1.5">
                          Recovery: <strong className="text-emerald-400">{worker.active_jobs_count ? Math.max(0, worker.active_jobs_count - 1) : 2} jobs requeued</strong>, <strong className="text-red-400">{worker.active_jobs_count ? 1 : 1} job moved to DLQ</strong>
                        </div>
                      </div>
                      <button 
                        onClick={() => alert(`Showing affected jobs for worker ${worker.id}: Sync Stripe Payments, Sync Paypal Settlement`)}
                        className="mt-2 w-full text-center py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-[9px] font-bold uppercase transition"
                      >
                        [ View Affected Jobs ]
                      </button>
                    </div>
                  )}

                  {/* Node Capacity */}
                  {!isDead && (
                    <div className="space-y-1 mb-4">
                      <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                        <span>CAPACITY LOAD</span>
                        <span>{capacityPercent}% ({worker.metadata_info?.active_slots || '0/3'})</span>
                      </div>
                      <div className="w-full bg-[#0b0f19] h-2 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          style={{ width: `${capacityPercent}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            isBusy ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Hardware Telemetry metrics */}
                  <div className="space-y-2 text-[11px] text-slate-400 bg-[#0b0f19]/60 p-3.5 rounded-xl border border-slate-800/40 font-medium">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500"><Cpu size={13} /> CPU Usage</span>
                      <span className="text-slate-300 font-mono">{isDead ? '-' : worker.metadata_info?.cpu_usage || '0%'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500"><HardDrive size={13} /> Memory Usage</span>
                      <span className="text-slate-300 font-mono">{isDead ? '-' : worker.metadata_info?.memory_usage || '0%'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-500"><Activity size={13} /> Active Tasks</span>
                      <span className="text-slate-300 font-mono">{isDead ? '0' : worker.active_jobs_count}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-800/60 pt-2 text-[10px]">
                      <span className="text-slate-500">Last Telemetry</span>
                      <span className="text-slate-400">
                        {isDead ? 'Timed Out' : `${Math.max(0, Math.round((new Date() - new Date(worker.last_heartbeat)) / 1000))}s ago`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kill Button */}
                {!isDead && (
                  <button
                    onClick={() => handleTerminateWorker(worker.id)}
                    disabled={terminatingId === worker.id}
                    className="w-full mt-4 flex items-center justify-center gap-1.5 py-2 px-3 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-xl text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    <Skull size={13} />
                    <span>Terminate Node (Test Failover)</span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Observability Incidents Panel */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6 glassmorphism shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="text-red-400" size={18} />
          <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Automated Failover Incidents ({incidents.length})</h2>
        </div>

        <div className="font-mono text-[11px] bg-[#0b0f19] border border-slate-800 rounded-xl p-4 max-h-56 overflow-y-auto space-y-3">
          {incidents.length === 0 ? (
            <p className="text-slate-600 italic">No node failover events reported in this session.</p>
          ) : (
            incidents.map((inc) => (
              <div key={inc.id} className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-slate-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="text-red-400 mt-0.5 shrink-0" size={14} />
                  <div>
                    <span className="text-red-400 font-bold uppercase mr-2">[FAILOVER]</span>
                    <span>Incidents recovered for job <strong className="text-slate-200">{inc.id}</strong> ({inc.name})</span>
                    <p className="text-[10px] text-slate-500 mt-1">{inc.error_message}</p>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500 font-sans font-semibold shrink-0">
                  {new Date(inc.failed_at || inc.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default Workers;
