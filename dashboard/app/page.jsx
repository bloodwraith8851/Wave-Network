import { Activity, Shield, Users, Server } from 'lucide-react';

export default function DashboardHome() {
  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Wave Network
          </h1>
          <p className="text-slate-400 mt-1">Bot Management Dashboard v4 ULTRA</p>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-md font-medium transition-colors">
            Documentation
          </button>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium transition-colors">
            Login with Discord
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Guilds" value="1,248" icon={<Server className="w-5 h-5 text-indigo-400" />} />
        <StatCard title="Active Users" value="142k+" icon={<Users className="w-5 h-5 text-green-400" />} />
        <StatCard title="Commands Executed" value="3.4M" icon={<Activity className="w-5 h-5 text-purple-400" />} />
        <StatCard title="Uptime" value="99.98%" icon={<Shield className="w-5 h-5 text-amber-400" />} />
      </div>

      <div className="mt-8 flex items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-lg">
        <div className="text-center">
          <h2 className="text-xl font-medium mb-2">Connecting to Core Engine...</h2>
          <p className="text-slate-500">The React components for configuring modules will appear here.</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
      <div>
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </div>
      <div className="p-3 bg-slate-800 rounded-lg">
        {icon}
      </div>
    </div>
  );
}
