import React, { useState, useEffect, useRef } from 'react';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { Trophy, Gamepad2, Skull, ChevronRight, LogOut, Activity, Lock, User, Mail, AlertTriangle, Bell, Play, Hexagon } from 'lucide-react';

// --- SUPABASE INITIALIZATION ---
// Safely load environment variables for Vite without crashing non-Vite environments
let envUrl = 'https://tvmcijxurcmsrwjqtupu.supabase.co';
let envKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bWNpanh1cmNtc3J3anF0dXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzYwNDksImV4cCI6MjA5NjkxMjA0OX0.38aHoxMhBExtXgg8CYAGSTpBX9BVj3PQx26FCW64RuE';
try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        envUrl = import.meta.env.VITE_SUPABASE_URL || envUrl;
        envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || envKey;
    }
} catch (e) {}

const SUPABASE_URL = 'https://tvmcijxurcmsrwjqtupu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bWNpanh1cmNtc3J3anF0dXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzYwNDksImV4cCI6MjA5NjkxMjA0OX0.38aHoxMhBExtXgg8CYAGSTpBX9BVj3PQx26FCW64RuE';

let supabase = null;
const isSupabaseConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

if (isSupabaseConfigured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [currentView, setCurrentView] = useState('auth'); 
  const [leaderboard, setLeaderboard] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [toast, setToast] = useState(null);
  const prevRankRef = useRef(null);

  // 1. Mandatory Auth Initialization
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
        setIsAuthChecking(false);
        return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Data Fetching & Sync (Supabase Realtime)
  useEffect(() => {
    if (!user || !supabase) return;

    const fetchLeaderboard = async () => {
        const { data, error } = await supabase
            .from('leaderboard')
            .select('*')
            .order('score', { ascending: false });
            
        if (data) {
            setLeaderboard(data);
            const myIndex = data.findIndex(row => row.id === user.id);
            const me = myIndex !== -1 ? data[myIndex] : null;
            const myRank = myIndex !== -1 ? myIndex + 1 : null;

            if (me) {
                setUserProfile(me);
                if (currentView === 'auth') setCurrentView('dashboard');
            } else {
                setUserProfile(null);
                setCurrentView('auth');
            }

            if (prevRankRef.current !== null && myRank !== null && prevRankRef.current !== myRank) {
                if (myRank < prevRankRef.current) {
                    setToast({ title: 'RANK UP!', message: `You climbed to position #${myRank}!`, type: 'success' });
                } else {
                    setToast({ title: 'RANK DOWN', message: `You dropped to position #${myRank}. Defend your rank!`, type: 'warning' });
                }
                setTimeout(() => setToast(null), 5000);
            }
            prevRankRef.current = myRank;
            
        } else if (error) {
            console.error("Error fetching leaderboard:", error);
        }
    };

    fetchLeaderboard();

    const channel = supabase
      .channel('public:leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, payload => {
          fetchLeaderboard(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentView]);

  // Auth Actions
  const handleAuthSubmit = async (type, email, password, alias) => {
    if (!supabase) return { success: false, error: "Supabase not configured." };
    
    try {
        if (type === 'register') {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });
            
            if (error) throw error;
            
            if (!data.session) {
                return { success: false, error: "Check your email to confirm registration before logging in." };
            }

            if (data?.user) {
                const finalAlias = alias.trim() || 'Colleague';
                const { error: insertError } = await supabase
                    .from('leaderboard')
                    .insert([{ id: data.user.id, alias: finalAlias, score: 0 }]);
                    
                if (insertError) {
                    throw new Error("Failed to create profile.");
                }
            }
            
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        }
        
        setCurrentView('dashboard');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
  };

  const handleLogout = async () => {
      if (supabase) {
          await supabase.auth.signOut();
          setUserProfile(null);
          setCurrentView('auth');
      }
  };

  const handleGameComplete = async (earnedScore, gameName, difficultyLevel) => {
    if (!user || !supabase || !userProfile) {
        setCurrentView('dashboard');
        return;
    }
    
    const diffMultipliers = { easy: 1, hard: 2, expert: 3 };
    const multiplier = diffMultipliers[difficultyLevel] || 1;
    const finalScore = Math.floor(earnedScore * multiplier);

    if (finalScore > 0 || gameName) {
        const newTotal = (userProfile.score || 0) + finalScore;
        
        const { error } = await supabase
            .from('leaderboard')
            .update({ 
                score: newTotal,
                last_game_played: gameName
            })
            .eq('id', user.id);
            
        if (error) {
            await supabase.from('leaderboard').update({ score: newTotal }).eq('id', user.id);
        }
    }
    
    setCurrentView('dashboard');
  };

  if (!isSupabaseConfigured) {
      return (
          <div className="h-screen w-screen bg-gray-50 flex flex-col items-center justify-center text-[#0d8199] font-sans text-center p-8">
              <AlertTriangle size={64} className="text-[#38b5cf] mb-6" />
              <h1 className="text-2xl font-bold mb-4">SUPABASE CONFIGURATION REQUIRED</h1>
              <p className="text-gray-600 max-w-lg mb-4 text-sm leading-relaxed">
                  The application is waiting for valid Supabase credentials. You must provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your .env file to connect to the backend.
              </p>
          </div>
      );
  }

  if (isAuthChecking) {
    return <div className="h-screen w-screen bg-[#f5f5f5] flex items-center justify-center text-[#0d8199] font-sans animate-pulse">Loading Decos Environment...</div>;
  }

  return (
    <div className="h-screen w-screen bg-[#f5f5f5] text-gray-700 font-sans overflow-hidden selection:bg-[#38b5cf] selection:text-white relative">
      
      {/* Toast Notification */}
      {toast && (
          <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-lg flex items-center gap-4 transition-all animate-bounce border
              ${toast.type === 'success' ? 'bg-white border-[#38b5cf] text-[#0d8199]' 
              : 'bg-white border-orange-400 text-orange-600'}`}
          >
              <Bell className={toast.type === 'success' ? 'text-[#38b5cf]' : 'text-orange-400'} />
              <div>
                  <p className="font-bold text-sm">{toast.title}</p>
                  <p className="text-xs">{toast.message}</p>
              </div>
          </div>
      )}

      <div className="relative z-10 h-full w-full max-w-5xl mx-auto flex flex-col shadow-2xl bg-white md:my-0">
        {currentView === 'auth' && <AuthView onSubmit={handleAuthSubmit} />}
        
        {currentView === 'dashboard' && userProfile && (
          <DashboardView 
            profile={userProfile} 
            leaderboard={leaderboard} 
            userId={user?.id}
            onLaunch={(game) => setCurrentView(game)}
            onLogout={handleLogout}
          />
        )}

        {currentView === 'game-connect' && <NumberConnectGame difficulty="easy" onComplete={(s) => handleGameComplete(s, 'Number Connect', 'easy')} />}
        {currentView === 'game-neon-heist' && <NeonHeistGame difficulty="hard" onComplete={(s) => handleGameComplete(s, 'Neon Heist', 'hard')} />}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function AuthView({ onSubmit }) {
  const [mode, setMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      setLoading(true);
      
      const result = await onSubmit(mode, email, password, alias);
      if (!result.success) {
          setError(result.error);
      }
      setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 md:p-8 relative overflow-y-auto bg-white">
      <div className="mb-8 mt-4 md:mt-0 flex flex-col items-center">
          <div className="w-12 h-12 bg-[#0d8199] text-white flex items-center justify-center rounded-lg mb-4 shadow-md">
              <ChevronRight size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl text-center text-[#0d8199] font-bold tracking-tight">
              Decos Innovation Day
          </h1>
          <h2 className="text-xl md:text-2xl text-[#38b5cf] font-light mt-1">Game Portal</h2>
      </div>

      <div className="bg-[#f5f5f5] p-6 md:p-10 w-full max-w-lg rounded-xl shadow-sm border border-gray-200">
        <div className="text-center mb-8 pb-6 border-b border-gray-300">
            <h3 className="text-lg text-gray-800 font-semibold mb-3">Welcome Colleagues!</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
                We are thrilled to participate in this year's Innovation Event. Our team has designed custom video games to test your logic and reflexes. Log in to play, compete, and climb the Decos leaderboard!
            </p>
            <p className="text-xs text-gray-500 italic">
                - Ankit Ajwani, Kim van Aarle, Natascha van den Bos, Roy van Dam, Prashant Singh
            </p>
        </div>

        <h3 className="text-md text-center text-gray-700 font-medium mb-6">
            {mode === 'login' ? 'Sign in to your account' : 'Register your player profile'}
        </h3>
        
        {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 mb-6 text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" /> <span className="leading-tight">{error}</span>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                maxLength="20"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Your Name (e.g. Prashant)"
                className="w-full bg-white border border-gray-300 text-gray-800 rounded-md pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#38b5cf] focus:ring-1 focus:ring-[#38b5cf] transition-all"
                required
              />
            </div>
          )}
          
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address (@decos.com)"
              className="w-full bg-white border border-gray-300 text-gray-800 rounded-md pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#38b5cf] focus:ring-1 focus:ring-[#38b5cf] transition-all"
              required
            />
          </div>

          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-white border border-gray-300 text-gray-800 rounded-md pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#38b5cf] focus:ring-1 focus:ring-[#38b5cf] transition-all"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 mt-2 bg-[#0d8199] hover:bg-[#0a667a] text-white rounded-full font-medium transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Join the Event')} <ChevronRight size={18} />
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
            <span className="text-gray-500">
                {mode === 'login' ? "Don't have an account yet?" : "Already registered?"} 
            </span>
            <button 
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                className="ml-2 text-[#0d8199] hover:text-[#38b5cf] font-semibold transition-colors"
            >
                {mode === 'login' ? 'Sign up here' : 'Log in here'}
            </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ profile, leaderboard, userId, onLaunch, onLogout }) {
  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden bg-white">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-4 mb-6 shrink-0 gap-4">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#0d8199] text-white flex items-center justify-center rounded-lg shadow-sm">
              <ChevronRight size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0d8199]">Innovation Day Portal</h1>
              <p className="text-sm text-gray-500">Welcome, <span className="text-[#38b5cf] font-semibold">{profile.alias}</span></p>
            </div>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="bg-[#f5f5f5] px-4 py-2 rounded-lg border border-gray-200 text-center min-w-[120px]">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Score</p>
                <p className="text-xl text-[#0d8199] font-bold">{profile.score || 0}</p>
            </div>
            <button onClick={onLogout} title="Log Out" className="text-gray-400 hover:text-gray-700 p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-all rounded-lg flex items-center gap-2">
                <LogOut size={18} />
            </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-8">
        
        {/* INSTRUCTIONS */}
        <div className="bg-blue-50 border-l-4 border-[#38b5cf] p-5 rounded-r-lg text-sm text-gray-700 flex flex-col gap-2 shrink-0">
            <h3 className="text-[#0d8199] font-bold flex items-center gap-2 text-base"><Trophy size={18}/> How to Play & Win</h3>
            <p className="leading-relaxed">
                Choose a module below to begin. Each game tests a different skill and has a specific difficulty multiplier. 
                Your highest scores aggregate to your total profile score. The leaderboard updates in real-time, so keep playing to defend your rank!
            </p>
        </div>

        {/* LEADERBOARD SECTION */}
        <div className="bg-white border border-gray-200 flex flex-col rounded-xl shrink-0 overflow-hidden shadow-sm">
            <h2 className="text-sm text-white font-bold bg-[#0d8199] p-4 flex items-center justify-between">
                <span>GLOBAL LEADERBOARD</span>
                <Activity size={16} className="text-blue-200"/>
            </h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#f5f5f5] text-gray-500 text-[11px] uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-semibold w-24">Rank</th>
                            <th className="px-6 py-4 font-semibold">Colleague Name</th>
                            <th className="px-6 py-4 font-semibold w-32">Status</th>
                            <th className="px-6 py-4 font-semibold">Last Played</th>
                            <th className="px-6 py-4 font-semibold text-right w-32">Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {leaderboard.length === 0 ? (
                            <tr><td colSpan="5" className="p-6 text-center text-sm text-gray-400">Loading player data...</td></tr>
                        ) : (
                            leaderboard.slice(0, 10).map((entry, index) => {
                                const isMe = entry.id === userId;
                                return (
                                    <tr key={entry.id} className={`transition-colors hover:bg-gray-50 ${isMe ? 'bg-blue-50/50' : ''}`}>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                                                ${index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                                                  index === 1 ? 'bg-gray-200 text-gray-700' : 
                                                  index === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-500'}`}>
                                                {index + 1}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 font-medium ${isMe ? 'text-[#0d8199]' : 'text-gray-700'}`}>
                                            {entry.alias} {isMe && <span className="ml-2 text-[10px] bg-[#38b5cf] text-white px-2 py-0.5 rounded-full">YOU</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            {isMe ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> ONLINE
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-400 font-medium">OFFLINE</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-gray-500">
                                            {entry.last_game_played || 'Never'}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold text-base ${isMe ? 'text-[#0d8199]' : 'text-gray-600'}`}>
                                            {entry.score || 0}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* GAMES SECTION */}
        <div className="flex flex-col shrink-0 mt-2">
            <h2 className="text-lg text-[#0d8199] font-bold flex items-center gap-2 mb-4">
                <Gamepad2 size={20}/> Innovation Games
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* EASY: Number Connect */}
                <div className="bg-white border border-gray-200 hover:border-[#38b5cf] hover:shadow-lg p-6 rounded-xl transition-all flex flex-col relative overflow-hidden group cursor-pointer" onClick={() => onLaunch('game-connect')}>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity"><Hexagon size={140} color="#0d8199" /></div>
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-xl text-gray-800 font-bold relative z-10">Number Connect</h3>
                        <span className="text-[10px] font-bold px-2 py-1 bg-green-100 text-green-700 rounded border border-green-200">EASY (1.0x)</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed relative z-10 flex-1">
                        Connect the numbers in ascending order without crossing your paths. A test of spatial logic and planning.
                    </p>
                    <button className="w-full py-3 bg-[#f5f5f5] group-hover:bg-[#0d8199] group-hover:text-white text-gray-600 text-sm font-semibold transition-colors flex items-center justify-center gap-2 rounded-lg relative z-10">
                        <Play size={16} fill="currentColor" /> Play Module
                    </button>
                </div>

                {/* HARD: Neon Heist (Vampire Survivors Clone) */}
                <div className="bg-white border border-gray-200 hover:border-[#38b5cf] hover:shadow-lg p-6 rounded-xl transition-all flex flex-col relative overflow-hidden group cursor-pointer" onClick={() => onLaunch('game-neon-heist')}>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity"><Skull size={140} color="#0d8199" /></div>
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-xl text-gray-800 font-bold relative z-10">Neon Heist</h3>
                        <span className="text-[10px] font-bold px-2 py-1 bg-red-100 text-red-700 rounded border border-red-200">HARD (2.0x)</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed relative z-10 flex-1">
                        A chaotic bullet-heaven simulation. Outrun the swarm, collect cash, and upgrade your auto-weapons. Survive as long as you can!
                    </p>
                    <button className="w-full py-3 bg-[#f5f5f5] group-hover:bg-[#0d8199] group-hover:text-white text-gray-600 text-sm font-semibold transition-colors flex items-center justify-center gap-2 rounded-lg relative z-10">
                        <Play size={16} fill="currentColor" /> Enter The Grid
                    </button>
                </div>

                {/* EXPERT: Coming Soon */}
                <div className="bg-gray-50 border border-gray-200 p-6 rounded-xl flex flex-col relative overflow-hidden opacity-80">
                    <div className="absolute -right-4 -bottom-4 opacity-5"><Lock size={140} /></div>
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-xl text-gray-400 font-bold">Classified</h3>
                        <span className="text-[10px] font-bold px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200">EXPERT (3.0x)</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-6 leading-relaxed flex-1">
                        This module is currently being finalized by the development team. Check back later in the event!
                    </p>
                    <button disabled className="w-full py-3 bg-gray-200 text-gray-400 text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2 rounded-lg relative z-10">
                        <Lock size={16}/> Locked
                    </button>
                </div>

            </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}

// --- GAME: NUMBER CONNECT ---
const CONNECT_LEVELS = [
    { size: 4, seq: [ {r:0, c:0, val:1}, {r:2, c:1, val:2}, {r:3, c:2, val:3}, {r:0, c:3, val:4} ] },
    { size: 5, seq: [ {r:0, c:0, val:1}, {r:1, c:2, val:2}, {r:3, c:1, val:3}, {r:3, c:3, val:4}, {r:0, c:4, val:5} ] },
    { size: 5, seq: [ {r:2, c:2, val:1}, {r:0, c:0, val:2}, {r:4, c:0, val:3}, {r:4, c:4, val:4}, {r:0, c:4, val:5} ] },
    { size: 6, seq: [ {r:0, c:0, val:1}, {r:1, c:3, val:2}, {r:3, c:2, val:3}, {r:5, c:1, val:4}, {r:4, c:4, val:5}, {r:2, c:5, val:6} ] },
    { size: 6, seq: [ {r:5, c:0, val:1}, {r:3, c:0, val:2}, {r:0, c:2, val:3}, {r:2, c:4, val:4}, {r:0, c:5, val:5}, {r:5, c:5, val:6} ] },
];

function NumberConnectGame({ difficulty, onComplete }) {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameState, setGameState] = useState('playing'); 
  const [levelIndex, setLevelIndex] = useState(0);
  const [path, setPath] = useState([]);
  const [targetNumber, setTargetNumber] = useState(2);
  const [isDragging, setIsDragging] = useState(false);
  const [flash, setFlash] = useState(false);
  
  useEffect(() => {
      if (gameState !== 'playing') return;
      const timer = setInterval(() => {
          setTimeLeft(prev => {
              if (prev <= 1) {
                  setGameState('gameover');
                  clearInterval(timer);
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);
      return () => clearInterval(timer);
  }, [gameState]);

  const currentLevel = CONNECT_LEVELS[levelIndex % CONNECT_LEVELS.length];
  const { size, seq } = currentLevel;
  const maxVal = seq.length;

  const getNumberAt = (r, c) => {
      const num = seq.find(s => s.r === r && s.c === c);
      return num ? num.val : null;
  };

  const handleStart = (r, c) => {
      if (gameState !== 'playing') return;
      const idx = path.findIndex(p => p.r === r && p.c === c);
      if (idx !== -1) {
          const newPath = path.slice(0, idx + 1);
          setPath(newPath);
          let newTarget = 2;
          newPath.forEach(p => {
              const val = getNumberAt(p.r, p.c);
              if (val && val >= newTarget) newTarget = val + 1;
          });
          setTargetNumber(newTarget);
          setIsDragging(true);
      } else if (path.length === 0 && getNumberAt(r, c) === 1) {
          setPath([{r, c}]);
          setIsDragging(true);
      }
  };

  const handleMove = (r, c) => {
      if (!isDragging || gameState !== 'playing') return;
      const last = path[path.length - 1];
      if (!last) return;
      if (last.r === r && last.c === c) return;

      const isAdj = Math.abs(last.r - r) + Math.abs(last.c - c) === 1;
      if (!isAdj) return;

      if (path.length > 1) {
          const prev = path[path.length - 2];
          if (prev.r === r && prev.c === c) {
              const newPath = path.slice(0, -1);
              setPath(newPath);
              const removedVal = getNumberAt(last.r, last.c);
              if (removedVal && removedVal === targetNumber - 1) {
                  setTargetNumber(targetNumber - 1);
              }
              return;
          }
      }

      if (path.some(p => p.r === r && p.c === c)) return;

      const val = getNumberAt(r, c);
      if (val !== null) {
          if (val === targetNumber) {
              const newPath = [...path, {r, c}];
              setPath(newPath);
              setTargetNumber(targetNumber + 1);
              
              if (targetNumber === maxVal) {
                  setIsDragging(false);
                  setFlash(true);
                  setScore(s => s + (size * 10)); 
                  setTimeout(() => {
                      setFlash(false);
                      setLevelIndex(i => i + 1);
                      setPath([]);
                      setTargetNumber(2);
                  }, 600);
              }
          }
      } else {
          setPath([...path, {r, c}]);
      }
  };

  const handleEnd = () => setIsDragging(false);

  const onTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      if (elem && elem.dataset.row) {
          handleMove(parseInt(elem.dataset.row), parseInt(elem.dataset.col));
      }
  };

  const gridCells = [];
  for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
          const val = getNumberAt(r, c);
          const inPath = path.some(p => p.r === r && p.c === c);
          const isHead = path.length > 0 && path[path.length-1].r === r && path[path.length-1].c === c;
          
          gridCells.push(
              <div 
                  key={`${r}-${c}`}
                  data-row={r} data-col={c}
                  onMouseDown={() => handleStart(r, c)}
                  onMouseEnter={() => handleMove(r, c)}
                  className={`relative flex items-center justify-center rounded-lg select-none transition-all duration-150 cursor-pointer
                      ${val ? 'bg-[#0d8199] text-white font-bold text-xl md:text-3xl shadow-sm' 
                            : inPath ? 'bg-[#38b5cf] shadow-inner scale-95 border border-[#0d8199]/50' 
                            : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'}
                      ${isHead ? 'ring-4 ring-[#0d8199] ring-offset-2 z-20 scale-105 shadow-lg' : ''}
                  `}
                  style={{ touchAction: 'none' }}
              >
                  {val && <span className="z-10 pointer-events-none">{val}</span>}
                  {!val && inPath && <div className="w-2.5 h-2.5 bg-white rounded-full opacity-90 pointer-events-none" />}
              </div>
          );
      }
  }

  const getCoord = (idx) => `${(idx + 0.5) * (100 / size)}%`;
  const points = path.map(p => `${getCoord(p.c)},${getCoord(p.r)}`).join(' ');

  return (
      <div 
          className="flex-1 flex flex-col bg-white relative items-center justify-center p-4 overflow-hidden select-none"
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchEnd={handleEnd}
          onTouchMove={onTouchMove}
      >
          <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between w-full border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm z-10">
              <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Points</p><p className="text-2xl md:text-4xl text-[#0d8199] font-black">{score}</p></div>
              <div className="text-center"><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Level</p><p className="text-xl md:text-2xl text-gray-700 font-bold">{levelIndex + 1}</p></div>
              <div className="text-right"><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Time Left</p><p className={`text-2xl md:text-4xl font-black ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-[#38b5cf]'}`}>{timeLeft}s</p></div>
          </div>

          <div 
              className={`relative w-full max-w-lg aspect-square bg-white border border-gray-200 rounded-2xl p-2 md:p-4 grid gap-2 md:gap-3 shadow-md mt-16
                  ${flash ? 'ring-4 ring-green-400 bg-green-50 transition-all duration-300' : ''}
              `}
              style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, touchAction: 'none' }}
          >
              {gridCells}
              <svg className="absolute inset-0 w-full h-full pointer-events-none p-2 md:p-4" style={{ overflow: 'visible' }}>
                  <polyline points={points} fill="none" stroke="#0d8199" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md opacity-90" />
              </svg>
          </div>

          {gameState === 'gameover' && (
              <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center z-30 backdrop-blur-sm p-4 text-center">
                  <Trophy size={64} className="text-yellow-500 mb-4" />
                  <h2 className="text-4xl md:text-5xl text-[#0d8199] font-bold mb-2">Time's Up!</h2>
                  <p className="text-gray-600 mb-6">You reached Level {levelIndex + 1}</p>
                  
                  <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-8 w-full max-w-sm">
                      <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Base Score</p>
                      <p className="text-3xl text-gray-800 font-bold mb-4">{score}</p>
                      <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Final Yield (1.0x)</p>
                      <p className="text-4xl text-[#38b5cf] font-black">{score}</p>
                  </div>
                  
                  <button onClick={() => onComplete(score)} className="px-8 py-4 bg-[#0d8199] hover:bg-[#0a667a] text-white rounded-full font-bold transition-all shadow-md flex items-center gap-2">
                      Submit & Return <ChevronRight size={20} />
                  </button>
              </div>
          )}
      </div>
  );
}

// --- GAME: NEON HEIST (VAMPIRE SURVIVORS CLONE) ---
function NeonHeistGame({ difficulty, onComplete }) {
    const canvasRef = useRef(null);
    const [gameState, setGameState] = useState('playing'); // playing, leveling, gameover
    const [score, setScore] = useState(0);
    const [levelOptions, setLevelOptions] = useState([]);
    
    // Core game state stored in ref to avoid react re-renders in the hot loop
    const state = useRef({
        player: { x: 0, y: 0, radius: 15, speed: 4, maxHp: 100, hp: 100 },
        keys: { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false },
        targetPointer: null, // For touch/mouse drag movement
        enemies: [],
        projectiles: [],
        drops: [],
        camera: { x: 0, y: 0 },
        stats: { score: 0, level: 1, cash: 0, nextLevelCash: 10 },
        weapons: {
            fireRate: 60, // frames between shots
            lastShot: 0,
            piercing: 1, // how many enemies a bullet can hit
            bulletSpeed: 8,
            auraRadius: 0 // 0 means no aura
        },
        spawnRate: 40,
        frameCount: 0,
        width: 0,
        height: 0
    });

    const UPGRADE_POOL = [
        { id: 'fireRate', name: 'Rapid Fire', desc: 'Shoot projectiles much faster.', apply: (s) => s.weapons.fireRate = Math.max(10, s.weapons.fireRate - 15) },
        { id: 'piercing', name: 'Armor Piercing', desc: 'Bullets penetrate through multiple enemies.', apply: (s) => s.weapons.piercing += 1 },
        { id: 'aura', name: 'Taser Aura', desc: 'A permanent electric field that damages nearby foes.', apply: (s) => s.weapons.auraRadius += 40 },
        { id: 'speed', name: 'Neon Sneakers', desc: 'Increase your movement speed.', apply: (s) => s.player.speed += 1.5 },
        { id: 'heal', name: 'Medkit', desc: 'Restore 50% of your maximum health.', apply: (s) => s.player.hp = Math.min(s.player.maxHp, s.player.hp + 50) }
    ];

    // Engine initialization and loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationId;

        const resize = () => {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
            state.current.width = canvas.width;
            state.current.height = canvas.height;
        };
        window.addEventListener('resize', resize);
        resize();

        // Input handling
        const handleKeyDown = (e) => { if(state.current.keys.hasOwnProperty(e.key)) state.current.keys[e.key] = true; };
        const handleKeyUp = (e) => { if(state.current.keys.hasOwnProperty(e.key)) state.current.keys[e.key] = false; };
        
        const updatePointer = (e) => {
            const rect = canvas.getBoundingClientRect();
            let clientX = e.clientX;
            let clientY = e.clientY;
            if(e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }
            state.current.targetPointer = {
                x: clientX - rect.left + state.current.camera.x,
                y: clientY - rect.top + state.current.camera.y
            };
        };
        
        const clearPointer = () => state.current.targetPointer = null;

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('mousedown', updatePointer);
        canvas.addEventListener('mousemove', (e) => { if (e.buttons > 0) updatePointer(e); });
        canvas.addEventListener('mouseup', clearPointer);
        canvas.addEventListener('touchstart', updatePointer, {passive: true});
        canvas.addEventListener('touchmove', updatePointer, {passive: true});
        canvas.addEventListener('touchend', clearPointer);

        const loop = () => {
            if (gameState === 'playing') {
                update(state.current);
                draw(ctx, state.current);
            }
            animationId = requestAnimationFrame(loop);
        };
        animationId = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if(canvas) {
                canvas.removeEventListener('mousedown', updatePointer);
                canvas.removeEventListener('mousemove', updatePointer);
                canvas.removeEventListener('mouseup', clearPointer);
                canvas.removeEventListener('touchstart', updatePointer);
                canvas.removeEventListener('touchmove', updatePointer);
                canvas.removeEventListener('touchend', clearPointer);
            }
        };
    }, [gameState]);

    const update = (s) => {
        s.frameCount++;
        
        // 1. Move Player
        let vx = 0, vy = 0;
        if (s.keys.w || s.keys.ArrowUp) vy -= 1;
        if (s.keys.s || s.keys.ArrowDown) vy += 1;
        if (s.keys.a || s.keys.ArrowLeft) vx -= 1;
        if (s.keys.d || s.keys.ArrowRight) vx += 1;

        if (vx !== 0 || vy !== 0) {
            // Keyboard move
            const len = Math.hypot(vx, vy);
            s.player.x += (vx / len) * s.player.speed;
            s.player.y += (vy / len) * s.player.speed;
            s.targetPointer = null; // override pointer if using keys
        } else if (s.targetPointer) {
            // Pointer move (Touch/Mouse)
            const dx = s.targetPointer.x - s.player.x;
            const dy = s.targetPointer.y - s.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > s.player.speed) {
                s.player.x += (dx / dist) * s.player.speed;
                s.player.y += (dy / dist) * s.player.speed;
            }
        }

        // Keep player in bounds (a large virtual arena)
        const arenaSize = 3000;
        s.player.x = Math.max(-arenaSize, Math.min(arenaSize, s.player.x));
        s.player.y = Math.max(-arenaSize, Math.min(arenaSize, s.player.y));

        // Update Camera
        s.camera.x = s.player.x - s.width / 2;
        s.camera.y = s.player.y - s.height / 2;

        // 2. Spawn Enemies
        // Difficulty scaling over time
        if (s.frameCount % 600 === 0 && s.spawnRate > 10) s.spawnRate -= 5; 
        
        if (s.frameCount % s.spawnRate === 0) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.max(s.width, s.height) * 0.7; // spawn just offscreen
            s.enemies.push({
                x: s.player.x + Math.cos(angle) * dist,
                y: s.player.y + Math.sin(angle) * dist,
                hp: 1 + Math.floor(s.frameCount / 1000), // scale hp over time
                speed: 1.5 + Math.random(),
                radius: 12
            });
        }

        // 3. Move Enemies & Check Player Collision
        for (let i = s.enemies.length - 1; i >= 0; i--) {
            const e = s.enemies[i];
            const dx = s.player.x - e.x;
            const dy = s.player.y - e.y;
            const dist = Math.hypot(dx, dy);
            
            // Move toward player
            e.x += (dx / dist) * e.speed;
            e.y += (dy / dist) * e.speed;

            // Damage player
            if (dist < s.player.radius + e.radius) {
                s.player.hp -= 0.5;
                if (s.player.hp <= 0) {
                    setScore(s.stats.score);
                    setGameState('gameover');
                    return;
                }
            }
            
            // Aura Damage
            if (s.weapons.auraRadius > 0 && dist < s.weapons.auraRadius) {
                e.hp -= 0.2; // Continuous damage
                if(e.hp <= 0) dropCash(s, e, i);
            }
        }

        // 4. Auto-Shoot Projectiles
        if (s.frameCount - s.weapons.lastShot > s.weapons.fireRate && s.enemies.length > 0) {
            // Find closest enemy
            let closest = null;
            let minDist = Infinity;
            s.enemies.forEach(e => {
                const dist = Math.hypot(s.player.x - e.x, s.player.y - e.y);
                if(dist < minDist) { minDist = dist; closest = e; }
            });

            if (closest) {
                const dx = closest.x - s.player.x;
                const dy = closest.y - s.player.y;
                const dist = Math.hypot(dx, dy);
                s.projectiles.push({
                    x: s.player.x,
                    y: s.player.y,
                    vx: (dx / dist) * s.weapons.bulletSpeed,
                    vy: (dy / dist) * s.weapons.bulletSpeed,
                    pierceLeft: s.weapons.piercing,
                    life: 100 // frames before disappearing
                });
                s.weapons.lastShot = s.frameCount;
            }
        }

        // 5. Update Projectiles & Check Hits
        for (let i = s.projectiles.length - 1; i >= 0; i--) {
            const p = s.projectiles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            
            if (p.life <= 0) {
                s.projectiles.splice(i, 1);
                continue;
            }

            // Collision with enemies
            for (let j = s.enemies.length - 1; j >= 0; j--) {
                const e = s.enemies[j];
                if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius + 5) {
                    e.hp -= 2; // Bullet damage
                    p.pierceLeft--;
                    if (e.hp <= 0) dropCash(s, e, j);
                    if (p.pierceLeft <= 0) {
                        s.projectiles.splice(i, 1);
                        break;
                    }
                }
            }
        }

        // 6. Update Cash Drops (Magnet effect if close)
        const magnetRadius = 80;
        for (let i = s.drops.length - 1; i >= 0; i--) {
            const drop = s.drops[i];
            const dist = Math.hypot(s.player.x - drop.x, s.player.y - drop.y);
            if (dist < s.player.radius + 10) {
                // Collect
                s.drops.splice(i, 1);
                s.stats.cash++;
                s.stats.score += 5;
                setScore(s.stats.score);
                
                // Trigger Level Up
                if (s.stats.cash >= s.stats.nextLevelCash) {
                    s.stats.cash = 0;
                    s.stats.nextLevelCash = Math.floor(s.stats.nextLevelCash * 1.5);
                    s.stats.level++;
                    
                    // Pick 3 random upgrades
                    const shuffled = [...UPGRADE_POOL].sort(() => 0.5 - Math.random());
                    setLevelOptions(shuffled.slice(0, 3));
                    setGameState('leveling');
                }
            } else if (dist < magnetRadius) {
                // Pull towards player
                drop.x += (s.player.x - drop.x) * 0.1;
                drop.y += (s.player.y - drop.y) * 0.1;
            }
        }
    };

    const dropCash = (s, enemy, index) => {
        s.enemies.splice(index, 1);
        // 30% chance to drop cash
        if (Math.random() < 0.3) {
            s.drops.push({ x: enemy.x, y: enemy.y });
        }
    };

    const draw = (ctx, s) => {
        // Clear background
        ctx.fillStyle = '#0f172a'; // Slate-900
        ctx.fillRect(0, 0, s.width, s.height);

        ctx.save();
        ctx.translate(-s.camera.x, -s.camera.y);

        // Draw Grid for movement reference
        ctx.strokeStyle = '#1e293b'; // Slate-800
        ctx.lineWidth = 1;
        const gridSize = 100;
        const startX = Math.floor(s.camera.x / gridSize) * gridSize;
        const startY = Math.floor(s.camera.y / gridSize) * gridSize;
        
        ctx.beginPath();
        for (let x = startX; x < s.camera.x + s.width; x += gridSize) {
            ctx.moveTo(x, s.camera.y); ctx.lineTo(x, s.camera.y + s.height);
        }
        for (let y = startY; y < s.camera.y + s.height; y += gridSize) {
            ctx.moveTo(s.camera.x, y); ctx.lineTo(s.camera.x + s.width, y);
        }
        ctx.stroke();

        // Draw Arena Bounds
        ctx.strokeStyle = '#ec4899'; // Pink-500
        ctx.lineWidth = 4;
        ctx.strokeRect(-3000, -3000, 6000, 6000);

        // Draw Cash Drops
        ctx.fillStyle = '#10b981'; // Emerald-500
        s.drops.forEach(d => {
            ctx.beginPath();
            ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Taser Aura
        if (s.weapons.auraRadius > 0) {
            ctx.strokeStyle = `rgba(56, 181, 207, ${0.2 + Math.sin(s.frameCount * 0.1) * 0.1})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(s.player.x, s.player.y, s.weapons.auraRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(56, 181, 207, 0.05)`;
            ctx.fill();
        }

        // Draw Projectiles
        ctx.fillStyle = '#fde047'; // Yellow-300
        s.projectiles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Enemies
        ctx.fillStyle = '#ef4444'; // Red-500
        s.enemies.forEach(e => {
            ctx.save();
            ctx.translate(e.x, e.y);
            // Point towards player
            const angle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
            ctx.rotate(angle);
            ctx.fillRect(-e.radius, -e.radius, e.radius*2, e.radius*2);
            ctx.restore();
        });

        // Draw Player
        ctx.fillStyle = '#38b5cf'; // Decos Cyan
        ctx.beginPath();
        ctx.arc(s.player.x, s.player.y, s.player.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Player HP Bar
        const hpPercent = Math.max(0, s.player.hp / s.player.maxHp);
        ctx.fillStyle = '#ef4444'; // Red background
        ctx.fillRect(s.player.x - 15, s.player.y + 20, 30, 4);
        ctx.fillStyle = '#10b981'; // Green fill
        ctx.fillRect(s.player.x - 15, s.player.y + 20, 30 * hpPercent, 4);

        ctx.restore();
    };

    const handleUpgradeSelect = (upgrade) => {
        upgrade.apply(state.current);
        setGameState('playing');
    };

    return (
        <div className="flex-1 flex flex-col bg-[#0f172a] relative items-center justify-center overflow-hidden w-full h-full">
            {/* UI Overlay */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between w-full z-10 pointer-events-none">
                <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Level {state.current.stats.level}</p>
                    <p className="text-2xl text-pink-500 font-black">Score: {score}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cash to Next Level</p>
                    <div className="w-32 h-3 bg-slate-800 rounded-full mt-1 border border-slate-700 overflow-hidden">
                        <div 
                            className="h-full bg-emerald-500 transition-all duration-300" 
                            style={{ width: `${(state.current.stats.cash / state.current.stats.nextLevelCash) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* The Game Canvas */}
            <canvas 
                ref={canvasRef} 
                className="w-full h-full block cursor-crosshair touch-none"
            />

            {/* Level Up Modal */}
            {gameState === 'leveling' && (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-30 backdrop-blur-sm p-4 text-center">
                    <h2 className="text-3xl md:text-5xl text-emerald-400 font-black mb-8 animate-pulse">LEVEL UP!</h2>
                    <div className="flex flex-col gap-4 w-full max-w-md">
                        {levelOptions.map((opt, i) => (
                            <button 
                                key={i}
                                onClick={() => handleUpgradeSelect(opt)}
                                className="bg-slate-800 border border-slate-600 hover:border-pink-500 hover:bg-slate-700 p-4 rounded-xl text-left transition-all group shadow-lg"
                            >
                                <h3 className="text-xl text-white font-bold group-hover:text-pink-400">{opt.name}</h3>
                                <p className="text-sm text-slate-400 mt-1">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Game Over Modal */}
            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center z-40 backdrop-blur-md p-4 text-center">
                    <Skull size={64} className="text-pink-500 mb-4" />
                    <h2 className="text-4xl md:text-5xl text-white font-black mb-2 uppercase tracking-tight">Wasted</h2>
                    <p className="text-slate-400 mb-8">The swarm finally caught you.</p>
                    
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8 w-full max-w-sm">
                        <p className="text-sm text-slate-500 uppercase tracking-wide mb-1">Base Survival Score</p>
                        <p className="text-3xl text-white font-bold mb-4">{score}</p>
                        <p className="text-sm text-slate-500 uppercase tracking-wide mb-1">Hard Yield (2.0x)</p>
                        <p className="text-4xl text-pink-500 font-black drop-shadow-[0_0_10px_rgba(236,72,153,0.8)]">{score * 2}</p>
                    </div>
                    
                    <button onClick={() => onComplete(score)} className="px-8 py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-full font-bold transition-all shadow-lg flex items-center gap-2">
                        Submit Score & Return <ChevronRight size={20} />
                    </button>
                </div>
            )}
            
            {/* Mobile instructions overlay (fades out) */}
            {gameState === 'playing' && score === 0 && (
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-slate-500 text-sm animate-pulse pointer-events-none text-center bg-slate-900/50 px-4 py-2 rounded-full backdrop-blur-sm">
                    WASD / Arrows to Move <br/> Or Touch & Drag
                </div>
            )}
        </div>
    );
}
