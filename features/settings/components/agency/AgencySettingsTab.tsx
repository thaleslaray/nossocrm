/**
 * AgencySettingsTab - Aba principal de configurações da agência
 *
 * Combina AgencyProfileSection e ServicesManager em uma interface integrada
 */
import React from 'react';
import { AgencyProfileSection } from './AgencyProfileSection';
import { ServicesManager } from './ServicesManager';

export const AgencySettingsTab: React.FC = () => {
  return (
    <div className="space-y-12">
      {/* Agency Profile */}
      <AgencyProfileSection />

      {/* Divider */}
      <div className="border-t border-neutral-200 dark:border-neutral-700" />

      {/* Services Catalog */}
      <ServicesManager />
    </div>
  );
};
