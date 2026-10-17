CREATE TABLE public.bot_settings (
  user_id uuid PRIMARY KEY,
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  interval text NOT NULL DEFAULT '1m',
  ema_fast int NOT NULL DEFAULT 9,
  ema_slow int NOT NULL DEFAULT 21,
  rsi_period int NOT NULL DEFAULT 14,
  rsi_overbought numeric NOT NULL DEFAULT 70,
  rsi_oversold numeric NOT NULL DEFAULT 30,
  stop_loss_pct numeric NOT NULL DEFAULT 0.5,
  take_profit_pct numeric NOT NULL DEFAULT 1.0,
  position_usdt numeric NOT NULL DEFAULT 50,
  max_trades_per_day int NOT NULL DEFAULT 20,
  max_daily_loss_usdt numeric NOT NULL DEFAULT 25,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_settings TO authenticated;
GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.bot_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.api_credentials (
  user_id uuid PRIMARY KEY,
  api_key text NOT NULL,
  api_secret text NOT NULL,
  testnet boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.api_credentials TO service_role;
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  qty numeric NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  stop_price numeric NOT NULL,
  target_price numeric NOT NULL,
  pnl numeric,
  entry_reason text,
  exit_reason text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own trades" ON public.trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX trades_user_idx ON public.trades(user_id, opened_at DESC);