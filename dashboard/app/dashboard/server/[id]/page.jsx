'use client';
import { useState, useEffect } from 'react';
import { getGuildConfig, updateGuildConfig } from '@/lib/api';

export default function ServerOverview({ params }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form states
  const [color, setColor] = useState('#7C3AED');
  const [autoClose, setAutoClose] = useState('24');
  const [autoAssign, setAutoAssign] = useState('round_robin');

  useEffect(() => {
    getGuildConfig(params.id)
      .then(res => {
        const db = res.config;
        setColor(db.branding?.color || '#7C3AED');
        setAutoClose(db.ticket?.settings?.auto_close_hours?.toString() || '24');
        setAutoAssign(db.autoAssign?.mode || 'off');
        setConfig(res);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGuildConfig(params.id, {
        "branding.color": color,
        "ticket.settings.auto_close_hours": parseInt(autoClose),
        "autoAssign.mode": autoAssign
      });
      alert("Settings saved successfully! Bot updated in real-time.");
    } catch(err) {
      alert("Error saving: " + err.message);
    }
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-40 bg-slate-800 rounded-xl"></div>;
  if (error) return <div className="text-red-400 bg-red-950/30 p-4 border border-red-900 rounded-xl">Failed to communicate with Bot Process: {error}</div>;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* BRANDING */}
      <section className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
        <h3 className="text-lg font-semibold mb-4">Aesthetics & Branding</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Primary Embed Color</label>
            <div className="flex gap-3">
              <input 
                type="color" 
                value={color} 
                onChange={e => setColor(e.target.value)}
                className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
              />
              <input 
                type="text" 
                value={color}
                onChange={e => setColor(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm flex-1 font-mono"
              />
            </div>
          </div>
        </div>
      </section>

      {/* TICKETS */}
      <section className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
        <h3 className="text-lg font-semibold mb-4">Ticket System Logic</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Auto-Close Inactivity (Hours)</label>
            <select 
              value={autoClose}
              onChange={e => setAutoClose(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm"
            >
              <option value="0">Disabled (Never auto-close)</option>
              <option value="12">12 Hours</option>
              <option value="24">24 Hours</option>
              <option value="48">48 Hours</option>
              <option value="72">3 Days</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">Users will be warned 1 hour prior to closure.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Auto-Assign Strategy</label>
            <select 
              value={autoAssign}
              onChange={e => setAutoAssign(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm"
            >
              <option value="off">Off (Manual claiming)</option>
              <option value="round_robin">Round Robin (Strict sequence)</option>
              <option value="load_balance">Load Balanced (Least active tickets)</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex justify-end pt-4">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving to Database...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
