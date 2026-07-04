import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, FolderKanban, Server, PlaySquare, 
  ShieldAlert, Settings, LogOut, Activity, Bell
} from 'lucide-react';

const Sidebar = ({ currentPage, setCurrentPage }) => {
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', name: 'Overview', icon: LayoutDashboard },
    { id: 'queues', name: 'Queue Manager', icon: Server },
    { id: 'jobs', name: 'Job Explorer', icon: PlaySquare },
    { id: 'workers', name: 'Worker Fleet', icon: Activity },
    { id: 'dlq', name: 'Dead Letter Queue', icon: ShieldAlert },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 text-slate-300">
      {/* Platform Logo */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-900 font-bold text-lg shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          O
        </div>
        <div>
          <h1 className="font-bold text-slate-100 text-lg tracking-wider">ORCHESTRIX</h1>
          <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-widest">Orchestration</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500 shadow-[inset_0_0_8px_rgba(16,185,129,0.05)]' 
                  : 'hover:bg-slate-800/50 hover:text-slate-100'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-emerald-400' : 'text-slate-400'} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </nav>

      {/* User Session Footer */}
      <div className="p-4 border-t border-slate-800 bg-[#0b0f19]/40 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-semibold text-slate-200">
              {user?.username?.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200 truncate max-w-[120px]">{user?.username}</p>
              <p className="text-[11px] text-slate-500 truncate">Developer</p>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition">
            <Bell size={16} />
          </button>
        </div>
        
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800/40 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/20 transition-all"
        >
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
