import { createFileRoute } from '@tanstack/react-router';
import { createHash, timingSafeEqual } from 'crypto';
import type { PaperState } from '@/lib/background-paper';

function eq(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }

export const Route = createFileRoute('/api/public/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env['TELEGRAM_API_KEY'];
        if (!key) return new Response('not configured', { status: 500 });
        const expected = createHash('sha256').update(`telegram-webhook:${key}`).digest('base64url');
        if (!eq(request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '', expected)) return new Response('Unauthorized', { status: 401 });
        const u = await request.json();
        try { await handle(u); } catch (e) { console.error('tg webhook', e); }
        return Response.json({ ok: true });
      },
    },
  },
});

async function handle(u: any) {
  const T = await import('@/lib/telegram.server');
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { mutatePaper, tickBackgroundUser } = await import('@/functions/background.functions');
  const msg = u.message, cb = u.callback_query;
  const chatId: number | undefined = msg?.chat?.id ?? cb?.message?.chat?.id;
  const fromId: number | undefined = msg?.from?.id ?? cb?.from?.id;
  if (!chatId || !fromId) return;
  const { data: adm } = await db.from('telegram_admins').select('user_id').eq('chat_id', fromId).maybeSingle();

  // Public / subscriber side
  if (!adm) {
    const text: string = msg?.text ?? '';
    if (text.startsWith('/redeem')) {
      const code = text.split(/\s+/)[1]?.trim();
      const { data: k } = code ? await db.from('tg_license_keys').select('*').eq('code', code).is('used_by', null).maybeSingle() : { data: null };
      if (!k) return T.tg('sendMessage', { chat_id: chatId, text: '❌ الكود غير صالح أو مستخدم' });
      const { data: cur } = await db.from('tg_subscribers').select('expires_at').eq('chat_id', fromId).maybeSingle();
      const base = Math.max(Date.now(), cur ? Date.parse(cur.expires_at) : 0);
      const exp = new Date(base + k.days * 864e5).toISOString();
      await db.from('tg_license_keys').update({ used_by: fromId, used_at: new Date().toISOString() }).eq('code', code!);
      await db.from('tg_subscribers').upsert({ chat_id: fromId, expires_at: exp });
      return T.tg('sendMessage', { chat_id: chatId, text: `💎 تم تفعيل اشتراكك حتى ${exp.slice(0, 10)}` });
    }
    const { data: sub } = await db.from('tg_subscribers').select('expires_at').eq('chat_id', fromId).maybeSingle();
    const active = sub && Date.parse(sub.expires_at) > Date.now();
    const days = active ? Math.ceil((Date.parse(sub!.expires_at) - Date.now()) / 864e5) : 0;
    return T.tg('sendMessage', { chat_id: chatId, text: `👋 أهلاً بك\nمعرفك: ${fromId}\nالعضوية: ${active ? `💎 VIP نشط — متبقي ${days} يوم` : '🆓 غير مفعل'}\n\nلتفعيل اشتراك أرسل:\n/redeem الكود` });
  }

  const userId = adm.user_id;
  const show = async (v: { text: string; kb: any }) => {
    if (cb) {
      await T.tg('answerCallbackQuery', { callback_query_id: cb.id });
      const r = await T.tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: v.text, reply_markup: { inline_keyboard: v.kb } });
      if (r.ok || String(r.description ?? '').includes('not modified')) return;
    }
    await T.tg('sendMessage', { chat_id: chatId, text: v.text, reply_markup: { inline_keyboard: v.kb } });
  };
  const load = async () => {
    const { data } = await db.from('paper_services').select('state,last_message').eq('user_id', userId).single();
    return { s: data!.state as unknown as PaperState, last: data!.last_message as string | null };
  };
  const home = async (note?: string) => { const { s, last } = await load(); const v = T.dashboard(s, note ?? last); return show(v); };
  const mut = async (fn: (s: PaperState) => string) => { try { const r = await mutatePaper(userId, async s => ({ state: s, message: fn(s) })); return r; } catch (e) { return { message: `⚠️ ${(e as Error).message}` }; } };

  const text: string = msg?.text ?? '';
  if (msg) {
    if (text.startsWith('/key')) {
      const days = Math.min(365, Math.max(1, Number(text.split(/\s+/)[1]) || 30));
      const code = `VIP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      await db.from('tg_license_keys').insert({ code, days });
      return T.tg('sendMessage', { chat_id: chatId, text: `🔑 كود تفعيل ${days} يوم:\n${code}\n\nالزبون يرسل للبوت: /redeem ${code}` });
    }
    return home();
  }

  const d: string = cb?.data ?? 'home';
  const open = (s: PaperState) => s.trades.some(t => !t.closedAt);
  if (d === 'home') return home();
  if (d === 'enable') return home((await mut(s => { s.enabled = !s.enabled; if (s.enabled && s.sniper) { s.sniperResetAt = Date.now(); s.sniperPausedUntil = 0; } return s.enabled ? 'تم تشغيل البوت' : 'تم إيقاف البوت'; })).message);
  if (d === 'm5' || d === 'm1') return home((await mut(s => { if (open(s)) throw new Error('أغلق الصفقة قبل التبديل'); s.sniper = d === 'm1'; s.lastCandle = 0; if (s.sniper) { s.sniperResetAt = Date.now(); s.sniperPausedUntil = 0; } return s.sniper ? 'تم تفعيل قناص 1m' : 'تم تفعيل نظام 5m'; })).message);
  if (d === 'news') return home((await mut(s => { s.newsShield = s.newsShield === false; return s.newsShield ? 'درع الأخبار مفعّل' : 'درع الأخبار متوقف'; })).message);
  if (d === 'sym') return home((await mut(s => { if (open(s)) throw new Error('أغلق الصفقة قبل التبديل'); s.symbol = s.symbol === 'PAXGUSDT' ? 'BTCUSDT' : 'PAXGUSDT'; s.lastCandle = 0; return 'تم تبديل الأصل'; })).message);
  if (d === 'kill') { await mut(s => { s.enabled = false; return 'إيقاف طوارئ'; }); try { await tickBackgroundUser(userId, 'close'); } catch { /* no open trade */ } return home('🚨 تم إيقاف البوت وإغلاق الصفقات'); }
  if (d === 'trades') return show(T.tradesView((await load()).s));
  if (d === 'be') { await mut(s => { s.trades.filter(t => !t.closedAt).forEach(t => { t.stop = t.entry; }); return 'تم التأمين على الدخول'; }); return show(T.tradesView((await load()).s)); }
  if (d === 'closeall' || d === 'long' || d === 'short') { let note: string; try { note = (await tickBackgroundUser(userId, d === 'closeall' ? 'close' : d)).message; } catch (e) { note = `⚠️ ${(e as Error).message}`; } return home(note); }
  if (d === 'risk') return show(T.riskView((await load()).s));
  if (d.startsWith('size:') || d.startsWith('loss:')) { const v = Number(d.split(':')[1]); await mut(s => { if (d.startsWith('size:')) s.settings.positionUsdt = v; else s.settings.maxDailyLossUsdt = v; return 'تم الحفظ'; }); return show(T.riskView((await load()).s)); }
  if (d === 'reset') { await mut(s => { s.sniperResetAt = Date.now(); s.sniperPausedUntil = 0; return 'تم فك التبريد'; }); return home('🔓 تم فك التبريد وقاطع الأمان'); }
  if (d === 'stats') return show(T.statsView((await load()).s));
  if (d === 'subs') {
    const { data } = await db.from('tg_subscribers').select('chat_id,expires_at').gt('expires_at', new Date().toISOString()).order('expires_at');
    const list = (data ?? []).map(r => `• ${r.chat_id} حتى ${r.expires_at.slice(0, 10)}`).join('\n') || 'لا يوجد مشتركين بعد';
    return show({ text: `👥 المشتركين النشطين\n\n${list}\n\nلتوليد كود: أرسل /key 30 (عدد الأيام)`, kb: [[{ text: '🔑 كود 30 يوم', callback_data: 'key:30' }, { text: '🔑 تجريبي يوم', callback_data: 'key:1' }], T.back] });
  }
  if (d.startsWith('key:')) {
    const days = Number(d.split(':')[1]), code = `VIP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await db.from('tg_license_keys').insert({ code, days });
    await T.tg('answerCallbackQuery', { callback_query_id: cb.id });
    return T.tg('sendMessage', { chat_id: chatId, text: `🔑 كود ${days} يوم:\n${code}\n\nالزبون يرسل: /redeem ${code}` });
  }
  return home();
}
