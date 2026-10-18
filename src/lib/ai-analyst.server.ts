import type { Kline } from '@/lib/binance';

export const AI_MODEL = 'anthropic/claude-sonnet-5';
export const AI_MIN_CONFIDENCE = 85;
export type AiVerdict = { approve: boolean; confidence: number; reason: string };

const fmt = (b: Kline[]) => b.slice(-40).map(k => [new Date(k.time * 1000).toISOString().slice(11, 16), k.open, k.high, k.low, k.close, Math.round(k.volume)].join(',')).join('\n');

/** Claude reviews a technically-valid signal; fails closed (no trade) on any error. */
export async function aiReviewTrade(p: { symbol: string; side: 'long' | 'short'; price: number; stop: number; target: number; signalReason: string; bars: Kline[]; filter: Kline[]; frame: string }): Promise<AiVerdict> {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) return { approve: false, confidence: 0, reason: 'مفتاح الذكاء الاصطناعي غير متوفر' };
  const system = 'You are a strict institutional risk manager for intraday scalping (gold/BTC). Reject anything ambiguous: liquidity sweeps against the trade, fakeout breakouts, exhausted moves, choppy structure, poor risk/reward. Approve only high-quality setups. Reply with ONLY JSON: {"approve":boolean,"confidence":0-100,"reason":"short Arabic explanation"}.';
  const user = `Symbol ${p.symbol}. Proposed ${p.side.toUpperCase()} at ${p.price}, stop ${p.stop}, target ${p.target}.\nIndicator engine says: ${p.signalReason}\nExecution frame ${p.frame} candles (time,o,h,l,c,vol):\n${fmt(p.bars)}\nHigher frame candles:\n${fmt(p.filter)}`;
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 4000, stream: true, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok || !res.body) { console.error('ai review', res.status, await res.text().catch(() => '')); return { approve: false, confidence: 0, reason: `تعذر تحليل الذكاء الاصطناعي (${res.status}) — لم تُفتح الصفقة` }; }
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '', text = '', refused = false;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() ?? '';
      for (const l of lines) { if (!l.startsWith('data:')) continue; try { const e = JSON.parse(l.slice(5)); if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') text += e.delta.text; if (e.delta?.stop_reason === 'refusal') refused = true; } catch { /* partial */ } }
    }
    if (refused) return { approve: false, confidence: 0, reason: 'رفض الذكاء الاصطناعي التحليل' };
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const confidence = Math.max(0, Math.min(100, Number(j.confidence) || 0));
    return { approve: !!j.approve && confidence >= AI_MIN_CONFIDENCE, confidence, reason: String(j.reason ?? '').slice(0, 300) };
  } catch (e) { console.error('ai review', e); return { approve: false, confidence: 0, reason: 'تعذر تحليل الذكاء الاصطناعي — لم تُفتح الصفقة' }; }
}
