import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useUpdateBot } from "@/hooks/use-bots";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CyberInput } from "./CyberInput";
import { Activity, X, Save, Loader2, Clock, RotateCcw, Circle, Shuffle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BotConfig } from "@shared/schema";

interface RpcDialogProps {
  bot: BotConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RpcFormValues {
  rpcType: string;
  rpcAppName: string;
  rpcTitle: string;
  rpcSubtitle: string;
  rpcImage: string;
  rpcStartTimestamp: string;
  rpcEndTimestamp: string;
  presenceStatus: string;
  statusMoverWords: string;
}

const PRESENCE_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: "online", label: "Online", dot: "bg-emerald-400" },
  { value: "idle", label: "Sleep / Idle", dot: "bg-yellow-400" },
  { value: "dnd", label: "Do Not Disturb", dot: "bg-red-500" },
  { value: "invisible", label: "Invisible", dot: "bg-zinc-500" },
];

export function RpcDialog({ bot, open, onOpenChange }: RpcDialogProps) {
  const updateBot = useUpdateBot();
  const { toast } = useToast();

  const form = useForm<RpcFormValues>({
    defaultValues: {
      rpcType: bot.rpcType || "PLAYING",
      rpcAppName: bot.rpcAppName || "",
      rpcTitle: bot.rpcTitle || "",
      rpcSubtitle: bot.rpcSubtitle || "",
      rpcImage: bot.rpcImage || "",
      rpcStartTimestamp: bot.rpcStartTimestamp || "",
      rpcEndTimestamp: bot.rpcEndTimestamp || "",
      presenceStatus: (bot as any).presenceStatus || "online",
      statusMoverWords: (bot as any).statusMoverWords || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        rpcType: bot.rpcType || "PLAYING",
        rpcAppName: bot.rpcAppName || "",
        rpcTitle: bot.rpcTitle || "",
        rpcSubtitle: bot.rpcSubtitle || "",
        rpcImage: bot.rpcImage || "",
        rpcStartTimestamp: bot.rpcStartTimestamp || "",
        rpcEndTimestamp: bot.rpcEndTimestamp || "",
        presenceStatus: (bot as any).presenceStatus || "online",
        statusMoverWords: (bot as any).statusMoverWords || "",
      });
    }
  }, [open, bot]);

  const presenceStatusVal = form.watch("presenceStatus");
  const statusMoverVal = form.watch("statusMoverWords");
  const moverWordsList = (statusMoverVal || "")
    .split(",")
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const startVal = form.watch("rpcStartTimestamp");
  const endVal = form.watch("rpcEndTimestamp");

  function formatTime(secs: number): string {
    if (!secs || isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const startNum = parseFloat(startVal) || 0;
  const endNum = parseFloat(endVal) || 0;
  const hasSeekBar = endNum > 0;
  const remaining = endNum - startNum;
  const progressPct = hasSeekBar ? Math.min(100, Math.max(0, (startNum / endNum) * 100)) : 0;

  const onSubmit = (data: RpcFormValues) => {
    const startRaw = data.rpcStartTimestamp.trim();
    const endRaw = data.rpcEndTimestamp.trim();

    const startNum = parseFloat(startRaw);
    const endNum = parseFloat(endRaw);

    // Normalize the mover words: trim, drop empties, dedupe.
    const cleanedMoverWords = Array.from(
      new Set(
        (data.statusMoverWords || "")
          .split(",")
          .map((w) => w.trim())
          .filter((w) => w.length > 0)
      )
    ).join(", ");

    const allowed = new Set(["online", "idle", "dnd", "invisible"]);
    const presenceStatus = allowed.has((data.presenceStatus || "").toLowerCase())
      ? data.presenceStatus.toLowerCase()
      : "online";

    updateBot.mutate(
      {
        id: bot.id,
        rpcType: data.rpcType,
        rpcAppName: data.rpcAppName.trim(),
        rpcTitle: data.rpcTitle.trim(),
        rpcSubtitle: data.rpcSubtitle.trim(),
        rpcImage: data.rpcImage.trim(),
        rpcStartTimestamp: !isNaN(startNum) && startRaw !== "" ? String(Math.max(0, startNum)) : "",
        rpcEndTimestamp: !isNaN(endNum) && endRaw !== "" && endNum > 0 ? String(Math.max(1, endNum)) : "",
        presenceStatus,
        statusMoverWords: cleanedMoverWords,
      } as any,
      {
        onSuccess: () => {
          toast({ title: "RPC updated", description: "Rich Presence settings saved and applied." });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Failed to save", description: "Could not update RPC settings.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-white/10 sm:max-w-lg p-0 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        <div className="px-6 py-5 flex items-center justify-between border-b border-white/8">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-white">
              Configure RPC — {bot.name}
            </DialogTitle>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── Online Status ──────────────────────────────────────────── */}
          <div className="space-y-2 border border-white/8 rounded-xl p-4 bg-white/2">
            <div className="flex items-center gap-2">
              <Circle className="w-3.5 h-3.5 text-primary" />
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                Online Status
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESENCE_OPTIONS.map((opt) => {
                const selected = (presenceStatusVal || "online").toLowerCase() === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 h-10 rounded-lg cursor-pointer font-mono text-xs transition-all border ${
                      selected
                        ? "border-primary/60 bg-primary/10 text-white"
                        : "border-white/10 bg-white/5 text-muted-foreground hover:text-white hover:border-white/20"
                    }`}
                    data-testid={`status-option-${opt.value}`}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      className="sr-only"
                      {...form.register("presenceStatus")}
                    />
                    <span className={`w-2.5 h-2.5 rounded-full ${opt.dot} shadow-[0_0_6px_currentColor]`} />
                    <span className="uppercase tracking-wider">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Status Mover ───────────────────────────────────────────── */}
          <div className="space-y-2 border border-white/8 rounded-xl p-4 bg-white/2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shuffle className="w-3.5 h-3.5 text-primary" />
                <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                  Status Mover (Cycling Custom Status)
                </label>
              </div>
              {statusMoverVal && (
                <button
                  type="button"
                  onClick={() => form.setValue("statusMoverWords", "")}
                  className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-white transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="word1, word2, word3 (comma-separated, leave empty to disable)"
              className="w-full bg-white/5 border border-white/10 rounded-lg h-10 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/10 outline-none transition-all"
              data-testid="input-status-mover"
              {...form.register("statusMoverWords")}
            />
            {moverWordsList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {moverWordsList.map((w, i) => (
                  <span
                    key={`${w}-${i}`}
                    className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30 text-primary font-mono text-[10px]"
                  >
                    {w}
                  </span>
                ))}
                <span className="px-2 py-0.5 font-mono text-[10px] text-muted-foreground/70">
                  → cycles every 5s
                </span>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground/50 leading-relaxed">
                Provide 2+ words separated by commas to rotate them as your custom status. Cadence is fixed at 5s to stay within Discord's gateway rate limits.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                Activity Type
              </label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                {...form.register("rpcType")}
              >
                <option value="PLAYING">PLAYING</option>
                <option value="STREAMING">STREAMING</option>
                <option value="LISTENING">LISTENING</option>
                <option value="WATCHING">WATCHING</option>
              </select>
            </div>
            <CyberInput
              label="App Name"
              placeholder="e.g. Spotify"
              {...form.register("rpcAppName")}
            />
          </div>

          <CyberInput
            label="Title / Details"
            placeholder="Song name, game title..."
            {...form.register("rpcTitle")}
          />

          <CyberInput
            label="Subtitle / State"
            placeholder="Artist, level, status..."
            {...form.register("rpcSubtitle")}
          />

          <CyberInput
            label="Large Image URL"
            placeholder="https://..."
            {...form.register("rpcImage")}
          />

          {/* Duration / Seek Bar section */}
          <div className="space-y-3 border border-white/8 rounded-xl p-4 bg-white/2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                  Progress Bar / Seek Bar
                </label>
              </div>
              {(startVal || endVal) && (
                <button
                  type="button"
                  onClick={() => {
                    form.setValue("rpcStartTimestamp", "");
                    form.setValue("rpcEndTimestamp", "");
                  }}
                  className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-white transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-mono text-[10px] uppercase text-muted-foreground tracking-wider">
                  Elapsed (seconds)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 37"
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-10 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/10 outline-none transition-all"
                  {...form.register("rpcStartTimestamp")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-mono text-[10px] uppercase text-muted-foreground tracking-wider">
                  Total Duration (seconds)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 214"
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-10 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/10 outline-none transition-all"
                  {...form.register("rpcEndTimestamp")}
                />
              </div>
            </div>

            {/* Live preview of the seek bar */}
            {hasSeekBar && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span className="text-primary/80">{formatTime(startNum)}</span>
                  <span>–{formatTime(remaining > 0 ? remaining : 0)} remaining</span>
                  <span>{formatTime(endNum)}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="font-mono text-[10px] text-muted-foreground/60 text-center">
                  Preview · Discord will advance this in real time
                </p>
              </div>
            )}

            {!hasSeekBar && (
              <p className="font-mono text-[10px] text-muted-foreground/50 leading-relaxed">
                Fill in <span className="text-primary/70">Total Duration</span> to show a seek bar. <span className="text-primary/70">Elapsed</span> is how far into the track you already are (leave blank to start from 0:00). Example: elapsed&nbsp;37&nbsp;/&nbsp;duration&nbsp;214 → shows&nbsp;0:37&nbsp;of&nbsp;3:34.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={updateBot.isPending}
            className="w-full h-11 bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold font-mono text-sm rounded-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(var(--primary)/0.3)]"
          >
            {updateBot.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {updateBot.isPending ? "Saving..." : "Save RPC Settings"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
