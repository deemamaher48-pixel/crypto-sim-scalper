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

  const M = await import('@/lib/mt5-telegram.server');
  const show = async (v: { text: string; kb: any }) => {
    if (cb) {
      const r = await T.tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: v.text, reply_markup: { inline_keyboard: v.kb } });
      if (r.ok || String(r.description ?? '').includes('not modified')) return;
    }
    await T.tg('sendMessage', { chat_id: chatId, text: v.text, reply_markup: { inline_keyboard: v.kb } });
  };

  const text: string = msg?.text ?? '';
  if (msg) {
    if (text.startsWith('/key')) {
      const days = Math.min(365, Math.max(1, Number(text.split(/\s+/)[1]) || 30));
      const code = `VIP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      await db.from('tg_license_keys').insert({ code, days });
      return T.tg('sendMessage', { chat_id: chatId, text: `🔑 كود تفعيل ${days} يوم:\n${code}\n\nالزبون يرسل للبوت: /redeem ${code}` });
    }
    return show(await M.mt5Panel());
  }

  // Answer the button immediately so Telegram stops the loading spinner.
  await T.tg('answerCallbackQuery', { callback_query_id: cb.id });
  const d: string = cb?.data ?? 'mt5';
  let view;
  try { view = d.startsWith('mt5:') ? await M.mt5Action(d.slice(4)) : await M.mt5Panel(); }
  catch (e) { view = await M.mt5Panel(`⚠️ صار خطأ: ${(e as Error).message}`); }
  return show(view);
}
