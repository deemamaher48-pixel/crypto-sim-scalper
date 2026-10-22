CREATE OR REPLACE FUNCTION public.mt5_expire_commands()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.mt5_commands SET status='cancelled', updated_at=now(),
         result = coalesce(result,'{}'::jsonb) || '{"reason":"expired"}'::jsonb
   WHERE status='pending' AND expires_at <= now();
  UPDATE public.mt5_commands SET status='unknown', updated_at=now()
   WHERE status='leased' AND (lease_until <= now() OR expires_at <= now());
$function$;