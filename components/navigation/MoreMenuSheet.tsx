import React from 'react';
import Link from 'next/link';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { cn } from '@/lib/utils/cn';
import { SECONDARY_NAV } from './navConfig';

export interface MoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MoreMenuSheet({ isOpen, onClose }: MoreMenuSheetProps) {
  return (
    <ActionSheet isOpen={isOpen} onClose={onClose} title="Mais" description="Acesse outras áreas do CRM">
      <div className="space-y-2">
        {SECONDARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10',
                'bg-white dark:bg-dark-card',
                'px-3 py-3 text-sm font-medium',
                'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/5',
                'focus-visible-ring'
              )}
            >
              <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <span className="font-display tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </ActionSheet>
  );
}

