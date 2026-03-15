import { useBots, useDeleteBot, useBotAction } from "@/hooks/use-bots";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { Loader2, Settings, Power, Trash2, Search, Zap, Plus, Bot, Shield, X, Users, Terminal, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: number;
  username: string;
  createdAt: string | null;
  botCount: number;
}

interface AdminData {
  users: AdminUser[];
  totalBots: number;
}

interface LiveBotInfo {
  id: number;
  name: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: string | null;
}

function AdminPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = React.useState<"login" | "data">("login");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [adminData, setAdminData] = React.useState<AdminData | null>(null);
  const [liveBots, setLiveBots] = React.useState<LiveBotInfo[]>([]);
  const [activeTab, setActiveTab] = React.useState<"bots" | "users">("bots");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        toast({ title: "Access Denied", description: "Invalid credentials", variant: "destructive" });
        setLoading(false);
        return;
      }
      const [dataRes, botsRes] = await Promise.all([
        fetch("/api/admin/data"),
        fetch("/api/admin/bots"),
      ]);
      const data: AdminData = await dataRes.json();
      const bots: LiveBotInfo[] = await botsRes.json();
      setAdminData(data);
      setLiveBots(bots);
      setStep("data");
    } catch {
      toast({ title: "Error", description: "Connection failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refreshBots = async () => {
    const botsRes = await fetch("/api/admin/bots");
    if (botsRes.ok) {
      setLiveBots(await botsRes.json());
    }
  };

  const connectedCount = liveBots.filter(b => b.isConnected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-[0_0_60px_rgba(34,197,94,0.08)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-mono text-sm font-bold text-white tracking-widest uppercase">Admin Panel</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 flex items-center justify-center text-muted-foreground hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "login" ? (
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <p className="text-xs text-muted-foreground font-mono">AUTHENTICATION REQUIRED</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-4 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  placeholder="Enter username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-4 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-black text-sm font-bold font-mono flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "AUTHENTICATE"}
            </button>
          </form>
        ) : (
          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Users className="w-3 h-3" /> Users</p>
                <p className="text-2xl font-bold text-white mt-1">{adminData?.users.length || 0}</p>
              </div>
              <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Terminal className="w-3 h-3" /> Total</p>
                <p className="text-2xl font-bold text-primary mt-1">{liveBots.length}</p>
              </div>
              <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Bot className="w-3 h-3" /> Live</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{connectedCount}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("bots")}
                className={cn(
                  "flex-1 h-9 rounded-lg text-xs font-mono font-bold transition-all",
                  activeTab === "bots"
                    ? "bg-primary/10 border border-primary/30 text-primary"
                    : "bg-white/3 border border-white/8 text-muted-foreground hover:text-white"
                )}
              >
                CONNECTED ACCOUNTS
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className={cn(
                  "flex-1 h-9 rounded-lg text-xs font-mono font-bold transition-all",
                  activeTab === "users"
                    ? "bg-primary/10 border border-primary/30 text-primary"
                    : "bg-white/3 border border-white/8 text-muted-foreground hover:text-white"
                )}
              >
                SESSIONS
              </button>
              <button
                onClick={refreshBots}
                className="w-9 h-9 rounded-lg bg-white/3 border border-white/8 text-muted-foreground hover:text-white flex items-center justify-center transition-all"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeTab === "bots" ? (
              <div className="space-y-2">
                {liveBots.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono text-center py-8">No bots registered yet</p>
                ) : (
                  <div className="rounded-xl border border-white/8 overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-white/8 bg-white/3">
                          <th className="text-left px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">Discord Name</th>
                          <th className="text-left px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">Discord ID</th>
                          <th className="text-right px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">Instance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveBots.map((b, i) => (
                          <tr key={b.id} className={cn("border-b border-white/5 last:border-0", i % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]")}>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold",
                                b.isConnected
                                  ? "text-green-400 bg-green-400/10"
                                  : "text-muted-foreground/60 bg-white/5"
                              )}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", b.isConnected ? "bg-green-400" : "bg-muted-foreground/40")} />
                                {b.isConnected ? "LIVE" : "OFFLINE"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white font-medium">{b.discordTag}</td>
                            <td className="px-4 py-3 text-muted-foreground">{b.discordId || "—"}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">#{b.id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/3">
                        <th className="text-left px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">ID</th>
                        <th className="text-left px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">Session</th>
                        <th className="text-right px-4 py-3 text-muted-foreground font-normal uppercase tracking-wider">Bots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminData?.users.map((u, i) => (
                        <tr key={u.id} className={cn("border-b border-white/5 last:border-0", i % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]")}>
                          <td className="px-4 py-3 text-white">#{u.id}</td>
                          <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{u.username}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn("font-bold", u.botCount > 0 ? "text-primary" : "text-muted-foreground/50")}>
                              {u.botCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: bots, isLoading } = useBots();
  const deleteBot = useDeleteBot();
  const botAction = useBotAction();
  const [search, setSearch] = React.useState("");
  const [adminOpen, setAdminOpen] = React.useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="font-mono text-primary/60 text-xs animate-pulse">LOADING INSTANCES...</p>
        </div>
      </div>
    );
  }

  const filteredBots = bots?.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.id.toString().includes(search)
  );

  const activeCount = bots?.filter(b => b.isRunning).length || 0;

  return (
    <div className="min-h-screen bg-black">
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/90 backdrop-blur-xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-black text-lg tracking-tight text-white">bothost.host</span>
          </div>

          <button
            onClick={() => setAdminOpen(true)}
            data-testid="button-admin-panel"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-mono"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              Your Instances
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your selfbot connections and RPC settings
            </p>
          </div>
          <CreateBotDialog />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white/3 border border-white/8 rounded-xl p-5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Bots</p>
            <p className="text-3xl font-bold text-white mt-1">{bots?.length || 0}</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl p-5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Online</p>
            <p className="text-3xl font-bold text-primary mt-1">{activeCount}</p>
          </div>
          <div className="hidden sm:block bg-white/3 border border-white/8 rounded-xl p-5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Offline</p>
            <p className="text-3xl font-bold text-destructive/80 mt-1">{(bots?.length || 0) - activeCount}</p>
          </div>
        </div>

        {/* Search */}
        {(bots?.length || 0) > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search bots..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg h-10 pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        )}

        {/* Bot grid */}
        {!bots?.length ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 border border-dashed border-white/10 rounded-2xl text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-white">No bots deployed yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first Discord selfbot token to get started</p>
            </div>
            <CreateBotDialog />
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBots?.map((bot, idx) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <div className="group relative bg-white/3 hover:bg-white/5 border border-white/8 hover:border-primary/20 rounded-xl p-5 transition-all duration-200 flex flex-col h-full">
                  <div className="absolute top-4 right-4">
                    <BotStatusBadge isRunning={!!bot.isRunning} isAfk={false} />
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="pr-20">
                      <h3 className="font-bold text-white text-base truncate">{bot.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">ID #{bot.id.toString().padStart(4, '0')}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Activity</span>
                        <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">{bot.rpcType || 'PLAYING'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Sniper</span>
                        <span className={cn("font-mono", bot.nitroSniper ? "text-primary" : "text-muted-foreground/50")}>
                          {bot.nitroSniper ? "ON" : "OFF"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Prefix</span>
                        <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">{bot.commandPrefix || '.'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5 pt-4 border-t border-white/5">
                    <Link href={`/bot/${bot.id}`} className="flex-1">
                      <button className="w-full h-9 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-xs font-mono text-white transition-all flex items-center justify-center gap-1.5">
                        <Settings className="w-3.5 h-3.5" />
                        Configure
                      </button>
                    </Link>

                    <button
                      onClick={() => botAction.mutate({ id: bot.id, action: bot.isRunning ? 'stop' : 'restart' })}
                      title={bot.isRunning ? "Stop" : "Start"}
                      className={cn(
                        "w-9 h-9 rounded-lg border flex items-center justify-center transition-all",
                        bot.isRunning
                          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/15 text-destructive"
                          : "border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary"
                      )}
                    >
                      <Power className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => { if (confirm("Delete this bot?")) deleteBot.mutate(bot.id); }}
                      title="Delete"
                      className="w-9 h-9 rounded-lg border border-white/8 bg-white/3 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
