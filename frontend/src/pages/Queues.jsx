import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, Settings, Pause, Play, Loader2, Info, Check, AlertCircle 
} from 'lucide-react';

const Queues = () => {
  const { token } = useAuth();
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create queue modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueuePriority, setNewQueuePriority] = useState('MEDIUM');
  const [newQueueConcurrency, setNewQueueConcurrency] = useState(10);
  const [createLoading, setCreateLoading] = useState(false);
  
  // Configure queue modal states
  const [editingQueue, setEditingQueue] = useState(null);
  const [editConcurrency, setEditConcurrency] = useState(10);
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editLoading, setEditLoading] = useState(false);

  const fetchQueues = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      // For development, we assume project_id = 1 is the seeded default project
      const response = await fetch('/api/queues?project_id=1', { headers });
      if (response.ok) {
        const data = await response.json();
        setQueues(data);
      }
    } catch (err) {
      console.error('Error fetching queues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePause = async (queueId, isPaused) => {
    try {
      const response = await fetch(`/api/queues/${queueId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_paused: !isPaused }),
      });
      if (response.ok) {
        fetchQueues();
      }
    } catch (err) {
      console.error('Error toggling pause state:', err);
    }
  };

  const handleCreateQueue = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const response = await fetch('/api/queues?project_id=1', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newQueueName,
          priority: newQueuePriority,
          concurrency_limit: newQueueConcurrency
        }),
      });
      if (response.ok) {
        setNewQueueName('');
        setNewQueuePriority('MEDIUM');
        setNewQueueConcurrency(10);
        setShowCreateModal(false);
        fetchQueues();
      } else {
        const errJson = await response.json();
        alert(errJson.detail || 'Failed to create queue');
      }
    } catch (err) {
      console.error('Error creating queue:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const response = await fetch(`/api/queues/${editingQueue.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priority: editPriority,
          concurrency_limit: editConcurrency
        }),
      });
      if (response.ok) {
        setEditingQueue(null);
        fetchQueues();
      }
    } catch (err) {
      console.error('Error updating queue config:', err);
    } finally {
      setEditLoading(false);
    }
  };

  if (loading && queues.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Queue Manager</h1>
          <p className="text-slate-400 text-xs mt-1">Configure queue partitions, concurrency limits, and retry policies</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition duration-150 cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
        >
          <Plus size={16} />
          <span>New Queue</span>
        </button>
      </div>

      {/* Queue Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {queues.length === 0 ? (
          <div className="col-span-full bg-[#0f172a] border border-slate-800 p-12 text-center glassmorphism rounded-2xl">
            <AlertCircle className="text-slate-700 mx-auto mb-3" size={36} />
            <h3 className="text-sm font-semibold text-slate-400">No queues found</h3>
            <p className="text-xs text-slate-600 mt-1">Create your first partition queue to map background executions.</p>
            <button 
              type="button"
              onClick={() => setShowCreateModal(true)} 
              className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              New Queue
            </button>
          </div>
        ) : (
          queues.map((queue) => {
            const isPaused = queue.is_paused;
            
            return (
              <div 
                key={queue.id}
                className={`bg-[#0f172a] border rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 glassmorphism ${
                  isPaused ? 'border-slate-800 opacity-80' : 'border-slate-800 hover:border-slate-700/80'
                }`}
              >
                <div>
                  {/* Queue Title/Badge */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-slate-100 text-base tracking-wide uppercase">{queue.name}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold ${
                          isPaused 
                            ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isPaused ? 'bg-slate-500' : 'bg-emerald-500 animate-pulse'}`} />
                          {isPaused ? 'PAUSED' : 'ACTIVE'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">Priority: <span className="text-slate-300 font-semibold">{queue.priority}</span></span>
                        <span className="text-[10px] text-slate-500 font-medium">Limit: <span className="text-slate-300 font-semibold">{queue.concurrency_limit || '∞'}</span></span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleTogglePause(queue.id, isPaused)}
                        className={`p-2 rounded-xl border transition-all ${
                          isPaused 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                        }`}
                        title={isPaused ? "Resume Queue" : "Pause Queue"}
                      >
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQueue(queue);
                          setEditConcurrency(queue.concurrency_limit || 10);
                          setEditPriority(queue.priority);
                        }}
                        className="p-2 bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 rounded-xl transition"
                      >
                        <Settings size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Queue Stats Counts */}
                  <div className="grid grid-cols-4 gap-2.5 my-5 text-center bg-[#0b0f19]/40 p-4 rounded-xl border border-slate-800/40">
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Pending</span>
                      <span className="text-lg font-bold text-slate-300 mt-1 block">{queue.pending_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Running</span>
                      <span className="text-lg font-bold text-sky-400 mt-1 block">{queue.running_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Completed</span>
                      <span className="text-lg font-bold text-emerald-400 mt-1 block">{queue.completed_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Failed</span>
                      <span className="text-lg font-bold text-red-400 mt-1 block">{queue.failed_count}</span>
                    </div>
                  </div>
                </div>

                {/* Retry Policy Preview */}
                {queue.retry_policy && (
                  <div className="border-t border-slate-800/60 pt-4 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Info size={12} className="text-slate-600" />
                      Retry policy: Up to {queue.retry_policy.max_retries} attempts
                    </span>
                    <span>
                      Backoff: x{queue.retry_policy.backoff_factor} (max {queue.retry_policy.backoff_max_delay}s)
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* --- CREATE QUEUE MODAL --- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#07090e]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md p-6 glassmorphism animate-scale-up">
            <h2 className="text-base font-bold text-slate-100 mb-4 tracking-wide uppercase">Create New Queue</h2>
            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Queue Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. video-rendering"
                  value={newQueueName}
                  onChange={(e) => setNewQueueName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Priority</label>
                  <select
                    value={newQueuePriority}
                    onChange={(e) => setNewQueuePriority(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-semibold">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={newQueueConcurrency}
                    onChange={(e) => setNewQueueConcurrency(parseInt(e.target.value))}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/60 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2.5 px-4 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {createLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT QUEUE CONFIG MODAL --- */}
      {editingQueue && (
        <div className="fixed inset-0 bg-[#07090e]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md p-6 glassmorphism animate-scale-up">
            <h2 className="text-base font-bold text-slate-100 mb-4 tracking-wide uppercase">Configure: {editingQueue.name}</h2>
            <form onSubmit={handleUpdateConfig} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={editConcurrency}
                    onChange={(e) => setEditConcurrency(parseInt(e.target.value))}
                    className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-200 focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/60 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingQueue(null)}
                  className="py-2.5 px-4 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {editLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Save Config</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Queues;
