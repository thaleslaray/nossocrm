'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

interface ContactPanelSkeletonProps {
  className?: string;
}

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-slate-200 dark:bg-white/10 rounded animate-pulse',
        className
      )}
    />
  );
}

export const ContactPanelSkeleton = memo(function ContactPanelSkeleton({ className }: ContactPanelSkeletonProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10">
        {/* Avatar & Name */}
        <div className="flex items-start gap-3">
          <SkeletonPulse className="w-14 h-14 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-5 w-32" />
            <SkeletonPulse className="h-4 w-24" />
            <div className="flex gap-2 mt-2">
              <SkeletonPulse className="h-5 w-16 rounded-full" />
              <SkeletonPulse className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-4">
          <SkeletonPulse className="flex-1 h-9 rounded-lg" />
          <SkeletonPulse className="flex-1 h-9 rounded-lg" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4 space-y-6">
        {/* Section 1 */}
        <div className="space-y-3">
          <SkeletonPulse className="h-3 w-24" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <SkeletonPulse className="w-4 h-4 rounded flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <SkeletonPulse className="h-3 w-16" />
                  <SkeletonPulse className="h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2 */}
        <div className="space-y-3">
          <SkeletonPulse className="h-3 w-20" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <SkeletonPulse className="w-4 h-4 rounded flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <SkeletonPulse className="h-3 w-20" />
                  <SkeletonPulse className="h-4 w-36" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 */}
        <div className="space-y-3">
          <SkeletonPulse className="h-3 w-12" />
          <div className="flex gap-1.5">
            <SkeletonPulse className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
});

export default ContactPanelSkeleton;
