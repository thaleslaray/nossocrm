import React from 'react';
import { useInboxController } from './hooks/useInboxController';
import { ViewModeToggle } from './components/ViewModeToggle';
import { InboxOverviewView } from './components/InboxOverviewView';
import { InboxListView } from './components/InboxListView';
import { InboxFocusView } from './components/InboxFocusView';

export const InboxPage: React.FC = () => {
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
  } = useInboxController();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold font-display text-slate-900 dark:text-white mb-1">
            Inbox
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Sua mesa de trabalho.</p>
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
          onGoToList={() => setViewMode('list')}
          onStartFocus={() => {
            setFocusIndex(0);
            setViewMode('focus');
          }}
          onAcceptSuggestion={handleAcceptSuggestion}
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
