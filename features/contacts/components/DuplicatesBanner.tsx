'use client';

import React from 'react';
import { AlertTriangle, GitMerge } from 'lucide-react';

interface DuplicatesBannerProps {
  count: number;
  onResolve: () => void;
}

export const DuplicatesBanner: React.FC<DuplicatesBannerProps> = ({ count, onResolve }) => {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/10">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {count} grupo{count !== 1 ? 's' : ''} de contatos duplicados
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Contatos com mesmo telefone ou e-mail podem ser mesclados
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onResolve}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition-colors flex-shrink-0"
      >
        <GitMerge className="w-3.5 h-3.5" />
        Resolver
      </button>
    </div>
  );
};
