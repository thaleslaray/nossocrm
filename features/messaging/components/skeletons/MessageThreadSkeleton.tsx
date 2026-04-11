'use client';

import { cn } from '@/lib/utils';

interface MessageThreadSkeletonProps {
  className?: string;
}

export function MessageThreadSkeleton({ className }: MessageThreadSkeletonProps) {
  return (
    <div className={cn('flex-1 overflow-hidden px-4 py-2', className)}>
      {/* Date separator skeleton */}
      <div className="flex justify-center py-4">
        <div className="h-6 w-20 bg-[var(--color-muted)] rounded-full animate-pulse" />
      </div>

      {/* Messages skeleton */}
      <div className="space-y-3">
        {/* Inbound message */}
        <div className="flex gap-2 max-w-[70%]">
          <div className="w-8 h-8 rounded-full bg-[var(--color-muted)] animate-pulse shrink-0" />
          <div className="space-y-2">
            <div className="h-4 w-20 bg-[var(--color-muted)] rounded animate-pulse" />
            <div className="h-16 w-48 bg-[var(--color-muted)] rounded-2xl rounded-bl-md animate-pulse" />
          </div>
        </div>

        {/* Outbound message */}
        <div className="flex justify-end">
          <div className="h-10 w-32 bg-[var(--color-muted)] rounded-2xl rounded-br-md animate-pulse" />
        </div>

        {/* Inbound message */}
        <div className="flex gap-2 max-w-[70%]">
          <div className="w-8 h-8 rounded-full bg-[var(--color-muted)] animate-pulse shrink-0" />
          <div className="h-24 w-56 bg-[var(--color-muted)] rounded-2xl rounded-bl-md animate-pulse" />
        </div>

        {/* Outbound messages */}
        <div className="flex justify-end">
          <div className="h-8 w-40 bg-[var(--color-muted)] rounded-2xl rounded-br-md animate-pulse" />
        </div>
        <div className="flex justify-end">
          <div className="h-12 w-52 bg-[var(--color-muted)] rounded-2xl rounded-br-md animate-pulse" />
        </div>

        {/* Inbound message */}
        <div className="flex gap-2 max-w-[70%]">
          <div className="w-8 h-8 rounded-full bg-[var(--color-muted)] animate-pulse shrink-0" />
          <div className="h-10 w-36 bg-[var(--color-muted)] rounded-2xl rounded-bl-md animate-pulse" />
        </div>
      </div>
    </div>
  );
}
