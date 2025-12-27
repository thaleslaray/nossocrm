import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SettingsSectionProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}

/**
 * Componente React `SettingsSection`.
 *
 * @param {SettingsSectionProps} { title, icon: Icon, children } - Parâmetro `{ title, icon: Icon, children }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, icon: Icon, children }) => (
  <div className="mb-12">
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Icon className="h-5 w-5" /> {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gerencie suas configurações de {title.toLowerCase()}.
          </p>
        </div>
      </div>
      {children}
    </div>
  </div>
);
