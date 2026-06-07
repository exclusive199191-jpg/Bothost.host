import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Play, Square, Trash2, Edit3, Zap, UserX,
  Activity, User, X, RefreshCw, Eye, EyeOff, Wifi, WifiOff, Loader2, CheckCircle2, AlertCircle, Users,
} from "lucide-react";
import type { InfiltratorAgent } from "@shared/schema";

const GLOW_RED = "0 0 0 1px rgba(239,68,68,0.35), 0 0 12px rgba(239,68,68,0.15)";
const GLOW_RED_HOVER = "0 0 0 1px rgba(239,68,68,0.6), 0 0 20px rgba(239,68,68,0.25)";
const GLOW_GREEN = "0 0 0 1px rgba(34,197,94,0.35), 0 0 12px rgba(34,197,94,0.15)";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "bg-green-500" :
    status === "joining" ? "bg-yellow-400" :
    status === "error" ? "bg-red-500" :
    "bg-white/20";
  const pulse = status === "active" || status === "joining";
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

function StatusLabel({ status }: { status: string }) {
  const label = status === "active" ? "ACTIVE" : status === "joining" ? "JOINING" : status === "error" ? "ERROR" : "IDLE";
  const color = status === "active" ? "text-green-400" : status === "joining" ? "text-yellow-400" : status === "error" ? "text-red-400" : "text-white/30";
  return <span className={`text-[10px] font-mono font-bold tracking-widest ${color}`}>{label}</span>;
}

interface AddAgentDialogProps {
  onClose: () => void;
  onSaved: () => void;
  editing?: InfiltratorAgent | null;
}

function AgentDialog({ onClose, onSaved, editing }: AddAgentDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showToken, setShowToken] = React.useState(false);
  const [form, setForm] = React.useState({
    token: editing?.token || "",
    displayName: editing?.displayName || "",
    bio: editing?.bio || "",
    pronouns: editing?.pronouns || "",
    avatarUrl: editing?.avatarUrl || "",
    serverInvite: editing?.serverInvite || "",
    serverId: editing?.serverId || "",
    channelId: editing?.channelId || "",
  });

  type InviteResult = { valid: boolean; guildName?: string; guildId?: string; memberCount?: number | null; onlineCount?: number | null; channelName?: string; error?: string };
  const [inviteResult, setInviteResult] = React.useState<InviteResult | null>(null);
  const [testingInvite, setTestingInvite] = React.useState(false);

  const testInvite = async () => {
    if (!form.serverInvite.trim()) return;
    setTestingInvite(true);
    setInviteResult(null);
    try {
      const res = await apiRequest("POST", "/api/infiltrators/test-invite", { invite: form.serverInvite.trim() });
      const data = await res.json();
      setInviteResult(data);
      if (data.valid && data.guildId && !form.serverId) {
        setForm(f => ({ ...f, serverId: data.guildId }));
      }
    } catch {
      setInviteResult({ valid: false, error: "Request failed" });
    } finally {
      setTestingInvite(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return apiRequest("PUT", `/api/infiltrators/${editing.id}`, form);
      }
      return apiRequest("POST", "/api/infiltrators", form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/infiltrators"] });
      toast({ title: editing ? "Agent updated" : "Agent added", description: "Saved successfully." });
      onSaved();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to save agent", variant: "destructive" });
    },
  });

  const field = (label: string, key: keyof typeof form, placeholder: string, opts?: { textarea?: boolean; type?: string; note?: string }) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest">{label}</label>
      {opts?.note && <p className="text-[10px] text-white/30 font-mono">{opts.note}</p>}
      {opts?.textarea ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 resize-none"
        />
      ) : key === "token" ? (
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 pr-10 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50"
          />
          <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <input
          type={opts?.type || "text"}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-[#0a0a0f] border border-red-500/20 rounded-2xl p-6 space-y-5 z-10"
        style={{ boxShadow: GLOW_RED }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserX className="w-5 h-5 text-red-400" />
            <h2 className="font-display font-black text-white">{editing ? "EDIT AGENT" : "DEPLOY AGENT"}</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {field("Discord Token", "token", "MTxxxxx.Gxxxxx.xxxxx", { note: "The account this agent will operate as" })}

          {/* Server Invite with Test button */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Server Invite</label>
            <p className="text-[10px] text-white/30 font-mono">Agent will auto-join if not already in the server</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.serverInvite}
                onChange={e => { setForm(f => ({ ...f, serverInvite: e.target.value })); setInviteResult(null); }}
                placeholder="discord.gg/xxxx  or  https://discord.gg/xxxx"
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50"
              />
              <button
                type="button"
                onClick={testInvite}
                disabled={!form.serverInvite.trim() || testingInvite}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-white/40 text-xs font-mono hover:border-red-500/40 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                title="Test this invite"
              >
                {testingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                {testingInvite ? "Testing…" : "Test"}
              </button>
            </div>

            {/* Invite result banner */}
            {inviteResult && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg px-3 py-2.5 border text-xs font-mono space-y-1 ${
                  inviteResult.valid
                    ? "bg-green-500/8 border-green-500/25 text-green-300"
                    : "bg-red-500/8 border-red-500/25 text-red-400"
                }`}
              >
                {inviteResult.valid ? (
                  <>
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{inviteResult.guildName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-white/40 pl-5">
                      {inviteResult.memberCount != null && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {inviteResult.memberCount.toLocaleString()} members
                        </span>
                      )}
                      {inviteResult.onlineCount != null && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                          {inviteResult.onlineCount.toLocaleString()} online
                        </span>
                      )}
                      {inviteResult.channelName && (
                        <span>#{inviteResult.channelName}</span>
                      )}
                    </div>
                    {inviteResult.guildId && (
                      <p className="text-[10px] text-white/25 pl-5">ID auto-filled ↓</p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{inviteResult.error || "Invalid or expired invite"}</span>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {field("Channel ID", "channelId", "123456789012345678", { note: "The channel the agent will be active in" })}
          {field("Server ID", "serverId", "123456789012345678 (optional if invite provided)", {})}

          <div className="border-t border-white/5 pt-3">
            <p className="text-[10px] font-mono text-red-400/60 uppercase tracking-widest mb-3">Profile Customisation</p>
            {field("Display Name / Nickname", "displayName", "e.g. jake")}
            {field("Bio", "bio", "e.g. just a chill person lol", { textarea: true })}
            {field("Pronouns", "pronouns", "e.g. he/him")}
            {field("Avatar URL", "avatarUrl", "https://i.imgur.com/xxxx.png", { note: "Direct image URL (PNG/JPG)" })}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-white/10 text-white/40 text-sm font-mono hover:border-white/20 hover:text-white/60 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!form.token || !form.channelId || save.isPending}
            className="flex-1 h-10 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-mono font-bold hover:bg-red-500/30 hover:border-red-500/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {save.isPending ? "Saving…" : editing ? "Update" : "Deploy Agent"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AgentCard({ agent, onEdit, onRefresh }: { agent: InfiltratorAgent; onEdit: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const initiate = useMutation({
    mutationFn: () => apiRequest("POST", `/api/infiltrators/${agent.id}/initiate`, {}),
    onSuccess: () => {
      toast({ title: "Agent initiated", description: "Connecting to Discord…" });
      setTimeout(onRefresh, 2000);
      setTimeout(onRefresh, 6000);
      setTimeout(onRefresh, 12000);
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Could not initiate", variant: "destructive" }),
  });

  const stop = useMutation({
    mutationFn: () => apiRequest("POST", `/api/infiltrators/${agent.id}/stop`, {}),
    onSuccess: () => {
      toast({ title: "Agent stopped" });
      onRefresh();
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Could not stop", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/infiltrators/${agent.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/infiltrators"] });
      toast({ title: "Agent removed" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message || "Could not delete", variant: "destructive" }),
  });

  const isActive = agent.isActive || agent.status === "active" || agent.status === "joining";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-black/40 border border-white/5 rounded-2xl p-5 space-y-4 transition-all duration-300 hover:border-red-500/20"
      style={{ boxShadow: isActive ? GLOW_GREEN : GLOW_RED }}
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-red-500/30 rounded-tl-2xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-red-500/30 rounded-br-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {agent.avatarUrl ? (
            <img src={agent.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10 flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-red-400/50" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-mono font-bold text-sm truncate">
              {agent.displayName || agent.discordTag || "Unknown Agent"}
            </p>
            {agent.discordTag && agent.discordTag !== agent.displayName && (
              <p className="text-white/30 font-mono text-[10px] truncate">{agent.discordTag}</p>
            )}
            {agent.pronouns && <p className="text-white/20 font-mono text-[10px]">{agent.pronouns}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDot status={agent.status || "idle"} />
          <StatusLabel status={agent.status || "idle"} />
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        {[
          { label: "Channel", value: agent.channelId ? `#${agent.channelId.slice(-6)}` : "—" },
          { label: "Server", value: agent.serverId ? agent.serverId.slice(-6) : "—" },
          { label: "Msgs Sent", value: agent.messagesSent || "0" },
          { label: "Status", value: agent.statusMessage?.slice(0, 24) || "Idle" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/3 rounded-lg px-2.5 py-1.5">
            <p className="text-white/30 uppercase tracking-widest text-[9px]">{label}</p>
            <p className="text-white/70 mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {agent.bio && (
        <p className="text-white/25 text-[11px] font-mono italic truncate">"{agent.bio}"</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-white/5">
        {isActive ? (
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-500/20 disabled:opacity-50 transition-all"
          >
            <Square className="w-3.5 h-3.5" />
            {stop.isPending ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button
            onClick={() => initiate.mutate()}
            disabled={initiate.isPending}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-mono hover:bg-green-500/20 disabled:opacity-50 transition-all"
            style={{ boxShadow: initiate.isPending ? GLOW_GREEN : undefined }}
          >
            <Play className="w-3.5 h-3.5" />
            {initiate.isPending ? "Initiating…" : "Initiate"}
          </button>
        )}
        <button
          onClick={onEdit}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 transition-colors"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { if (confirm("Remove this agent?")) del.mutate(); }}
          disabled={del.isPending}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-red-500/20 text-red-500/40 hover:text-red-400 hover:border-red-500/40 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export default function Infiltrator() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<InfiltratorAgent | null>(null);

  const { data: agents = [], isLoading, refetch } = useQuery<InfiltratorAgent[]>({
    queryKey: ["/api/infiltrators"],
    refetchInterval: 5000,
  });

  const activeCount = agents.filter(a => a.isActive).length;

  return (
    <div className="min-h-screen bg-[#06060b]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-red-500/15 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4"
        style={{ backgroundColor: "rgba(6,6,11,0.92)", boxShadow: "0 1px 0 rgba(239,68,68,0.1)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors text-xs font-mono">
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            </Link>
            <div className="w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <UserX className="w-4 h-4 text-red-400" />
              </div>
              <span className="font-display font-black text-white tracking-tight">INFILTRATOR</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5">
              <Activity className="w-3 h-3 text-red-400" />
              <span className="text-red-400 text-[11px] font-mono font-bold">{activeCount} active</span>
            </div>
            <button
              onClick={() => refetch()}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-white/10 text-white/30 hover:text-white/60 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
              Human Agents
            </h1>
            <p className="text-white/30 text-sm mt-0.5 font-mono">
              AI-powered accounts that blend into Discord communities
            </p>
          </div>
          <button
            onClick={() => { setEditingAgent(null); setShowDialog(true); }}
            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-mono font-bold hover:bg-red-500/25 hover:border-red-500/50 transition-all"
            style={{ boxShadow: GLOW_RED }}
          >
            <Plus className="w-4 h-4" />
            Add Agent
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: agents.length, color: "text-white" },
            { label: "Active", value: activeCount, color: "text-green-400" },
            { label: "Idle", value: agents.length - activeCount, color: "text-white/30" },
          ].map(s => (
            <div key={s.label} className="bg-white/3 rounded-xl p-3 sm:p-4 border border-white/5">
              <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        {agents.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-dashed border-red-500/20 p-10 text-center space-y-6"
            style={{ boxShadow: GLOW_RED }}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <UserX className="w-7 h-7 text-red-400/60" />
            </div>
            <div>
              <p className="text-white font-semibold">No agents deployed</p>
              <p className="text-white/30 text-sm mt-2 max-w-md mx-auto font-mono leading-relaxed">
                Each agent uses a Discord token to join a server, read the conversation, and generate
                contextually-aware human-like messages using AI. They blend in — casual tone, natural timing, real reactions.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
              {[
                { n: "1", t: "Add token", d: "Provide a Discord user token and target channel" },
                { n: "2", t: "Customise profile", d: "Set display name, bio, pronouns, and avatar" },
                { n: "3", t: "Initiate", d: "Agent joins, reads the room, and starts talking" },
              ].map(s => (
                <div key={s.n} className="bg-white/3 rounded-xl p-3 border border-white/5">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
                    <span className="text-[10px] font-bold text-red-400">{s.n}</span>
                  </div>
                  <p className="text-white text-xs font-mono font-bold">{s.t}</p>
                  <p className="text-white/30 text-[11px] mt-0.5">{s.d}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setEditingAgent(null); setShowDialog(true); }}
              className="inline-flex items-center gap-2 h-10 px-6 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-mono font-bold hover:bg-red-500/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              Deploy First Agent
            </button>
          </motion.div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto" />
              <p className="text-white/30 text-xs font-mono animate-pulse">LOADING AGENTS…</p>
            </div>
          </div>
        )}

        {/* Agent grid */}
        {agents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onEdit={() => { setEditingAgent(agent); setShowDialog(true); }}
                  onRefresh={() => refetch()}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Dialog */}
      <AnimatePresence>
        {showDialog && (
          <AgentDialog
            editing={editingAgent}
            onClose={() => { setShowDialog(false); setEditingAgent(null); }}
            onSaved={() => { setShowDialog(false); setEditingAgent(null); qc.invalidateQueries({ queryKey: ["/api/infiltrators"] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
