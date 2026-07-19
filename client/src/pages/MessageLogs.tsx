import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Users, Server, Activity, Lock, CheckCircle } from "lucide-react";

const EDGE_GLOW = "0 0 0 1px rgba(168,85,247,0.35), 0 0 12px rgba(168,85,247,0.15)";
const EDGE_GLOW_HOVER = "0 0 0 1px rgba(168,85,247,0.6), 0 0 20px rgba(168,85,247,0.25)";

export default function MessageLogs() {
  const { data: stats } = useQuery<{
    totalMessages: number; uniqueUsers: number; uniqueServers: number;
  }>({
    queryKey: ["/api/logs/stats"],
    refetchInterval: 10000,
  });

  const statItems = [
    {
      label: "Messages Logged",
      value: stats?.totalMessages?.toLocaleString() ?? "—",
      icon: MessageSquare,
      color: "text-primary",
      border: "border-primary/20",
      bg: "bg-primary/5",
      desc: "Total server messages captured across all tokens",
    },
    {
      label: "Unique Users",
      value: stats?.uniqueUsers?.toLocaleString() ?? "—",
      icon: Users,
      color: "text-cyan-400",
      border: "border-cyan-400/20",
      bg: "bg-cyan-400/5",
      desc: "Distinct Discord users seen by all tokens",
    },
    {
      label: "Servers Monitored",
      value: stats?.uniqueServers?.toLocaleString() ?? "—",
      icon: Server,
      color: "text-purple-400",
      border: "border-purple-400/20",
      bg: "bg-purple-400/5",
      desc: "Unique guilds covered across all tokens",
    },
  ];

  const perks = [
    "Full access to every logged server message",
    "Search & filter by user, keyword, or server",
    "Real-time message feed as they come in",
    "Complete history stored and never lost on restart",
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4"
        style={{
          backgroundColor: "#0a0a0ae6",
          borderBottomColor: "rgba(168,85,247,0.2)",
          boxShadow: "0 1px 0 rgba(168,85,247,0.1)",
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:border-primary/40 transition-all">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-mono font-bold text-white text-sm tracking-tight">LOGGER STATS</span>
              <span className="hidden sm:inline text-[10px] font-mono text-primary/50 border border-primary/20 rounded px-1.5 py-0.5">
                GUILD ONLY · LIVE
              </span>
            </div>
          </div>
          <Link href="/">
            <button className="text-xs font-mono text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-primary/20">
              ← Dashboard
            </button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Intro */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <h1 className="text-2xl font-bold font-mono text-white tracking-tight">Logger Overview</h1>
          <p className="text-sm font-mono text-muted-foreground max-w-md mx-auto">
            Live stats from all connected tokens. Every server message is captured automatically — no DMs.
          </p>
        </motion.div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statItems.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`rounded-xl p-5 border ${s.border} ${s.bg} transition-all duration-300`}
              style={{ boxShadow: EDGE_GLOW }}
              whileHover={{ boxShadow: EDGE_GLOW_HOVER }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg bg-black/30 border ${s.border} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className={`text-[11px] font-mono uppercase tracking-widest ${s.color}`}>{s.label}</p>
              </div>
              <p className={`text-4xl font-bold font-mono ${s.color} mb-2`}>
                {stats ? s.value : (
                  <span className="opacity-30 animate-pulse">···</span>
                )}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground/50">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Access unlock banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl border border-primary/25 bg-primary/5 overflow-hidden"
          style={{ boxShadow: EDGE_GLOW }}
        >
          {/* Top strip */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-primary/15 bg-primary/10">
            <Lock className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
              Full Message Access — Host Your Account to Unlock
            </p>
          </div>

          <div className="px-5 py-5 space-y-4">
            <p className="text-sm font-mono text-white/80 leading-relaxed">
              Once you add and host your token on this site, you'll get complete access to every message
              logged by your account — searchable, filterable, and updated in real time.
            </p>

            <ul className="space-y-2">
              {perks.map((perk, i) => (
                <motion.li
                  key={perk}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.06 }}
                  className="flex items-center gap-2.5"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-mono text-white/70">{perk}</span>
                </motion.li>
              ))}
            </ul>

            <Link href="/">
              <button className="mt-1 h-9 px-5 bg-primary hover:bg-primary/90 text-black font-mono font-bold text-xs rounded-lg transition-all">
                → Add a Token on the Dashboard
              </button>
            </Link>
          </div>
        </motion.div>

      </main>
    </div>
  );
}
