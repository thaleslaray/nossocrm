'use client'

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsController } from './hooks/useSettingsController';
import { TagsManager } from './components/TagsManager';
import { CustomFieldsManager } from './components/CustomFieldsManager';
import { ApiKeysSection } from './components/ApiKeysSection';
import { WebhooksSection } from './components/WebhooksSection';
import { McpSection } from './components/McpSection';
import { ChannelsSection } from './components/ChannelsSection';
import { BusinessUnitsSection } from './components/BusinessUnitsSection';
import { DataStorageSettings } from './components/DataStorageSettings';
import { ProductsCatalogManager } from './components/ProductsCatalogManager';
import { AICenterSettings } from './AICenterSettings';

import { UsersPage } from './UsersPage';
import { useAuth } from '@/context/AuthContext';
import { Settings as SettingsIcon, Users, Database, Sparkles, Plug, Package, Building2 } from 'lucide-react';
import { SelectField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/button';

type SettingsTab = 'general' | 'products' | 'business-units' | 'integrations' | 'ai' | 'data' | 'users';

interface GeneralSettingsProps {
  hash?: string;
  isAdmin: boolean;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ hash, isAdmin }) => {
  const controller = useSettingsController();

  // Scroll to hash element (e.g., #ai-config)
  useEffect(() => {
    if (hash) {
      const elementId = hash.slice(1); // Remove #
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [hash]);


  return (
    <div className="pb-10">
      {/* General Settings */}
      <div className="mb-12">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Página Inicial</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Escolha qual tela deve abrir quando você iniciar o CRM.
          </p>
          <SelectField
            label="Página Inicial"
            containerClassName="max-w-xs"
            options={[
              { value: '/dashboard', label: 'Dashboard' },
              { value: '/inbox-list', label: 'Inbox (Lista)' },
              { value: '/inbox-focus', label: 'Inbox (Foco)' },
              { value: '/boards', label: 'Boards (Kanban)' },
              { value: '/contacts', label: 'Contatos' },
              { value: '/activities', label: 'Atividades' },
              { value: '/reports', label: 'Relatórios' },
            ]}
            value={controller.defaultRoute}
            onChange={(e) => controller.setDefaultRoute(e.target.value)}
            aria-label="Selecionar página inicial"
          />
        </div>
      </div>

      {isAdmin && (
        <>
          <TagsManager
            availableTags={controller.availableTags}
            newTagName={controller.newTagName}
            setNewTagName={controller.setNewTagName}
            onAddTag={controller.handleAddTag}
            onRemoveTag={controller.removeTag}
          />

          <CustomFieldsManager
            customFieldDefinitions={controller.customFieldDefinitions}
            newFieldLabel={controller.newFieldLabel}
            setNewFieldLabel={controller.setNewFieldLabel}
            newFieldType={controller.newFieldType}
            setNewFieldType={controller.setNewFieldType}
            newFieldOptions={controller.newFieldOptions}
            setNewFieldOptions={controller.setNewFieldOptions}
            editingId={controller.editingId}
            onStartEditing={controller.startEditingField}
            onCancelEditing={controller.cancelEditingField}
            onSaveField={controller.handleSaveField}
            onRemoveField={controller.removeCustomField}
          />
        </>
      )}

    </div>
  );
};

const ProductsSettings: React.FC = () => {
  return (
    <div className="pb-10">
      <ProductsCatalogManager />
    </div>
  );
};

const IntegrationsSettings: React.FC = () => {
  type IntegrationsSubTab = 'channels' | 'webhooks' | 'api' | 'mcp';
  const [subTab, setSubTab] = useState<IntegrationsSubTab>('channels');

  useEffect(() => {
    const syncFromHash = () => {
    const h = typeof window !== 'undefined' ? (window.location.hash || '').replace('#', '') : '';
    if (h === 'channels' || h === 'webhooks' || h === 'api' || h === 'mcp') setSubTab(h as IntegrationsSubTab);
    };

    syncFromHash();

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', syncFromHash);
      return () => window.removeEventListener('hashchange', syncFromHash);
    }
  }, []);

  const setSubTabAndHash = (t: IntegrationsSubTab) => {
    setSubTab(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.hash = `#${t}`;
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-6">
        {([
          { id: 'channels' as const, label: 'Canais (Messaging)' },
          { id: 'webhooks' as const, label: 'Webhooks' },
          { id: 'api' as const, label: 'API' },
          { id: 'mcp' as const, label: 'MCP' },
        ] as const).map((t) => {
          const active = subTab === t.id;
          return (
            <Button
              key={t.id}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTabAndHash(t.id)}
            >
              {t.label}
            </Button>
          );
        })}
      </div>

      {subTab === 'channels' && <ChannelsSection />}
      {subTab === 'api' && <ApiKeysSection />}
      {subTab === 'webhooks' && <WebhooksSection />}
      {subTab === 'mcp' && <McpSection />}
    </div>
  );
};

interface SettingsPageProps {
  tab?: SettingsTab;
}

/**
 * Componente React `SettingsPage`.
 *
 * @param {SettingsPageProps} { tab: initialTab } - Parâmetro `{ tab: initialTab }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
const SettingsPage: React.FC<SettingsPageProps> = ({ tab: initialTab }) => {
  const { profile } = useAuth();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');

  // Get hash from URL for scrolling
  const hash = typeof window !== 'undefined' ? window.location.hash : '';

  // Determine tab from pathname if available
  useEffect(() => {
    if (pathname?.includes('/settings/ai')) {
      setActiveTab('ai');
    } else if (pathname?.includes('/settings/products')) {
      setActiveTab('products');
    } else if (pathname?.includes('/settings/business-units') || pathname?.includes('/settings/unidades')) {
      setActiveTab('business-units');
    } else if (pathname?.includes('/settings/integracoes')) {
      setActiveTab('integrations');
    } else if (pathname?.includes('/settings/data')) {
      setActiveTab('data');
    } else if (pathname?.includes('/settings/users')) {
      setActiveTab('users');
    } else {
      setActiveTab('general');
    }
  }, [pathname]);

  const tabs = [
    { id: 'general' as SettingsTab, name: 'Geral', icon: SettingsIcon },
    ...(profile?.role === 'admin' ? [{ id: 'products' as SettingsTab, name: 'Produtos/Serviços', icon: Package }] : []),
    ...(profile?.role === 'admin' ? [{ id: 'business-units' as SettingsTab, name: 'Unidades', icon: Building2 }] : []),
    ...(profile?.role === 'admin' ? [{ id: 'integrations' as SettingsTab, name: 'Integrações', icon: Plug }] : []),
    { id: 'ai' as SettingsTab, name: 'Central de I.A', icon: Sparkles },
    { id: 'data' as SettingsTab, name: 'Dados', icon: Database },
    ...(profile?.role === 'admin' ? [{ id: 'users' as SettingsTab, name: 'Equipe', icon: Users }] : []),
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'products':
        return <ProductsSettings />;
      case 'business-units':
        return (
          <div className="pb-10 space-y-8">
            <BusinessUnitsSection />
          </div>
        );
      case 'integrations':
        return <IntegrationsSettings />;
      case 'ai':
        return <AICenterSettings />;
      case 'data':
        return <DataStorageSettings />;
      case 'users':
        return <UsersPage />;
      default:
        return <GeneralSettings hash={hash} isAdmin={profile?.role === 'admin'} />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Tabs minimalistas */}
      <div className="flex items-center gap-1 mb-8 border-b border-slate-200 dark:border-white/10">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {renderContent()}
    </div>
  );
};

export default SettingsPage;

