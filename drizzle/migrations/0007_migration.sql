-- MT5 queue safety: lease, ttl, unknown, emergency stop, validation, rate limit
ALTER TABLE public.mt5_commands
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz;

-- cancel every pending/unfinished live command
UPDATE public.mt5_commands SET status='cancelled', updated_at=now()
 WHERE status NOT IN ('done','failed','unknown','cancelled');

CREATE TABLE IF NOT EXISTS public.mt5_control (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  emergency_stop boolean NOT NULL DEFAULT true,
  max_lot numeric NOT NULL DEFAULT 0.10,
  allowed_symbols text[] NOT NULL DEFAULT ARRAY['XAUUSD','BTCUSD'],
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mt5_control TO service_role;
ALTER TABLE public.mt5_control ENABLE ROW LEVEL SECURITY;
INSERT INTO public.mt5_control(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

-- server-side validation of every new command
CREATE OR REPLACE FUNCTION public.mt5_validate_command()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c public.mt5_control;
BEGIN
  SELECT * INTO c FROM public.mt5_control WHERE id=1;
  IF NEW.action NOT IN ('BUY','SELL','CLOSE','CLOSE_PARTIAL','BREAKEVEN') THEN
    RAISE EXCEPTION 'invalid action %', NEW.action; END IF;
  IF NOT (NEW.symbol = ANY(c.allowed_symbols)) THEN
    RAISE EXCEPTION 'symbol % not allowed', NEW.symbol; END IF;
  IF NEW.action IN ('BUY','SELL') THEN
    IF NEW.lot IS NULL OR NEW.lot <= 0 OR NEW.lot > c.max_lot THEN
      RAISE EXCEPTION 'lot must be >0 and <= %', c.max_lot; END IF;
    IF NEW.sl IS NULL OR NEW.sl <= 0 THEN
      RAISE EXCEPTION 'stop loss is mandatory'; END IF;
  END IF;
  IF NEW.action = 'CLOSE_PARTIAL' AND (NEW.lot IS NULL OR NEW.lot <= 0 OR NEW.lot > c.max_lot) THEN
    RAISE EXCEPTION 'invalid partial lot'; END IF;
  IF NEW.action IN ('CLOSE','CLOSE_PARTIAL','BREAKEVEN') AND NEW.ticket IS NULL THEN
    RAISE EXCEPTION 'ticket required'; END IF;
  NEW.status := 'pending';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mt5_validate ON public.mt5_commands;
CREATE TRIGGER mt5_validate BEFORE INSERT ON public.mt5_commands
  FOR EACH ROW EXECUTE FUNCTION public.mt5_validate_command();

-- atomic lease; expired-without-report => unknown, never retried
CREATE OR REPLACE FUNCTION public.mt5_lease_commands(p_lease_sec int DEFAULT 30, p_limit int DEFAULT 20)
RETURNS TABLE(id uuid, action text, symbol text, lot numeric, sl numeric, tp numeric, ticket bigint, comment text, ttl int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE stop boolean;
BEGIN
  UPDATE public.mt5_commands m SET status='unknown', updated_at=now()
   WHERE m.status IN ('pending','leased') AND m.expires_at <= now();
  SELECT emergency_stop INTO stop FROM public.mt5_control WHERE mt5_control.id=1;
  RETURN QUERY
  WITH picked AS (
    SELECT m.id FROM public.mt5_commands m
     WHERE m.expires_at > now()
       AND (m.status='pending' OR (m.status='leased' AND m.lease_until <= now()))
       AND (NOT coalesce(stop,true) OR m.action IN ('CLOSE','CLOSE_PARTIAL','BREAKEVEN'))
     ORDER BY m.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  UPDATE public.mt5_commands m SET status='leased',
     lease_until=least(now() + make_interval(secs => p_lease_sec), m.expires_at), updated_at=now()
    FROM picked WHERE m.id=picked.id
  RETURNING m.id, m.action, m.symbol, m.lot, m.sl, m.tp, m.ticket, m.comment,
     greatest(0, floor(extract(epoch FROM (m.expires_at - now()))))::int;
END $$;

-- report only leased, non-final; duplicates rejected
CREATE OR REPLACE FUNCTION public.mt5_report_command(p_id uuid, p_success boolean, p_result jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.mt5_commands SET status = CASE WHEN p_success THEN 'done' ELSE 'failed' END,
     result=p_result, reported_at=now(), updated_at=now()
   WHERE id=p_id AND status='leased';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN CASE WHEN n=1 THEN 'ok' ELSE 'rejected' END;
END $$;

-- shared-storage fixed-window rate limit
CREATE TABLE public.mt5_rate_limits (
  bucket text PRIMARY KEY, window_start timestamptz NOT NULL, hits int NOT NULL
);
GRANT ALL ON public.mt5_rate_limits TO service_role;
ALTER TABLE public.mt5_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mt5_rate_hit(p_bucket text, p_max int, p_window_sec int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h int;
BEGIN
  INSERT INTO public.mt5_rate_limits AS r(bucket, window_start, hits) VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE SET
    hits = CASE WHEN r.window_start <= now() - make_interval(secs => p_window_sec) THEN 1 ELSE r.hits + 1 END,
    window_start = CASE WHEN r.window_start <= now() - make_interval(secs => p_window_sec) THEN now() ELSE r.window_start END
  RETURNING hits INTO h;
  RETURN h <= p_max;
END $$;

REVOKE EXECUTE ON FUNCTION public.mt5_lease_commands(int,int), public.mt5_report_command(uuid,boolean,jsonb),
  public.mt5_rate_hit(text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mt5_lease_commands(int,int), public.mt5_report_command(uuid,boolean,jsonb),
  public.mt5_rate_hit(text,int,int) TO service_role;