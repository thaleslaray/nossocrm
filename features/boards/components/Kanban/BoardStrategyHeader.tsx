import React, { useState } from 'react';
import {
  Target,
  Bot,
  DoorOpen,
  Info,
  Edit2,
  Check,
  X,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { Board } from '@/types';
import { useCRM } from '@/context/CRMContext';

// Performance: reuse formatter instances.
const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface BoardStrategyHeaderProps {
  board: Board;
}

export const BoardStrategyHeader: React.FC<BoardStrategyHeaderProps> = ({ board }) => {
  const { updateBoard, setIsGlobalAIOpen, boards, deals } = useCRM();
  const [isEditing, setIsEditing] = useState(false);
  const [editedBoard, setEditedBoard] = useState(board);

  // Calculate Progress Automatically
  const calculatedProgress = React.useMemo(() => {
    const type = board.goal?.type || 'number';

    /**
     * Performance: avoid `deals.filter(...)` + extra passes over the boardDeals.
     * We scan once and compute the aggregates we need.
     */
    let dealCount = 0;
    let wonCount = 0;
    let totalValue = 0;
    for (const d of deals) {
      if (d.boardId !== board.id) continue;
      dealCount += 1;
      totalValue += d.value || 0;
      if (d.isWon) wonCount += 1;
    }

    if (type === 'currency') {
      return {
        value: totalValue,
        display: BRL_CURRENCY_FORMATTER.format(totalValue),
      };
    }

    if (type === 'percentage') {
      if (dealCount === 0) return { value: 0, display: '0%' };
      const percent = Math.round((wonCount / dealCount) * 100);
      return {
        value: percent,
        display: `${percent}%`,
      };
    }

    // Default: Number
    return {
      value: dealCount,
      display: dealCount.toString(),
    };
  }, [deals, board.id, board.goal?.type]);

  // Performance: parse target once per goal change (instead of per render).
  // Hook must live before any early returns (rules-of-hooks).
  const targetValueNumber = React.useMemo(() => {
    if (!board.goal?.targetValue) return 0;

    // Parse Target
    const targetStr = board.goal.targetValue.replace(/[^0-9.]/g, '');
    const target = parseFloat(targetStr);
    return Number.isFinite(target) ? target : 0;
  }, [board.goal?.targetValue]);

  // Performance: compute progress as a derived value (and keep hooks order stable).
  const progress = React.useMemo(() => {
    if (targetValueNumber === 0) return 0;
    const current = calculatedProgress.value;
    return Math.min(100, Math.max(0, (current / targetValueNumber) * 100));
  }, [calculatedProgress.value, targetValueNumber]);

  const hasStrategy = board.goal || board.agentPersona || board.entryTrigger;

  if (!hasStrategy && !isEditing) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setIsEditing(true)}
          className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:border-primary-500 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-all group bg-slate-50/50 dark:bg-white/5"
        >
          <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm group-hover:scale-110 transition-transform">
            <Target size={16} className="text-primary-500" />
          </div>
          <span className="font-medium text-sm">
            Definir Estratégia do Board (Meta, Agente e Gatilhos)
          </span>
        </button>
      </div>
    );
  }

  const handleSave = () => {
    updateBoard(board.id, {
      goal: editedBoard.goal,
      agentPersona: editedBoard.agentPersona,
      entryTrigger: editedBoard.entryTrigger,
      nextBoardId: editedBoard.nextBoardId,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedBoard(board);
    setIsEditing(false);
  };

  return (
    <div className="relative mb-4 group/header z-20">
      {/* Background Glow Effect (Subtle) */}
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-orange-500/5 rounded-xl blur-xl opacity-50 group-hover/header:opacity-100 transition-opacity duration-700"></div>

      <div className="relative px-5 py-3 bg-white dark:bg-[#0B1120] rounded-lg border border-slate-100 dark:border-white/5 shadow-sm transition-all duration-300 hover:shadow-md">
        {/* Edit Button - Only visible on hover */}
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition-all opacity-0 group-hover/header:opacity-100"
            title="Editar Estratégia"
          >
            <Edit2 size={12} />
          </button>
        )}

        {isEditing ? (
          // --- EDIT MODE (Functional & Clean) ---
          // --- EDIT MODE (Jobs Style: Clean, Focused, Minimal) ---
          // --- EDIT MODE (Polished & Unified) ---
          <div className="animate-in fade-in zoom-in-95 duration-300">
            {/* Header Actions */}
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-slate-100 dark:bg-white/10 rounded-lg">
                  <Target size={16} className="text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                    Estratégia do Board
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Defina como a IA deve trabalhar aqui
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>

            <div className="space-y-8">
              {/* TOP SECTION: RULES (The Brain) */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <DoorOpen size={12} /> Regras de Entrada (O Filtro)
                </label>
                <div className="relative">
                  <textarea
                    className="w-full h-24 bg-slate-50 dark:bg-white/5 rounded-xl p-4 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none leading-relaxed border border-slate-200 dark:border-white/5 transition-all"
                    placeholder="Descreva as regras para a IA: Quem deve entrar aqui? Quais critérios de qualidade? (ex: Apenas leads B2B com budget > 50k)"
                    value={editedBoard.entryTrigger || ''}
                    onChange={e => setEditedBoard({ ...editedBoard, entryTrigger: e.target.value })}
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 bg-white/50 dark:bg-black/20 px-2 py-1 rounded-full backdrop-blur-sm">
                    A IA usará isso para filtrar leads
                  </div>
                </div>
              </div>

              {/* BOTTOM SECTION: GOAL & AGENT (Side by Side) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* LEFT: GOAL (All Goal fields) */}
                <div className="space-y-4 border-r border-slate-100 dark:border-white/5 pr-8">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 border-b border-slate-100 dark:border-white/5 pb-2">
                    <Target size={12} /> Objetivo (O Alvo)
                  </label>

                  {/* KPI Inputs */}
                  <div className="flex gap-4">
                    <div className="flex-1 bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          className="flex-1 bg-transparent text-xl font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none"
                          placeholder="0"
                          value={editedBoard.goal?.targetValue || ''}
                          onChange={e =>
                            setEditedBoard({
                              ...editedBoard,
                              goal: { ...editedBoard.goal!, targetValue: e.target.value },
                            })
                          }
                        />
                        <select
                          className="bg-transparent text-[10px] font-bold uppercase text-slate-400 focus:text-blue-500 focus:outline-none cursor-pointer"
                          value={editedBoard.goal?.type || 'number'}
                          onChange={e =>
                            setEditedBoard({
                              ...editedBoard,
                              goal: {
                                ...editedBoard.goal!,
                                type: e.target.value as 'currency' | 'number' | 'percentage',
                              },
                            })
                          }
                        >
                          <option value="currency">R$ (Valor)</option>
                          <option value="number"># (Qtd)</option>
                          <option value="percentage">% (Taxa)</option>
                        </select>
                      </div>
                      <input
                        className="w-full bg-transparent text-xs font-medium text-slate-500 focus:text-blue-600 focus:outline-none transition-colors border-b border-transparent focus:border-blue-200 pb-0.5"
                        placeholder="Nome do KPI"
                        value={editedBoard.goal?.kpi || ''}
                        onChange={e =>
                          setEditedBoard({
                            ...editedBoard,
                            goal: { ...editedBoard.goal!, kpi: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="w-24 opacity-50 pointer-events-none grayscale">
                      <label className="text-[10px] text-slate-400 font-medium block mb-1">
                        Progresso (Auto)
                      </label>
                      <input
                        className="w-full bg-transparent border-b border-slate-200 dark:border-white/10 text-lg font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
                        placeholder="-"
                        readOnly
                        value={calculatedProgress.display}
                      />
                    </div>
                  </div>

                  {/* Goal Context */}
                  <textarea
                    className="w-full h-24 bg-transparent border border-slate-200 dark:border-white/10 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:border-blue-500/50 resize-none transition-all"
                    placeholder="Por que essa meta existe? Qual o contexto estratégico?"
                    value={editedBoard.goal?.description || ''}
                    onChange={e =>
                      setEditedBoard({
                        ...editedBoard,
                        goal: { ...editedBoard.goal!, description: e.target.value },
                      })
                    }
                  />
                </div>

                {/* RIGHT: AGENT (All Agent fields) */}
                <div className="space-y-4 pl-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 border-b border-slate-100 dark:border-white/5 pb-2">
                    <Bot size={12} /> Agente (O Executor)
                  </label>

                  {/* Agent Identity */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-medium">Nome</label>
                      <input
                        className="w-full bg-transparent border-b border-slate-200 dark:border-white/10 py-1 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-300"
                        placeholder="Ex: Ana"
                        value={editedBoard.agentPersona?.name || ''}
                        onChange={e =>
                          setEditedBoard({
                            ...editedBoard,
                            agentPersona: { ...editedBoard.agentPersona!, name: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-medium">Cargo</label>
                      <input
                        className="w-full bg-transparent border-b border-slate-200 dark:border-white/10 py-1 text-xs text-slate-500 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-300"
                        placeholder="Ex: Vendedora"
                        value={editedBoard.agentPersona?.role || ''}
                        onChange={e =>
                          setEditedBoard({
                            ...editedBoard,
                            agentPersona: { ...editedBoard.agentPersona!, role: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Agent Behavior */}
                  <textarea
                    className="w-full h-24 bg-transparent border border-slate-200 dark:border-white/10 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:border-purple-500/50 resize-none transition-all"
                    placeholder="Como o agente deve agir? (Tom de voz, postura...)"
                    value={editedBoard.agentPersona?.behavior || ''}
                    onChange={e =>
                      setEditedBoard({
                        ...editedBoard,
                        agentPersona: { ...editedBoard.agentPersona!, behavior: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          // --- VIEW MODE (Compact & Premium) ---
          <>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* GOAL (Hero Section) - Spans 4 cols */}
              <div className="md:col-span-4 flex flex-col justify-center border-r border-slate-100 dark:border-white/5 pr-6 relative">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Objetivo
                  </span>
                </div>

                <div className="flex flex-col mb-2">
                  <h2 className="text-lg md:text-xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                    {board.goal?.targetValue}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                    {board.goal?.kpi}
                  </span>
                </div>

                {/* Sleek Progress Bar */}
                <div className="relative h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-1">
                  <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000 ease-out"
                    style={{ width: `${progress}% ` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                  <span>{calculatedProgress.display} Concluído</span>
                  <div className="group/goal relative cursor-help">
                    <span className="border-b border-dotted border-slate-600 hover:text-blue-400 transition-colors">
                      Detalhes
                    </span>
                    {/* Tooltip for Goal Description */}
                    <div className="absolute left-0 top-full mt-2 hidden group-hover/goal:block w-80 p-4 bg-slate-900 text-slate-300 text-xs rounded-lg shadow-2xl z-[100] border border-slate-700 max-h-64 overflow-y-auto">
                      {board.goal?.description}
                    </div>
                  </div>
                </div>
              </div>

              {/* AGENT - Spans 3 cols */}
              <div className="md:col-span-3 flex flex-col justify-center px-4 border-r border-slate-100 dark:border-white/5 relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Bot size={12} className="text-purple-500" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      Agente
                    </span>
                  </div>
                  {board.agentPersona && (
                    <button
                      onClick={() => setIsGlobalAIOpen(true)}
                      className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                    >
                      <MessageSquare size={12} /> Falar
                    </button>
                  )}
                </div>

                <div className="group/agent relative">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-0.5 group-hover/agent:text-purple-400 transition-colors cursor-default truncate">
                    {board.agentPersona?.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                    {board.agentPersona?.role}
                  </p>

                  {/* Tooltip for Agent Behavior */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover/agent:block w-80 p-4 bg-slate-900 text-slate-300 text-xs rounded-lg shadow-2xl z-[100] border border-slate-700 max-h-64 overflow-y-auto">
                    <p className="font-semibold text-purple-300 mb-1">Comportamento</p>"
                    {board.agentPersona?.behavior}"
                  </div>
                </div>
              </div>

              {/* TRIGGER - Spans 5 cols */}
              <div className="md:col-span-5 flex flex-col justify-center pl-4 relative">
                <div className="flex items-center gap-2 mb-1">
                  <DoorOpen size={12} className="text-orange-500" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Entrada
                  </span>
                </div>

                <div className="group/trigger relative cursor-help">
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {board.entryTrigger}
                  </p>
                  {/* Tooltip for Full Trigger */}
                  <div className="absolute right-0 top-full mt-2 hidden group-hover/trigger:block w-80 p-4 bg-slate-900 text-slate-300 text-xs rounded-lg shadow-2xl z-[100] border border-slate-700 max-h-64 overflow-y-auto">
                    {board.entryTrigger}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
