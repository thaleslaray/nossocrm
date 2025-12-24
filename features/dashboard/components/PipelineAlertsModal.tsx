import React from 'react';
import { X, AlertTriangle, Clock, Calendar, TrendingUp, ChevronRight } from 'lucide-react';
import { Deal } from '@/types';

interface PipelineAlert {
  type: 'stagnant' | 'no-activity' | 'ready-to-close';
  title: string;
  description: string;
  deals: Deal[];
  color: string;
  icon: React.ElementType;
}

interface PipelineAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deals: Deal[];
  activities: { dealId: string; date: string; completed: boolean }[];
  onNavigateToDeal: (dealId: string) => void;
}

export const PipelineAlertsModal: React.FC<PipelineAlertsModalProps> = ({
  isOpen,
  onClose,
  deals,
  activities,
  onNavigateToDeal,
}) => {
  if (!isOpen) return null;

  // Performance: use timestamps for comparisons to reduce Date allocations.
  const nowTs = Date.now();
  const now = new Date(nowTs);
  const tenDaysAgoTs = nowTs - 10 * 24 * 60 * 60 * 1000;

  // Deals ativos (não ganhos nem perdidos)
  const activeDeals = deals.filter(d => !d.isWon && !d.isLost);

  // 1. Negócios Estagnados - sem mudança de estágio há mais de 10 dias
  const stagnantDeals = activeDeals.filter(deal => {
    const lastChangeTs = deal.lastStageChangeDate
      ? Date.parse(deal.lastStageChangeDate)
      : Date.parse(deal.createdAt);
    return lastChangeTs < tenDaysAgoTs;
  });

  // 2. Deals sem próxima atividade agendada
  /**
   * Performance: avoid N+1 scans (`activities.filter(...)` for each deal).
   * Build a Set of dealIds that have at least one future pending activity.
   */
  const dealIdsWithFutureActivity = new Set<string>();
  for (const a of activities) {
    if (a.completed) continue;
    if (Date.parse(a.date) >= nowTs) {
      dealIdsWithFutureActivity.add(a.dealId);
    }
  }
  const dealsWithoutActivity = activeDeals.filter(deal => !dealIdsWithFutureActivity.has(deal.id));

  // 3. Deals prontos para fechar (alta probabilidade ou em estágios finais)
  const readyToCloseDeals = activeDeals.filter(deal => {
    // Performance: avoid creating multiple strings when status is nullish.
    return deal.probability >= 70 || (deal.status ? deal.status.toLowerCase().includes('proposta') : false);
  });

  const alerts: PipelineAlert[] = [
    {
      type: 'stagnant',
      title: 'Negócios Estagnados',
      description: 'Sem mudança de estágio há mais de 10 dias',
      deals: stagnantDeals,
      color: 'text-red-500 bg-red-500/10',
      icon: AlertTriangle,
    },
    {
      type: 'no-activity',
      title: 'Sem Próximo Passo',
      description: 'Nenhuma atividade futura agendada',
      deals: dealsWithoutActivity,
      color: 'text-amber-500 bg-amber-500/10',
      icon: Calendar,
    },
    {
      type: 'ready-to-close',
      title: 'Prontos para Fechar',
      description: 'Alta probabilidade de conversão',
      deals: readyToCloseDeals,
      color: 'text-emerald-500 bg-emerald-500/10',
      icon: TrendingUp,
    },
  ];

  const totalAlerts = stagnantDeals.length + dealsWithoutActivity.length;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-none" />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-slate-200 dark:border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="text-primary-500" size={24} />
              Alertas de Pipeline
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {totalAlerts > 0 
                ? `${totalAlerts} itens precisam de atenção`
                : 'Seu pipeline está saudável! 🎉'
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Fechar"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          {alerts.map((alert) => (
            <div key={alert.type} className="space-y-3">
              {/* Alert Header */}
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${alert.color}`}>
                  <alert.icon size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {alert.title}
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                      alert.deals.length > 0 
                        ? alert.type === 'ready-to-close' 
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/20 text-red-600 dark:text-red-400'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {alert.deals.length}
                    </span>
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {alert.description}
                  </p>
                </div>
              </div>

              {/* Deals List */}
              {alert.deals.length > 0 ? (
                <div className="space-y-2 pl-11">
                  {alert.deals.slice(0, 5).map((deal) => (
                    <button
                      key={deal.id}
                      onClick={() => onNavigateToDeal(deal.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {deal.title}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          ${deal.value.toLocaleString()} • {deal.probability}% probabilidade
                        </p>
                      </div>
                      <ChevronRight 
                        size={18} 
                        className="text-slate-400 group-hover:text-primary-500 transition-colors flex-shrink-0" 
                      />
                    </button>
                  ))}
                  {alert.deals.length > 5 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">
                      + {alert.deals.length - 5} outros deals
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 pl-11 italic">
                  Nenhum deal nesta categoria ✓
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            💡 Dica: Deals sem atividade futura têm menor chance de conversão. Agende próximos passos!
          </p>
        </div>
      </div>
    </div>
  );
};
