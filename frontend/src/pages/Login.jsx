import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, KeyRound, User, Loader2 } from 'lucide-react';

const Login = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Visual Background Details */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
      
      {/* Auth Card Container */}
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800/80 rounded-2xl shadow-2xl p-8 relative z-10 glassmorphism">
        
        {/* Header Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <Shield size={24} />
          </div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
            {isRegister ? 'Create Orchestrix Account' : 'Welcome to Orchestrix'}
          </h2>
          <p className="text-slate-400 text-xs mt-2">
            {isRegister 
              ? 'Join the high-reliability developer platform' 
              : 'Distributed Job Orchestration & Execution Platform'}
          </p>
        </div>

        {/* Errors Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Username</label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="developer"
                className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-all duration-200 shadow-inner"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Password</label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0b0f19] border border-slate-800 focus:border-emerald-500/50 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-all duration-200 shadow-inner"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold py-3 rounded-xl text-sm transition-all duration-150 cursor-pointer shadow-[0_4px_14px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>{isRegister ? 'Sign Up' : 'Sign In'}</span>
            )}
          </button>
        </form>

        {/* Tab switch */}
        <div className="mt-8 text-center border-t border-slate-800/80 pt-6">
          <p className="text-xs text-slate-400">
            {isRegister ? 'Already have an account?' : "Don't have an account yet?"}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-emerald-400 hover:text-emerald-300 font-bold ml-1 transition"
            >
              {isRegister ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>

        {/* System seed helper note */}
        {!isRegister && (
          <div className="mt-6 text-center text-[10px] text-slate-500 font-medium bg-[#0b0f19]/30 rounded-lg p-2.5 border border-slate-800/40">
            💡 Dev Login: <span className="text-emerald-400 font-semibold">developer</span> / <span className="text-emerald-400 font-semibold">password123</span>
          </div>
        )}

      </div>
    </div>
  );
};

export default Login;
