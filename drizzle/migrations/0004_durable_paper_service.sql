CREATE TABLE public.paper_services (
 user_id uuid PRIMARY KEY,
 state jsonb NOT NULL DEFAULT '{}'::jsonb,
 enabled boolean NOT NULL DEFAULT false,
 last_tick_at timestamptz,
 last_message text NOT NULL DEFAULT 'البوت متوقف',
 lease_token uuid,
 lease_until timestamptz
);
GRANT SELECT ON public.paper_services TO authenticated;
GRANT ALL ON public.paper_services TO service_role;
ALTER TABLE public.paper_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read paper service" ON public.paper_services FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.claim_paper_service(p_user uuid, p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.paper_services SET lease_token=p_token, lease_until=now()+interval '45 seconds' WHERE user_id=p_user AND (lease_until IS NULL OR lease_until<now());
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_paper_service(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_paper_service(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.commit_paper_service(p_user uuid,p_token uuid,p_state jsonb,p_message text,p_tick boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t jsonb;
BEGIN
 UPDATE public.paper_services SET state=p_state,enabled=coalesce((p_state->>'enabled')::boolean,false),last_message=p_message,last_tick_at=CASE WHEN p_tick THEN now() ELSE last_tick_at END,lease_token=NULL,lease_until=NULL WHERE user_id=p_user AND lease_token=p_token;
 IF NOT FOUND THEN RETURN false; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(coalesce(p_state->'trades','[]'::jsonb)) LOOP
 INSERT INTO public.trades(id,user_id,symbol,status,qty,entry_price,exit_price,stop_price,target_price,pnl,entry_reason,exit_reason,opened_at,closed_at,mode,side)
 VALUES((t->>'id')::uuid,p_user,coalesce(p_state->>'symbol','BTCUSDT'),CASE WHEN t->>'closedAt' IS NULL THEN 'open' ELSE 'closed' END,(t->>'qty')::numeric,(t->>'entry')::numeric,(t->>'exit')::numeric,(t->>'stop')::numeric,(t->>'target')::numeric,(t->>'pnl')::numeric,t->>'entryReason',t->>'exitReason',(t->>'openedAt')::timestamptz,(t->>'closedAt')::timestamptz,'paper',t->>'side')
 ON CONFLICT(id) DO UPDATE SET status=excluded.status,exit_price=excluded.exit_price,stop_price=excluded.stop_price,target_price=excluded.target_price,pnl=excluded.pnl,exit_reason=excluded.exit_reason,closed_at=excluded.closed_at WHERE trades.user_id=p_user;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.commit_paper_service(uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_paper_service(uuid,uuid,jsonb,text,boolean) TO service_role;