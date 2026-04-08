-- Migration: rastreamento de uso de IA por usuário por dia
-- Objetivo: limitar custo de IA (Task 6 Sprint 2)

CREATE TABLE IF NOT EXISTS public.user_ai_usage (
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- RLS: cada usuário vê e modifica apenas sua própria linha
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_ai_usage_self ON public.user_ai_usage
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Função atômica de incremento (evita race condition no upsert do lado app)
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  INSERT INTO public.user_ai_usage (user_id, usage_date, request_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET request_count = user_ai_usage.request_count + 1;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_usage(UUID) TO authenticated;
