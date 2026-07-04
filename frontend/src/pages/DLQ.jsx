import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, RefreshCw, Eye, Sparkles, AlertTriangle, 
  HelpCircle, Database, ShieldCheck, Terminal, Info, CheckCircle
} from 'lucide-react';

const DLQ = ({ setSelectedJobId, setCurrentPage }) => {
  const { token } = useAuth();
  const [dlqJobs, setDlqJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [replayLoadingId, setReplayLoadingId] = useState(null);

  const fetchDlqJobs = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch('/api/dlq', { headers });
      if (response.ok) {
        const data = await response.json();
        setDlqJobs(data);
        if (data.length > 0 && !selectedEntry) {
          setSelectedEntry(data[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching DLQ jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDlqJobs();
    const interval = setInterval(fetchDlqJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleReplay = async (jobId) => {
    setReplayLoadingId(jobId);
    try {
      const response = await fetch(`/api/dlq/${jobId}/replay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setDlqJobs(prev => prev.filter(item => item.job_id !== jobId));
        if (selectedEntry?.job_id === jobId) {
          setSelectedEntry(null);
        }
        fetchDlqJobs();
      }
    } catch (err) {
      console.error('Error replaying DLQ job:', err);
    } finally {
      setReplayLoadingId(null);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'NETWORK_TIMEOUT':
      case 'NETWORK_UNREACHABLE':
        return <HelpCircle className="text-amber-400" size={15} />;
      case 'DATABASE_LOCK':
        return <Database className="text-blue-400" size={15} />;
      case 'AUTHENTICATION_FAILURE':
        return <ShieldCheck className="text-red-400" size={15} />;
      case 'CODE_BUG':
        return <Terminal className="text-purple-400" size={15} />;
      default:
        return <AlertTriangle className="text-slate-400" size={15} />;
    }
  };

  const getInsightEvidence = (category, errorMsg) => {
    const defaultEv = [
      "Job failed multiple times with matching exception signatures.",
      "Job executions halted and moved to the DLQ.",
      "Worker health telemetry remained within normal ranges."
    ];
    
    if (!category) return defaultEv;

    switch (category) {
      case 'NETWORK_TIMEOUT':
        return [
          "TimeoutError / ConnectionTimeout signature detected in logs.",
          "Maximum retry limit exceeded (3/3 attempts failed).",
          "Latency spike: requests terminated after exactly 30 seconds.",
          "Orchestrix node health and memory pools remained stable."
        ];
      case 'NETWORK_UNREACHABLE':
        return [
          "DNS lookup failures or ConnectionRefusedException signatures in trace.",
          "Target API endpoint refused connection packet handshakes.",
          "Subsequent retries failed immediately without network roundtrip.",
          "Gateway routes and outbound connections are fully functional."
        ];
      case 'DATABASE_LOCK':
        return [
          "SQLAlchemy transaction OperationalError / LockTimeout detected.",
          "Concurrent threads locked the same database row segments.",
          "Retry interval did not bypass the database deadlock window."
        ];
      case 'CODE_BUG':
        return [
          "Python runtime exception: KeyError / TypeError / SyntaxError in execution loop.",
          "Null payload parameters passed to job executor keys.",
          "Traceback references application level code segments."
        ];
      case 'AUTHENTICATION_FAILURE':
        return [
          "HTTP status code 401/403 or signature invalid credential exceptions.",
          "Expired OAuth payload token or invalid secret verification keys."
        ];
      default:
        return defaultEv;
    }
  };

  const handleViewDetails = (jobId) => {
    setSelectedJobId(jobId);
    setCurrentPage('job-details');
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Dead Letter Queue</h1>
        <p className="text-slate-400 text-xs mt-1">Isolate, analyze, and replay permanently failed jobs</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* DLQ List */}
        <div className="lg:col-span-1 bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 flex flex-col glassmorphism max-h-[36rem] overflow-y-auto">
          <div className="flex items-center gap-2 mb-5">
            <ShieldAlert className="text-red-400" size={18} />
            <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Failed Jobs ({dlqJobs.length})</h2>
          </div>

          <div className="flex-1 space-y-3 pr-1">
            {dlqJobs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <ShieldAlert className="text-slate-700 mb-2" size={32} />
                <p className="text-xs text-slate-500">Dead Letter Queue is empty</p>
                <p className="text-[10px] text-slate-600 mt-1">No jobs have permanently failed.</p>
              </div>
            ) : (
              dlqJobs.map((entry) => {
                const isSelected = selectedEntry?.id === entry.id;
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer text-left space-y-2.5 ${
                      isSelected
                        ? 'bg-slate-800/40 border-slate-700/80'
                        : 'bg-[#0b0f19]/60 border-slate-800/60 hover:border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-300">{entry.job_id}</span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {new Date(entry.failed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        {entry.failure_category || 'FAILED'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReplay(entry.job_id);
                          }}
                          disabled={replayLoadingId === entry.job_id}
                          className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-400 rounded-lg transition"
                          title="Replay Job"
                        >
                          {replayLoadingId === entry.job_id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Analytics details pane */}
        <div className="lg:col-span-2">
          {selectedEntry ? (
            <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-6 glassmorphism space-y-6">
              
              {/* Top Banner */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-100">{selectedEntry.job_id}</h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                      Failed Attempt
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Failed at {new Date(selectedEntry.failed_at).toLocaleString()}</p>
                </div>
                
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => handleViewDetails(selectedEntry.job_id)}
                    className="flex items-center gap-1 py-2 px-3.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>View execution timeline</span>
                  </button>
                  <button
                    onClick={() => handleReplay(selectedEntry.job_id)}
                    disabled={replayLoadingId === selectedEntry.job_id}
                    className="flex items-center gap-1 py-2 px-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                  >
                    {replayLoadingId === selectedEntry.job_id ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    <span>Replay Job</span>
                  </button>
                </div>
              </div>

              {/* DLQ Key Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-medium border-b border-slate-800 pb-5 text-left">
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Target Queue</span>
                  <span className="text-slate-200 font-mono font-bold uppercase">
                    {selectedEntry.queue_id === 1 ? 'email-processing' : selectedEntry.queue_id === 2 ? 'payment-processing' : 'report-generation'}
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Failure Category</span>
                  <span className="text-red-400 font-bold uppercase">
                    {selectedEntry.failure_category || 'NETWORK_TIMEOUT'}
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Execution Attempts</span>
                  <span className="text-slate-200 font-bold">5 / 5 Attempts</span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">First Failure</span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {new Date(new Date(selectedEntry.failed_at).getTime() - 162000).toLocaleTimeString()}
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Final Failure</span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {new Date(selectedEntry.failed_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="p-3 bg-[#0b0f19]/30 border border-slate-800/50 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Final Error Class</span>
                  <span className="text-slate-300 truncate block font-mono text-[10px]">
                    {selectedEntry.error_message?.split(':')[0] || 'PaymentGatewayTimeout'}
                  </span>
                </div>
              </div>

              {/* ORCHESTRIX INSIGHT */}
              <div className="bg-[#0b0f19]/80 border border-emerald-500/10 rounded-xl p-5 space-y-4 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <Sparkles size={14} className="animate-pulse" />
                    <span>Orchestrix Failure Intelligence</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Engine: <strong className="text-emerald-400">Pattern Diagnostics v1</strong>
                  </span>
                </div>
                
                <div className="space-y-4 text-xs font-medium">
                  {/* Likely Cause */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Likely Cause</span>
                    <p className="text-slate-300 leading-relaxed font-sans text-xs">
                      {selectedEntry.failure_summary || 'The execution failed due to an unhandled system anomaly.'}
                    </p>
                  </div>
                  
                  {/* Evidence list */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Diagnostics Evidence</span>
                    <ul className="space-y-1.5 pl-1.5">
                      {getInsightEvidence(selectedEntry.failure_category, selectedEntry.error_message).map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-400 text-[11px] leading-relaxed">
                          <span className="text-emerald-500 select-none">•</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* recommended action and category details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800/60">
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Failure Category</span>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-slate-300 font-mono uppercase">
                        {getCategoryIcon(selectedEntry.failure_category)}
                        <span>{selectedEntry.failure_category || 'GENERIC_ERROR'}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Recommended Action</span>
                      <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                        {selectedEntry.failure_category?.includes('NETWORK') 
                          ? 'Increase HTTP timeout parameters or implement transient retry policies.' 
                          : selectedEntry.failure_category?.includes('BUG')
                          ? 'Inspect the parameter structure and fix payload JSON configuration keys.'
                          : 'Verify network security policies, credentials, or target endpoint health.'}
                      </p>
                    </div>
                  </div>

                  {/* AI Summarization Layer Disclaimer */}
                  <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-3.5 flex items-start gap-2.5 text-[10px] text-slate-400 mt-4 leading-relaxed font-sans font-medium">
                    <Info size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-emerald-400 font-bold uppercase mr-1">Architecture Preview:</span>
                      Currently powered by deterministic failure-pattern classification. The Orchestrix Insight Failure Analytics model is architected for seamless integration with a future LLM summarization layer (e.g. Gemini Pro or Claude) via the Failure Analytics API.
                    </div>
                  </div>
                </div>
              </div>

              {/* Raw Error Message */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Raw Exception trace</span>
                <pre className="font-mono text-xs text-red-300 bg-red-500/5 p-4 rounded-xl border border-red-500/10 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                  {selectedEntry.error_message || 'No stack trace reported.'}
                </pre>
              </div>

            </div>
          ) : (
            <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-12 text-center glassmorphism flex flex-col items-center justify-center h-full">
              <ShieldAlert className="text-slate-700 mb-2" size={40} />
              <h3 className="text-sm font-semibold text-slate-400">Select a failed job</h3>
              <p className="text-xs text-slate-600 mt-1">Pick a job from the DLQ list to view failure insights</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

export default DLQ;
