ALTER TABLE public.bot_settings
  ADD COLUMN mode text NOT NULL DEFAULT 'paper',
  ADD COLUMN paper_usdt numeric NOT NULL DEFAULT 10000,
  ADD COLUMN paper_btc numeric NOT NULL DEFAULT 0;
ALTER TABLE public.trades ADD COLUMN mode text NOT NULL DEFAULT 'paper';