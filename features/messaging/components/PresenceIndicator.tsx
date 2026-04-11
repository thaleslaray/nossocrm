'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

interface PresenceIndicatorProps {
  status: PresenceStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_CONFIG: Record<PresenceStatus, { color: string; label: string; animate?: boolean }> = {
  online: { color: 'bg-green-500', label: 'online' },
  typing: { color: 'bg-green-500', label: 'digitando...', animate: true },
  recording: { color: 'bg-red-500', label: 'gravando áudio...', animate: true },
  offline: { color: 'bg-slate-400', label: '' },
};

export function PresenceIndicator({ status, showLabel = false, size = 'sm', className }: PresenceIndicatorProps) {
  if (status === 'offline') return null;

  const config = STATUS_CONFIG[status];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('rounded-full', dotSize, config.color, config.animate && 'animate-pulse')} />
      {showLabel && config.label && (
        <span className={cn(
          'text-[10px] font-medium italic',
          status === 'recording' ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'
        )}>
          {config.label}
        </span>
      )}
    </span>
  );
}
