import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { PRIMARY_NAV, SECONDARY_NAV } from './navConfig';

export interface NavigationRailProps {
  /** Optional: used only if we want to keep "More" as a sheet trigger (mobile-like). */
  onOpenMore?: () => void;
}

export function NavigationRail({ onOpenMore }: NavigationRailProps) {
  const pathname = usePathname();

  const isHrefActive = (href: string) =>
    pathname === href ||
    (href === '/boards' && pathname === '/pipeline') ||
    (href === '/pipeline' && pathname === '/boards');

  return (
    <nav
      aria-label="Navegação principal (tablet)"
      className={cn(
        'flex',
        'flex-col justify-between',
        'w-20 shrink-0',
        'glass border-r border-[var(--color-border-subtle)]'
      )}
    >
      <div className="flex flex-col items-center gap-2 py-4">
        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary-500/20">
          N
        </div>
      </div>

      <div className="flex-1 px-3 py-2 overflow-y-auto scrollbar-custom">
        <div className="space-y-2">
          {PRIMARY_NAV.filter((i) => i.id !== 'more').map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? isHrefActive(item.href) : false;

            return (
              <Link
                key={item.id}
                href={item.href!}
                className={cn(
                  'w-full h-12 rounded-xl flex items-center justify-center transition-colors focus-visible-ring',
                  isActive
                    ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-900/50'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                )}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                aria-label={item.label}
              >
                <Icon className={cn('h-5 w-5', isActive ? 'text-primary-500' : '')} aria-hidden="true" />
              </Link>
            );
          })}
        </div>

        <div className="my-3 h-px bg-slate-200/60 dark:bg-white/10" />

        <div className="space-y-2">
          {SECONDARY_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = isHrefActive(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'w-full h-12 rounded-xl flex items-center justify-center transition-colors focus-visible-ring',
                  isActive
                    ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-900/50'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                )}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                aria-label={item.label}
              >
                <Icon className={cn('h-5 w-5', isActive ? 'text-primary-500' : '')} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-3 pb-4" />
    </nav>
  );
}

