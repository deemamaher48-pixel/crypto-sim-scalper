UPDATE public.mt5_commands SET status='executed' WHERE status='done';
ALTER TABLE public.mt5_commands DROP CONSTRAINT IF EXISTS mt5_commands_status_check;
ALTER TABLE public.mt5_commands ADD CONSTRAINT mt5_commands_status_check
  CHECK (status IN ('pending','leased','executed','failed','unknown','cancelled'));

CREATE OR REPLACE FUNCTION public.mt5_expire_commands()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.mt5_commands SET status='unknown', updated_at=now()
   WHERE (status='pending' AND expires_at <= now())
      OR (status='leased' AND (lease_until <= now() OR expires_at <= now()));
$$;

CREATE OR REPLACE FUNCTION public.mt5_lease_commands(p_lease_sec int DEFAULT 30, p_limit int DEFAULT 20)
RETURNS TABLE(id uuid, action text, symbol text, lot numeric, sl numeric, tp numeric, ticket bigint, comment text, ttl int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE stop boolean;
BEGIN
  PERFORM public.mt5_expire_commands();
  SELECT emergency_stop INTO stop FROM public.mt5_control WHERE mt5_control.id=1;
  RETURN QUERY
  WITH picked AS (
    SELECT m.id FROM public.mt5_commands m
     WHERE m.status='pending' AND m.expires_at > now()
       AND (NOT coalesce(stop,true) OR m.action IN ('CLOSE','CLOSE_PARTIAL','BREAKEVEN'))
     ORDER BY m.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  UPDATE public.mt5_commands m SET status='leased',
     lease_until=least(now() + make_interval(secs => p_lease_sec), m.expires_at), updated_at=now()
    FROM picked WHERE m.id=picked.id
  RETURNING m.id, m.action, m.symbol, m.lot, m.sl, m.tp, m.ticket, m.comment,
     greatest(0, floor(extract(epoch FROM (least(now() + make_interval(secs => p_lease_sec), m.expires_at) - now()))))::int;
END $$;

-- returns: ok | already_reported | conflict | rejected
CREATE OR REPLACE FUNCTION public.mt5_report_command(p_id uuid, p_success boolean, p_result jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.mt5_commands; want text := CASE WHEN p_success THEN 'executed' ELSE 'failed' END;
BEGIN
  SELECT * INTO c FROM public.mt5_commands WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'rejected'; END IF;
  IF c.status IN ('executed','failed') THEN
    RETURN CASE WHEN c.status=want AND c.result = p_result THEN 'already_reported' ELSE 'conflict' END;
  END IF;
  IF c.status <> 'leased' OR c.lease_until IS NULL OR c.lease_until <= now() OR c.expires_at <= now() THEN
    IF c.status IN ('pending','leased') THEN
      UPDATE public.mt5_commands SET status='unknown', updated_at=now() WHERE id=p_id;
    END IF;
    RETURN 'rejected';
  END IF;
  UPDATE public.mt5_commands SET status=want, result=p_result, reported_at=now(), updated_at=now() WHERE id=p_id;
  RETURN 'ok';
END $$;

REVOKE EXECUTE ON FUNCTION public.mt5_expire_commands() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mt5_expire_commands() TO service_role;
REVOKE EXECUTE ON FUNCTION public.mt5_lease_commands(int,int), public.mt5_report_command(uuid,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mt5_lease_commands(int,int), public.mt5_report_command(uuid,boolean,jsonb) TO service_role;