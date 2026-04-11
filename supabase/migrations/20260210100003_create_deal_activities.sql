-- Migration: create_deal_activities
-- Tabela dedicada para log de atividades do AI Agent em deals.
-- Separada de `activities` porque precisa de metadata JSONB
-- e não requer os campos obrigatórios de atividades CRM (title, date, etc.)

CREATE TABLE IF NOT EXISTS public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON public.deal_activities (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_org_id ON public.deal_activities (organization_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_type ON public.deal_activities (type);

-- RLS: Users can only see deal activities from their own organization
CREATE POLICY "Users can view own org deal activities"
ON public.deal_activities FOR SELECT TO authenticated
USING (
  organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS: Users can insert deal activities for their own organization
CREATE POLICY "Users can insert own org deal activities"
ON public.deal_activities FOR INSERT TO authenticated
WITH CHECK (
  organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);
