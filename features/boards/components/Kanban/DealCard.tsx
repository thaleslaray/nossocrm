import React, { useState } from 'react';
import Image from 'next/image';
import { DealView } from '@/types';
import { Building2, Hourglass, Trophy, XCircle } from 'lucide-react';
import { ActivityStatusIcon } from './ActivityStatusIcon';
import { priorityAriaLabelPtBr } from '@/lib/utils/priority';

interface DealCardProps {
  deal: DealView;
  isRotting: boolean;
  activityStatus: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string, title: string) => void;
  /** Callback de seleção do deal (mantido estável via useCallback no pai para permitir memoização) */
  onSelect: (dealId: string) => void;
  /**
   * Performance: boolean derivado por-card evita prop global mutável.
   * Isso reduz re-render em listas grandes quando o usuário abre/fecha o menu.
   */
  isMenuOpen: boolean;
  setOpenMenuId: (id: string | null) => void;
  onQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  /** Callback to open move-to-stage modal for keyboard accessibility */
  onMoveToStage?: (dealId: string) => void;
}

// Check if deal is closed (won or lost)
const isDealClosed = (deal: DealView) => deal.isWon || deal.isLost;

// Get priority label for accessibility (PT-BR)
const getPriorityLabel = (priority: string | undefined) => priorityAriaLabelPtBr(priority);

// Get initials from name
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const DealCardComponent: React.FC<DealCardProps> = ({
  deal,
  isRotting,
  activityStatus,
  isDragging,
  onDragStart,
  onSelect,
  isMenuOpen,
  setOpenMenuId,
  onQuickAddActivity,
  setLastMouseDownDealId,
  onMoveToStage,
}) => {
  const [localDragging, setLocalDragging] = useState(false);
  const isClosed = isDealClosed(deal);

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(isMenuOpen ? null : deal.id);
  };

  const handleQuickAdd = (type: 'CALL' | 'MEETING' | 'EMAIL') => {
    onQuickAddActivity(deal.id, type, deal.title);
  };

  const handleDragStart = (e: React.DragEvent) => {
    setLocalDragging(true);
    e.dataTransfer.setData('dealId', deal.id);
    // Fallback mapping when optimistic temp id gets replaced mid-drag by a refetch.
    // Do not log title; it can contain PII.
    e.dataTransfer.setData('dealTitle', deal.title || '');
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(e, deal.id, deal.title || '');
  };

  const handleDragEnd = () => {
    setLocalDragging(false);
  };

  // Determine card styling based on won/lost status
  const getCardClasses = () => {
    const baseClasses = `
      p-3 rounded-lg border-l-4 border-y border-r
      shadow-sm cursor-grab active:cursor-grabbing group hover:shadow-md transition-all relative select-none
    `;

    if (deal.isWon) {
      return `${baseClasses} 
        bg-green-50 dark:bg-green-900/20 
        border-green-200 dark:border-green-700/50
        ${localDragging || isDragging ? 'opacity-50 rotate-2 scale-95' : ''}`;
    }

    if (deal.isLost) {
      return `${baseClasses} 
        bg-red-50 dark:bg-red-900/20 
        border-red-200 dark:border-red-700/50 
        ${localDragging || isDragging ? 'opacity-50 rotate-2 scale-95' : 'opacity-70'}`;
    }

    // Default - open deal
    return `${baseClasses}
      border-slate-200 dark:border-slate-700/50
      ${localDragging || isDragging ? 'bg-green-100 dark:bg-green-900 opacity-50 rotate-2 scale-95' : 'bg-white dark:bg-slate-800 opacity-100'}
      ${isRotting ? 'opacity-80 saturate-50 border-dashed' : ''}
    `;
  };

  // Get border-left color class based on status
  const getBorderLeftClass = () => {
    if (deal.isWon) return '!border-l-green-500';
    if (deal.isLost) return '!border-l-red-500';
    // Priority-based colors for open deals
    if (deal.priority === 'high') return '!border-l-red-500';
    if (deal.priority === 'medium') return '!border-l-amber-500';
    return '!border-l-blue-500';
  };

  // Build accessible label including visible text (tags)
  const getAriaLabel = () => {
    const parts: string[] = [];

    // Status badges (visible text)
    if (deal.isWon) parts.push('ganho');
    if (deal.isLost) parts.push('perdido');

    // Tags (visible text) - include all shown tags
    const shownTags = deal.tags.slice(0, isClosed ? 1 : 2);
    if (shownTags.length > 0) {
      parts.push(...shownTags);
    }

    // Main content
    parts.push(deal.title);
    if (deal.companyName) parts.push(deal.companyName);
    parts.push(`$${deal.value.toLocaleString()}`);

    // Additional context
    const priority = getPriorityLabel(deal.priority);
    if (priority) parts.push(priority);
    if (isRotting && !isClosed) parts.push('estagnado');

    return parts.join(', ');
  };

  return (
    <div
      data-deal-id={deal.id}
      draggable={!deal.id.startsWith('temp-')}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseDown={() => setLastMouseDownDealId(deal.id)}
      onClick={e => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect(deal.id);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!(e.target as HTMLElement).closest('button')) {
            onSelect(deal.id);
          }
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={getAriaLabel()}
      className={`${getCardClasses()} ${getBorderLeftClass()}`}
    >
      {/* Won Badge */}
      {deal.isWon && (
        <div
          className="absolute -top-2 -right-2 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 p-1 rounded-full shadow-sm z-10 flex items-center gap-0.5"
          aria-label="Negócio ganho"
        >
          <Trophy size={12} aria-hidden="true" />
        </div>
      )}

      {/* Lost Badge */}
      {deal.isLost && (
        <div
          className="absolute -top-2 -right-2 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 p-1 rounded-full shadow-sm z-10 flex items-center gap-0.5"
          aria-label={deal.lossReason ? `Perdido: ${deal.lossReason}` : 'Negócio perdido'}
        >
          <XCircle size={12} aria-hidden="true" />
        </div>
      )}

      {/* Rotting indicator - only for open deals */}
      {isRotting && !isClosed && (
        <div
          className="absolute -top-2 -right-2 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 p-1 rounded-full shadow-sm z-10"
          aria-label="Negócio estagnado, mais de 10 dias sem atualização"
        >
          <Hourglass size={12} aria-hidden="true" />
        </div>
      )}

      <div className="flex gap-1 mb-2 flex-wrap">
        {/* Won/Lost status badge */}
        {deal.isWon && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-800/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
            ✓ GANHO
          </span>
        )}
        {deal.isLost && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
            ✗ PERDIDO
          </span>
        )}
        {/* Regular tags */}
        {deal.tags.slice(0, isClosed ? 1 : 2).map((tag, index) => (
          <span
            key={`${deal.id}-tag-${index}`}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5"
          >
            {tag}
          </span>
        ))}
      </div>

      <h4
        className={`text-sm font-bold font-display leading-snug mb-0.5 ${isRotting ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}
      >
        {deal.title}
      </h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
        <Building2 size={10} aria-hidden="true" /> {deal.companyName}
      </p>

      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          {deal.owner && deal.owner.name !== 'Sem Dono' && (
            deal.owner.avatar ? (
              <Image
                src={deal.owner.avatar}
                alt={`Responsável: ${deal.owner.name}`}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full ring-1 ring-white dark:ring-slate-800"
                title={`Responsável: ${deal.owner.name}`}
                unoptimized
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 flex items-center justify-center text-[9px] font-bold ring-1 ring-white dark:ring-slate-800"
                title={`Responsável: ${deal.owner.name}`}
              >
                {getInitials(deal.owner.name)}
              </div>
            )
          )}
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 font-mono">
            ${deal.value.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center">
          <ActivityStatusIcon
            status={activityStatus}
            type={deal.nextActivity?.type}
            dealId={deal.id}
            dealTitle={deal.title}
            isOpen={isMenuOpen}
            onToggle={handleToggleMenu}
            onQuickAdd={handleQuickAdd}
            onRequestClose={() => setOpenMenuId(null)}
            onMoveToStage={onMoveToStage ? () => onMoveToStage(deal.id) : undefined}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Performance: `DealCard` fica em lista grande (Kanban).
 * Usamos `React.memo` para evitar re-render de TODOS os cards quando apenas o menu de 1 deal muda.
 * Isso depende de props estáveis do pai (ex.: `onSelect` via useCallback e `isMenuOpen` por-card).
 */
export const DealCard = React.memo(DealCardComponent);
