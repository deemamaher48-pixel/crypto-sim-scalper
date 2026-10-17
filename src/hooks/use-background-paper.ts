import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { getBackground, backgroundAction } from '@/functions/background.functions';
import { initialPaperState } from '@/lib/background-paper';
import { computeIndicators,computeExtras,sidePnl } from '@/lib/trading';
import { smartSignal } from '@/lib/smart-scalp';
import { sniperSignal } from '@/lib/sniper-scalp';
import type { Kline } from '@/lib/binance';
import type { useLocalPaper,LocalSettings,BotStatus } from '@/hooks/use-local-paper';
export function useBackgroundPaper(userId:string|undefined,local:ReturnType<typeof useLocalPaper>,k5:Kline[],k15:Kline[],k1:Kline[]) {
 const read=useServerFn(getBackground),action=useServerFn(backgroundAction),qc=useQueryClient();
 const query=useQuery({queryKey:['background',userId],queryFn:()=>read(),enabled:!!userId,refetchInterval:10000});
 const mutation=useMutation({mutationFn:(data:NonNullable<Parameters<typeof action>[0]>['data'])=>action({data}),onSuccess:()=>{qc.invalidateQueries({queryKey:['background']});qc.invalidateQueries({queryKey:['trades']});},onError:(e)=>toast.error(e.message)});
 const s=query.data?.state??initialPaperState(), bars=s.sniper?k1:k5,closed=bars.slice(0,-1),filter=(s.sniper?k5:k15).slice(0,-1),price=bars.at(-1)?.close??0,open=s.trades.find(t=>!t.closedAt),q=open?.remainingQty??open?.qty??0;
 const pnl=open?sidePnl(open.side,q,open.entry,price||open.entry):0;
 const stale=query.data?.lastTickAt && Date.now()-Date.parse(query.data.lastTickAt)>120000;
 const status:BotStatus=query.isError?{tone:'watch',text:'جارٍ إعادة الاتصال بالخدمة…'}:query.isPending&&userId?{tone:'watch',text:'جارٍ قراءة سجل الحساب…'}:open?{tone:'open',text:query.data?.message??'صفقة مفتوحة'}:stale&&s.enabled?{tone:'watch',text:'جارٍ المزامنة — إصلاح تلقائي للخدمة…'}:{tone:s.enabled?'watch':'off',text:query.data?.message??'البوت الخلفي متوقف'};
 const healing=useRef(0);
 useEffect(()=>{if(!userId||!s.enabled||!stale||mutation.isPending)return;if(Date.now()-healing.current<60000)return;healing.current=Date.now();action({data:{action:'tick'}}).then(()=>qc.invalidateQueries({queryKey:['background']})).catch(()=>{});},[userId,s.enabled,stale,query.dataUpdatedAt]);
 const cloud={...s,loaded:!query.isPending,price,open,ind:computeIndicators(closed.map(b=>b.close),s.settings),extras:computeExtras(closed),signal:(s.sniper?sniperSignal:smartSignal)(closed,filter),unrealized:(open?.realized??0)+pnl,equity:s.usdt+(open?open.size*q/open.qty+pnl:0),status,breakerOn:s.sniperPausedUntil>Date.now(),setEnabled:(on:boolean)=>mutation.mutate({action:'enable',on}),setSniper:(on:boolean)=>mutation.mutate({action:'sniper',on}),updateSettings:(risk:Partial<LocalSettings>)=>mutation.mutate({action:'risk',risk}),longNow:()=>mutation.mutate({action:'long'}),shortNow:()=>mutation.mutate({action:'short'}),closeNow:()=>mutation.mutate({action:'close'}),reset:()=>{},setSymbol:(symbol:'BTCUSDT'|'PAXGUSDT')=>mutation.mutate({action:'symbol',symbol})};
 return {bot:userId?cloud:local,cloud:!!userId,busy:mutation.isPending||!!userId&&query.isPending,symbol:userId?s.symbol:undefined,setSymbol:cloud.setSymbol,lastTickAt:query.data?.lastTickAt};
}
