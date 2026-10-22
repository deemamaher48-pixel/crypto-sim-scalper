CREATE TABLE public.tg_followers (chat_id bigint PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.tg_followers TO service_role;
ALTER TABLE public.tg_followers ENABLE ROW LEVEL SECURITY;