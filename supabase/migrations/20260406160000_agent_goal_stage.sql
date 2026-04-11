-- Migration: agent_goal_stage_id em boards
-- O agente age autonomamente até o estágio definido aqui.
-- NULL = sem limite (age em todos os estágios com AI habilitado).

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS agent_goal_stage_id uuid
    REFERENCES board_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN boards.agent_goal_stage_id IS
  'Estágio limite do agente AI. NULL = sem limite (age até o fim). '
  'Quando o deal passa deste estágio, o agente para de agir.';
