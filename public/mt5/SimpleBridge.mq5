// SimpleBridge: reads Common/Files/cmd_*.txt, trades, writes res_<id>.txt. Demo only.
#property strict
#include <Trade/Trade.mqh>
CTrade trade;

int OnInit() { EventSetMillisecondTimer(500); trade.SetDeviationInPoints(50); return INIT_SUCCEEDED; }
void OnDeinit(const int r) { EventKillTimer(); }

string Get(string &keys[], string &vals[], string k) {
   for (int i = 0; i < ArraySize(keys); i++) if (keys[i] == k) return vals[i];
   return "";
}

void Reply(string id, bool ok, ulong ticket, double price, string err) {
   int h = FileOpen("res_" + id + ".txt", FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if (h == INVALID_HANDLE) return;
   FileWriteString(h, "success=" + (ok ? "1" : "0") + "\n");
   FileWriteString(h, "ticket=" + IntegerToString((long)ticket) + "\n");
   FileWriteString(h, "price=" + DoubleToString(price, 2) + "\n");
   FileWriteString(h, "error=" + err + "\n");
   FileClose(h);
}

void Handle(string file) {
   int h = FileOpen(file, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if (h == INVALID_HANDLE) return;
   string keys[], vals[];
   while (!FileIsEnding(h)) {
      string line = FileReadString(h); int p = StringFind(line, "=");
      if (p <= 0) continue;
      int n = ArraySize(keys); ArrayResize(keys, n + 1); ArrayResize(vals, n + 1);
      keys[n] = StringSubstr(line, 0, p); vals[n] = StringSubstr(line, p + 1);
   }
   FileClose(h); FileDelete(file, FILE_COMMON);

   string id = Get(keys, vals, "id"), act = Get(keys, vals, "action"), sym = Get(keys, vals, "symbol");
   double lot = StringToDouble(Get(keys, vals, "lot")), sl = StringToDouble(Get(keys, vals, "sl")), tp = StringToDouble(Get(keys, vals, "tp"));
   ulong ticket = (ulong)StringToInteger(Get(keys, vals, "ticket"));
   string cmt = Get(keys, vals, "comment");

   if (AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) { Reply(id, false, 0, 0, "not_demo"); return; }
   if (sym != "XAUUSD.INZO") { Reply(id, false, 0, 0, "bad_symbol"); return; }
   SymbolSelect(sym, true);
   bool ok = false;
   if (act == "BUY" || act == "SELL") {
      if (lot <= 0 || lot > 0.01 || sl <= 0) { Reply(id, false, 0, 0, "risk_rules"); return; }
      ok = act == "BUY" ? trade.Buy(lot, sym, 0, sl, tp, cmt) : trade.Sell(lot, sym, 0, sl, tp, cmt);
      Reply(id, ok, ok ? trade.ResultOrder() : 0, trade.ResultPrice(), ok ? "" : trade.ResultRetcodeDescription());
      return;
   }
   if (!PositionSelectByTicket(ticket)) { Reply(id, false, ticket, 0, "position_not_found"); return; }
   if (act == "CLOSE") ok = trade.PositionClose(ticket);
   else if (act == "CLOSE_PARTIAL") ok = trade.PositionClosePartial(ticket, MathMin(lot, PositionGetDouble(POSITION_VOLUME)));
   else if (act == "BREAKEVEN") ok = trade.PositionModify(ticket, PositionGetDouble(POSITION_PRICE_OPEN), PositionGetDouble(POSITION_TP));
   else { Reply(id, false, ticket, 0, "bad_action"); return; }
   Reply(id, ok, ticket, trade.ResultPrice(), ok ? "" : trade.ResultRetcodeDescription());
}

void OnTimer() {
   string name; long hf = FileFindFirst("cmd_*.txt", name, FILE_COMMON);
   if (hf == INVALID_HANDLE) return;
   do { Handle(name); } while (FileFindNext(hf, name));
   FileFindClose(hf);
}
