import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Search, Filter, Plus, Clock, Play, CheckCircle, 
  XCircle, ChevronRight, Loader2, RefreshCw, Send, Calendar,
  Layers, RotateCcw, AlertTriangle, ArrowRight, ChevronLeft
} from 'lucide-react';

const Jobs = ({ setSelectedJobId, setCurrentPage }) => {
  const { token } = useAuth();
  
  // Jobs & Paginated states
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [queues, setQueues] = useState([]);

  // Create Job Modal states
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [jobName, setJobName] = useState('');
  const [queueName, setQueueName] = useState('email');
  const [priority, setPriority] = useState(1);
  const [jobType, setJobType] = useState('immediate'); // immediate, delayed, scheduled, recurring, batch
  
  // Custom type options
  const [delaySec, setDelaySec] = useState(10);
  const [scheduledDate, setScheduledDate] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [payloadStr, setPayloadStr] = useState('{\n  "user_id": 124,\n  "template": "welcome"\n}');
  const [batchPayloadsStr, setBatchPayloadsStr] = useState('[\n  {"user_id": 101, "template": "welcome"},\n  {"user_id": 102, "template": "welcome"},\n  {"user_id": 103, "template": "welcome"}\n]');
  
  const [submitLoading, setSubmitLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('explorer'); // explorer, cron
  const [cronSchedules, setCronSchedules] = useState([]);
  const [cronLoading, setCronLoading] = useState(false);

  const fetchJobs = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      let url = `/api/jobs?page=${page}&page_size=${pageSize}&`;
      if (statusFilter) url += `status=${statusFilter}&`;
      if (search) url += `search=${search}&`;
      
      const response = await fetch(url, { headers });
      if (response.ok) {
        const data = await response.json();
        setJobs(data.items || []);
        setTotalPages(data.total_pages || 1);
        setTotalJobs(data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueues = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch('/api/queues?project_id=1', { headers });
      if (response.ok) {
        const data = await response.json();
        setQueues(data);
      }
    } catch (err) {
      console.error('Error fetching queues:', err);
    }
  };

  const fetchCronSchedules = async () => {
    setCronLoading(true);
    try {
      const response = await fetch('/api/cron', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCronSchedules(data || []);
      }
    } catch (err) {
      console.error('Error fetching cron schedules:', err);
    } finally {
      setCronLoading(false);
    }
  };

  const handlePauseCron = async (cronId) => {
    try {
      const response = await fetch(`/api/cron/${cronId}/pause`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchCronSchedules();
      } else {
        const err = await response.json();
        alert(err.detail || 'Failed to pause cron schedule');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResumeCron = async (cronId) => {
    try {
      const response = await fetch(`/api/cron/${cronId}/resume`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchCronSchedules();
      } else {
        const err = await response.json();
        alert(err.detail || 'Failed to resume cron schedule');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCron = async (cronId) => {
    if (!confirm('Are you sure you want to delete this recurring cron schedule?')) return;
    try {
      const response = await fetch(`/api/cron/${cronId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchCronSchedules();
      } else {
        const err = await response.json();
        alert(err.detail || 'Failed to delete cron schedule');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'explorer') {
      fetchJobs();
    } else {
      fetchCronSchedules();
    }
  }, [statusFilter, search, page, activeSubTab]);

  // Telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeSubTab === 'explorer') {
        fetchJobs();
      } else {
        fetchCronSchedules();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [statusFilter, search, page, activeSubTab]);

  const handleOpenDetails = (jobId) => {
    setSelectedJobId(jobId);
    setCurrentPage('job-details');
  };

  const getBatchCount = () => {
    try {
      const arr = JSON.parse(batchPayloadsStr);
      return Array.isArray(arr) ? arr.length : 0;
    } catch (e) {
      return 0;
    }
  };

  // Human readable cron helper
  const getCronTranslation = (cron) => {
    const trimmed = cron.trim();
    if (trimmed === '0 9 * * *') return 'Runs every day at 9:00 AM';
    if (trimmed === '*/5 * * * *') return 'Runs every 5 minutes';
    if (trimmed === '0 * * * *') return 'Runs every hour (at minute 0)';
    if (trimmed === '0 0 * * 0') return 'Runs every Sunday at 12:00 AM (midnight)';
    return 'Custom Schedule Expression';
  };

  const handleSubmitJob = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    setErrorMsg('');

    try {
      // 1. Submit recurring cron job
      if (jobType === 'recurring') {
        let payload = null;
        try {
          payload = JSON.parse(payloadStr);
        } catch {
          alert('Invalid JSON in payload');
          setSubmitLoading(false);
          return;
        }

        const response = await fetch('/api/cron', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: jobName,
            cron_expression: cronExpression,
            queue_name: queueName,
            priority: parseInt(priority),
            payload
          }),
        });

        if (response.ok) {
          setShowSubmitModal(false);
          fetchJobs();
        } else {
          const errData = await response.json();
          alert(errData.detail || 'Failed to submit cron schedule');
        }
      } 
      // 2. Submit batch jobs
      else if (jobType === 'batch') {
        let payloads = [];
        try {
          payloads = JSON.parse(batchPayloadsStr);
          if (!Array.isArray(payloads)) throw new Error();
        } catch {
          alert('Batch payloads must be a valid JSON array of objects');
          setSubmitLoading(false);
          return;
        }

        const response = await fetch('/api/jobs/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: jobName,
            queue_name: queueName,
            priority: parseInt(priority),
            payloads
          }),
        });

        if (response.ok) {
          setShowSubmitModal(false);
          fetchJobs();
        } else {
          const errData = await response.json();
          alert(errData.detail || 'Failed to submit batch');
        }
      } 
      // 3. Submit Immediate / Delayed / Scheduled regular jobs
      else {
        let payload = null;
        try {
          payload = JSON.parse(payloadStr);
        } catch {
          alert('Invalid JSON in payload');
          setSubmitLoading(false);
          return;
        }

        let scheduled_at = null;
        if (jobType === 'delayed') {
          const scheduledTime = new Date();
          scheduledTime.setSeconds(scheduledTime.getSeconds() + delaySec);
          scheduled_at = scheduledTime.toISOString();
        } else if (jobType === 'scheduled') {
          if (!scheduledDate) {
            alert('Please select a date and time');
            setSubmitLoading(false);
            return;
          }
          scheduled_at = new Date(scheduledDate).toISOString();
        }

        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: jobName,
            queue_name: queueName,
            priority: parseInt(priority),
            payload,
            scheduled_at
          }),
        });

        if (response.ok) {
          setShowSubmitModal(false);
          fetchJobs();
        } else {
          const errData = await response.json();
          alert(errData.detail || 'Failed to submit job');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle size={10} /> Completed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" /> Running
          </span>
        );
      case 'claimed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Claimed
          </span>
        );
      case 'failed':
      case 'dlq':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle size={10} /> DLQ
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock size={10} /> Scheduled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            Queued
          </span>
        );
    }
  };

  const getDuration = (job) => {
    if (!job.started_at) return '-';
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const durationMs = end - new Date(job.started_at);
    return `${(durationMs / 1000).toFixed(2)}s`;
  };

  const [errorMsg, setErrorMsg] = useState('');

  const triggerSimulatedJob = async (type) => {
    let name = "Process Credit Card Sync";
    let qName = "payments";
    let payload = { amount: 250.00 };

    if (type === 'timeout') {
      name = "Process Paypal Settlement";
      qName = "payments";
      payload = { simulate_fail: true, fail_reason: "HTTPConnectionError: Connection timed out after 30 seconds when reaching api.paypal.com" };
    } else if (type === 'bug') {
      name = "Generate Financial PDF";
      qName = "reports";
      payload = { simulate_fail: true, fail_reason: "KeyError: 'revenue_totals' missing from payload dictionary" };
    } else if (type === 'success') {
      name = "Dispatch Slack Notification Alert";
      qName = "notifications";
      payload = { channel: "#ops-logs" };
    }

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          queue_name: qName,
          priority: 2,
          payload
        }),
      });
      if (response.ok) {
        fetchJobs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Job Explorer</h1>
          <p className="text-slate-400 text-xs mt-1">Search, debug, and trace individual execution payloads</p>
        </div>
        <div className="flex gap-2">
          {/* Quick Simulators */}
          <div className="flex items-center gap-1.5 bg-[#0f172a] border border-slate-800 p-1.5 rounded-xl text-xs glassmorphism">
            <span className="text-[10px] text-slate-500 font-bold px-2 uppercase">Simulate:</span>
            <button onClick={() => triggerSimulatedJob('success')} className="hover:bg-slate-800 text-emerald-400 font-semibold px-2.5 py-1 rounded-lg transition">Success</button>
            <button onClick={() => triggerSimulatedJob('timeout')} className="hover:bg-slate-800 text-amber-400 font-semibold px-2.5 py-1 rounded-lg transition">Timeout</button>
            <button onClick={() => triggerSimulatedJob('bug')} className="hover:bg-slate-800 text-red-400 font-semibold px-2.5 py-1 rounded-lg transition">Bug</button>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition duration-150 cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
          >
            <Plus size={16} />
            <span>Create Job</span>
          </button>
        </div>
      </div>

      {/* Sub tabs navigation */}
      <div className="flex border-b border-slate-800/80 mb-6">
        <button
          onClick={() => setActiveSubTab('explorer')}
          className={`pb-3 px-6 text-xs font-bold uppercase tracking-wider transition ${
            activeSubTab === 'explorer' 
              ? 'text-emerald-400 border-b-2 border-emerald-500' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Job Explorer
        </button>
        <button
          onClick={() => setActiveSubTab('cron')}
          className={`pb-3 px-6 text-xs font-bold uppercase tracking-wider transition ${
            activeSubTab === 'cron' 
              ? 'text-emerald-400 border-b-2 border-emerald-500' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Recurring Cron Manager
        </button>
      </div>

      {activeSubTab === 'explorer' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 bg-[#0f172a] border border-slate-800/80 p-4 rounded-xl glassmorphism">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by Job ID or Name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-[#0b0f19] border border-slate-800/80 focus:border-slate-700/80 rounded-xl py-2.5 pl-11 pr-4 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition shadow-inner"
          />
        </div>
        
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0b0f19] border border-slate-800/80 rounded-xl py-2.5 px-4 text-xs text-slate-300 focus:outline-none transition pr-8 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="dlq">DLQ</option>
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden glassmorphism shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b0f19]/30 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="py-4 px-5">Job ID</th>
                <th className="py-4 px-5">Job Name</th>
                <th className="py-4 px-5">Queue</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5">Worker</th>
                <th className="py-4 px-5">Duration</th>
                <th className="py-4 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2 text-slate-600" />
                    Fetching latest records...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-20 text-center text-slate-500">
                    <AlertTriangle size={32} className="mx-auto mb-3 text-slate-600 animate-pulse" />
                    <h3 className="text-sm font-semibold text-slate-400">No jobs found</h3>
                    <p className="text-xs text-slate-600 mt-1">Create your first job to begin processing background tasks.</p>
                    <button 
                      type="button"
                      onClick={() => setShowSubmitModal(true)} 
                      className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                      Create Job
                    </button>
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/20 transition-all duration-150">
                    <td className="py-3.5 px-5 font-mono font-bold text-slate-400 select-all">
                      {job.id}
                      {job.batch_id && (
                        <span className="block text-[9px] text-blue-400 mt-0.5">Batch: {job.batch_id}</span>
                      )}
                      {job.cron_schedule_id && (
                        <span className="block text-[9px] text-emerald-400 mt-0.5">Cron Scheduled</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-slate-200">{job.name}</td>
                    <td className="py-3.5 px-5 font-medium text-slate-400">
                      {queues.find(q => q.id === job.queue_id)?.name || 'Default'}
                    </td>
                    <td className="py-3.5 px-5">{getStatusBadge(job.status)}</td>
                    <td className="py-3.5 px-5 font-mono text-slate-500 text-[11px]">{job.worker_id || '-'}</td>
                    <td className="py-3.5 px-5 font-mono text-slate-400 text-[11px]">{getDuration(job)}</td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => handleOpenDetails(job.id)}
                        className="inline-flex items-center gap-1 py-1.5 px-3 bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-800 hover:border-slate-700 rounded-lg transition text-[11px] font-semibold cursor-pointer"
                      >
                        <span>Details</span>
                        <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 bg-[#0b0f19]/30 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalJobs)} of {totalJobs} jobs
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-800 rounded-lg disabled:opacity-40 transition cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold text-slate-300">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-800 rounded-lg disabled:opacity-40 transition cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        </div>
      </>
    )}

      {/* --- RECURRING CRON MANAGER TAB --- */}
      {activeSubTab === 'cron' && (
        <div className="space-y-6">
          <div className="bg-[#0f172a] border border-slate-800/80 p-5 rounded-2xl glassmorphism flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-200">Recurring Schedules</h2>
              <p className="text-xs text-slate-400 mt-1">List, pause, resume, and delete active cron routines</p>
            </div>
            <button
              onClick={() => { setJobType('recurring'); setShowSubmitModal(true); }}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2 px-3.5 rounded-xl text-xs transition duration-150 cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
            >
              <Plus size={14} />
              <span>Add Cron Schedule</span>
            </button>
          </div>

          {cronLoading && cronSchedules.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
          ) : cronSchedules.length === 0 ? (
            <div className="bg-[#0f172a] border border-slate-800/80 p-12 text-center rounded-2xl glassmorphism">
              <Clock size={32} className="mx-auto text-slate-600 mb-3 animate-pulse" />
              <h3 className="text-sm font-semibold text-slate-400">No active cron schedules</h3>
              <p className="text-xs text-slate-600 mt-1">Create one using the button above or during job creation.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cronSchedules.map((sched) => (
                <div key={sched.id} className={`bg-[#0f172a] border rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 glassmorphism ${
                  !sched.is_active 
                    ? 'border-red-500/10 bg-red-950/5 shadow-[inset_0_0_10px_rgba(239,68,68,0.02)]' 
                    : 'border-slate-800 hover:border-slate-700/80 shadow-md'
                }`}>
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-slate-200 text-sm select-all">{sched.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        sched.is_active 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-red-500/15 text-red-400 border border-red-500/25'
                      }`}>
                        {sched.is_active ? '● ACTIVE' : '◉ PAUSED'}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between border-b border-slate-800/50 pb-1.5">
                        <span className="text-slate-500">Cron Expression:</span>
                        <span className="font-mono text-slate-300 font-bold">{sched.cron_expression}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/50 pb-1.5">
                        <span className="text-slate-500">Translation:</span>
                        <span className="text-slate-300 font-semibold">{getCronTranslation(sched.cron_expression)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/50 pb-1.5">
                        <span className="text-slate-500">Queue:</span>
                        <span className="font-mono text-slate-400 font-bold uppercase">{queues.find(q => q.id === sched.queue_id)?.name || 'default'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/50 pb-1.5">
                        <span className="text-slate-500">Last Run:</span>
                        <span className="font-mono text-slate-400">{sched.last_run_at ? new Date(sched.last_run_at).toLocaleString() : 'Never'}</span>
                      </div>
                      <div className="flex justify-between pb-1.5">
                        <span className="text-slate-500">Next Run:</span>
                        <span className="font-mono text-emerald-400 font-semibold">{sched.is_active ? new Date(sched.next_run_at).toLocaleString() : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2.5 mt-5 pt-4 border-t border-slate-800/60">
                    {sched.is_active ? (
                      <button
                        onClick={() => handlePauseCron(sched.id)}
                        className="flex-1 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold transition cursor-pointer text-center"
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => handleResumeCron(sched.id)}
                        className="flex-1 py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold transition cursor-pointer text-center"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteCron(sched.id)}
                      className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/35 text-red-400 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- CREATE JOB MODAL (Upgraded) --- */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-[#07090e]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg p-6 glassmorphism animate-scale-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-bold text-slate-100 mb-4 tracking-wide uppercase">Create New Job Task</h2>
            <form onSubmit={handleSubmitJob} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Job Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sync Stripe Payments"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition"
                />
              </div>

              {/* Job Type Selector Cards */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Execution Type</label>
                <div className="space-y-2">
                  {[
                    { id: 'immediate', name: 'Immediate', desc: 'Execute as soon as a worker is available.' },
                    { id: 'delayed', name: 'Delayed', desc: 'Delay execution by a transient wait period.' },
                    { id: 'scheduled', name: 'Scheduled', desc: 'Execute at a specific future calendar date/time.' },
                    { id: 'recurring', name: 'Recurring (Cron)', desc: 'Run repeatedly based on cron configurations.' },
                    { id: 'batch', name: 'Batch', desc: 'Spawn multiple job payloads atomically.' }
                  ].map((type) => (
                    <label 
                      key={type.id}
                      onClick={() => setJobType(type.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer text-left ${
                        jobType === type.id 
                          ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.05)]' 
                          : 'border-slate-800/80 bg-[#0b0f19]/40 hover:border-slate-700/60'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="jobTypeRadio" 
                        checked={jobType === type.id} 
                        onChange={() => {}} 
                        className="mt-1 accent-emerald-500 shrink-0 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-200">{type.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{type.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional Inputs based on Job Type */}
              {jobType === 'delayed' && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Delay Interval (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    value={delaySec}
                    onChange={(e) => setDelaySec(parseInt(e.target.value))}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none transition"
                  />
                </div>
              )}

              {jobType === 'scheduled' && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Execution Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none transition"
                  />
                </div>
              )}

              {jobType === 'recurring' && (
                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Cron Expression</label>
                    <input
                      type="text"
                      required
                      placeholder="*/5 * * * *"
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Human Translation</span>
                    <span className="text-emerald-400 text-xs font-semibold block bg-[#0b0f19] border border-slate-800/40 rounded-xl py-2.5 px-3 font-sans mt-0.5">
                      {getCronTranslation(cronExpression)}
                    </span>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Quick Presets</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCronExpression('*/5 * * * *')}
                        className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg transition cursor-pointer"
                      >
                        Every 5 mins (*/5 * * * *)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCronExpression('0 * * * *')}
                        className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg transition cursor-pointer"
                      >
                        Every Hour (0 * * * *)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCronExpression('0 9 * * *')}
                        className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg transition cursor-pointer"
                      >
                        Daily at 9 AM (0 9 * * *)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCronExpression('0 0 * * 0')}
                        className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded-lg transition cursor-pointer"
                      >
                        Every Sunday (0 0 * * 0)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Core Options (Queue, Priority) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Queue</label>
                  <select
                    value={queueName}
                    onChange={(e) => setQueueName(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-300 focus:outline-none transition cursor-pointer"
                  >
                    {queues.map(q => (
                      <option key={q.id} value={q.name}>{q.name.toUpperCase()} (Priority: {q.priority})</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Job Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value))}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-300 focus:outline-none transition cursor-pointer"
                  >
                    <option value="1">Low Priority</option>
                    <option value="2">Medium Priority</option>
                    <option value="5">High Priority</option>
                  </select>
                </div>
              </div>

              {/* Payload Field */}
              {jobType === 'batch' ? (
                <div className="space-y-1.5 animate-fade-in">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Batch Payloads Array (JSON Array)</label>
                    {getBatchCount() > 0 && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
                        {getBatchCount()} jobs will be created
                      </span>
                    )}
                  </div>
                  <textarea
                    rows="5"
                    value={batchPayloadsStr}
                    placeholder='[\n  {"user_id": 101},\n  {"user_id": 102}\n]'
                    onChange={(e) => setBatchPayloadsStr(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2 px-3 text-xs font-mono text-slate-300 focus:outline-none transition"
                  />
                </div>
              ) : (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">JSON Payload</label>
                  <textarea
                    rows="4"
                    value={payloadStr}
                    onChange={(e) => setPayloadStr(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2 px-3 text-xs font-mono text-slate-300 focus:outline-none transition"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/60 mt-6">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="py-2.5 px-4 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {submitLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Create Job</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Jobs;
