import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { PRIMARY_NAV } from './navConfig';

export interface BottomNavProps {
  onOpenMore: () => void;
}

export function BottomNav({ onOpenMore }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal (mobile)"
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 md:hidden',
        'border-t border-slate-200 dark:border-white/10',
        'bg-white/85 dark:bg-dark-card/85 backdrop-blur',
        'pb-[var(--app-safe-area-bottom,0px)]'
      )}
    >
      <div className="mx-auto flex h-[var(--app-bottom-nav-height,56px)] max-w-screen-sm items-stretch">
        {PRIMARY_NAV.map((item) => {
          const isActive =
            item.href
              ? pathname === item.href || (item.href === '/boards' && pathname === '/pipeline')
              : false;

          const Icon = item.icon;

          if (item.id === 'more') {
            return (
              <button
                key={item.id}
                type="button"
                onClick={onOpenMore}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1',
                  'text-xs font-medium',
                  'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                  'focus-visible-ring'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="font-display tracking-wide">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href!}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1',
                'text-xs font-medium focus-visible-ring',
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5', isActive ? 'text-primary-500' : '')} aria-hidden="true" />
              <span className="font-display tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

