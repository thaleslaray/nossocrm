import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInboxController } from './hooks/useInboxController';
import { ViewModeToggle } from './components/ViewModeToggle';
import { InboxOverviewView } from './components/InboxOverviewView';
import { InboxListView } from './components/InboxListView';
import { InboxFocusView } from './components/InboxFocusView';
import { DebugFillButton } from '@/components/debug/DebugFillButton';

/**
 * Componente React `InboxPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const InboxPage: React.FC = () => {
  const router = useRouter();

  // Controla “intenção” ao abrir a Lista (ex.: abrir já com sugestões expandidas)
  const [listPreset, setListPreset] = useState<'default' | 'suggestions-expanded'>('default');

  const {
    // View Mode
    viewMode,
    setViewMode,

    // Atividades
    overdueActivities,
    todayMeetings,
    todayTasks,
    upcomingActivities,

    // Sugestões IA
    aiSuggestions,

    // Focus Mode
    focusQueue,
    focusIndex,
    setFocusIndex,
    currentFocusItem,
    handleFocusNext,
    handleFocusPrev,
    handleFocusSkip,
    handleFocusDone,
    handleFocusSnooze,

    // Handlers Atividades
    handleCompleteActivity,
    handleSnoozeActivity,
    handleDiscardActivity,

    // Handlers Sugestões
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleSnoozeSuggestion,
    seedInboxDebug,
  } = useInboxController();

  const listDefaults = useMemo(
    () => ({
      suggestionsDefaultOpen: true,
      suggestionsDefaultShowAll: listPreset === 'suggestions-expanded',
    }),
    [listPreset]
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold font-display text-slate-900 dark:text-white mb-1">
            Inbox
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Sua mesa de trabalho.</p>
          <div className="mt-4 flex gap-2">
            <DebugFillButton onClick={seedInboxDebug} label="Seed Inbox" variant="secondary" />
          </div>
        </div>

        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Views */}
      {viewMode === 'overview' ? (
        <InboxOverviewView
          overdueActivities={overdueActivities}
          todayMeetings={todayMeetings}
          todayTasks={todayTasks}
          upcomingActivities={upcomingActivities}
          aiSuggestions={aiSuggestions}
          onGoToList={() => {
            setListPreset('default');
            setViewMode('list');
          }}
          onStartFocus={() => {
            setFocusIndex(0);
            setViewMode('focus');
          }}
          onAcceptSuggestion={handleAcceptSuggestion}

          onOpenOverdue={() => router.push('/activities?filter=overdue')}
          onOpenToday={() => router.push('/activities?filter=today')}
          onOpenCriticalSuggestions={() => {
            setListPreset('suggestions-expanded');
            setViewMode('list');
          }}
          onOpenPending={() => {
            setListPreset('default');
            setViewMode('list');
          }}
        />
      ) : viewMode === 'list' ? (
        <InboxListView
          overdueActivities={overdueActivities}
          todayMeetings={todayMeetings}
          todayTasks={todayTasks}
          upcomingActivities={upcomingActivities}
          aiSuggestions={aiSuggestions}
          onCompleteActivity={handleCompleteActivity}
          onSnoozeActivity={handleSnoozeActivity}
          onDiscardActivity={handleDiscardActivity}
          onAcceptSuggestion={handleAcceptSuggestion}
          onDismissSuggestion={handleDismissSuggestion}
          onSnoozeSuggestion={handleSnoozeSuggestion}
          suggestionsDefaultOpen={listDefaults.suggestionsDefaultOpen}
          suggestionsDefaultShowAll={listDefaults.suggestionsDefaultShowAll}
          onSelectActivity={(id) => {
            const index = focusQueue.findIndex(item => item.id === id);
            if (index !== -1) {
              setFocusIndex(index);
              setViewMode('focus');
            }
          }}
        />
      ) : (
        <InboxFocusView
          currentItem={currentFocusItem}
          currentIndex={focusIndex}
          totalItems={focusQueue.length}
          onDone={handleFocusDone}
          onSnooze={handleFocusSnooze}
          onSkip={handleFocusSkip}
          onPrev={handleFocusPrev}
          onNext={handleFocusNext}
        />
      )}
    </div>
  );
};
