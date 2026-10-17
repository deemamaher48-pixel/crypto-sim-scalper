import { describe,it,expect } from 'vitest';
import { initialPaperState,stepPaper } from './background-paper';
const bars=[{time:0,open:100,high:101,low:99,close:100,volume:1}];
describe('durable background paper',()=>{
 it('keeps every trade and close time when executing without a page',()=>{
 const s=initialPaperState();s.usdt=9900;s.trades=[{id:'open',side:'long',size:100,qty:1,entry:100,stop:99,target:110,entryReason:'test',openedAt:new Date(0).toISOString()},...Array.from({length:600},(_,i)=>({id:String(i),side:'long' as const,size:100,qty:1,entry:100,stop:99,target:110,entryReason:'old',openedAt:new Date(0).toISOString(),closedAt:new Date(1).toISOString(),pnl:0}))];
 const r=stepPaper(s,bars,[],60000,'close');expect(r.state.trades).toHaveLength(601);expect(r.state.trades[0].closedAt).toBe('1970-01-01T00:01:00.000Z');expect(r.state.usdt).toBeCloseTo(9999.99);expect(s.trades[0].closedAt).toBeUndefined();
 });
 it('does not enter again from the same closed candle',()=>{const s=initialPaperState();s.enabled=true;s.lastCandle=10;const r=stepPaper(s,[{...bars[0],time:10}],[],400000);expect(r.state.trades).toHaveLength(0);expect(r.state.lastCandle).toBe(10);});
 it('still closes a stopped bots open trade at its stop',()=>{const s=initialPaperState();s.trades=[{id:'x',side:'short',size:100,qty:1,entry:99,stop:100,target:90,entryReason:'test',openedAt:new Date(0).toISOString()}];const r=stepPaper(s,bars,[],60000);expect(r.state.trades[0].exitReason).toBe('stop_loss');expect(r.state.trades[0].closedAt).toBe('1970-01-01T00:01:00.000Z');});
});
