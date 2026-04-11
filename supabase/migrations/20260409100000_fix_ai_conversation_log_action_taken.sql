-- Fix: expandir CHECK constraint de action_taken para incluir 'stage_evaluation'
--
-- O stage-evaluator inseria logs de tokens com action_taken='stage_evaluation'
-- mas o CHECK constraint original só permitia:
--   'responded', 'advanced_stage', 'handoff', 'skipped'
-- Esses inserts falhavam silenciosamente, deixando o token budget cego
-- para os tokens consumidos nas avaliações de avanço de estágio.

ALTER TABLE ai_conversation_log
  DROP CONSTRAINT IF EXISTS ai_conversation_log_action_taken_check;

ALTER TABLE ai_conversation_log
  ADD CONSTRAINT ai_conversation_log_action_taken_check
  CHECK (action_taken IN (
    'responded',
    'advanced_stage',
    'handoff',
    'skipped',
    'stage_evaluation'
  ));

COMMENT ON COLUMN ai_conversation_log.action_taken IS
  'Ação tomada pelo agente: responded (respondeu), advanced_stage (avançou deal),
   handoff (passou para humano), skipped (não respondeu),
   stage_evaluation (avaliação de critérios de avanço — não envia mensagem).';
