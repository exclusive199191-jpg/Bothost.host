import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Search, MessageSquare, Users, Server, Hash,
  Bot, ChevronLeft, ChevronRight, X, Tag, Filter, RotateCcw,
  Activity, Lock, CheckCircle,
} from "lucide-react";
import type { MessageLog } from "@shared/schema";

const EDGE_GLOW       = "0 0 0 1px rgba(168,85,247,0.35), 0 0 12px rgba(168,85,247,0.15)";
const EDGE_GLOW_HOVER = "0 0 0 1px rgba(168,85,247,0.6), 0 0 20px rgba(168,85,247,0.25)";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function highlight(text: string, kw: string): React.ReactNode {
  if (!kw) return text;
  const idx = text.toLowerCase().indexOf(kw.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{text.slice(idx, idx + kw.length)}</mark>
      {highlight(text.slice(idx + kw.length), kw)}
    </>
  );
}

const PAGE_SIZE = 50;
interface Filters { userId: string; keyword: string; }
const EMPTY: Filters = { userId: "", keyword: "" };

export default function MessageLogs() {
  const [draft, setDraft]   = useState<Filters>(EMPTY);
  const [active, setActive] = useState<Filters>(EMPTY);
  const [page, setPage]     = useState(0);
  const hasActive = !!(active.userId || active.keyword);

  // Global stats — visible to everyone
  const { data: stats } = useQuery<{
    totalMessages: number; uniqueUsers: number; uniqueServers: number;
  }>({ queryKey: ["/api/logs/stats"], refetchInterval: 10000 });

  // Gate: at least one bot must be running (globally) to view logs
  const { data: bots } = useQuery<{ id: number; isRunning: boolean }[]>({
    queryKey: ["/api/bots"],
    refetchInterval: 15000,
  });
  const isHosted = Array.isArray(bots) && bots.some((b) => b.isRunning);

  // Full message log — only fetched when gate is open
  const logsQueryKey = ["/api/logs", { authorId: active.userId, keyword: active.keyword, limit: PAGE_SIZE, offset: page * PAGE_SIZE }];
  const { data: logs, isLoading: logsLoading } = useQuery<MessageLog[]>({
    queryKey: logsQueryKey,
    enabled: isHosted,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (active.userId)  params.set("authorId", active.userId);
      if (active.keyword) params.set("keyword",  active.keyword);
      params.set("limit",  String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/logs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: hasActive ? undefined : 10000,
  });

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setActive({ userId: draft.userId.trim(), keyword: draft.keyword.trim() });
    setPage(0);
  };
  const clearAll = () => { setDraft(EMPTY); setActive(EMPTY); setPage(0); };

  const statItems = [
    { label: "Messages Logged",   value: stats?.totalMessages?.toLocaleString() ?? "—", icon: MessageSquare, color: "text-primary",    border: "border-primary/20",    bg: "bg-primary/5" },
    { label: "Unique Users",      value: stats?.uniqueUsers?.toLocaleString()    ?? "—", icon: Users,         color: "text-cyan-400",   border: "border-cyan-400/20",   bg: "bg-cyan-400/5" },
    { label: "Servers Monitored", value: stats?.uniqueServers?.toLocaleString()  ?? "—", icon: Server,        color: "text-purple-400", border: "border-purple-400/20", bg: "bg-purple-400/5" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4"
        style={{ backgroundColor: "#0a0a0ae6", borderBottomColor: "rgba(168,85,247,0.2)", boxShadow: "0 1px 0 rgba(168,85,247,0.1)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
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
              <span className="font-mono font-bold text-white text-sm tracking-tight">MESSAGE LOGS</span>
              <span className="hidden sm:inline text-[10px] font-mono text-primary/50 border border-primary/20 rounded px-1.5 py-0.5">
                GUILD ONLY · ALL TOKENS
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Stats — always visible */}
        <div className="grid grid-cols-3 gap-3">
          {statItems.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`rounded-xl p-4 border ${s.border} ${s.bg} transition-all duration-300`}
              style={{ boxShadow: EDGE_GLOW }}
              whileHover={{ boxShadow: EDGE_GLOW_HOVER }}
            >
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest hidden sm:block">{s.label}</p>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold font-mono ${s.color}`}>
                {stats ? s.value : <span className="opacity-30 animate-pulse">···</span>}
              </p>
            </motion.div>
          ))}
        </div>

        {/* ── HOSTED: show full search + message table ── */}
        {isHosted ? (
          <>
            {/* Search & Filter */}
            <form
              onSubmit={applyFilters}
              className="rounded-xl border border-purple-500/10 bg-white/[0.02] p-4"
              style={{ boxShadow: EDGE_GLOW }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-3.5 h-3.5 text-primary/60" />
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">Search & Filter</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={draft.userId}
                    onChange={(e) => setDraft(d => ({ ...d, userId: e.target.value }))}
                    placeholder="Filter by Discord user ID..."
                    className="w-full h-9 bg-white/5 rounded-lg pl-9 pr-3 font-mono text-xs text-white placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary/30 outline-none border border-transparent focus:border-primary/20 transition-all"
                  />
                </div>
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={draft.keyword}
                    onChange={(e) => setDraft(d => ({ ...d, keyword: e.target.value }))}
                    placeholder="Search message content..."
                    className="w-full h-9 bg-white/5 rounded-lg pl-9 pr-3 font-mono text-xs text-white placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-primary/30 outline-none border border-transparent focus:border-primary/20 transition-all"
                  />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="submit"
                    className="h-9 px-5 bg-primary hover:bg-primary/90 text-black font-mono font-bold text-xs rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" /> Search
                  </button>
                  {hasActive && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="h-9 px-3 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-white/20 transition-all font-mono text-xs flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                  )}
                </div>
              </div>
              {hasActive && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                  <span className="text-[10px] font-mono text-muted-foreground/50 self-center">Active filters:</span>
                  {active.userId && (
                    <span className="flex items-center gap-1.5 text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full px-2.5 py-1">
                      <Users className="w-3 h-3" /> User: {active.userId}
                      <button onClick={() => { setActive(a => ({ ...a, userId: "" })); setDraft(d => ({ ...d, userId: "" })); setPage(0); }}><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {active.keyword && (
                    <span className="flex items-center gap-1.5 text-[10px] font-mono bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-full px-2.5 py-1">
                      <Tag className="w-3 h-3" /> Keyword: "{active.keyword}"
                      <button onClick={() => { setActive(a => ({ ...a, keyword: "" })); setDraft(d => ({ ...d, keyword: "" })); setPage(0); }}><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {logs !== undefined && (
                    <span className="text-[10px] font-mono text-white/30 self-center ml-auto">{logs.length} result{logs.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              )}
            </form>

            {/* Log table */}
            {logsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-mono text-muted-foreground animate-pulse">FETCHING LOGS...</p>
                </div>
              </div>
            ) : !logs?.length ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-purple-500/20 space-y-3"
                style={{ boxShadow: EDGE_GLOW }}
              >
                <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm font-mono text-muted-foreground">
                  {hasActive ? "No messages match your filters" : "No messages logged yet"}
                </p>
                {hasActive && (
                  <button onClick={clearAll} className="text-xs font-mono text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5">
                    <RotateCcw className="w-3 h-3" /> Clear filters
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-purple-500/10" style={{ boxShadow: EDGE_GLOW }}>
                <div className="hidden md:grid grid-cols-[160px_160px_140px_1fr_80px] gap-0 bg-white/[0.025] border-b border-white/5 px-4 py-2.5">
                  {["USER", "SERVER", "CHANNEL", "MESSAGE", "TIME"].map((h) => (
                    <div key={h} className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">{h}</div>
                  ))}
                </div>
                <div className="divide-y divide-white/[0.04]">
                  <AnimatePresence initial={false}>
                    {logs.map((log, i) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.008, 0.25) }}
                        className="px-4 py-3 hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Mobile */}
                        <div className="md:hidden space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              {log.authorAvatar ? (
                                <img src={log.authorAvatar} alt="" className="w-6 h-6 rounded-full shrink-0 object-cover" />
                              ) : (
                                <div className="w-6 h-6 rounded-full shrink-0 bg-primary/20 flex items-center justify-center">
                                  <Bot className="w-3 h-3 text-primary/60" />
                                </div>
                              )}
                              <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                                {log.authorTag || log.authorId || "Unknown User"}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{timeAgo(log.timestamp)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/50 flex-wrap">
                            {(log.guildName || log.guildId) && (
                              <span className="flex items-center gap-1"><Server className="w-3 h-3" />{log.guildName || log.guildId}</span>
                            )}
                            {(log.channelName || log.channelId) && (
                              <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{log.channelName || log.channelId}</span>
                            )}
                          </div>
                          <p className="text-sm text-white/80 leading-relaxed break-words">{highlight(log.content, active.keyword)}</p>
                        </div>
                        {/* Desktop */}
                        <div className="hidden md:flex gap-3 items-start">
                          {/* Avatar */}
                          <div className="shrink-0 pt-0.5">
                            {log.authorAvatar ? (
                              <img src={log.authorAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-primary/60" />
                              </div>
                            )}
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-sm text-white">
                                {log.authorTag || log.authorId || "Unknown User"}
                              </span>
                              {log.authorId && log.authorTag && (
                                <span className="font-mono text-[9px] text-white/25">{log.authorId}</span>
                              )}
                              {(log.guildName || log.guildId) && (
                                <span className="flex items-center gap-1 text-[10px] font-mono text-white/35">
                                  <Server className="w-3 h-3" />{log.guildName || log.guildId}
                                </span>
                              )}
                              {(log.channelName || log.channelId) && (
                                <span className="flex items-center gap-1 text-[10px] font-mono text-white/35">
                                  <Hash className="w-3 h-3" />{log.channelName || log.channelId}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/85 break-words leading-snug">{highlight(log.content, active.keyword)}</p>
                          </div>
                          {/* Timestamp */}
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-mono text-muted-foreground/40 whitespace-nowrap">{timeAgo(log.timestamp)}</p>
                            <p className="text-[9px] font-mono text-muted-foreground/20 whitespace-nowrap">{fmtTime(log.timestamp)}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Pagination */}
            {(logs?.length ?? 0) > 0 && (
              <div className="flex items-center justify-between py-1">
                <p className="text-xs font-mono text-muted-foreground/50">
                  Page {page + 1} · {(page * PAGE_SIZE) + 1}–{(page * PAGE_SIZE) + (logs?.length ?? 0)}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="h-8 px-3 rounded-lg border border-white/10 text-xs font-mono text-muted-foreground hover:text-white hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5">
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </button>
                  <button onClick={() => setPage(p => p + 1)} disabled={(logs?.length ?? 0) < PAGE_SIZE}
                    className="h-8 px-3 rounded-lg border border-white/10 text-xs font-mono text-muted-foreground hover:text-white hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5">
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
        </>

      </main>
    </div>
  );
}
