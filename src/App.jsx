import React, { useState, useEffect, useRef } from 'react';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { Terminal, Trophy, Gamepad2, Skull, Zap, ChevronRight, LogOut, Activity, Lock, User, Mail, AlertTriangle } from 'lucide-react';

// --- SUPABASE INITIALIZATION ---
// In a real Vite app, these would come from import.meta.env
// For this preview, you will need to replace these strings with your actual Supabase project keys
const SUPABASE_URL = typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL ? process.env.VITE_SUPABASE_URL : 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY ? process.env.VITE_SUPABASE_ANON_KEY : 'YOUR_SUPABASE_ANON_KEY';

let supabase = null;
const isSupabaseConfigured = SUPABASE_URL !== 'https://tvmcijxurcmsrwjqtupu.supabase.co' && SUPABASE_ANON_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bWNpanh1cmNtc3J3anF0dXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzYwNDksImV4cCI6MjA5NjkxMjA0OX0.38aHoxMhBExtXgg8CYAGSTpBX9BVj3PQx26FCW64RuE';

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
  const [difficulty, setDifficulty] = useState('medium');

  // 1. Mandatory Auth Initialization
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
        setIsAuthChecking(false);
        return;
    }

    // Check active sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthChecking(false);
    });

    // Listen for auth changes
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
            const me = data.find(row => row.id === user.id);
            if (me) {
                setUserProfile(me);
                if (currentView === 'auth') setCurrentView('dashboard');
            } else {
                setUserProfile(null);
                setCurrentView('auth');
            }
        } else if (error) {
            console.error("Error fetching leaderboard:", error);
        }
    };

    fetchLeaderboard();

    // Subscribe to realtime changes on the leaderboard table
    const channel = supabase
      .channel('public:leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, payload => {
          fetchLeaderboard(); // Re-fetch on any change to keep it simple and sorted
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
            if (data?.user) {
                // Create user profile in leaderboard
                const finalAlias = alias.trim() || 'Anon_Hacker';
                const { error: insertError } = await supabase
                    .from('leaderboard')
                    .insert([{ id: data.user.id, alias: finalAlias, score: 0 }]);
                    
                if (insertError) throw insertError;
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

  // Game Action
  const handleGameComplete = async (earnedScore) => {
    if (!user || !supabase || !userProfile) {
        setCurrentView('dashboard');
        return;
    }
    
    const diffMultipliers = { easy: 1, medium: 1.5, hard: 2 };
    const multiplier = diffMultipliers[difficulty] || 1;
    const finalScore = Math.floor(earnedScore * multiplier);

    if (finalScore > 0) {
        const newTotal = (userProfile.score || 0) + finalScore;
        const { error } = await supabase
            .from('leaderboard')
            .update({ score: newTotal })
            .eq('id', user.id);
            
        if (error) console.error("Error saving score:", error);
    }
    
    setCurrentView('dashboard');
  };

  if (!isSupabaseConfigured) {
      return (
          <div className="h-screen w-screen bg-[#0b0c10] flex flex-col items-center justify-center text-cyan-400 font-mono text-center p-8">
              <AlertTriangle size={64} className="text-yellow-500 mb-6" />
              <h1 className="text-2xl font-bold mb-4">SUPABASE CONFIGURATION REQUIRED</h1>
              <p className="text-gray-400 max-w-lg mb-4 text-sm leading-relaxed">
                  The application is waiting for valid Supabase credentials. You must provide `SUPABASE_URL` and `SUPABASE_ANON_KEY` to connect to the backend.
              </p>
              <p className="text-gray-500 text-xs">Check the Deployment Guide for instructions.</p>
          </div>
      );
  }

  if (isAuthChecking) {
    return <div className="h-screen w-screen bg-[#0b0c10] flex items-center justify-center text-cyan-400 font-mono animate-pulse">INITIALIZING SECURE CONNECTION...</div>;
  }

  return (
    <div className="h-screen w-screen bg-[#0b0c10] text-gray-300 font-mono overflow-hidden selection:bg-cyan-900">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{
          backgroundImage: 'linear-gradient(rgba(0, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.2) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
      }}></div>

      <div className="relative z-10 h-full w-full max-w-6xl mx-auto flex flex-col">
        {currentView === 'auth' && <AuthView onSubmit={handleAuthSubmit} />}
        
        {currentView === 'dashboard' && userProfile && (
          <DashboardView 
            profile={userProfile} 
            leaderboard={leaderboard} 
            userId={user?.id}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onLaunch={(game) => setCurrentView(game)}
            onLogout={handleLogout}
          />
        )}

        {currentView === 'game-bug' && <BugSquasherGame difficulty={difficulty} onComplete={handleGameComplete} />}
        {currentView === 'game-node' && <NodeDecryptorGame difficulty={difficulty} onComplete={handleGameComplete} />}
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
    <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-y-auto">
      <div className="bg-gray-950/90 border border-cyan-800 p-8 w-full max-w-md shadow-[0_0_40px_rgba(0,255,255,0.15)] backdrop-blur-xl relative z-10 my-8">
        <div className="flex items-center justify-center mb-6 text-cyan-400">
          <Terminal size={48} className={loading ? "animate-spin" : "animate-pulse"} />
        </div>
        <h1 className="text-2xl text-center text-cyan-300 mb-2 font-bold tracking-widest text-shadow-neon">
            {mode === 'login' ? 'SYSTEM_LOGIN' : 'SECURE_REGISTRATION'}
        </h1>
        <p className="text-center text-xs text-gray-500 mb-8">
            {mode === 'login' ? 'AUTHENTICATE VIA SUPABASE' : 'CREATE A NEW AGENT PROFILE'}
        </p>
        
        {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-400 text-xs p-3 mb-6 flex items-center gap-2">
                <AlertTriangle size={16} /> {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'register' && (
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-700" />
              <input 
                type="text" 
                maxLength="15"
                value={alias}
                onChange={(e) => setAlias(e.target.value.toUpperCase())}
                placeholder="HACKER_ALIAS"
                className="w-full bg-black/50 border border-cyan-900 text-cyan-300 pl-10 pr-4 py-3 focus:outline-none focus:border-cyan-400 transition-colors placeholder:text-gray-700"
                required
              />
            </div>
          )}
          
          <div className="relative">
            <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-700" />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="AGENT_EMAIL@DOMAIN.COM"
              className="w-full bg-black/50 border border-cyan-900 text-cyan-300 pl-10 pr-4 py-3 focus:outline-none focus:border-cyan-400 transition-colors placeholder:text-gray-700"
              required
            />
          </div>

          <div className="relative">
            <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-700" />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SECURE_PASSWORD"
              className="w-full bg-black/50 border border-cyan-900 text-cyan-300 pl-10 pr-4 py-3 focus:outline-none focus:border-cyan-400 transition-colors placeholder:text-gray-700"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-4 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500 text-cyan-100 font-bold tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'PROCESSING...' : (mode === 'login' ? 'INITIALIZE' : 'REGISTER')} <ChevronRight size={20} />
          </button>
        </form>

        <div className="mt-8 text-center text-xs">
            <span className="text-gray-600">
                {mode === 'login' ? "DON'T HAVE AN ACCOUNT?" : "ALREADY REGISTERED?"} 
            </span>
            <button 
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                className="ml-2 text-cyan-400 hover:text-cyan-200 underline decoration-cyan-900 underline-offset-4 transition-colors"
            >
                {mode === 'login' ? 'REGISTER NOW' : 'LOGIN HERE'}
            </button>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .text-shadow-neon { text-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }
      `}} />
    </div>
  );
}

function DashboardView({ profile, leaderboard, userId, difficulty, setDifficulty, onLaunch, onLogout }) {
  const diffMultiplier = { easy: '1.0x', medium: '1.5x', hard: '2.0x' };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
      <header className="flex justify-between items-end border-b border-cyan-900/50 pb-4 mb-6 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-cyan-400 flex items-center gap-3 text-shadow-neon">
            <Activity className="animate-pulse" /> CYBER_GRID
          </h1>
          <p className="text-xs text-gray-500 mt-1">GLOBAL SUPABASE DASHBOARD</p>
        </div>
        <div className="text-right flex items-center gap-4">
            <div className="hidden md:block text-right">
                <p className="text-[10px] text-cyan-700">CURRENT ALIAS</p>
                <p className="text-md text-cyan-200 font-bold tracking-wider">{profile.alias}</p>
            </div>
            <button onClick={onLogout} title="Disconnect" className="text-gray-500 hover:text-red-400 p-2 border border-transparent hover:border-red-900/50 bg-black/20 transition-all rounded">
                <LogOut size={20} />
            </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        <div className="flex flex-col gap-6 lg:col-span-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
          <div className="bg-gray-900/60 border border-cyan-900 p-6 shadow-[0_0_15px_rgba(0,255,255,0.05)] rounded relative overflow-hidden shrink-0">
             <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={64} /></div>
             <p className="text-sm text-cyan-500 mb-2 font-bold">TOTAL REPUTATION</p>
             <p className="text-5xl text-yellow-400 font-bold drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
               {profile.score || 0}
             </p>
             <p className="text-[10px] text-gray-500 mt-4 leading-relaxed">
               Points persist securely to Supabase.
             </p>
          </div>

          <div className="bg-gray-900/60 border border-cyan-900 p-6 shadow-[0_0_15px_rgba(0,255,255,0.05)] rounded shrink-0">
             <p className="text-sm text-cyan-500 mb-4 font-bold flex items-center gap-2"><Zap size={16}/> SYSTEM DIFFICULTY</p>
             <div className="space-y-3">
               {['easy', 'medium', 'hard'].map(level => (
                 <button 
                    key={level}
                    onClick={() => setDifficulty(level)}
                    className={`w-full flex justify-between items-center px-4 py-3 border transition-all
                      ${difficulty === level 
                        ? 'bg-cyan-900/40 border-cyan-400 text-cyan-100 shadow-[0_0_10px_rgba(0,255,255,0.3)]' 
                        : 'bg-black/40 border-gray-800 text-gray-500 hover:border-cyan-800 hover:text-gray-300'}`}
                 >
                   <span className="uppercase">{level}</span>
                   <span className="text-xs">PTS: {diffMultiplier[level]}</span>
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-1 overflow-y-auto custom-scrollbar pr-2 pb-4 relative">
            <h2 className="text-sm text-cyan-500 font-bold flex items-center gap-2 sticky top-0 bg-[#0b0c10] z-10 py-2 border-b border-cyan-900/50 mb-2"><Gamepad2 size={16}/> AVAILABLE MODULES</h2>
            
            <div className="bg-black border border-cyan-800/50 hover:border-cyan-400 p-5 group transition-all cursor-pointer relative overflow-hidden shrink-0" onClick={() => onLaunch('game-bug')}>
                <div className="absolute right-0 bottom-0 opacity-5 group-hover:opacity-20 transition-opacity transform group-hover:scale-110"><Skull size={120} color="#ff003c" /></div>
                <h3 className="text-xl text-red-400 font-bold mb-2">BUG SQUASHER</h3>
                <p className="text-xs text-gray-400 mb-6 leading-relaxed relative z-10">
                    Eradicate system bugs popping up across the server cluster. Avoid terminating vital features.
                </p>
                <div className="flex justify-between items-center text-[10px] border-t border-gray-800 pt-3 mt-auto relative z-10">
                    <span className="text-cyan-600 bg-cyan-950/50 px-2 py-1 rounded">2D TARGETING</span>
                    <button className="text-cyan-400 group-hover:text-white flex items-center gap-1 font-bold">LAUNCH <ChevronRight size={14}/></button>
                </div>
            </div>

            <div className="bg-black border border-cyan-800/50 hover:border-cyan-400 p-5 group transition-all cursor-pointer relative overflow-hidden shrink-0" onClick={() => onLaunch('game-node')}>
                <div className="absolute right-0 bottom-0 opacity-5 group-hover:opacity-20 transition-opacity transform group-hover:scale-110"><Activity size={120} color="#00ffcc" /></div>
                <h3 className="text-xl text-emerald-400 font-bold mb-2">NODE DECRYPTOR</h3>
                <p className="text-xs text-gray-400 mb-6 leading-relaxed relative z-10">
                    Rapidly isolate active green data nodes. Do not touch compromised red firewalls.
                </p>
                <div className="flex justify-between items-center text-[10px] border-t border-gray-800 pt-3 mt-auto relative z-10">
                    <span className="text-cyan-600 bg-cyan-950/50 px-2 py-1 rounded">REFLEX GRID</span>
                    <button className="text-cyan-400 group-hover:text-white flex items-center gap-1 font-bold">LAUNCH <ChevronRight size={14}/></button>
                </div>
            </div>
        </div>

        <div className="bg-gray-900/40 border border-cyan-900 flex flex-col lg:col-span-1 rounded overflow-hidden mb-4">
            <h2 className="text-sm text-cyan-500 font-bold bg-gray-900 p-4 border-b border-cyan-900 flex items-center justify-between shrink-0">
                <span>GLOBAL NETWORK</span>
                <Trophy size={16} className="text-yellow-500"/>
            </h2>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {leaderboard.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-600">SCANNING FOR AGENTS...</div>
                ) : (
                    leaderboard.map((entry, index) => {
                        const isMe = entry.id === userId;
                        return (
                            <div key={entry.id} className={`flex items-center justify-between p-3 rounded text-sm transition-colors ${isMe ? 'bg-cyan-900/40 border border-cyan-700 text-white shadow-[0_0_10px_rgba(0,255,255,0.1)]' : 'bg-black/20 hover:bg-gray-800/50 text-gray-400 border border-transparent'}`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className={`w-6 text-center text-[10px] font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-600'}`}>
                                        {index < 3 ? `0${index + 1}` : index + 1}
                                    </span>
                                    <span className="truncate font-bold tracking-wider">{entry.alias}</span>
                                </div>
                                <span className={`font-mono ${isMe ? 'text-yellow-400' : 'text-cyan-500'}`}>
                                    {entry.score || 0}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .text-shadow-neon { text-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #164e63; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #0891b2; }
      `}} />
    </div>
  );
}

// --- GAME 1: BUG SQUASHER (CANVAS) ---
function BugSquasherGame({ difficulty, onComplete }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameState, setGameState] = useState('playing'); 

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const speedMult = difficulty === 'hard' ? 1.5 : (difficulty === 'medium' ? 1 : 0.7);
    const GRID_COLS = 3, GRID_ROWS = 3;
    const ENTITY_DURATION = 800 / speedMult;
    let MIN_SPAWN = 800 / speedMult, MAX_SPAWN = 1600 / speedMult;
    
    let isRunning = true;
    let localScore = 0;
    let timeRemaining = 30000;
    let lastTime = performance.now();
    let timeSinceLastSpawn = 0;
    let currentSpawnInterval = 1000;
    
    let cellSize = 0, gridOffsetX = 0, gridOffsetY = 0;
    let laptops = [], floatingTexts = [];

    class Laptop {
        constructor(col, row) {
            this.col = col; this.row = row;
            this.x = 0; this.y = 0; this.width = 0; this.height = 0;
            this.entityType = null; this.entityTimer = 0;
            this.state = 'idle'; this.yOffset = 0; 
        }
        updateLayout(size, offsetX, offsetY) {
            this.width = size * 0.8; this.height = size * 0.7;
            this.x = offsetX + this.col * size + (size - this.width) / 2;
            this.y = offsetY + this.row * size + (size - this.height) / 2;
        }
        spawn(type) {
            this.entityType = type; this.state = 'rising';
            this.entityTimer = 0; this.yOffset = this.height;
        }
        hit() {
            if (this.state === 'rising' || this.state === 'active') {
                this.state = 'falling'; return this.entityType;
            }
            return null;
        }
        update(dt) {
            if (this.state === 'idle') return;
            const speed = (this.height / 100) * dt * speedMult;
            if (this.state === 'rising') {
                this.yOffset -= speed;
                if (this.yOffset <= 0) { this.yOffset = 0; this.state = 'active'; }
            } else if (this.state === 'active') {
                this.entityTimer += dt;
                if (this.entityTimer >= ENTITY_DURATION) this.state = 'falling';
            } else if (this.state === 'falling') {
                this.yOffset += speed;
                if (this.yOffset >= this.height) {
                    this.yOffset = this.height; this.state = 'idle'; this.entityType = null;
                }
            }
        }
        draw(ctx) {
            const w = this.width, h = this.height * 0.75;
            ctx.fillStyle = '#1e293b'; ctx.fillRect(this.x, this.y, w, h);
            ctx.fillStyle = '#0a0f1c'; ctx.fillRect(this.x + 3, this.y + 3, w - 6, h - 6);
            ctx.fillStyle = '#334155';
            ctx.beginPath(); ctx.moveTo(this.x, this.y + h); ctx.lineTo(this.x + w, this.y + h);
            ctx.lineTo(this.x + w + 10, this.y + this.height); ctx.lineTo(this.x - 10, this.y + this.height); ctx.fill();

            if (this.state !== 'idle' && this.entityType) {
                ctx.save();
                ctx.beginPath(); ctx.rect(this.x + 3, this.y + 3, w - 6, h - 6); ctx.clip();
                const cx = this.x + w / 2, cy = this.y + h / 2 + this.yOffset + (h * 0.1);
                const size = Math.min(w, h) * 0.45;
                if (this.entityType === 'bug') {
                    ctx.fillStyle = '#ff003c'; ctx.beginPath(); ctx.arc(cx, cy, size*0.6, 0, Math.PI*2); ctx.fill();
                } else {
                    ctx.fillStyle = '#ffd700'; ctx.fillRect(cx - size*0.5, cy - size*0.5, size, size);
                }
                ctx.restore();
            }
        }
    }

    class FloatingText {
        constructor(x, y, text, color) {
            this.x = x; this.y = y; this.text = text; this.color = color;
            this.life = 800; this.maxLife = 800; this.dy = -0.06;
        }
        update(dt) { this.y += this.dy * dt; this.life -= dt; }
        draw(ctx) {
            ctx.save(); ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
            ctx.fillStyle = this.color; ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center'; ctx.fillText(this.text, this.x, this.y); ctx.restore();
        }
    }

    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width; canvas.height = rect.height;
        const availH = canvas.height * 0.85, availW = canvas.width * 0.95;
        cellSize = Math.min(availW / GRID_COLS, availH / GRID_ROWS);
        gridOffsetX = (canvas.width - (cellSize * GRID_COLS)) / 2;
        gridOffsetY = (canvas.height - (cellSize * GRID_ROWS)) / 2 + (canvas.height * 0.05);
        laptops.forEach(l => l.updateLayout(cellSize, gridOffsetX, gridOffsetY));
    };

    const init = () => {
        for(let r=0; r<GRID_ROWS; r++) for(let c=0; c<GRID_COLS; c++) laptops.push(new Laptop(c, r));
        resize();
    };

    const handleInput = (x, y) => {
        if(!isRunning) return;
        for (let l of laptops) {
            if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height * 0.75) {
                const hit = l.hit();
                if (hit === 'bug') { localScore += 10; floatingTexts.push(new FloatingText(x, y, '+10', '#0f0')); }
                else if (hit === 'feature') { localScore -= 20; floatingTexts.push(new FloatingText(x, y, '-20', '#f00')); }
                setScore(localScore);
                break;
            }
        }
    };

    const onDown = (e) => {
        const rect = canvas.getBoundingClientRect();
        handleInput(e.clientX || e.touches[0].clientX - rect.left, e.clientY || e.touches[0].clientY - rect.top);
    };
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', (e)=>{e.preventDefault(); onDown(e.touches[0]);}, {passive:false});
    window.addEventListener('resize', resize);

    init();

    let animId;
    const loop = (time) => {
        if(!isRunning) return;
        const dt = time - lastTime; lastTime = time;
        
        timeRemaining -= dt;
        if(timeRemaining <= 0) {
            isRunning = false; setGameState('gameover'); setTimeLeft(0); return;
        }
        if(timeRemaining % 1000 < 50) setTimeLeft(Math.ceil(timeRemaining/1000));

        timeSinceLastSpawn += dt;
        if(timeSinceLastSpawn >= currentSpawnInterval) {
            const idle = laptops.filter(l => l.state === 'idle');
            if(idle.length > 0) idle[Math.floor(Math.random()*idle.length)].spawn(Math.random() < 0.75 ? 'bug' : 'feature');
            timeSinceLastSpawn = 0;
            currentSpawnInterval = Math.random() * (MAX_SPAWN - MIN_SPAWN) + MIN_SPAWN;
        }

        laptops.forEach(l => l.update(dt));
        floatingTexts.forEach(ft => ft.update(dt));
        floatingTexts = floatingTexts.filter(ft => ft.life > 0);

        ctx.clearRect(0,0,canvas.width,canvas.height);
        
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.1)'; ctx.lineWidth = 1; ctx.beginPath();
        for(let i=0; i<canvas.width; i+=40) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
        for(let i=0; i<canvas.height; i+=40) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
        ctx.stroke();

        laptops.forEach(l => l.draw(ctx));
        floatingTexts.forEach(ft => ft.draw(ctx));

        animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
        isRunning = false;
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('mousedown', onDown);
    };
  }, [difficulty]);

  return (
    <div className="flex-1 flex flex-col bg-black relative">
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between z-10 pointer-events-none bg-gradient-to-b from-black to-transparent">
         <div><p className="text-[10px] text-red-500">BUG SCORE</p><p className="text-2xl md:text-4xl text-white font-bold">{score}</p></div>
         <div className="text-right"><p className="text-[10px] text-cyan-500">TIME</p><p className="text-2xl md:text-4xl text-cyan-300 font-bold">{timeLeft}s</p></div>
      </div>
      
      <canvas ref={canvasRef} className="flex-1 w-full h-full block cursor-crosshair touch-none" />

      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 backdrop-blur-sm p-4 text-center">
           <h2 className="text-4xl md:text-6xl text-red-500 font-bold mb-4 drop-shadow-[0_0_15px_rgba(255,0,0,0.8)]">SYSTEM CLEANED</h2>
           <p className="text-sm md:text-lg text-gray-400 mb-2">RAW SCORE: {score}</p>
           <p className="text-2xl md:text-3xl text-yellow-400 mb-8 font-bold">YIELD: {Math.floor(score * (difficulty === 'hard' ? 2 : difficulty === 'medium' ? 1.5 : 1))}</p>
           <button onClick={() => onComplete(score)} className="px-6 py-4 md:px-8 bg-cyan-900 border-2 border-cyan-400 text-white hover:bg-cyan-800 transition-colors w-full max-w-sm">
              SUBMIT TO SUPABASE
           </button>
        </div>
      )}
    </div>
  );
}

// --- GAME 2: NODE DECRYPTOR (REACT GRID) ---
function NodeDecryptorGame({ difficulty, onComplete }) {
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(20);
    const [gameState, setGameState] = useState('playing'); 
    const [nodes, setNodes] = useState(Array(16).fill('idle')); 
    const timerRef = useRef(null);
    const loopRef = useRef(null);

    useEffect(() => {
        const speedMult = difficulty === 'hard' ? 2 : (difficulty === 'medium' ? 1.5 : 1);
        const cycleTime = 1200 / speedMult;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setGameState('gameover');
                    clearInterval(timerRef.current);
                    clearInterval(loopRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        loopRef.current = setInterval(() => {
            if (gameState !== 'playing') return;
            const newNodes = Array(16).fill('idle');
            
            const numActive = Math.floor(Math.random() * 3) + 1;
            for(let i=0; i<numActive; i++) newNodes[Math.floor(Math.random()*16)] = 'active';
            
            const numTraps = Math.floor(Math.random() * (difficulty === 'hard' ? 3 : 2));
            for(let i=0; i<numTraps; i++) {
                let idx = Math.floor(Math.random()*16);
                if(newNodes[idx] !== 'active') newNodes[idx] = 'trap';
            }
            
            setNodes(newNodes);
        }, cycleTime);

        return () => {
            clearInterval(timerRef.current);
            clearInterval(loopRef.current);
        };
    }, [difficulty, gameState]);

    const handleNodeClick = (index, type) => {
        if (gameState !== 'playing') return;
        
        if (type === 'active') {
            setScore(s => s + 5);
            setNodes(prev => {
                const arr = [...prev];
                arr[index] = 'cleared'; 
                return arr;
            });
        } else if (type === 'trap') {
            setScore(s => s - 10);
            setNodes(prev => {
                const arr = [...prev];
                arr[index] = 'breach'; 
                return arr;
            });
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-[#050b14] relative items-center justify-center p-4 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between w-full">
                <div><p className="text-[10px] text-emerald-500">DECRYPTED</p><p className="text-2xl md:text-4xl text-white font-bold">{score}</p></div>
                <div className="text-right"><p className="text-[10px] text-cyan-500">TIME</p><p className="text-2xl md:text-4xl text-cyan-300 font-bold">{timeLeft}s</p></div>
            </div>

            <div className="grid grid-cols-4 gap-2 md:gap-4 w-full max-w-sm aspect-square mt-12">
                {nodes.map((state, i) => (
                    <button 
                        key={i} 
                        onMouseDown={() => handleNodeClick(i, state)}
                        onTouchStart={(e) => { e.preventDefault(); handleNodeClick(i, state); }}
                        className={`w-full h-full rounded border transition-all duration-100 ease-in-out cursor-crosshair
                            ${state === 'idle' ? 'bg-[#0a192f] border-[#1e293b] hover:bg-[#112240]' : ''}
                            ${state === 'active' ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_20px_#10b981]' : ''}
                            ${state === 'trap' ? 'bg-red-600 border-red-400 shadow-[0_0_20px_#ef4444]' : ''}
                            ${state === 'cleared' ? 'bg-cyan-500/20 border-cyan-500 scale-95' : ''}
                            ${state === 'breach' ? 'bg-red-900 border-red-700 scale-105' : ''}
                        `}
                    />
                ))}
            </div>

            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 backdrop-blur-sm p-4 text-center">
                <h2 className="text-4xl md:text-6xl text-emerald-500 font-bold mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]">NODES SECURED</h2>
                <p className="text-sm md:text-lg text-gray-400 mb-2">RAW DATA: {score}</p>
                <p className="text-2xl md:text-3xl text-yellow-400 mb-8 font-bold">YIELD: {Math.floor(score * (difficulty === 'hard' ? 2 : difficulty === 'medium' ? 1.5 : 1))}</p>
                <button onClick={() => onComplete(score)} className="px-6 py-4 md:px-8 bg-cyan-900 border-2 border-cyan-400 text-white hover:bg-cyan-800 transition-colors w-full max-w-sm">
                    SUBMIT TO SUPABASE
                </button>
                </div>
            )}
        </div>
    );
}