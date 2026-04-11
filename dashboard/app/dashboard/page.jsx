import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function ServerSelectorPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/');
  }

  // In a real scenario, we'd fetch the user's guilds from Discord's /users/@me/guilds
  // using session.accessToken. For this template, we show a mock list that connects
  // to the API layer of the bot.
  const MOCK_GUILDS = [
    { id: '123456789', name: 'Wave Development', icon: null, botPresent: true },
    { id: '987654321', name: 'Community Hub', icon: null, botPresent: false },
  ];

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-100">Select a Server</h1>
        <p className="text-slate-400 mt-1">Manage settings for servers where you have Administrator permissions.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MOCK_GUILDS.map(guild => (
          <div key={guild.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-40">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex justify-center items-center font-bold text-lg">
                {guild.name.charAt(0)}
              </div>
              <h3 className="font-medium text-lg leading-tight truncate">{guild.name}</h3>
            </div>
            
            <div>
              {guild.botPresent ? (
                <a 
                  href={`/dashboard/server/${guild.id}`} 
                  className="block w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-center rounded-md font-medium transition-colors"
                >
                  Manage Bot
                </a>
              ) : (
                <a 
                  href="#" 
                  className="block w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-center rounded-md font-medium transition-colors"
                >
                  Invite Bot
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
