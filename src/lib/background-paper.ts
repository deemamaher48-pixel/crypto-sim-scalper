import type { LocalTrade, LocalSettings } from '@/hooks/use-local-paper';
import type { Kline } from '@/lib/binance';
import { sidePnl, riskGate } from '@/lib/trading';
import { SMART, smartSignal, smartBracket, smartCandleExit, breakevenStop, inCooldown, inRolloverWindow } from '@/lib/smart-scalp';
import { SNIPER, sniperSignal, sniperBracket, sniperCandleExit, fastBreakeven, sniperCooldown, breakerTripped } from '@/lib/sniper-scalp';
export type PaperState = { settings: LocalSettings; usdt: number; btc: number; enabled: boolean; trades: LocalTrade[]; symbol: 'BTCUSDT' | 'PAXGUSDT'; sniper: boolean; sniperResetAt: number; sniperPausedUntil: number; lastCandle: number };
export function initialPaperState(): PaperState { return { settings: { emaFast:9,emaSlow:21,rsiPeriod:9,rsiOverbought:70,rsiOversold:30,stopLossPct:.5,takeProfitPct:1,positionUsdt:100,maxTradesPerDay:20,maxDailyLossUsdt:50,fastMode:false,useAtr:true,atrSlMult:1.5,atrTpMult:3 }, usdt:10000,btc:0,enabled:false,trades:[],symbol:'BTCUSDT',sniper:false,sniperResetAt:0,sniperPausedUntil:0,lastCandle:0 }; }
export function stepPaper(input: PaperState, bars: Kline[], filter: Kline[], now: number, manual?: 'long' | 'short' | 'close') {
 const s = structuredClone(input), price = bars.at(-1)?.close;
 if (!price || !Number.isFinite(price)) throw new Error('السعر غير متاح');
 const closed=bars.filter(b=>b.time*1000+(s.sniper?60000:300000)<=now), candle=closed.at(-1)?.time ?? 0;
 const fresh=candle>s.lastCandle; s.lastCandle=Math.max(candle,s.lastCandle);
 const f=filter.filter(b=>b.time*1000+(s.sniper?300000:900000)<=now);
 const sig=(s.sniper?sniperSignal:smartSignal)(closed,f);
 let t=s.trades.find(t=>!t.closedAt); let message=s.enabled ? sig?.reason ?? 'يجمع بيانات السوق' : 'البوت متوقف';
 if(t){
  const d=t.side==='long'?1:-1, q=t.remainingQty??t.qty;
  let reason: LocalTrade['exitReason']=manual==='close'?'manual':d*(price-t.stop)<=0?'stop_loss':d*(price-t.target)>=0?'take_profit':undefined;
  t.best=d*(price-(t.best??t.entry))>0?price:t.best??t.entry;
  if(!reason && fresh && candle*1000>=Date.parse(t.openedAt)) reason=(t.mode==='sniper'?sniperCandleExit:smartCandleExit)({side:t.side,entry:t.entry,tp1:t.tp1??t.target,tp1Hit:!!t.tp1Hit,best:t.best,openedAt:t.openedAt},closed,now)??undefined;
  if(reason){
   const part=sidePnl(t.side,q,t.entry,price); t.pnl=(t.realized??0)+part; t.exit=price;t.exitReason=reason;t.closedAt=new Date(now).toISOString();t.remainingQty=0;
   s.usdt+=t.size*q/t.qty+part;
   if(t.mode==='sniper' && breakerTripped(s.trades.filter(x=>x.mode==='sniper'&&x.closedAt&&Date.parse(x.closedAt)>=s.sniperResetAt).map(x=>x.pnl??0))) s.sniperPausedUntil=now+SNIPER.breakerMs;
   return {state:s,message:`تم الإغلاق: ${t.pnl.toFixed(2)} USDT`};
  }
  if(!t.tp1Hit && t.tp1!=null && d*(price-t.tp1)>=0){const frac=t.mode==='sniper'?SNIPER.tp1Close:SMART.tp1Close,part=sidePnl(t.side,t.qty*frac,t.entry,price);s.usdt+=t.size*frac+part;t.realized=part;t.remainingQty=t.qty*(1-frac);t.tp1Hit=true;t.stop=breakevenStop(t.side,t.entry);}
  if(t.mode==='sniper'&&!t.beDone&&t.atr){const be=fastBreakeven(t.side,t.entry,price,t.atr);if(be!=null){t.stop=be;t.beDone=true;}}
  return {state:s,message:'صفقة مفتوحة — مراقبة الوقف والأهداف'};
 }
 if(manual==='close') throw new Error('لا توجد صفقة مفتوحة');
 if(!manual && (!s.enabled || !fresh)) return {state:s,message};
 const loss=s.trades.find(x=>x.closedAt&&(x.pnl??0)<0&&(x.mode==='sniper')===s.sniper);
 const lossAt=loss?.closedAt?Date.parse(loss.closedAt):null;
 const cooling=s.sniper?sniperCooldown(lossAt!=null&&lossAt<s.sniperResetAt?null:lossAt,now):inCooldown(lossAt,now);
 if(!manual && (cooling || s.sniper&&s.sniperPausedUntil>now || s.symbol==='PAXGUSDT'&&inRolloverWindow(now))) return {state:s,message:'الدخول متوقف — تبريد أو قاطع أمان أو وقت إغلاق الذهب'};
 const today=s.trades.filter(x=>x.openedAt.startsWith(new Date(now).toISOString().slice(0,10)));
 const gate=riskGate({hasOpenTrade:false,tradesToday:today.length,maxTradesPerDay:s.settings.maxTradesPerDay,pnlToday:today.reduce((a,t)=>a+(t.pnl??0),0),maxDailyLossUsdt:s.settings.maxDailyLossUsdt,positionUsdt:s.settings.positionUsdt,freeUsdt:s.usdt});
 if(!gate.ok) {if(manual)throw new Error(gate.reason);return {state:s,message:gate.reason};}
 const side=manual??sig?.side, a=sig?.atr;
 if(!side||!a) return {state:s,message};
 const br=(s.sniper?sniperBracket:smartBracket)(side,price,a,s.symbol==='PAXGUSDT'),size=s.settings.positionUsdt;
 const trade:LocalTrade={id:crypto.randomUUID(),side,size,qty:size/price,remainingQty:size/price,realized:0,tp1:br.tp1,tp1Hit:false,best:price,entry:price,stop:br.stop,target:br.target,entryReason:manual?'صفقة يدوية':sig?.reason??'',openedAt:new Date(now).toISOString(),atr:a,...(s.sniper?{mode:'sniper' as const}:{})};
 trade.symbol=s.symbol;
 s.usdt-=size;s.trades.unshift(trade);message=`فتح ${side==='long'?'Long':'Short'} عند ${price}`;
 return {state:s,message};
}
