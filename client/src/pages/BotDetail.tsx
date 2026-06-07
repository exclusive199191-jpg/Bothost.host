import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { useBot, useUpdateBot, useBotAction, BOT_NOT_FOUND, BOT_ACCESS_DENIED } from "@/hooks/use-bots";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { CyberInput } from "@/components/CyberInput";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, ArrowLeft, Save, RefreshCw, Activity, Settings2, Terminal,
  ChevronDown, Search, Lock, Plus, X, Wifi, AlertTriangle, LogIn,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const COMMANDS = [
  { cat: "General",    usage: "help",                       desc: "List all commands with descriptions." },
  { cat: "General",    usage: "uptime",                     desc: "How long the bot has been running." },
  { cat: "General",    usage: "ping",                       desc: "Check Discord latency." },
  { cat: "General",    usage: "time",                       desc: "Current local + UTC time." },
  { cat: "General",    usage: "coin",                       desc: "Flip a coin." },
  { cat: "General",    usage: "roll <sides>",               desc: "Roll a die (default d6)." },
  { cat: "General",    usage: "8ball <question>",           desc: "Magic 8-ball answer." },
  { cat: "General",    usage: "rps <r/p/s>",                desc: "Rock paper scissors." },
  { cat: "General",    usage: "choose <a,b,...>",           desc: "Pick a random option." },
  { cat: "General",    usage: "fact",                       desc: "Random useless fact." },
  { cat: "General",    usage: "joke",                       desc: "Random one-liner joke." },
  { cat: "General",    usage: "snowflake <id>",             desc: "Decode a Discord snowflake ID." },
  { cat: "General",    usage: "creationdate <id>",          desc: "Creation date from snowflake." },
  { cat: "General",    usage: "server info",                desc: "Server name, ID, owner, members." },
  { cat: "General",    usage: "user info <@user>",          desc: "User tag, ID, badges, age." },
  { cat: "General",    usage: "prefix set <new>",           desc: "Change the command prefix." },
  { cat: "General",    usage: "stopall",                    desc: "Stop all active modules." },
  { cat: "General",    usage: "join <invite>",              desc: "Join a Discord server by invite link." },
  { cat: "General",    usage: "copy full server",           desc: "Clone server (roles, channels), DM all members." },
  { cat: "General",    usage: "server emoji steal <id>",    desc: "Steal emojis from a guild and upload here." },
  { cat: "General",    usage: "server end <id>",            desc: "Flood all channels in a guild with images." },
  { cat: "General",    usage: "server end stop",            desc: "Cancel in-progress server end flood." },
  { cat: "General",    usage: "report server",              desc: "Mass-report the current server." },
  { cat: "General",    usage: "report msg <id>",            desc: "Report a specific message by ID." },
  { cat: "Fun/Tools",  usage: "echo <text>",                desc: "Repeat text back." },
  { cat: "Fun/Tools",  usage: "mock <@user>",               desc: "Mock user's last message in AlTeRnAtInG CaSe." },
  { cat: "Fun/Tools",  usage: "mock <text>",                desc: "AlTeRnAtInG CaSe on custom text." },
  { cat: "Fun/Tools",  usage: "owo <text>",                 desc: "Convert to owo furry style." },
  { cat: "Fun/Tools",  usage: "clap <text>",                desc: "Add 👏 between words." },
  { cat: "Fun/Tools",  usage: "flip <text>",                desc: "Flip text upside down." },
  { cat: "Fun/Tools",  usage: "zalgo <text>",               desc: "Z̶a̸l̷g̶o̸ corrupt text." },
  { cat: "Fun/Tools",  usage: "ship <@u1> <@u2>",           desc: "Fake ship percentage." },
  { cat: "Fun/Tools",  usage: "gayrate <@user>",            desc: "Random gay % (joke)." },
  { cat: "Fun/Tools",  usage: "simprate <@user>",           desc: "Random simp % (joke)." },
  { cat: "Fun/Tools",  usage: "roast <@user>",              desc: "Send a brutal roast." },
  { cat: "Fun/Tools",  usage: "compliment <@user>",         desc: "Sarcastic compliment." },
  { cat: "Fun/Tools",  usage: "pickup <@user>",             desc: "Cringe pickup line." },
  { cat: "Fun/Tools",  usage: "truth",                      desc: "Random truth question." },
  { cat: "Fun/Tools",  usage: "dare <@user>",               desc: "Random dare suggestion." },
  { cat: "Fun/Tools",  usage: "wouldyourather <a> or <b>",  desc: "Would you rather prompt." },
  { cat: "Fun/Tools",  usage: "pfp <@user>",                desc: "Full-size profile picture URL." },
  { cat: "Fun/Tools",  usage: "banner <@user>",             desc: "Full-size banner URL." },
  { cat: "Fun/Tools",  usage: "react all",                  desc: "React with 26+ emojis (reply first)." },
  { cat: "Fun/Tools",  usage: "autoreact <@user> <emoji>",  desc: "Auto-react to user's messages." },
  { cat: "Fun/Tools",  usage: "gpt <question>",             desc: "Ask ChatGPT a question via AI." },
  { cat: "Fun/Tools",  usage: "tiktok views <user> <link>", desc: "Order TikTok views boost." },
  { cat: "Automation", usage: "spam <count> <msg>",         desc: "Send message N times." },
  { cat: "Automation", usage: "flood <message>",            desc: "Continuously send until spamstop." },
  { cat: "Automation", usage: "spamstop",                   desc: "Stop all spam/flood loops." },
  { cat: "Automation", usage: "nitro on",                   desc: "Enable Nitro sniper." },
  { cat: "Automation", usage: "nitro off",                  desc: "Disable Nitro sniper." },
  { cat: "Automation", usage: "afk [reason]",               desc: "Toggle AFK mode on/off." },
  { cat: "Automation", usage: "bully <@user>",              desc: "Spam insults at user every 100ms." },
  { cat: "Automation", usage: "bully off",                  desc: "Stop the bully loop." },
  { cat: "Automation", usage: "sob <@user>",                desc: "Continuously sad-react to user." },
  { cat: "Automation", usage: "statusmover <w1,w2,...>",    desc: "Cycle custom status through words." },
  { cat: "Automation", usage: "statusmover off",            desc: "Stop status cycling." },
  { cat: "Management", usage: "massdm <message>",           desc: "DM all friends and contacts." },
  { cat: "Management", usage: "closealldms",                desc: "Close all DM channels." },
  { cat: "Management", usage: "purge <count>",              desc: "Delete your last N messages." },
  { cat: "Management", usage: "gc allow",                   desc: "Allow all group chat invites." },
  { cat: "Management", usage: "gc deny",                    desc: "Deny all group chat invites." },
  { cat: "Management", usage: "gc trap <@user>",            desc: "Re-invite user if they leave." },
  { cat: "Management", usage: "gc whitelist [ID]",          desc: "Whitelist a GC from auto-leave." },
  { cat: "Management", usage: "host <token>",               desc: "Host a new Discord account." },
  { cat: "Management", usage: "members msgs",               desc: "Show message counts per member." },
  { cat: "OSINT",      usage: "snipe",                      desc: "Show last deleted message." },
  { cat: "OSINT",      usage: "ip check <ip>",              desc: "IP location, ISP, coordinates." },
  { cat: "OSINT",      usage: "link check <url>",           desc: "Check if URL is a phishing link." },
  { cat: "OSINT",      usage: "osint user <@user>",         desc: "Full OSINT report on a Discord user." },
  { cat: "OSINT",      usage: "osint discord <id>",         desc: "OSINT on a Discord user ID." },
  { cat: "OSINT",      usage: "osint server",               desc: "Server OSINT — roles, channels, members." },
  { cat: "OSINT",      usage: "osint token <token>",        desc: "Lookup info from a Discord token." },
  { cat: "OSINT",      usage: "username breach <user>",     desc: "Check username in breach databases." },
  { cat: "OSINT",      usage: "username leak <user>",       desc: "Check username in leak databases." },
  { cat: "OSINT",      usage: "edr email <email>",          desc: "Lookup email — breaches, social." },
  { cat: "OSINT",      usage: "edr phone <number>",         desc: "Lookup phone — carrier, owner." },
  { cat: "OSINT",      usage: "who is <domain>",            desc: "WHOIS domain lookup." },
  { cat: "OSINT",      usage: "who lives <address>",        desc: "Geocode + resident lookup." },
  { cat: "OSINT",      usage: "convert cords <lat> <lng>",  desc: "Convert GPS coords to address." },
  { cat: "OSINT",      usage: "full report <target>",       desc: "Mega-dossier combining all OSINT sources." },
];

const CATEGORIES = ["General", "Fun/Tools", "Automation", "Management", "OSINT"] as const;
const CAT_ACCENT: Record<string, string> = {
  General:    "text-blue-400 border-blue-400/20",
  "Fun/Tools":"text-purple-400 border-purple-400/20",
  Automation: "text-yellow-400 border-yellow-400/20",
  Management: "text-orange-400 border-orange-400/20",
  OSINT:      "text-red-400 border-red-400/20",
};

function CommandsPanel({ prefix }: { prefix: string }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["General"]));

  const toggle = (cat: string) => setOpen(prev => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const q = search.toLowerCase().trim();
  const filtered = (cat: string) =>
    COMMANDS.filter(c => c.cat === cat && (!q || c.usage.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)));
  const totalShown = CATEGORIES.reduce((n, cat) => n + filtered(cat).length, 0);

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Commands</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/40">{COMMANDS.length} total</span>
      </div>
      <div className="px-3 py-2 border-b border-white/8">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(new Set(CATEGORIES)); }}
            placeholder="Search commands..."
            className="w-full bg-white/5 border border-white/8 rounded-md h-7 pl-7 pr-3 text-[11px] font-mono text-white placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors"
          />
          {search && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/40">{totalShown}</span>}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {CATEGORIES.map(cat => {
          const cmds = filtered(cat);
          if (q && cmds.length === 0) return null;
          const isOpen = open.has(cat);
          return (
            <div key={cat}>
              <button
                onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/3 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-mono font-bold uppercase tracking-wider", CAT_ACCENT[cat])}>{cat}</span>
                  <span className="text-[9px] text-muted-foreground/40 font-mono">{cmds.length}</span>
                </div>
                <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform", isOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-1">
                      {cmds.map(cmd => (
                        <div
                          key={cmd.usage}
                          className="flex items-baseline justify-between gap-2 px-4 py-1 hover:bg-white/3 transition-colors"
                        >
                          <code className="text-[11px] font-mono text-primary flex-shrink-0 whitespace-nowrap">
                            {prefix}{cmd.usage}
                          </code>
                          <span className="text-[10px] text-muted-foreground/60 text-right truncate">{cmd.desc}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogsPanel({ botId }: { botId: number }) {
  const { data } = useQuery<{ logs: Array<{ ts: number; msg: string }> }>({
    queryKey: [`/api/bots/${botId}/logs`],
    refetchInterval: 5000,
  });
  const logs = data?.logs || [];

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Error Logs</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/40">live · {logs.length}</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] font-mono text-muted-foreground/30">No errors — all clear</p>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map((log, i) => (
              <div key={i} className="px-4 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-mono text-muted-foreground/30">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-red-400/80 break-all">{log.msg}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JoinServerPanel({ botId }: { botId: number }) {
  const [invite, setInvite] = useState("");
  const { toast } = useToast();

  const joinMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bots/${botId}/join`, { invite: invite.trim() });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Joined!", description: `Successfully joined: ${data.guildName || "server"}` });
      setInvite("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to join", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Section title="Join Server" icon={<LogIn className="w-4 h-4" />}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-mono">Enter a Discord invite link or code to join a server with this bot account.</p>
        <div className="flex gap-2">
          <input
            value={invite}
            onChange={e => setInvite(e.target.value)}
            onKeyDown={e => e.key === "Enter" && invite.trim() && joinMut.mutate()}
            placeholder="discord.gg/abc123 or invite code"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg h-10 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-all"
            data-testid="input-join-invite"
          />
          <button
            onClick={() => joinMut.mutate()}
            disabled={!invite.trim() || joinMut.isPending}
            className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-black text-xs font-bold font-mono flex items-center gap-1.5 transition-all"
            data-testid="button-join-server"
          >
            {joinMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            Join
          </button>
        </div>
      </div>
    </Section>
  );
}

function BullyTargetsPanel({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setInput("");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-mono">Discord user IDs that will receive auto-bully messages.</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Discord user ID..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg h-9 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-all"
          data-testid="input-bully-target"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white disabled:opacity-40 transition-all"
          data-testid="button-add-bully-target"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(id => (
            <div key={id} className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-red-500/10 border border-red-500/20 group">
              <span className="text-[11px] font-mono text-red-300">{id}</span>
              <button
                onClick={() => onChange(value.filter(v => v !== id))}
                className="text-red-400/40 hover:text-red-400 transition-colors"
                data-testid={`button-remove-bully-${id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {value.length === 0 && (
        <p className="text-[11px] font-mono text-muted-foreground/30">No targets added</p>
      )}
    </div>
  );
}

export default function BotDetail() {
  const [, params] = useRoute("/bot/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: bot, isLoading } = useBot(id);
  const updateBot = useUpdateBot();
  const botAction = useBotAction();

  const form = useForm({
    resolver: zodResolver(insertBotConfigSchema.omit({ id: true, lastSeen: true, token: true, userId: true } as any)),
    defaultValues: {
      name: "",
      rpcTitle: "",
      rpcSubtitle: "",
      rpcAppName: "",
      rpcImage: "",
      rpcType: "PLAYING",
      rpcStartTimestamp: "",
      rpcEndTimestamp: "",
      presenceStatus: "online",
      statusMoverWords: "",
      commandPrefix: ".",
      afkMessage: "",
      nitroSniper: false,
      isRunning: true,
      isAfk: false,
      bullyTargets: [] as string[],
      passcode: "",
      gcAllowAll: false,
      whitelistedGcs: [] as string[],
    }
  });

  useEffect(() => {
    if (bot && bot !== BOT_NOT_FOUND && bot !== BOT_ACCESS_DENIED) {
      form.reset({
        name: bot.name,
        rpcTitle: bot.rpcTitle || "",
        rpcSubtitle: bot.rpcSubtitle || "",
        rpcAppName: bot.rpcAppName || "",
        rpcImage: bot.rpcImage || "",
        rpcType: bot.rpcType || "PLAYING",
        rpcStartTimestamp: bot.rpcStartTimestamp || "",
        rpcEndTimestamp: bot.rpcEndTimestamp || "",
        presenceStatus: (bot as any).presenceStatus || "online",
        statusMoverWords: (bot as any).statusMoverWords || "",
        commandPrefix: bot.commandPrefix || ".",
        afkMessage: (bot as any).afkMessage || "",
        nitroSniper: bot.nitroSniper || false,
        isRunning: bot.isRunning || false,
        isAfk: (bot as any).isAfk || false,
        bullyTargets: ((bot.bullyTargets || []) as string[]),
        passcode: bot.passcode || "",
        gcAllowAll: bot.gcAllowAll || false,
        whitelistedGcs: ((bot.whitelistedGcs || []) as string[]),
      });
    }
  }, [bot, form]);

  const onSubmit = (data: any) => {
    updateBot.mutate({
      id,
      ...data,
      rpcStartTimestamp: data.rpcStartTimestamp ? String(data.rpcStartTimestamp) : "",
      rpcEndTimestamp: data.rpcEndTimestamp ? String(data.rpcEndTimestamp) : "",
    }, {
      onSuccess: () => toast({ title: "Saved!", description: "Bot configuration updated." }),
      onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (bot === BOT_ACCESS_DENIED) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-4 p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
        <Lock className="w-7 h-7 text-destructive" />
      </div>
      <div>
        <h1 className="font-mono text-lg font-bold text-white mb-1">Access Denied</h1>
        <p className="text-sm text-muted-foreground font-mono">This instance belongs to another user.</p>
      </div>
      <Link href="/">
        <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-mono text-white hover:bg-white/10 transition-all">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </Link>
    </div>
  );

  if (!bot || bot === BOT_NOT_FOUND) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-4 p-6 text-center">
      <p className="text-muted-foreground font-mono">Bot not found</p>
      <Link href="/">
        <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-mono text-white hover:bg-white/10 transition-all">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </Link>
    </div>
  );

  const prefix = form.watch("commandPrefix") || ".";
  const bullyTargets = (form.watch("bullyTargets") as string[]) || [];

  return (
    <div className="min-h-screen bg-black">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/90 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/">
              <button className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white flex items-center justify-center transition-all flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-sm sm:text-base truncate">{bot.name}</h1>
                <span className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  bot.isRunning ? "bg-primary shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "bg-destructive/70"
                )} />
              </div>
              {bot.discordTag ? (
                <p className="text-xs text-primary/60 font-mono">@{bot.discordTag}</p>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">ID #{bot.id.toString().padStart(4, '0')}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={() => botAction.mutate({ id, action: 'restart' }, {
                onSuccess: () => { toast({ title: "Restarting…" }); qc.invalidateQueries({ queryKey: ["/api/bots", id] }); },
                onError: (e: any) => toast({ title: "Restart failed", description: e?.message, variant: "destructive" }),
              })}
              disabled={botAction.isPending}
              className="h-9 px-2 sm:px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white text-xs font-mono flex items-center gap-1.5 sm:gap-2 transition-all disabled:opacity-50"
              data-testid="button-restart-bot"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", botAction.isPending && "animate-spin")} />
              <span className="hidden sm:inline">Restart</span>
            </button>
            <button
              onClick={form.handleSubmit(onSubmit)}
              disabled={updateBot.isPending}
              className="h-9 px-3 sm:px-4 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-black text-xs font-bold font-mono flex items-center gap-1.5 sm:gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              data-testid="button-save-bot"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save Changes</span>
              <span className="sm:hidden">Save</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Rich Presence */}
            <Section title="Rich Presence" icon={<Activity className="w-4 h-4" />}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Activity Type</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                      {...form.register("rpcType")}
                      data-testid="select-rpc-type"
                    >
                      <option value="PLAYING">PLAYING</option>
                      <option value="STREAMING">STREAMING</option>
                      <option value="LISTENING">LISTENING</option>
                      <option value="WATCHING">WATCHING</option>
                    </select>
                  </div>
                  <CyberInput label="App Name" placeholder="Application Name" {...form.register("rpcAppName")} data-testid="input-rpc-app-name" />
                </div>
                <CyberInput label="Title / Details" placeholder="Rich Presence Title" {...form.register("rpcTitle")} data-testid="input-rpc-title" />
                <CyberInput label="Subtitle / State" placeholder="Rich Presence Subtitle" {...form.register("rpcSubtitle")} data-testid="input-rpc-subtitle" />
                <CyberInput label="Large Image URL" placeholder="https://..." {...form.register("rpcImage")} data-testid="input-rpc-image" />
                <div className="grid grid-cols-2 gap-4">
                  <CyberInput label="Start Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcStartTimestamp")} />
                  <CyberInput label="End Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcEndTimestamp")} />
                </div>
              </div>
            </Section>

            {/* Bot Settings */}
            <Section title="Bot Settings" icon={<Settings2 className="w-4 h-4" />}>
              <div className="space-y-4">
                <CyberInput label="Command Prefix" placeholder="." {...form.register("commandPrefix")} data-testid="input-command-prefix" />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Presence Status</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                      {...form.register("presenceStatus")}
                      data-testid="select-presence-status"
                    >
                      <option value="online">Online</option>
                      <option value="idle">Idle</option>
                      <option value="dnd">Do Not Disturb</option>
                      <option value="invisible">Invisible</option>
                    </select>
                  </div>
                  <CyberInput
                    label="AFK Auto-Reply"
                    placeholder="Be right back..."
                    {...form.register("afkMessage")}
                    data-testid="input-afk-message"
                  />
                </div>

                <CyberInput
                  label="Status Mover Words (comma-separated)"
                  placeholder="coding, gaming, vibing"
                  {...form.register("statusMoverWords")}
                  data-testid="input-status-mover"
                />
                <p className="text-[11px] font-mono text-muted-foreground/40 -mt-2">Cycles through these words as your custom status every 5 seconds. Leave blank to disable.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-4 bg-white/3 rounded-lg border border-white/8">
                    <div>
                      <Label className="text-sm font-medium text-white">Nitro Sniper</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Auto-claim Nitro gifts</p>
                    </div>
                    <Switch
                      checked={form.watch("nitroSniper")}
                      onCheckedChange={(v) => form.setValue("nitroSniper", v)}
                      data-testid="switch-nitro-sniper"
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/3 rounded-lg border border-white/8">
                    <div>
                      <Label className="text-sm font-medium text-white">Allow All GCs</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Accept all group chat invites</p>
                    </div>
                    <Switch
                      checked={form.watch("gcAllowAll")}
                      onCheckedChange={(v) => form.setValue("gcAllowAll", v)}
                      data-testid="switch-gc-allow-all"
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Bully Targets */}
            <Section title="Bully Targets" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
              <BullyTargetsPanel
                value={bullyTargets}
                onChange={(v) => form.setValue("bullyTargets", v)}
              />
            </Section>

            {/* Join Server */}
            {bot.isRunning && <JoinServerPanel botId={id} />}

            {/* Commands */}
            <CommandsPanel prefix={prefix} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Status */}
            <Section title="Status">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-mono">Connection</span>
                  <span className={cn(
                    "text-xs font-mono font-bold",
                    bot.isRunning ? "text-primary" : "text-destructive/80"
                  )}>
                    {bot.isRunning ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
                {bot.discordTag && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-mono">Account</span>
                    <span className="text-xs font-mono text-primary/80">@{bot.discordTag}</span>
                  </div>
                )}
                {bot.discordId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-mono">Discord ID</span>
                    <span className="text-xs font-mono text-white/60 break-all text-right">{bot.discordId}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-mono">Bot ID</span>
                  <span className="text-xs font-mono text-white">#{bot.id}</span>
                </div>
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-white">Instance Active</Label>
                    <Switch
                      checked={form.watch("isRunning")}
                      onCheckedChange={(v) => form.setValue("isRunning", v)}
                      data-testid="switch-instance-active"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Toggle to start or stop this bot</p>
                </div>
              </div>
            </Section>

            {/* Quick reference */}
            <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Quick Reference</h3>
              </div>
              <div className="p-5 space-y-1">
                {[
                  { cmd: "help",         label: "All commands" },
                  { cmd: "ping",         label: "Check latency" },
                  { cmd: "stopall",      label: "Stop everything" },
                  { cmd: "nitro on",     label: "Sniper on" },
                  { cmd: "afk",          label: "Toggle AFK" },
                  { cmd: "spam 5 hi",    label: "Spam 5×" },
                  { cmd: "massdm msg",   label: "DM all friends" },
                  { cmd: "snipe",        label: "Last deleted msg" },
                  { cmd: "purge 10",     label: "Delete 10 msgs" },
                  { cmd: "join <inv>",   label: "Join server" },
                  { cmd: "osint user @", label: "OSINT a user" },
                  { cmd: "full report",  label: "Full dossier" },
                ].map(({ cmd, label }) => (
                  <div key={cmd} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0 group">
                    <code className="text-xs font-mono text-primary group-hover:text-primary/80 transition-colors">
                      {prefix}{cmd}
                    </code>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live error logs */}
            <LogsPanel botId={id} />
          </div>
        </div>
      </main>
    </div>
  );
}
