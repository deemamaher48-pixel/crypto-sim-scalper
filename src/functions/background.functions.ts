import { fetchNewsTimes } from '@/lib/news-guard';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { initialPaperState, stepPaper, type PaperState } from '@/lib/background-paper';
import { fetchKlines } from '@/lib/binance';
import type { Json } from '@/integrations/supabase/types';
async function db(){return (await import('@/integrations/supabase/client.server')).supabaseAdmin;}
export async function mutatePaper(userId:string, change:(s:PaperState)=>Promise<{state:PaperState;message:string}>){return locked(userId,change);}
async function locked(userId:string, change:(s:PaperState)=>Promise<{state:PaperState;message:string}>, tick=false){
 const client=await db(), token=crypto.randomUUID();
 const {data:claimed,error}=await client.rpc('claim_paper_service',{p_user:userId,p_token:token});if(error)throw error;if(!claimed)throw new Error('البوت يعالج طلباً آخر، جرّب بعد قليل');
 try{
 const {data:row,error:readError}=await client.from('paper_services').select('*').eq('user_id',userId).single();if(readError)throw readError;
 const result=await change(row.state as unknown as PaperState);
 const {data:committed,error:commitError}=await client.rpc('commit_paper_service',{p_user:userId,p_token:token,p_state:result.state as unknown as Json,p_message:result.message,p_tick:tick});if(commitError)throw commitError;if(!committed)throw new Error('تعذر حفظ حالة البوت');
 return result;
 }catch(e){await client.from('paper_services').update({lease_token:null,lease_until:null,last_message:'تعذر التحديث — سيحاول البوت مجدداً'}).eq('user_id',userId).eq('lease_token',token);throw e;}
}
export async function tickBackgroundUser(userId:string,manual?:'long'|'short'|'close'){
 const before=new Map<string,{closed:boolean;tp1:boolean}>();
 const r=await locked(userId,async s=>{s.trades.slice(0,5).forEach(t=>before.set(t.id,{closed:!!t.closedAt,tp1:!!t.tp1Hit}));const [bars,filter,news]=await Promise.all([fetchKlines(s.symbol,s.sniper?'1m':'5m',300),fetchKlines(s.symbol,s.sniper?'5m':'15m',200),fetchNewsTimes()]);
  const out=stepPaper(s,bars,filter,Date.now(),manual,news);
  const nt=out.state.trades[0];
  if(!manual && nt && !nt.closedAt && !s.trades.some(x=>x.id===nt.id)){
   const {aiReviewTrade}=await import('@/lib/ai-analyst.server');
   const v=await aiReviewTrade({symbol:s.symbol==='PAXGUSDT'?'XAUUSD':s.symbol,side:nt.side,price:nt.entry,stop:nt.stop,target:nt.target,signalReason:nt.entryReason,bars,filter,frame:s.sniper?'1m':'5m'});
   if(!v.approve) return {state:{...s,lastCandle:out.state.lastCandle},message:`🧠 الذكاء الاصطناعي رفض الصفقة (ثقة ${v.confidence}%): ${v.reason}`};
   nt.entryReason=`${nt.entryReason} | 🧠 AI ${v.confidence}%: ${v.reason}`;
   out.message=`${out.message} — موافقة الذكاء الاصطناعي ${v.confidence}%`;
  }
  return out;},true);
 try{const {notifyTradeChanges}=await import('@/lib/telegram.server');await notifyTradeChanges(userId,before,r.state);}catch(e){console.error('telegram notify',e);}
 return r;
}
export const getBackground = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data,error}=await context.supabase.from('paper_services').select('state,last_tick_at,last_message').eq('user_id',context.userId).maybeSingle();if(error)throw error;return data?{state:data.state as unknown as PaperState,lastTickAt:data.last_tick_at,message:data.last_message}:null;
});
export const backgroundAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(i=>z.object({action:z.enum(['enable','sniper','symbol','risk','long','short','close','tick']),on:z.boolean().optional(),symbol:z.enum(['BTCUSDT','PAXGUSDT']).optional(),risk:z.object({positionUsdt:z.number().min(10).max(100000).optional(),maxTradesPerDay:z.number().int().min(1).max(500).optional(),maxDailyLossUsdt:z.number().min(1).max(100000).optional()}).optional()}).parse(i)).handler(async({context,data})=>{
 const client=await db();
 const {data:existing,error}=await client.from('paper_services').select('user_id').eq('user_id',context.userId).maybeSingle();if(error)throw error;
 if(!existing){
 const {data:open,error:oe}=await client.from('trades').select('id').eq('user_id',context.userId).eq('status','open').limit(1);if(oe)throw oe;if(open?.length)throw new Error('أغلق صفقة الحساب المفتوحة أولاً');
 const {error:ie}=await client.from('paper_services').insert({user_id:context.userId,state:initialPaperState() as unknown as Json});if(ie)throw ie;
 const {error:se}=await client.from('bot_settings').update({enabled:false}).eq('user_id',context.userId);if(se)throw se;
 }
 if(data.action==='tick')return tickBackgroundUser(context.userId);
 if(data.action==='long'||data.action==='short'||data.action==='close')return tickBackgroundUser(context.userId,data.action);
 return locked(context.userId,async s=>{
 if((data.action==='sniper'||data.action==='symbol')&&s.trades.some(t=>!t.closedAt))throw new Error('أغلق الصفقة قبل التبديل');
 if(data.action==='enable'){s.enabled=!!data.on;if(data.on&&s.sniper){s.sniperResetAt=Date.now();s.sniperPausedUntil=0;}}
 if(data.action==='sniper'){s.sniper=!!data.on;s.lastCandle=0;if(data.on){s.sniperResetAt=Date.now();s.sniperPausedUntil=0;}}
 if(data.action==='symbol'&&data.symbol){s.symbol=data.symbol;s.lastCandle=0;}
 if(data.action==='risk'&&data.risk){
  if(data.risk.positionUsdt!=null)s.settings.positionUsdt=data.risk.positionUsdt;
  if(data.risk.maxTradesPerDay!=null)s.settings.maxTradesPerDay=data.risk.maxTradesPerDay;
  if(data.risk.maxDailyLossUsdt!=null)s.settings.maxDailyLossUsdt=data.risk.maxDailyLossUsdt;
 }
 return {state:s,message:s.enabled?'البوت يعمل بالخلفية':'البوت متوقف'};
 });
});
