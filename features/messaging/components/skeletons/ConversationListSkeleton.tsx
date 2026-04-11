'use client';

import { cn } from '@/lib/utils';

interface ConversationListSkeletonProps {
  className?: string;
  count?: number;
}

export function ConversationListSkeleton({
  className,
  count = 8,
}: ConversationListSkeletonProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header skeleton */}
      <div className="shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="h-6 w-24 bg-[var(--color-muted)] rounded animate-pulse" />
          <div className="h-8 w-8 bg-[var(--color-muted)] rounded-lg animate-pulse" />
        </div>

        {/* Search skeleton */}
        <div className="h-10 bg-[var(--color-muted)] rounded-lg animate-pulse" />

        {/* Tabs skeleton */}
        <div className="flex gap-1 mt-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 w-20 bg-[var(--color-muted)] rounded-md animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* List skeleton */}
      <div className="flex-1 overflow-hidden p-2 space-y-1">
        {Array.from({ length: count }).map((_, i) => (
          <ConversationItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function ConversationItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg">
      {/* Avatar skeleton */}
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-[var(--color-muted)] animate-pulse" />
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--color-muted)] animate-pulse" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-32 bg-[var(--color-muted)] rounded animate-pulse" />
          <div className="h-3 w-12 bg-[var(--color-muted)] rounded animate-pulse" />
        </div>
        <div className="h-4 w-48 bg-[var(--color-muted)] rounded animate-pulse" />
        <div className="h-3 w-20 bg-[var(--color-muted)] rounded animate-pulse" />
      </div>
    </div>
  );
}
