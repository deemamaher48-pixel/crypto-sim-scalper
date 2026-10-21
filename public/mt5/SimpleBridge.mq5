// SimpleBridge v2: reads Common/Files/cmd_*.txt, trades, writes res_<id>.txt and snapshot.json. Demo only.
// - SL/TP re-anchored on the broker's real fill price when sl_pts/tp_pts are given.
// - CLOSE / BREAKEVEN with ticket=0 apply to every position on the symbol.
// - One position at a time: a new entry while one is open replies "already_open".
#property strict
#include <Trade/Trade.mqh>
CTrade trade;
input double MaxLot = 0.10;
datetime lastSnap = 0;

int OnInit() { EventSetMillisecondTimer(100); trade.SetDeviationInPoints(50); return INIT_SUCCEEDED; }
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

int CountOn(string sym) {
   int n = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--) if (PositionGetSymbol(i) == sym) n++;
   return n;
}

void WriteSnapshot() {
   string pos = "";
   for (int i = 0; i < PositionsTotal(); i++) {
      string s = PositionGetSymbol(i); if (s == "") continue;
      if (pos != "") pos += ",";
      pos += "{\"ticket\":" + IntegerToString(PositionGetInteger(POSITION_TICKET)) +
             ",\"symbol\":\"" + s + "\",\"type\":\"" + (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "BUY" : "SELL") +
             "\",\"volume\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) +
             ",\"price_open\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 2) +
             ",\"sl\":" + DoubleToString(PositionGetDouble(POSITION_SL), 2) +
             ",\"tp\":" + DoubleToString(PositionGetDouble(POSITION_TP), 2) +
             ",\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + "}";
   }
   string js = "{\"connected\":true,\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
               ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
               ",\"free_margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) +
               ",\"positions\":[" + pos + "]}";
   int h = FileOpen("snapshot.tmp", FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if (h == INVALID_HANDLE) return;
   FileWriteString(h, js); FileClose(h);
   FileMove("snapshot.tmp", FILE_COMMON, "snapshot.json", FILE_COMMON | FILE_REWRITE);
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
   double slPts = StringToDouble(Get(keys, vals, "sl_pts")), tpPts = StringToDouble(Get(keys, vals, "tp_pts"));
   ulong ticket = (ulong)StringToInteger(Get(keys, vals, "ticket"));
   string cmt = Get(keys, vals, "comment");

   if (AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) { Reply(id, false, 0, 0, "not_demo"); return; }
   if (sym != "XAUUSD.INZO") { Reply(id, false, 0, 0, "bad_symbol"); return; }
   SymbolSelect(sym, true);
   int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   bool ok = false;

   if (act == "BUY" || act == "SELL") {
      if (lot <= 0 || lot > MaxLot) { Reply(id, false, 0, 0, "risk_rules_lot"); return; }
      if (CountOn(sym) > 0) { Reply(id, false, 0, 0, "already_open"); return; }
      bool buy = act == "BUY";
      double px = buy ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID);
      if (slPts > 0) sl = NormalizeDouble(buy ? px - slPts : px + slPts, dg);
      if (tpPts > 0) tp = NormalizeDouble(buy ? px + tpPts : px - tpPts, dg);
      if (sl <= 0) { Reply(id, false, 0, 0, "sl_required"); return; }
      ok = buy ? trade.Buy(lot, sym, 0, sl, tp, cmt) : trade.Sell(lot, sym, 0, sl, tp, cmt);
      ulong t = 0;
      if (ok) { ulong deal = trade.ResultDeal(); if (deal > 0 && HistoryDealSelect(deal)) t = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID); if (t == 0) t = trade.ResultOrder(); }
      // If the broker re-quoted, nudge SL/TP onto the actual fill price.
      if (ok && t > 0 && PositionSelectByTicket(t) && (slPts > 0 || tpPts > 0)) {
         double f = PositionGetDouble(POSITION_PRICE_OPEN);
         double s2 = slPts > 0 ? NormalizeDouble(buy ? f - slPts : f + slPts, dg) : PositionGetDouble(POSITION_SL);
         double t2 = tpPts > 0 ? NormalizeDouble(buy ? f + tpPts : f - tpPts, dg) : PositionGetDouble(POSITION_TP);
         if (MathAbs(s2 - PositionGetDouble(POSITION_SL)) > 0 || MathAbs(t2 - PositionGetDouble(POSITION_TP)) > 0) trade.PositionModify(t, s2, t2);
      }
      Reply(id, ok, t, ok ? trade.ResultPrice() : 0, ok ? "" : trade.ResultRetcodeDescription());
      WriteSnapshot();
      return;
   }

   if (ticket == 0 && (act == "CLOSE" || act == "BREAKEVEN")) {
      int done = 0, fail = 0;
      for (int i = PositionsTotal() - 1; i >= 0; i--) {
         if (PositionGetSymbol(i) != sym) continue;
         ulong tk = (ulong)PositionGetInteger(POSITION_TICKET);
         bool r = act == "CLOSE" ? trade.PositionClose(tk) : trade.PositionModify(tk, PositionGetDouble(POSITION_PRICE_OPEN), PositionGetDouble(POSITION_TP));
         if (r) done++; else fail++;
      }
      Reply(id, fail == 0, 0, 0, done + fail == 0 ? "no_positions" : (fail > 0 ? "failed_" + IntegerToString(fail) : ""));
      WriteSnapshot();
      return;
   }

   if (!PositionSelectByTicket(ticket)) { Reply(id, false, ticket, 0, "position_not_found"); return; }
   if (act == "CLOSE") ok = trade.PositionClose(ticket);
   else if (act == "CLOSE_PARTIAL") ok = trade.PositionClosePartial(ticket, MathMin(lot, PositionGetDouble(POSITION_VOLUME)));
   else if (act == "BREAKEVEN") ok = trade.PositionModify(ticket, PositionGetDouble(POSITION_PRICE_OPEN), PositionGetDouble(POSITION_TP));
   else { Reply(id, false, ticket, 0, "bad_action"); return; }
   Reply(id, ok, ticket, trade.ResultPrice(), ok ? "" : trade.ResultRetcodeDescription());
   WriteSnapshot();
}

void OnTimer() {
   string name; long hf = FileFindFirst("cmd_*.txt", name, FILE_COMMON);
   if (hf != INVALID_HANDLE) {
      do { Handle(name); } while (FileFindNext(hf, name));
      FileFindClose(hf);
   }
   if (TimeLocal() - lastSnap >= 5) { WriteSnapshot(); lastSnap = TimeLocal(); }
}
