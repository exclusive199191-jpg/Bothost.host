import { Client } from 'discord.js-selfbot-v13';
import type { InfiltratorAgent } from '@shared/schema';

interface AgentRuntime {
  client: Client;
  timer: NodeJS.Timeout | null;
  running: boolean;
}

const runtimes = new Map<number, AgentRuntime>();

async function pollinations(systemPrompt: string, userPrompt: string): Promise<string | null> {
  try {
    const resp = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const d: any = await resp.json();
      return (d?.choices?.[0]?.message?.content || '').trim() || null;
    }
    return (await resp.text()).trim() || null;
  } catch {
    return null;
  }
}

async function generateHumanMessage(name: string, serverName: string, recentMessages: string): Promise<string | null> {
  const system = `You are ${name}, a real human Discord user chatting in a server. You MUST sound 100% human at all times.

CORE RULES — never break these:
- Swear and cuss naturally when it fits the vibe. Use words like: fuck, shit, bro wtf, damn, ass, hell, ngl that's fucked, omfg, etc. Don't overdo it but don't avoid it either — real people swear
- Use emojis exactly like a real Discord user: 💀 😭 🤣 😂 fr fr, 🔥 😩 😤 bro 💀💀, not perfectly placed, just thrown in naturally
- Type mostly lowercase. Skip punctuation at the end of sentences. Use "..." when trailing off
- Keep it SHORT — usually 3 to 15 words. Occasionally longer if the vibe calls for it
- Use real Discord/internet slang: lol, lmao, lmfao, fr, ngl, tbh, idk, bruh, bro, omg, omfg, wtf, nah, yeah, ong, no cap, lowkey, highkey, deadass, frl, istg, ight, aight, bet, slay, based, ratio, W, L, mid, goated, rn, smh, imo, sus, kinda, gonna, wanna, tryna, prolly, rn, nvm, js, jk, yk, etc.
- React to what was just said — don't start a random new topic unless the chat has gone quiet
- Sometimes just send a single emoji or reaction like "💀" or "lmaooo" or "bro what"
- Occasionally make real typos: teh, adn, jsut, tho, bc, cuz, u, ur, r, rn, smth, ngl, smh
- NEVER use bullet points, numbered lists, or formal writing
- NEVER say you're an AI, a bot, or an assistant — you are a real human
- NEVER use perfect spelling/grammar every time — that's obviously a bot
- Match the energy: gaming chat = hype, memes = funny, chill = laid back, drama = react to it
- Sometimes go "lmaooo" or "bro 💀" or "ok that's actually kinda fire tho" — short reactive stuff
- Don't repeat what others say back to them like a bot would
- If someone says something funny, just laugh naturally: "LMAOOO", "bro 💀💀", "STOPPP"

You are in server: ${serverName}. Fit in completely. Be authentically human.`;

  const user = `Recent chat messages:\n${recentMessages}\n\nReply naturally as ${name}. Keep it real, short, human. Use emojis and cuss if it fits.`;
  return pollinations(system, user);
}

async function setProfile(client: Client, agent: InfiltratorAgent, guildId: string) {
  const user = client.user;
  if (!user) return;

  if (agent.avatarUrl) {
    try { await user.setAvatar(agent.avatarUrl); } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (agent.bio || agent.pronouns) {
    try {
      await (client as any).api.users('@me').profile.patch({
        data: { bio: agent.bio || '', pronouns: agent.pronouns || '' },
      });
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (agent.displayName && guildId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild?.members?.me) {
        await guild.members.me.setNickname(agent.displayName);
      }
    } catch { /* ignore */ }
  }
}

async function joinServer(client: Client, agent: InfiltratorAgent): Promise<string> {
  if (!agent.serverInvite) return agent.serverId || '';
  const code = agent.serverInvite
    .replace(/https?:\/\/discord\.gg\//i, '')
    .replace(/https?:\/\/discord\.com\/invite\//i, '')
    .trim();
  try {
    const inv: any = await client.fetchInvite(code);
    const guildId: string = inv?.guild?.id || agent.serverId || '';
    const alreadyIn = guildId && client.guilds.cache.has(guildId);
    if (!alreadyIn) {
      await inv.accept?.();
      await new Promise(r => setTimeout(r, 3000));
    }
    return guildId;
  } catch {
    return agent.serverId || '';
  }
}

function scheduleNext(agentId: number, fn: () => Promise<void>) {
  const rt = runtimes.get(agentId);
  if (!rt || !rt.running) return;
  const delay = (3 + Math.random() * 12) * 60 * 1000;
  rt.timer = setTimeout(fn, delay);
}

export const InfiltratorManager = {
  async initiate(
    agent: InfiltratorAgent,
    onStatusChange: (id: number, status: string, msg: string, tag?: string, discordId?: string) => void,
  ): Promise<{ success: boolean; error?: string }> {
    if (runtimes.has(agent.id)) {
      await InfiltratorManager.stop(agent.id);
    }

    onStatusChange(agent.id, 'joining', 'Connecting to Discord…');

    const client = new Client({ checkUpdate: false });
    const rt: AgentRuntime = { client, timer: null, running: true };
    runtimes.set(agent.id, rt);

    try {
      await client.login(agent.token);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Login timeout')), 20000);
        client.once('ready', () => { clearTimeout(t); resolve(); });
        client.once('error', (e) => { clearTimeout(t); reject(e); });
      });
    } catch (e: any) {
      runtimes.delete(agent.id);
      await client.destroy().catch(() => {});
      onStatusChange(agent.id, 'error', `Login failed: ${e?.message || e}`);
      return { success: false, error: e?.message || String(e) };
    }

    const tag = client.user?.tag || '';
    const discordId = client.user?.id || '';
    onStatusChange(agent.id, 'joining', `Logged in as ${tag}, joining server…`, tag, discordId);

    const guildId = await joinServer(client, agent);
    await new Promise(r => setTimeout(r, 2000));
    await setProfile(client, agent, guildId);

    onStatusChange(agent.id, 'active', `Active — lurking in channel`, tag, discordId);

    const loop = async () => {
      if (!rt.running) return;
      try {
        const channel: any = await client.channels.fetch(agent.channelId).catch(() => null);
        if (channel) {
          const msgs: any = await channel.messages.fetch({ limit: 25 }).catch(() => null);
          if (msgs && msgs.size > 0) {
            const lines = [...msgs.values()]
              .filter((m: any) => m.content?.trim())
              .reverse()
              .slice(-20)
              .map((m: any) => `${m.author.username}: ${m.content}`)
              .join('\n');

            const serverName = guildId ? (client.guilds.cache.get(guildId)?.name || 'Discord') : 'Discord';
            const name = agent.displayName || client.user?.username || 'User';
            const reply = await generateHumanMessage(name, serverName, lines);

            if (reply && rt.running) {
              await channel.sendTyping().catch(() => {});
              const typingDelay = Math.min(reply.length * 60 + Math.random() * 1500, 5000);
              await new Promise(r => setTimeout(r, typingDelay));
              if (rt.running) {
                await channel.send(reply);
                const current = parseInt(agent.messagesSent || '0', 10);
                agent.messagesSent = String(current + 1);
                onStatusChange(agent.id, 'active', `Active — ${agent.messagesSent} msg(s) sent`, tag, discordId);
              }
            }
          }
        }
      } catch { /* ignore per-loop errors */ }
      scheduleNext(agent.id, loop);
    };

    const initialDelay = (1 + Math.random() * 4) * 60 * 1000;
    rt.timer = setTimeout(loop, initialDelay);

    return { success: true };
  },

  async stop(agentId: number): Promise<void> {
    const rt = runtimes.get(agentId);
    if (!rt) return;
    rt.running = false;
    if (rt.timer) { clearTimeout(rt.timer); rt.timer = null; }
    await rt.client.destroy().catch(() => {});
    runtimes.delete(agentId);
  },

  isRunning(agentId: number): boolean {
    return runtimes.has(agentId) && (runtimes.get(agentId)?.running ?? false);
  },
};
