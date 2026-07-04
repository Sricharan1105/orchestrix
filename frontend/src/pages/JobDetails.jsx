import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Clock, Server, CheckCircle2, XCircle, 
  AlertTriangle, RotateCcw, PlaySquare, Calendar, ChevronRight
} from 'lucide-react';

const JobDetails = ({ jobId, setCurrentPage }) => {
  const { token } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchJobDetails = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch(`/api/jobs/${jobId}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setJob(data);
      }
    } catch (err) {
      console.error('Error fetching job details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobDetails();
    const interval = setInterval(fetchJobDetails, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  if (loading && !job) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Job not found.</p>
        <button onClick={() => setCurrentPage('jobs')} className="text-emerald-400 font-semibold text-xs mt-4">Go Back</button>
      </div>
    );
  }

  // Determine active step index in the lifecycle
  const steps = [
    { label: 'Queued', desc: 'Job created in system', completed: true, timestamp: job.created_at },
    { label: 'Scheduled', desc: 'Added to scheduler engine', completed: !!job.scheduled_at, timestamp: job.scheduled_at },
    { label: 'Claimed', desc: job.worker_id ? `Assigned to ${job.worker_id}` : 'Waiting for worker claim', completed: !!job.claimed_at, timestamp: job.claimed_at },
    { label: 'Running', desc: 'Task execution started', completed: job.status === 'running' || job.status === 'completed' || job.status === 'dlq', timestamp: job.started_at },
    { label: 'Completed', desc: job.status === 'completed' ? 'Successfully executed' : job.status === 'dlq' ? 'Moved to DLQ' : 'Awaiting completion', completed: job.status === 'completed' || job.status === 'dlq', failed: job.status === 'dlq', timestamp: job.completed_at || (job.status === 'dlq' ? job.updated_at : null) }
  ];

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'SUCCESS': return 'text-emerald-400';
      case 'ERROR': return 'text-red-400 font-semibold';
      case 'WARNING': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Back navigation */}
      <button
        onClick={() => setCurrentPage('jobs')}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
      >
        <ArrowLeft size={14} />
        <span>Back to Job Explorer</span>
      </button>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold text-slate-100 select-all">{job.id}</span>
            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
              job.status === 'completed' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : job.status === 'dlq'
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse'
            }`}>
              {job.status.toUpperCase()}
            </span>
          </div>
          <h1 className="text-sm font-semibold text-slate-300 mt-2">{job.name}</h1>
        </div>
        
        {/* Basic Metadata grid */}
        <div className="flex items-center gap-6 text-xs text-slate-400 bg-[#0f172a] border border-slate-800 p-4 rounded-xl glassmorphism">
          <div className="flex items-center gap-1.5">
            <Server size={14} className="text-slate-500" />
            <span>Worker: <strong className="text-slate-300 font-mono">{job.worker_id || 'None'}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-500" />
            <span>Retries: <strong className="text-slate-300">{job.retry_count}</strong></span>
          </div>
        </div>
      </div>

      {/* Grid: Timeline and Payload details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Lifecycle Timeline */}
        <div className="lg:col-span-1 bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex flex-col glassmorphism">
          <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-6">Execution Lifecycle</h2>
          
          <div className="relative border-l border-slate-800 ml-3.5 space-y-6">
            {steps.map((step, idx) => {
              const isDone = step.completed;
              const isFail = step.failed;
              
              return (
                <div key={idx} className="relative pl-6">
                  {/* Dot */}
                  <div className={`absolute left-[-7px] top-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    isFail 
                      ? 'bg-red-950 border-red-500 text-red-500' 
                      : isDone 
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-500' 
                      : 'bg-[#0f172a] border-slate-800'
                  }`}>
                    {isDone && !isFail && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {isFail && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                  
                  {/* Step details */}
                  <div>
                    <h3 className={`text-xs font-bold ${
                      isFail ? 'text-red-400' : isDone ? 'text-slate-200' : 'text-slate-500'
                    }`}>
                      {step.label}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{step.desc}</p>
                    {step.timestamp && (
                      <span className="text-[9px] text-slate-600 block mt-1 font-mono">
                        {new Date(step.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payload & Error Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* If there is an error message, show it */}
          {job.error_message && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-xs glassmorphism">
              <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
                <AlertTriangle size={14} />
                <span>Execution Failure Detected</span>
              </div>
              <pre className="font-mono text-red-300 bg-[#07090e]/40 p-4 rounded-lg border border-red-500/10 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                {job.error_message}
              </pre>
            </div>
          )}

          {/* Configured Retry Policy & Timeline */}
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 glassmorphism space-y-6">
            
            {/* Retry Policy Specs */}
            <div>
              <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">Retry Policy Configuration</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Strategy</span>
                  <span className="text-xs font-bold text-emerald-400 mt-1 block">
                    {job.retry_policy?.strategy || 'EXPONENTIAL'}
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Max Retries</span>
                  <span className="text-xs font-bold text-slate-200 mt-1 block">
                    {job.retry_policy?.max_retries ?? 3} Attempts
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Base Delay</span>
                  <span className="text-xs font-bold text-slate-200 mt-1 block">
                    {job.retry_policy?.backoff_factor ?? 2} seconds
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Max Delay</span>
                  <span className="text-xs font-bold text-slate-200 mt-1 block">
                    {job.retry_policy?.backoff_max_delay ?? 60} seconds
                  </span>
                </div>
              </div>
            </div>

            {/* Retry History Timeline */}
            <div>
              <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Retry History</h2>
              <div className="space-y-4">
                {job.executions && job.executions.length > 0 ? (
                  job.executions.map((exec, idx) => {
                    const isFailed = exec.status === 'failed';
                    const isSuccess = exec.status === 'completed';
                    
                    // Calculate delay offset text
                    let delayText = '';
                    if (isFailed && job.retry_policy) {
                      const factor = job.retry_policy.backoff_factor;
                      const maxDelay = job.retry_policy.backoff_max_delay;
                      let delay = 0;
                      if (job.retry_policy.strategy === 'FIXED') {
                        delay = factor;
                      } else if (job.retry_policy.strategy === 'LINEAR') {
                        delay = factor * exec.attempt_number;
                      } else { // EXPONENTIAL
                        delay = Math.pow(factor, exec.attempt_number);
                      }
                      delay = Math.min(delay, maxDelay);
                      delayText = `Next retry in ${delay} seconds`;
                    }

                    return (
                      <div key={exec.id} className="relative pl-6 border-l border-slate-800">
                        {/* Bullet Icon */}
                        <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full flex items-center justify-center ${
                          isSuccess 
                            ? 'bg-emerald-500 ring-4 ring-emerald-500/10' 
                            : 'bg-red-500 ring-4 ring-red-500/10'
                        }`} />
                        
                        <div className="bg-[#0b0f19]/40 border border-slate-800/40 rounded-xl p-3.5 space-y-2 text-left">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-slate-300">Attempt {exec.attempt_number}</span>
                            <span className="text-slate-500 font-mono">{new Date(exec.started_at).toLocaleString()}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className={isSuccess ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                              {isSuccess ? '✓ COMPLETED' : '❌ FAILURE'}
                            </span>
                            {exec.error_message && (
                              <span className="text-slate-400 font-mono text-[10px] bg-[#07090e]/40 px-2 py-0.5 rounded border border-slate-800/40 max-w-full truncate">
                                {exec.error_message}
                              </span>
                            )}
                          </div>
                          
                          {delayText && (
                            <div className="text-[10px] text-slate-500 font-medium font-mono italic">
                              {delayText}
                            </div>
                          )}
                        </div>
                        
                        {/* Downward arrow spacer if not last */}
                        {idx < job.executions.length - 1 && (
                          <div className="my-2 ml-1 text-slate-600 text-xs">↓</div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 bg-[#0b0f19]/20 border border-dashed border-slate-800 rounded-xl text-center">
                    <p className="text-[11px] text-slate-500 italic">No execution attempts registered.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* JSON Payload */}
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 glassmorphism">
            <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Job Payload</h2>
            <pre className="font-mono text-slate-300 bg-[#0b0f19]/60 p-4 rounded-lg border border-slate-800/80 text-[11px] overflow-x-auto select-all">
              {JSON.stringify(job.payload || {}, null, 2)}
            </pre>
          </div>
        </div>

      </div>

      {/* Execution Logs */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 glassmorphism shadow-lg">
        <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">Execution logs</h2>
        
        <div className="font-mono text-[11px] bg-[#0b0f19] border border-slate-800 rounded-lg p-4 max-h-72 overflow-y-auto space-y-2.5 shadow-inner">
          {job.logs.length === 0 ? (
            <p className="text-slate-600 italic">No execution logs written for this job yet.</p>
          ) : (
            job.logs.map((log) => (
              <div key={log.id} className="flex gap-4 hover:bg-slate-900/40 p-0.5 rounded transition">
                <span className="text-slate-600 select-none">{formatDate(log.timestamp)}</span>
                <span className={`w-14 uppercase select-none ${getLogLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-slate-300 select-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default JobDetails;
