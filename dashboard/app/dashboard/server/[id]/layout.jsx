'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function ServerLayout({ children, params }) {
  const pathname = usePathname();
  const serverId = params.id;

  const TABS = [
    { name: 'Overview', path: `/dashboard/server/${serverId}` },
    { name: 'Permissions', path: `/dashboard/server/${serverId}/permissions` },
    { name: 'Analytics', path: `/dashboard/server/${serverId}/stats` },
  ];

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm max-w-fit">
        <ChevronLeft className="w-4 h-4" /> Back to Servers
      </Link>
      
      <header className="border-b border-slate-800 pb-6">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600/30 text-indigo-400 rounded-md flex items-center justify-center text-sm ring-1 ring-indigo-500/50">
            W
          </div>
          Server Configuration
        </h1>
        
        {/* Navigation Tabs */}
        <div className="flex gap-6 mt-6">
          {TABS.map(tab => {
            const isActive = pathname === tab.path;
            return (
              <Link 
                key={tab.path} 
                href={tab.path}
                className={`pb-3 font-medium text-sm transition-colors relative ${
                  isActive ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.name}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 rounded-t-md" />
                )}
              </Link>
            )
          })}
        </div>
      </header>

      <div>
        {children}
      </div>
    </div>
  );
}
