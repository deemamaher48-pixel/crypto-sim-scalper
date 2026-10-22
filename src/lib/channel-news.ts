// High-impact news from the user's own news channel (t.me/s/fxdiab public page) — pure parsing + phase logic.
export type ChannelPost = { at: number; text: string };
export type ChannelNews = { phase: "shock" | "post"; start: number; why: string; bias: "BUY" | "SELL" | null } | null;

const HIGH = /(CPI|NFP|PCE|GDP|PMI|FOMC|التضخم|الوظائف|الفائدة|الفيدرالي|باول|غير الزراعية|البطالة|عاجل|🟥|‼️)/i;
const MIN = 60_000;

export function parseChannel(html: string): ChannelPost[] {
  const out: ChannelPost[] = [];
  for (const blk of html.split('class="tgme_widget_message_wrap').slice(1)) {
    const t = blk.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    const d = blk.match(/datetime="([^"]+)"/)?.[1];
    if (!t || !d) continue;
    const text = t.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
    const at = Date.parse(d);
    if (Number.isFinite(at)) out.push({ at, text });
  }
  return out;
}

export function goldBias(text: string): "BUY" | "SELL" | null {
  const m = text.match(/الذهب\s*:\s*(إيجابي|سلبي)/);
  return m ? (m[1] === "إيجابي" ? "BUY" : "SELL") : null;
}

/** Newest high-impact post: first 3 min = shock (block), next 30 min = post (trade only with gold bias). */
export function channelPhase(posts: ChannelPost[], now: number, shockMin = 3, postMin = 30): ChannelNews {
  const hits = posts.filter((p) => HIGH.test(p.text) && now - p.at >= 0 && now - p.at < postMin * MIN).sort((a, b) => b.at - a.at);
  const p = hits[0];
  if (!p) return null;
  const title = p.text.split("\n")[0]!.slice(0, 70);
  return { phase: now - p.at < shockMin * MIN ? "shock" : "post", start: p.at, why: `قناة الأخبار: ${title}`, bias: goldBias(p.text) };
}

export async function fetchChannelPosts(): Promise<ChannelPost[]> {
  try {
    const r = await fetch("https://t.me/s/fxdiab", { headers: { "User-Agent": "Mozilla/5.0" } });
    return r.ok ? parseChannel(await r.text()) : [];
  } catch { return []; }
}
