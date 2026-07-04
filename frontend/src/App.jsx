import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Queues from './pages/Queues';
import Jobs from './pages/Jobs';
import JobDetails from './pages/JobDetails';
import DLQ from './pages/DLQ';
import Settings from './pages/Settings';
import Workers from './pages/Workers';

const MainAppContent = () => {
  const { token, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedJobId, setSelectedJobId] = useState(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Route protection
  if (!token) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'queues':
        return <Queues />;
      case 'jobs':
        return (
          <Jobs 
            setSelectedJobId={setSelectedJobId} 
            setCurrentPage={setCurrentPage} 
          />
        );
      case 'job-details':
        return (
          <JobDetails 
            jobId={selectedJobId} 
            setCurrentPage={setCurrentPage} 
          />
        );
      case 'workers':
        return <Workers />;
      case 'dlq':
        return (
          <DLQ 
            setSelectedJobId={setSelectedJobId} 
            setCurrentPage={setCurrentPage} 
          />
        );
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex">
      {/* Fixed Sidebar */}
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      {/* Main Content Area */}
      <main className="flex-1 ml-64 min-h-screen p-8 lg:p-10 overflow-y-auto bg-[#0b0f19] relative">
        {/* Subtle grid background mask for premium look */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-[0.04] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10">
          {renderPage()}
        </div>
      </main>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
};

export default App;
