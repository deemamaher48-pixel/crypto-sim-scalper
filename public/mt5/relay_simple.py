#!/usr/bin/env python3
"""Minimal MT5 relay: cloud /pending -> EA file -> cloud /result. No ledger, no halt."""
import json, os, socket, sys, time, urllib.request, urllib.error, logging
from datetime import datetime
from pathlib import Path

BASE = "https://crypto-sim-scalper.lovable.app/api/public/mt5"
HOME = Path("/home/mt5/bridge")
FILES = Path("/home/mt5/.wine/drive_c/users/mt5/AppData/Roaming/MetaQuotes/Terminal/Common/Files")
DONE = HOME / "state" / "simple_done.json"
PENDING_RESULTS = HOME / "state" / "simple_results.json"
DRY = "--dry-run" in sys.argv
SYMBOLS = {"XAUUSD": "XAUUSD.INZO", "GOLD": "XAUUSD.INZO", "XAUUSD.INZO": "XAUUSD.INZO"}
ACTIONS = {"BUY", "SELL", "CLOSE", "CLOSE_PARTIAL", "BREAKEVEN"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.FileHandler(HOME / "logs" / "relay-simple.log"), logging.StreamHandler()])
log = logging.getLogger("relay")

# Force IPv4 (IPv6 route on this VPS is broken).
_gai = socket.getaddrinfo
socket.getaddrinfo = lambda h, p, f=0, *a, **k: _gai(h, p, socket.AF_INET, *a, **k)

def load_key():
    env = {}
    for line in (HOME / ".env").read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
    for name in ("BRIDGE_API_KEY", "MT5_BRIDGE_API_KEY", "CLOUD_BRIDGE_KEY", "API_KEY"):
        if env.get(name): return env[name]
    for k, v in env.items():
        if "KEY" in k and v: return v
    sys.exit("no bridge key in .env")

KEY = load_key()

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}

def jload(p, d):
    try: return json.loads(p.read_text())
    except Exception: return d

def jsave(p, v):
    tmp = p.with_suffix(".tmp"); tmp.write_text(json.dumps(v)); os.replace(tmp, p)

def iso(s): return datetime.fromisoformat(s.replace("Z", "+00:00"))

MAX_LOT = 0.10
SNAPSHOT = FILES / "snapshot.json"

def check(c):
    if c.get("action") not in ACTIONS: return "bad_action"
    if c.get("symbol") not in SYMBOLS: return "bad_symbol"
    if c["action"] in ("BUY", "SELL"):
        if not c.get("lot") or c["lot"] <= 0 or c["lot"] > MAX_LOT: return "lot_over_max"
        if not c.get("sl") or c["sl"] <= 0: return "sl_required"
    # CLOSE/BREAKEVEN with ticket 0 = all positions on the symbol (EA handles it).
    if c["action"] == "CLOSE_PARTIAL" and not c.get("ticket"): return "ticket_required"
    return None

def run_ea(c):
    cid = c["command_id"]
    lines = [f"id={cid}", f"action={c['action']}", f"symbol={SYMBOLS[c['symbol']]}",
             f"lot={c.get('lot') or 0}", f"sl={c.get('sl') or 0}", f"tp={c.get('tp') or 0}",
             f"sl_pts={c.get('sl_pts') or 0}", f"tp_pts={c.get('tp_pts') or 0}",
             f"ticket={c.get('ticket') or 0}", f"comment={(c.get('comment') or '')[:25]}"]
    cmd, res = FILES / f"cmd_{cid}.txt", FILES / f"res_{cid}.txt"
    tmp = FILES / f"tmp_{cid}.txt"; tmp.write_text("\n".join(lines) + "\n"); os.replace(tmp, cmd)
    for _ in range(30):
        time.sleep(0.5)
        if res.exists():
            kv = dict(l.split("=", 1) for l in res.read_text(errors="ignore").splitlines() if "=" in l)
            res.unlink(missing_ok=True)
            out = {"command_id": cid, "success": kv.get("success") == "1"}
            if kv.get("ticket", "0").isdigit() and int(kv["ticket"]) > 0: out["ticket"] = int(kv["ticket"])
            try:
                if float(kv.get("price", 0)) > 0: out["price"] = float(kv["price"])
            except ValueError: pass
            if kv.get("error"): out["error"] = kv["error"][:500]
            return out
    if cmd.exists():  # EA never picked it up -> safe, nothing executed
        cmd.unlink(missing_ok=True); return {"command_id": cid, "success": False, "error": "ea_not_running"}
    return {"command_id": cid, "success": False, "error": "ea_timeout_check_mt5"}

def main():
    FILES.mkdir(parents=True, exist_ok=True)
    done = set(jload(DONE, [])); outbox = jload(PENDING_RESULTS, {})
    log.info("relay_simple start dry_run=%s files=%s", DRY, FILES)
    last_snap = 0
    while True:
        try:
            if time.time() - last_snap >= 20 and SNAPSHOT.exists():  # live balance/positions for Telegram
                snap = jload(SNAPSHOT, None)
                if isinstance(snap, dict):
                    st, _ = api("POST", "/status", snap)
                    if st != 200: log.warning("status HTTP %s", st)
                last_snap = time.time()
            for cid, body in list(outbox.items()):  # retry unsent results
                st, _ = api("POST", "/result", body)
                if st in (200, 404): outbox.pop(cid); jsave(PENDING_RESULTS, outbox); log.info("result %s -> %s", cid, st)
            st, data = api("GET", "/pending")
            if st != 200: log.warning("pending HTTP %s", st); time.sleep(5); continue
            if data.get("emergency_stop"):
                time.sleep(2); continue
            now = iso(data["server_time"])
            for c in data.get("commands", []):
                cid = c["command_id"]
                if cid in done: continue
                if iso(c["expires_at"]) <= now: continue
                err = check(c)
                if DRY:
                    log.info("DRY would send %s %s %s lot=%s sl=%s tp=%s err=%s", cid, c["action"], c["symbol"], c.get("lot"), c.get("sl"), c.get("tp"), err)
                    done.add(cid); continue
                done.add(cid); jsave(DONE, sorted(done))  # mark first: at-most-once
                result = {"command_id": cid, "success": False, "error": err} if err else run_ea(c)
                log.info("executed %s %s -> %s", cid, c["action"], result)
                outbox[cid] = result; jsave(PENDING_RESULTS, outbox)
                st, _ = api("POST", "/result", result)
                if st in (200, 404): outbox.pop(cid); jsave(PENDING_RESULTS, outbox)
        except Exception as e:
            log.warning("loop error: %s", e)
        time.sleep(2)

if __name__ == "__main__":
    main()
