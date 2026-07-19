import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, MessageSquare, Users, Server, Hash, Clock, Bot, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { MessageLog } from "@shared/schema";

const EDGE_GLOW = "0 0 0 1px rgba(168,85,247,0.35), 0 0 12px rgba(168,85,247,0.15)";
const EDGE_GLOW_HOVER = "0 0 0 1px rgba(168,85,247,0.6), 0 0 20px rgba(168,85,247,0.25)";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const PAGE_SIZE = 50;

export default function MessageLogs() {
  const [searchId, setSearchId] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data: stats } = useQuery<{ totalMessages: number; uniqueUsers: number; uniqueServers: number }>({
    queryKey: ["/api/logs/stats"],
    refetchInterval: 15000,
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery<MessageLog[]>({
    queryKey: ["/api/logs", { authorId: activeSearch }],
    queryFn: async () => {
      const res = await fetch(`/api/logs?authorId=${encodeURIComponent(activeSearch)}`, {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !!activeSearch,
  });

  const { data: allLogs, isLoading: allLoading } = useQuery<MessageLog[]>({
    queryKey: ["/api/logs", { limit: PAGE_SIZE, offset: page * PAGE_SIZE }],
    queryFn: async () => {
      const res = await fetch(`/api/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !activeSearch,
    refetchInterval: 10000,
  });

  const displayLogs = activeSearch ? searchResults : allLogs;
  const isLoading = activeSearch ? searchLoading : allLoading;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchId.trim();
    if (trimmed) {
      setActiveSearch(trimmed);
      setPage(0);
    }
  };

  const clearSearch = () => {
    setActiveSearch("");
    setSearchId("");
    setPage(0);
  };

  const statItems = [
    { label: "Messages", value: stats?.totalMessages?.toLocaleString() ?? "—", icon: MessageSquare, color: "text-primary" },
    { label: "Unique Users", value: stats?.uniqueUsers?.toLocaleString() ?? "—", icon: Users, color: "text-cyan-400" },
    { label: "Servers", value: stats?.uniqueServers?.toLocaleString() ?? "—", icon: Server, color: "text-purple-400" },
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
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-mono font-bold text-white text-sm tracking-tight">MESSAGE LOGS</span>
              <span className="hidden sm:inline text-[10px] font-mono text-primary/50 border border-primary/20 rounded px-1.5 py-0.5">SERVER ONLY</span>
            </div>
          </div>
          <Link href="/">
            <button className="text-xs font-mono text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-primary/20">
              ← Dashboard
            </button>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {statItems.map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/[0.03] rounded-xl p-4 border border-transparent transition-all duration-300"
              style={{ boxShadow: EDGE_GLOW }}
              whileHover={{ boxShadow: EDGE_GLOW_HOVER }}
            >
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{s.label}</p>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Search */}
        <div>
          <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Search by Discord user ID..."
                data-testid="input-search-userid"
                className="w-full h-10 bg-white/5 rounded-lg pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/30 outline-none transition-all border border-transparent focus:border-primary/20"
                style={{ boxShadow: EDGE_GLOW }}
              />
            </div>
            <button
              type="submit"
              data-testid="button-search-logs"
              className="h-10 px-5 bg-primary hover:bg-primary/90 text-black font-mono font-bold text-xs rounded-lg transition-all"
            >
              SEARCH
            </button>
            {activeSearch && (
              <button
                type="button"
                onClick={clearSearch}
                data-testid="button-clear-search"
                className="h-10 px-4 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-white/20 transition-all font-mono text-xs flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </form>
          {activeSearch && (
            <p className="mt-2 text-xs font-mono text-muted-foreground">
              Showing results for user ID: <span className="text-primary">{activeSearch}</span>
              {searchResults !== undefined && (
                <span className="ml-2 text-white/40">({searchResults.length} message{searchResults.length !== 1 ? "s" : ""})</span>
              )}
            </p>
          )}
        </div>

        {/* Log table */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-xs font-mono text-muted-foreground animate-pulse">FETCHING LOGS...</p>
              </div>
            </div>
          ) : !displayLogs?.length ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-purple-500/20 space-y-3"
              style={{ boxShadow: EDGE_GLOW }}
            >
              <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm font-mono text-muted-foreground">
                {activeSearch ? "No messages found for that user ID" : "No messages logged yet"}
              </p>
              {!activeSearch && (
                <p className="text-xs font-mono text-muted-foreground/50">Messages from all servers will appear here as bots receive them</p>
              )}
            </motion.div>
          ) : (
            <div
              className="rounded-xl overflow-hidden border border-purple-500/10"
              style={{ boxShadow: EDGE_GLOW }}
            >
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_1fr_2fr_80px] gap-0 bg-white/[0.02] border-b border-white/5 px-4 py-2.5 hidden md:grid">
                {["USER", "SERVER", "CHANNEL", "MESSAGE", "TIME"].map((h) => (
                  <div key={h} className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">{h}</div>
                ))}
              </div>

              <div className="divide-y divide-white/[0.04]">
                <AnimatePresence initial={false}>
                  {displayLogs.map((log, i) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.01, 0.3) }}
                      className="px-4 py-3 hover:bg-white/[0.025] transition-colors group"
                      data-testid={`row-log-${log.id}`}
                    >
                      {/* Mobile layout */}
                      <div className="md:hidden space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Bot className="w-3 h-3 text-primary/60 shrink-0" />
                            <span className="font-mono text-xs text-primary truncate max-w-[120px]">{log.authorTag || log.authorId}</span>
                            <span className="text-[10px] font-mono text-white/25 truncate max-w-[80px]">({log.authorId})</span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">{timeAgo(log.timestamp)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
                          <Server className="w-3 h-3 shrink-0" />
                          <span className="truncate">{log.guildName || log.guildId}</span>
                          <Hash className="w-3 h-3 shrink-0 ml-1" />
                          <span className="truncate">{log.channelName || log.channelId}</span>
                        </div>
                        <p className="text-sm text-white/85 leading-relaxed break-words font-mono">{log.content}</p>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_2fr_80px] gap-0 items-start">
                        <div className="min-w-0 pr-2">
                          <p className="font-mono text-xs text-primary truncate">{log.authorTag || log.authorId}</p>
                          <p className="font-mono text-[10px] text-white/25 truncate">{log.authorId}</p>
                        </div>
                        <div className="min-w-0 pr-2 flex items-center gap-1.5">
                          <Server className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          <p className="font-mono text-xs text-white/60 truncate">{log.guildName || log.guildId}</p>
                        </div>
                        <div className="min-w-0 pr-2 flex items-center gap-1.5">
                          <Hash className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          <p className="font-mono text-xs text-white/60 truncate">{log.channelName || log.channelId}</p>
                        </div>
                        <div className="min-w-0 pr-3">
                          <p className="text-sm text-white/85 break-words leading-snug">{log.content}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-mono text-muted-foreground/50 whitespace-nowrap">{timeAgo(log.timestamp)}</p>
                          <p className="text-[9px] font-mono text-muted-foreground/30 whitespace-nowrap">{fmtTime(log.timestamp)}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Pagination (only when not searching) */}
        {!activeSearch && (allLogs?.length ?? 0) > 0 && (
          <div className="flex items-center justify-between py-2">
            <p className="text-xs font-mono text-muted-foreground">
              Page {page + 1} · showing {(page * PAGE_SIZE) + 1}–{(page * PAGE_SIZE) + (displayLogs?.length ?? 0)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-8 px-3 rounded-lg border border-white/10 text-xs font-mono text-muted-foreground hover:text-white hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                <ChevronLeft className="w-3 h-3" /> Prev
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(displayLogs?.length ?? 0) < PAGE_SIZE}
                className="h-8 px-3 rounded-lg border border-white/10 text-xs font-mono text-muted-foreground hover:text-white hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                Next <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
