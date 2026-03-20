import { useBots, useDeleteBot, useBotAction } from "@/hooks/use-bots";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { RpcDialog } from "@/components/RpcDialog";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { useTheme } from "@/hooks/use-theme";
import { Loader2, Settings, Power, Trash2, Search, Zap, Bot, Shield } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";
import type { BotConfig } from "@shared/schema";

const EDGE_GLOW = "0 0 0 1px rgba(168,85,247,0.45), 0 0 12px rgba(168,85,247,0.25), 0 0 30px rgba(168,85,247,0.10)";
const EDGE_GLOW_HOVER = "0 0 0 1px rgba(168,85,247,0.7), 0 0 18px rgba(168,85,247,0.4), 0 0 40px rgba(168,85,247,0.15)";

export default function Dashboard() {
  const { data: bots, isLoading } = useBots();
  const deleteBot = useDeleteBot();
  const botAction = useBotAction();
  const { currentBg } = useTheme();
  const [search, setSearch] = React.useState("");
  const [rpcBot, setRpcBot] = React.useState<BotConfig | null>(null);
  const [hoveredCard, setHoveredCard] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: currentBg.cssValue }}>
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
    <div className="min-h-screen" style={{ backgroundColor: currentBg.cssValue }}>
      {/* Top nav */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4"
        style={{
          backgroundColor: `${currentBg.cssValue}e6`,
          borderBottomColor: "rgba(168,85,247,0.25)",
          boxShadow: "0 1px 0 rgba(168,85,247,0.15)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center"
              style={{ boxShadow: "0 0 10px rgba(168,85,247,0.2)" }}
            >
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-black text-base sm:text-lg tracking-tight text-white">bothost.host</span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeCustomizer />
            <Link href="/admin">
              <button className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-mono">
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
              Your Instances
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Manage your selfbot connections and RPC settings
            </p>
          </div>
          <CreateBotDialog />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Total", value: bots?.length || 0, className: "text-white" },
            { label: "Online", value: activeCount, className: "text-primary" },
            { label: "Offline", value: (bots?.length || 0) - activeCount, className: "text-destructive/80" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/3 rounded-xl p-3 sm:p-5 transition-all duration-300"
              style={{ boxShadow: EDGE_GLOW }}
            >
              <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className={cn("text-2xl sm:text-3xl font-bold mt-1", stat.className)}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        {(bots?.length || 0) > 0 && (
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search bots..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 rounded-lg h-10 pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/20 outline-none transition-all"
              style={{ boxShadow: EDGE_GLOW }}
            />
          </div>
        )}

        {/* Bot grid */}
        {!bots?.length ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 sm:py-24 rounded-2xl text-center space-y-4 border border-dashed border-purple-500/20"
            style={{ boxShadow: EDGE_GLOW }}
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/5 flex items-center justify-center"
              style={{ boxShadow: EDGE_GLOW }}
            >
              <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-white">No bots deployed yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first Discord selfbot token to get started</p>
            </div>
            <CreateBotDialog />
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredBots?.map((bot, idx) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <div
                  className="group relative bg-white/3 hover:bg-white/5 rounded-xl p-4 sm:p-5 transition-all duration-300 flex flex-col h-full cursor-default"
                  style={{
                    boxShadow: hoveredCard === bot.id ? EDGE_GLOW_HOVER : EDGE_GLOW,
                  }}
                  onMouseEnter={() => setHoveredCard(bot.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                    <BotStatusBadge isRunning={!!bot.isRunning} isAfk={false} />
                  </div>

                  <div className="flex-1 space-y-3 sm:space-y-4">
                    <div className="pr-16 sm:pr-20">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">{bot.name}</h3>
                      {bot.discordTag ? (
                        <p className="text-xs text-primary/70 font-mono mt-0.5 truncate">@{bot.discordTag}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">ID #{bot.id.toString().padStart(4, '0')}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Activity</span>
                        <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">{bot.rpcType || 'PLAYING'}</span>
                      </div>
                      {bot.rpcTitle && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-mono">RPC</span>
                          <span className="text-white/70 font-mono truncate max-w-[120px]">{bot.rpcTitle}</span>
                        </div>
                      )}
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

                  <div className="flex gap-2 mt-4 pt-3 sm:mt-5 sm:pt-4 border-t border-purple-500/10">
                    <button
                      onClick={() => setRpcBot(bot)}
                      className="flex-1 h-9 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-xs font-mono text-white transition-all flex items-center justify-center gap-1.5"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configure
                    </button>

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

      {rpcBot && (
        <RpcDialog
          bot={rpcBot}
          open={!!rpcBot}
          onOpenChange={(open) => { if (!open) setRpcBot(null); }}
        />
      )}
    </div>
  );
}
