'use client';

import React, { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WindowExpiryBadgeProps {
  windowExpiresAt: string | null | undefined;
  className?: string;
  variant?: 'inline' | 'badge';
}

function getExpiryInfo(expiresAt: string | null | undefined): {
  isExpired: boolean;
  minutesRemaining: number | null;
  hoursRemaining: number | null;
  status: 'expired' | 'critical' | 'warning' | 'ok';
} {
  if (!expiresAt) {
    return { isExpired: false, minutesRemaining: null, hoursRemaining: null, status: 'ok' };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { isExpired: true, minutesRemaining: 0, hoursRemaining: 0, status: 'expired' };
  }

  const minutesRemaining = Math.floor(diffMs / (1000 * 60));
  const hoursRemaining = Math.floor(minutesRemaining / 60);

  let status: 'expired' | 'critical' | 'warning' | 'ok';
  if (minutesRemaining <= 60) {
    status = 'critical';
  } else if (hoursRemaining <= 4) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return { isExpired: false, minutesRemaining, hoursRemaining, status };
}

const STATUS_STYLES = {
  expired: {
    container: 'bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400',
    icon: XCircle,
  },
  critical: {
    container: 'bg-orange-100 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-400',
    icon: AlertTriangle,
  },
  warning: {
    container: 'bg-yellow-100 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    icon: Clock,
  },
  ok: {
    container: 'bg-green-100 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400',
    icon: Clock,
  },
};

export const WindowExpiryBadge = memo(function WindowExpiryBadge({
  windowExpiresAt,
  className,
  variant = 'badge',
}: WindowExpiryBadgeProps) {
  // Tick counter forces useMemo to re-evaluate periodically so time display stays fresh
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!windowExpiresAt) return;
    // Update every 30s when showing minutes, every 60s otherwise
    const intervalMs = 30_000;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [windowExpiresAt]);

  const expiryInfo = useMemo(() => getExpiryInfo(windowExpiresAt), [windowExpiresAt, tick]);

  // Don't show if no expiry or more than 12 hours remaining
  if (!windowExpiresAt || (expiryInfo.hoursRemaining !== null && expiryInfo.hoursRemaining > 12)) {
    return null;
  }

  const { status, minutesRemaining, hoursRemaining, isExpired } = expiryInfo;
  const styles = STATUS_STYLES[status];
  const Icon = styles.icon;

  // Format display text
  let displayText: string;
  if (isExpired) {
    displayText = 'Janela expirada';
  } else if (minutesRemaining !== null && minutesRemaining <= 60) {
    displayText = `${minutesRemaining}min restantes`;
  } else if (hoursRemaining !== null) {
    displayText = `${hoursRemaining}h restantes`;
  } else {
    return null;
  }

  if (variant === 'inline') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs',
          status === 'expired' ? 'text-red-500' : '',
          status === 'critical' ? 'text-orange-500' : '',
          status === 'warning' ? 'text-yellow-600' : '',
          status === 'ok' ? 'text-green-600' : '',
          className
        )}
      >
        <Icon className="w-3 h-3" />
        <span>{displayText}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium',
        styles.container,
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{displayText}</span>
    </div>
  );
});

export default WindowExpiryBadge;
