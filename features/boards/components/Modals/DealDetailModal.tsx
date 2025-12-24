import React, { useState, useRef, useEffect, useId } from 'react';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import ConfirmModal from '@/components/ConfirmModal';
import { LossReasonModal } from '@/components/ui/LossReasonModal';
import { useMoveDealSimple } from '@/lib/query/hooks';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';
import { Activity } from '@/types';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import {
  analyzeLead,
  generateEmailDraft,
  generateObjectionResponse,
} from '@/lib/ai/tasksClient';
import {
  BrainCircuit,
  Mail,
  Phone,
  Calendar,
  Check,
  X,
  Trash2,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Building2,
  User,
  FileText,
  Mic,
  StopCircle,
  Package,
  Sword,
  CheckCircle2,
  Bot,
} from 'lucide-react';
import { StageProgressBar } from '../StageProgressBar';
import { ActivityRow } from '@/features/activities/components/ActivityRow';

interface DealDetailModalProps {
  dealId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DealDetailModal: React.FC<DealDetailModalProps> = ({ dealId, isOpen, onClose }) => {
  // Accessibility: Unique ID for ARIA labelling
  const headingId = useId();

  // Accessibility: Return focus to trigger element when modal closes
  useFocusReturn({ enabled: isOpen });

  const {
    deals,
    contacts,
    updateDeal,
    deleteDeal,
    activities,
    addActivity,
    updateActivity,
    deleteActivity,
    products,
    addItemToDeal,
    removeItemFromDeal,
    customFieldDefinitions,
    activeBoard,
    boards,
    lifecycleStages,
  } = useCRM();
  const { profile } = useAuth();
  const { addToast } = useToast();

  const deal = deals.find(d => d.id === dealId);
  const contact = deal ? contacts.find(c => c.id === deal.contactId) : null;

  // Determine the correct board for this deal
  const dealBoard = deal ? boards.find(b => b.id === deal.boardId) || activeBoard : activeBoard;

  // Use unified TanStack Query hook for moving deals
  const { moveDeal } = useMoveDealSimple(dealBoard, lifecycleStages);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editValue, setEditValue] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [aiResult, setAiResult] = useState<{ suggestion: string; score: number } | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'products' | 'info'>('timeline');

  // Ditado por voz (Web Speech API) - client-side (sem backend)
  const speech = useSpeechRecognition();
  const voicePrefixRef = useRef<string>('');

  const [objection, setObjection] = useState('');
  const [objectionResponses, setObjectionResponses] = useState<string[]>([]);
  const [isGeneratingObjections, setIsGeneratingObjections] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQuantity, setProductQuantity] = useState(1);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showLossReasonModal, setShowLossReasonModal] = useState(false);
  const [pendingLostStageId, setPendingLostStageId] = useState<string | null>(null);
  const [lossReasonOrigin, setLossReasonOrigin] = useState<'button' | 'stage'>('button');

  // Helper functions removed as they are now handled by ActivityRow component

  // Reset state when deal changes or modal opens
  useEffect(() => {
    if (isOpen && deal) {
      setEditTitle(deal.title);
      setEditValue(deal.value.toString());
      setAiResult(null);
      setEmailDraft(null);
      setObjectionResponses([]);
      setObjection('');
      setActiveTab('timeline');
      setIsEditingTitle(false);
      setIsEditingValue(false);
      setShowLossReasonModal(false);
      setPendingLostStageId(null);
      setLossReasonOrigin('button');
      speech.resetTranscript();
      voicePrefixRef.current = '';
    }
  }, [isOpen, dealId]); // Depend on dealId to reset when switching deals

  // Mantém o textarea sincronizado com o ditado (sem sobrescrever um prefixo que o usuário já tinha)
  useEffect(() => {
    if (!speech.isListening) return;
    setNewNote(`${voicePrefixRef.current}${speech.transcript}`);
  }, [speech.isListening, speech.transcript]);

  // Segurança/UX: não deixar o microfone “ligado” se o modal fechar ou se o usuário sair da aba Timeline.
  useEffect(() => {
    if (!isOpen && speech.isListening) {
      speech.stopListening();
    }
  }, [isOpen, speech.isListening]);

  useEffect(() => {
    if (activeTab !== 'timeline' && speech.isListening) {
      speech.stopListening();
    }
  }, [activeTab, speech.isListening]);

  if (!isOpen || !deal) return null;

  const handleAnalyzeDeal = async () => {
    setIsAnalyzing(true);
    try {
      // Buscar label do estágio para não enviar UUID para a IA
      const stageLabel = dealBoard?.stages.find(s => s.id === deal.status)?.label;
      const result = await analyzeLead(deal, stageLabel);
      setAiResult({ suggestion: result.suggestion, score: result.probabilityScore });
      updateDeal(deal.id, { aiSummary: result.suggestion, probability: result.probabilityScore });
    } catch (error: any) {
      console.error('[DealDetailModal] analyzeLead failed:', error);
      addToast(
        error?.message || 'Falha ao analisar deal com IA. Verifique Configurações → Inteligência Artificial.',
        'warning'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDraftEmail = async () => {
    setIsDrafting(true);
    try {
      // Buscar label do estágio para não enviar UUID para a IA
      const stageLabel = dealBoard?.stages.find(s => s.id === deal.status)?.label;
      const draft = await generateEmailDraft(deal, stageLabel);
      setEmailDraft(draft);
    } catch (error: any) {
      console.error('[DealDetailModal] generateEmailDraft failed:', error);
      addToast(
        error?.message || 'Falha ao gerar e-mail com IA. Verifique Configurações → Inteligência Artificial.',
        'warning'
      );
    } finally {
      setIsDrafting(false);
    }
  };

  const startRecording = () => {
    if (!speech.hasRecognitionSupport) {
      addToast('Seu navegador não suporta ditado por voz.', 'warning');
      return;
    }

    // Mantém o que já estava no textarea como prefixo (caso o usuário misture digitação + voz)
    voicePrefixRef.current = newNote.trim() ? `${newNote.trim()}\n` : '';
    speech.resetTranscript();
    speech.startListening();
  };

  const stopRecording = () => {
    speech.stopListening();
    if (!newNote.trim()) {
      addToast('Não consegui captar fala. Tente novamente.', 'warning');
    }
  };

  const handleObjection = async () => {
    if (!objection.trim()) return;
    setIsGeneratingObjections(true);
    try {
      const responses = await generateObjectionResponse(deal, objection);
      setObjectionResponses(responses);
    } catch (error: any) {
      console.error('[DealDetailModal] generateObjectionResponse failed:', error);
      addToast(
        error?.message || 'Falha ao gerar respostas. Verifique Configurações → Inteligência Artificial.',
        'warning'
      );
    } finally {
      setIsGeneratingObjections(false);
    }
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;

    // Se estiver ditando, para antes de enviar para evitar que o textarea continue sendo atualizado.
    speech.stopListening();

    const noteActivity: Activity = {
      id: crypto.randomUUID(),
      dealId: deal.id,
      dealTitle: deal.title,
      type: 'NOTE',
      title: 'Nota Adicionada',
      description: newNote,
      date: new Date().toISOString(),
      user: { name: 'Eu', avatar: 'https://i.pravatar.cc/150?u=me' },
      completed: true,
    };

    addActivity(noteActivity);
    setNewNote('');
    speech.resetTranscript();
    voicePrefixRef.current = '';
  };

  const handleAddProduct = () => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    addItemToDeal(deal.id, {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: productQuantity,
    });

    setSelectedProductId('');
    setProductQuantity(1);
  };

  const confirmDeleteDeal = () => {
    if (deleteId) {
      deleteDeal(deleteId);
      addToast('Negócio excluído com sucesso', 'success');
      setDeleteId(null);
      onClose();
    }
  };

  const saveTitle = () => {
    if (editTitle) {
      updateDeal(deal.id, { title: editTitle });
      setIsEditingTitle(false);
    }
  };

  const saveValue = () => {
    if (editValue) {
      updateDeal(deal.id, { value: Number(editValue) });
      setIsEditingValue(false);
    }
  };

  const updateCustomField = (key: string, value: string | number | boolean) => {
    const updatedFields = { ...deal.customFields, [key]: value };
    updateDeal(deal.id, { customFields: updatedFields });
  };

  const dealActivities = activities.filter(a => a.dealId === deal.id);

  // Handle escape key to close modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isEditingTitle && !isEditingValue) {
      onClose();
    }
  };

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
      >
        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          {/* HEADER (Stage Bar + Won/Lost) */}
          <div className="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/10 p-6 shrink-0">
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1 mr-8">
                {isEditingTitle ? (
                  <div className="flex gap-2 mb-1">
                    <input
                      autoFocus
                      type="text"
                      className="text-2xl font-bold text-slate-900 dark:text-white bg-white dark:bg-black/20 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 w-full outline-none focus:ring-2 focus:ring-primary-500"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={e => e.key === 'Enter' && saveTitle()}
                    />
                    <button onClick={saveTitle} className="text-green-500 hover:text-green-400">
                      <Check size={24} />
                    </button>
                  </div>
                ) : (
                  <h2
                    id={headingId}
                    onClick={() => {
                      setEditTitle(deal.title);
                      setIsEditingTitle(true);
                    }}
                    className="text-2xl font-bold text-slate-900 dark:text-white font-display leading-tight cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 flex items-center gap-2 group transition-colors"
                    title="Clique para editar"
                  >
                    {deal.title}
                    <Pencil size={16} className="opacity-0 group-hover:opacity-50 text-slate-400" />
                  </h2>
                )}

                {isEditingValue ? (
                  <div className="flex gap-2 items-center">
                    <span className="text-lg font-mono font-bold text-slate-500">$</span>
                    <input
                      autoFocus
                      type="number"
                      className="text-lg font-mono font-bold text-primary-600 dark:text-primary-400 bg-white dark:bg-black/20 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 w-32 outline-none focus:ring-2 focus:ring-primary-500"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveValue}
                      onKeyDown={e => e.key === 'Enter' && saveValue()}
                    />
                    <button onClick={saveValue} className="text-green-500 hover:text-green-400">
                      <Check size={20} />
                    </button>
                  </div>
                ) : (
                  <p
                    onClick={() => {
                      setEditValue(deal.value.toString());
                      setIsEditingValue(true);
                    }}
                    className="text-lg text-primary-600 dark:text-primary-400 font-mono font-bold cursor-pointer hover:underline decoration-dashed underline-offset-4"
                    title="Clique para editar valor"
                  >
                    ${deal.value.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-3 items-center">
                {/* Se fechado: mostra badge + botão Reabrir */}
                {(deal.isWon || deal.isLost) ? (
                  <>
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${deal.isWon ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {deal.isWon ? '✓ GANHO' : '✗ PERDIDO'}
                    </span>
                    <button
                      onClick={() => {
                        // Find first non-won/lost stage to reopen to
                        const firstRegularStage = dealBoard?.stages.find(
                          s => s.linkedLifecycleStage !== 'CUSTOMER' && s.linkedLifecycleStage !== 'OTHER'
                        );
                        if (firstRegularStage) {
                          moveDeal(deal, firstRegularStage.id);
                        } else {
                          // Fallback: just clear the won/lost flags
                          updateDeal(deal.id, { isWon: false, isLost: false, closedAt: undefined });
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-sm flex items-center gap-2 transition-all"
                    >
                      ↩ Reabrir
                    </button>
                  </>
                ) : (
                  /* Se aberto: mostra botões Ganho e Perdido */
                  <>
                    <button
                      onClick={() => {
                        // Intelligent "Won" Logic:
                        // 0. Check for "Stay in Stage" flag (Archive/Close in place)
                        if (dealBoard?.wonStayInStage) {
                          moveDeal(deal, deal.status, undefined, true, false);
                          onClose();
                          return;
                        }

                        // 1. Check if board has explicit Won Stage configured
                        if (dealBoard?.wonStageId) {
                          moveDeal(deal, dealBoard.wonStageId);
                          onClose();
                          return;
                        }

                        // 2. Find the appropriate "Success Stage" for this board based on lifecycle
                        const successStage = dealBoard?.stages.find(
                          s => s.linkedLifecycleStage === 'CUSTOMER'
                        ) || dealBoard?.stages.find(
                          s => s.linkedLifecycleStage === 'MQL'
                        ) || dealBoard?.stages.find(
                          s => s.linkedLifecycleStage === 'SALES_QUALIFIED'
                        );

                        if (successStage) {
                          moveDeal(deal, successStage.id);
                        } else {
                          // Fallback: just mark as won without moving
                          updateDeal(deal.id, { isWon: true, isLost: false, closedAt: new Date().toISOString() });
                        }
                        onClose();
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold text-sm shadow-sm flex items-center gap-2"
                    >
                      <ThumbsUp size={16} /> GANHO
                    </button>
                    <button
                      onClick={() => {
                        // 0. Check for "Stay in Stage" flag
                        if (dealBoard?.lostStayInStage) {
                          // We don't set pendingLostStageId because we aren't moving to a new stage ID
                          // But the modal logic relies on it? No, if pendingLostStageId is null, we might need another flag.
                          // Actually, let's keep it clean.
                          // setPendingLostStageId(deal.status); // Hack?
                          // Better: Just open modal, and handle logic in confirm.
                        }

                        // If board has explicit Lost Stage, queue it
                        if (dealBoard?.lostStageId) {
                          setPendingLostStageId(dealBoard.lostStageId);
                        }
                        setLossReasonOrigin('button');
                        setShowLossReasonModal(true);
                      }}
                      className="px-4 py-2 bg-transparent border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2"
                    >
                      <ThumbsDown size={16} /> PERDIDO
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDeleteId(deal.id)}
                  className="ml-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Excluir Negócio"
                >
                  <Trash2 size={24} />
                </button>
                <button
                  onClick={onClose}
                  className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {dealBoard ? (
              <StageProgressBar
                stages={dealBoard.stages}
                currentStatus={deal.status}
                onStageClick={stageId => {
                  // Check if clicking on a LOST stage
                  const targetStage = dealBoard.stages.find(s => s.id === stageId);
                  // Check if it matches configured Lost Stage OR explicitly linked 'OTHER' stage
                  const isLostStage =
                    dealBoard.lostStageId === stageId ||
                    targetStage?.linkedLifecycleStage === 'OTHER';

                  if (isLostStage) {
                    // Show loss reason modal
                    setPendingLostStageId(stageId);
                    setLossReasonOrigin('stage');
                    setShowLossReasonModal(true);
                  } else {
                    // Regular move
                    moveDeal(deal, stageId);
                  }
                }}
              />
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200/60 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                Board não encontrado para este negócio. Algumas ações (mover estágio) podem ficar indisponíveis.
              </div>
            )}
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar (Static Info + Custom Fields) */}
            <div className="w-1/3 border-r border-slate-200 dark:border-white/5 p-6 overflow-y-auto bg-white dark:bg-dark-card">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                    <Building2 size={14} /> Empresa (Conta)
                  </h3>
                  <p className="text-slate-900 dark:text-white font-medium">{deal.companyName}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                    <User size={14} /> Contato Principal
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">
                      {(deal.contactName || '?').charAt(0)}
                    </div>
                    <div>
                      <p className="text-slate-900 dark:text-white font-medium text-sm flex items-center gap-2">
                        {deal.contactName || 'Sem contato'}
                        {contact?.stage &&
                          (() => {
                            const stage = lifecycleStages.find(s => s.id === contact.stage);
                            if (!stage) return null;

                            // Extract base color name (e.g. 'blue' from 'bg-blue-500')
                            const colorClass = stage.color; // e.g. bg-blue-500
                            // We need to construct text and ring classes dynamically or just use inline styles/safe list
                            // For now, let's just use the background color provided and white text

                            return (
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 text-white ${colorClass}`}
                              >
                                {stage.name}
                              </span>
                            );
                          })()}
                      </p>
                      <p className="text-slate-500 text-xs">{deal.contactEmail}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Detalhes</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Prioridade</span>
                      <span className="text-slate-900 dark:text-white capitalize">
                        {deal.priority}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Criado em</span>
                      <span className="text-slate-900 dark:text-white">
                        {new Date(deal.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Probabilidade</span>
                      <span className="text-slate-900 dark:text-white">{deal.probability}%</span>
                    </div>
                  </div>
                </div>

                {/* DYNAMIC CUSTOM FIELDS INPUTS */}
                {customFieldDefinitions.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">
                      Campos Personalizados
                    </h3>
                    <div className="space-y-4">
                      {customFieldDefinitions.map(field => (
                        <div key={field.id}>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            {field.label}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              value={deal.customFields?.[field.key] || ''}
                              onChange={e => updateCustomField(field.key, e.target.value)}
                              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 text-sm dark:text-white focus:ring-1 focus:ring-primary-500 outline-none"
                            >
                              <option value="">Selecione...</option>
                              {field.options?.map(opt => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type}
                              value={deal.customFields?.[field.key] || ''}
                              onChange={e => updateCustomField(field.key, e.target.value)}
                              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 text-sm dark:text-white focus:ring-1 focus:ring-primary-500 outline-none"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Content (Tabs & Timeline) */}
            <div className="flex-1 flex flex-col bg-white dark:bg-dark-card">
              <div className="h-14 border-b border-slate-200 dark:border-white/5 flex items-center px-6 shrink-0">
                <div className="flex gap-6">
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`text-sm font-bold h-14 border-b-2 transition-colors ${activeTab === 'timeline' ? 'border-primary-500 text-primary-600 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-white'}`}
                  >
                    Timeline
                  </button>
                  <button
                    onClick={() => setActiveTab('products')}
                    className={`text-sm font-bold h-14 border-b-2 transition-colors ${activeTab === 'products' ? 'border-primary-500 text-primary-600 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-white'}`}
                  >
                    Produtos
                  </button>
                  <button
                    onClick={() => setActiveTab('info')}
                    className={`text-sm font-bold h-14 border-b-2 transition-colors ${activeTab === 'info' ? 'border-primary-500 text-primary-600 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-white'}`}
                  >
                    IA Insights
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-black/10">
                {activeTab === 'timeline' && (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-sm">
                      <textarea
                        className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none resize-none min-h-[80px]"
                        placeholder="Escreva uma nota..."
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                      ></textarea>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                        <div className="flex gap-2 text-slate-400">
                          <button className="p-1 hover:text-primary-500 transition-colors">
                            <FileText size={16} />
                          </button>
                          <button
                            onClick={speech.isListening ? stopRecording : startRecording}
                            className={`p-1 transition-all ${speech.isListening ? 'text-red-500 animate-pulse' : 'hover:text-primary-500'}`}
                            title="Ditado por voz (transcrição no navegador)"
                            aria-pressed={speech.isListening}
                          >
                            {speech.isListening ? (
                              <StopCircle size={16} />
                            ) : (
                              <Mic size={16} />
                            )}
                          </button>

                          {speech.isListening && (
                            <div
                              className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 select-none"
                              aria-live="polite"
                            >
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                              </span>
                              <span>
                                Ouvindo… <span className="text-slate-500 dark:text-slate-300">(clique para parar)</span>
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={handleAddNote}
                          disabled={!newNote.trim()}
                          className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all"
                        >
                          <Check size={14} /> Enviar
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 pl-4 border-l border-slate-200 dark:border-slate-800">
                      {dealActivities.length === 0 && (
                        <p className="text-sm text-slate-500 italic pl-4">
                          Nenhuma atividade registrada.
                        </p>
                      )}
                      {dealActivities.map(activity => (
                        <ActivityRow
                          key={activity.id}
                          activity={activity}
                          deal={deal}
                          onToggleComplete={id => {
                            const act = activities.find(a => a.id === id);
                            if (act) updateActivity(id, { completed: !act.completed });
                          }}
                          onEdit={() => { }} // Edit not implemented in modal yet
                          onDelete={id => deleteActivity(id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'products' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-slate-50 dark:bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/10">
                      <h3 className="text-sm font-bold text-slate-700 dark:text-white mb-3 flex items-center gap-2">
                        <Package size={16} /> Adicionar Produto/Serviço
                      </h3>
                      <div className="flex gap-3">
                        <select
                          className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                          value={selectedProductId}
                          onChange={e => setSelectedProductId(e.target.value)}
                        >
                          <option value="">Selecione um item...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} - ${p.price}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          className="w-20 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                          value={productQuantity}
                          onChange={e => setProductQuantity(parseInt(e.target.value))}
                        />
                        <button
                          onClick={handleAddProduct}
                          disabled={!selectedProductId}
                          className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/5 text-slate-500 dark:text-slate-400 font-medium">
                          <tr>
                            <th className="px-4 py-3">Item</th>
                            <th className="px-4 py-3 w-20 text-center">Qtd</th>
                            <th className="px-4 py-3 w-32 text-right">Preço Unit.</th>
                            <th className="px-4 py-3 w-32 text-right">Total</th>
                            <th className="px-4 py-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {!deal.items || deal.items.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                                Nenhum produto adicionado. O valor do negócio é manual.
                              </td>
                            </tr>
                          ) : (
                            deal.items.map(item => (
                              <tr key={item.id}>
                                <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">
                                  {item.name}
                                </td>
                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                                  {item.quantity}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                                  ${item.price.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                                  ${(item.price * item.quantity).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => removeItemFromDeal(deal.id, item.id)}
                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-black/20 border-t border-slate-200 dark:border-white/5">
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300 uppercase text-xs tracking-wider"
                            >
                              Total do Pedido
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-primary-600 dark:text-primary-400 text-lg">
                              ${deal.value.toLocaleString()}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'info' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/10 dark:to-dark-card p-6 rounded-xl border border-primary-100 dark:border-primary-500/20">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-primary-100 dark:bg-primary-500/20 rounded-lg text-primary-600 dark:text-primary-400">
                          <BrainCircuit size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white font-display text-lg">
                            Insights Gemini
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Inteligência Artificial aplicada ao negócio
                          </p>
                        </div>
                      </div>

                      {/* STRATEGY CONTEXT BAR */}
                      {dealBoard?.agentPersona && (
                        <div className="mb-6 bg-slate-900/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                            <Bot size={20} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                Atuando como
                              </span>
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                              {dealBoard.agentPersona?.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {dealBoard.agentPersona?.role} • Foco: {dealBoard.goal?.kpi || 'Geral'}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-3 mb-5">
                        <button
                          onClick={handleAnalyzeDeal}
                          disabled={isAnalyzing}
                          className="flex-1 py-2.5 bg-white dark:bg-white/5 text-slate-700 dark:text-white text-sm font-medium rounded-lg shadow-sm border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                        >
                          {isAnalyzing ? (
                            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                          ) : (
                            <BrainCircuit size={16} />
                          )}
                          Analisar Negócio
                        </button>
                        <button
                          onClick={handleDraftEmail}
                          disabled={isDrafting}
                          className="flex-1 py-2.5 bg-white dark:bg-white/5 text-slate-700 dark:text-white text-sm font-medium rounded-lg shadow-sm border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                        >
                          {isDrafting ? (
                            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                          ) : (
                            <Mail size={16} />
                          )}
                          Escrever Email
                        </button>
                      </div>
                      {aiResult && (
                        <div className="bg-white/80 dark:bg-black/40 backdrop-blur-md p-4 rounded-lg border border-primary-100 dark:border-primary-500/20 mb-4">
                          <div className="flex justify-between mb-2 border-b border-primary-100 dark:border-white/5 pb-2">
                            <span className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wider">
                              Sugestão
                            </span>
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2 rounded">
                              {aiResult.score}% Chance
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                            {aiResult.suggestion}
                          </p>
                        </div>
                      )}
                      {emailDraft && (
                        <div className="bg-white/80 dark:bg-black/40 backdrop-blur-md p-4 rounded-lg border border-primary-100 dark:border-primary-500/20">
                          <h4 className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wider mb-2">
                            Rascunho de Email
                          </h4>
                          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed italic">
                            "{emailDraft}"
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-rose-50 dark:bg-rose-900/10 p-6 rounded-xl border border-rose-100 dark:border-rose-500/20">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-rose-100 dark:bg-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400">
                          <Sword size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white font-display text-lg">
                            Objection Killer
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            O cliente está difícil? A IA te ajuda a negociar.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          className="flex-1 bg-white dark:bg-white/5 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500 dark:text-white"
                          placeholder="Ex: 'Achamos o preço muito alto' ou 'Preciso falar com meu sócio'"
                          value={objection}
                          onChange={e => setObjection(e.target.value)}
                        />
                        <button
                          onClick={handleObjection}
                          disabled={isGeneratingObjections || !objection.trim()}
                          className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                        >
                          {isGeneratingObjections ? (
                            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                          ) : (
                            'Gerar Respostas'
                          )}
                        </button>
                      </div>

                      {objectionResponses.length > 0 && (
                        <div className="space-y-3">
                          {objectionResponses.map((resp, idx) => (
                            <div
                              key={idx}
                              className="bg-white dark:bg-white/5 p-3 rounded-lg border border-rose-100 dark:border-rose-500/10 flex gap-3"
                            >
                              <div className="shrink-0 w-6 h-6 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold text-xs">
                                {idx + 1}
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-200">{resp}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ConfirmModal
          isOpen={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={confirmDeleteDeal}
          title="Excluir Negócio"
          message="Tem certeza que deseja excluir este negócio? Esta ação não pode ser desfeita."
          confirmText="Excluir"
          variant="danger"
        />

        <LossReasonModal
          isOpen={showLossReasonModal}
          onClose={() => {
            setShowLossReasonModal(false);
            setPendingLostStageId(null);
            setLossReasonOrigin('button');
          }}
          onConfirm={(reason) => {
            // Priority:
            // 0. Stay in stage flag (Archive)
            // 1. Pending Stage (if set via click or explicit button)
            // 2. Explicit Lost Stage on Board
            // 3. Stage linked to 'OTHER' lifecycle

            if (dealBoard?.lostStayInStage) {
              moveDeal(deal, deal.status, reason, false, true); // explicitLost = true
              setShowLossReasonModal(false);
              setPendingLostStageId(null);
              if (lossReasonOrigin === 'button') onClose();
              return;
            }

            let targetStageId = pendingLostStageId;

            if (!targetStageId && dealBoard?.lostStageId) {
              targetStageId = dealBoard.lostStageId;
            }

            if (!targetStageId) {
              targetStageId =
                dealBoard?.stages.find(s => s.linkedLifecycleStage === 'OTHER')?.id ?? null;
            }

            if (targetStageId) {
              moveDeal(deal, targetStageId, reason);
            } else {
              // Fallback: just mark as lost without moving
              updateDeal(deal.id, { isLost: true, isWon: false, closedAt: new Date().toISOString(), lossReason: reason });
            }
            setShowLossReasonModal(false);
            setPendingLostStageId(null);
            // Only close the deal modal if it was triggered via the "PERDIDO" button
            if (lossReasonOrigin === 'button') onClose();
          }}
          dealTitle={deal.title}
        />
      </div>
    </FocusTrap>
  );
};
