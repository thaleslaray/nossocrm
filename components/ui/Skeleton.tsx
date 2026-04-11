import React from 'react';
import { cn } from '@/lib/utils/cn';

type SkeletonVariant = 'rect' | 'circle' | 'text';

interface SkeletonProps {
  className?: string;
  variant?: SkeletonVariant;
}

export function Skeleton({ className, variant = 'rect' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-slate-200 dark:bg-white/10',
        variant === 'circle' ? 'rounded-full' : 'rounded-lg',
        className
      )}
      aria-hidden="true"
    />
  );
}

// Composto: 4 stat cards do dashboard
export function SkeletonStatCard() {
  return (
    <div className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton variant="rect" className="h-11 w-11 rounded-xl" />
      </div>
      <Skeleton className="h-4 w-36" />
    </div>
  );
}

// Composto: linha de tabela (contacts, activities)
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={cn('h-4', i === 0 ? 'w-32' : i === cols - 1 ? 'w-16' : 'w-24')} />
        </td>
      ))}
    </tr>
  );
}

// Composto: kanban deal card
export function SkeletonDealCard() {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton variant="circle" className="h-6 w-6" />
      </div>
    </div>
  );
}
