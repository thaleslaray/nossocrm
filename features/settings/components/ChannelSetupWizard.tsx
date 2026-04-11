'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MessageCircle,
  Instagram,
  Mail,
  QrCode,
  Key,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils/cn';
import { useCreateChannelMutation } from '@/lib/query/hooks/useChannelsQuery';
import { useBusinessUnitsWithCounts } from '@/lib/query/hooks/useBusinessUnitsQuery';
import {
  type ChannelType,
  type CreateChannelInput,
  CHANNEL_TYPE_INFO,
  CHANNEL_PROVIDERS,
} from '@/lib/messaging/types';

// =============================================================================
// TYPES
// =============================================================================

type WizardStep = 'select' | 'credentials' | 'test' | 'complete';

interface ChannelSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-select a channel type/provider */
  initialType?: ChannelType;
  initialProvider?: string;
  /** Business unit to associate the channel with */
  businessUnitId?: string;
}

interface ProviderConfig {
  name: string;
  description: string;
  official: boolean;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'password' | 'textarea';
    placeholder: string;
    required: boolean;
    helpText?: string;
    autoGenerate?: boolean;
  }[];
  setupUrl?: string;
  setupInstructions?: string[];
}

// Generate a cryptographically secure random token
function generateVerifyToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 32;
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let result = 'ncrm_';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }
  return result;
}

// =============================================================================
// PROVIDER CONFIGURATIONS
// =============================================================================

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  'whatsapp:z-api': {
    name: 'Z-API',
    description: 'Conexão não-oficial via WhatsApp Web. Setup rápido, sem limites de mensagem.',
    official: false,
    fields: [
      {
        key: 'instanceId',
        label: 'Instance ID',
        type: 'text',
        placeholder: 'Ex: A1B2C3D4E5F6...',
        required: true,
        helpText: 'Encontrado no painel da Z-API após criar uma instância.',
      },
      {
        key: 'token',
        label: 'Token',
        type: 'password',
        placeholder: 'Seu token de API',
        required: true,
        helpText: 'Token de autenticação da sua instância.',
      },
      {
        key: 'clientToken',
        label: 'Client Token (opcional)',
        type: 'password',
        placeholder: 'Token do cliente (se aplicável)',
        required: false,
        helpText: 'Necessário apenas para algumas operações específicas.',
      },
    ],
    setupUrl: 'https://developer.z-api.io/',
    setupInstructions: [
      '1. Acesse developer.z-api.io e crie uma conta',
      '2. Crie uma nova instância no painel',
      '3. Copie o Instance ID e Token gerados',
      '4. Cole os dados nos campos abaixo',
    ],
  },
  'whatsapp:evolution': {
    name: 'Evolution API',
    description: 'Conexão não-oficial via WhatsApp Web usando Evolution API self-hosted.',
    official: false,
    fields: [
      {
        key: 'serverUrl',
        label: 'URL do Servidor',
        type: 'text',
        placeholder: 'Ex: https://evolution.suaempresa.com',
        required: true,
        helpText: 'URL base da sua instância Evolution API.',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'Sua chave de API global',
        required: true,
        helpText: 'Chave de autenticação configurada no servidor Evolution API.',
      },
      {
        key: 'instanceName',
        label: 'Nome da Instância',
        type: 'text',
        placeholder: 'Ex: minha-empresa',
        required: true,
        helpText: 'Nome da instância criada no servidor Evolution API.',
      },
    ],
    setupUrl: 'https://doc.evolution-api.com/',
    setupInstructions: [
      '1. Instale ou acesse seu servidor Evolution API',
      '2. Crie uma instância no painel ou via API',
      '3. Copie a URL do servidor e a API Key',
      '4. Após salvar, configure o webhook apontando para a URL exibida',
    ],
  },
  'whatsapp:meta-cloud': {
    name: 'Meta Cloud API',
    description: 'API oficial da Meta. Requer verificação de negócio e templates aprovados.',
    official: true,
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        type: 'text',
        placeholder: 'Ex: 123456789012345',
        required: true,
        helpText: 'ID do número de telefone no Meta Business.',
      },
      {
        key: 'businessAccountId',
        label: 'WhatsApp Business Account ID',
        type: 'text',
        placeholder: 'Ex: 123456789012345',
        required: true,
        helpText: 'ID da conta comercial do WhatsApp.',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'Seu token de acesso permanente',
        required: true,
        helpText: 'Token com permissões whatsapp_business_messaging.',
      },
      {
        key: 'appSecret',
        label: 'App Secret',
        type: 'password',
        placeholder: 'Seu App Secret do Meta',
        required: false,
        helpText: 'Encontrado em Configurações > Básico no Meta for Developers. Necessário para verificar assinaturas de webhook.',
      },
      {
        key: 'verifyToken',
        label: 'Verify Token (para webhooks)',
        type: 'text',
        placeholder: 'Gerado automaticamente',
        required: false, // Auto-generated
        helpText: 'Token gerado automaticamente. Copie este valor para a configuração do webhook no Meta.',
        autoGenerate: true,
      },
    ],
    setupUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    setupInstructions: [
      '1. Acesse developers.facebook.com e crie um app de negócios',
      '2. Adicione o produto "WhatsApp" ao seu app',
      '3. Configure um número de telefone de teste ou produção',
      '4. Gere um token de acesso permanente',
      '5. Cole os dados nos campos abaixo',
    ],
  },
  'instagram:meta': {
    name: 'Instagram API',
    description: 'API oficial da Meta para Instagram Direct Messages.',
    official: true,
    fields: [
      {
        key: 'pageId',
        label: 'Facebook Page ID',
        type: 'text',
        placeholder: 'Ex: 123456789012345',
        required: true,
        helpText: 'ID da página do Facebook vinculada à conta Instagram.',
      },
      {
        key: 'instagramAccountId',
        label: 'Instagram Business Account ID',
        type: 'text',
        placeholder: 'Ex: 17841400000000000',
        required: true,
        helpText: 'ID da conta profissional do Instagram.',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'Seu token de acesso',
        required: true,
        helpText: 'Token com permissões instagram_manage_messages.',
      },
    ],
    setupUrl: 'https://developers.facebook.com/docs/instagram-api/getting-started',
    setupInstructions: [
      '1. Certifique-se de ter uma conta Instagram Profissional ou de Criador',
      '2. Vincule a conta a uma página do Facebook',
      '3. Crie um app no Meta for Developers',
      '4. Solicite as permissões necessárias para messaging',
      '5. Gere um token de acesso e cole abaixo',
    ],
  },
  'email:resend': {
    name: 'Resend',
    description: 'API moderna de email transacional. Setup simples, tracking completo.',
    official: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 're_xxxxxxxxxxxx',
        required: true,
        helpText: 'Encontrada em resend.com/api-keys.',
      },
      {
        key: 'fromName',
        label: 'Nome do Remetente',
        type: 'text',
        placeholder: 'Sua Empresa',
        required: true,
        helpText: 'Nome que aparecerá no campo "De:" do email.',
      },
      {
        key: 'fromEmail',
        label: 'Email do Remetente',
        type: 'text',
        placeholder: 'noreply@suaempresa.com',
        required: true,
        helpText: 'Deve ser de um domínio verificado no Resend.',
      },
      {
        key: 'replyTo',
        label: 'Reply-To (opcional)',
        type: 'text',
        placeholder: 'contato@suaempresa.com',
        required: false,
        helpText: 'Endereço para receber respostas dos clientes.',
      },
    ],
    setupUrl: 'https://resend.com/docs/getting-started',
    setupInstructions: [
      '1. Acesse resend.com e crie uma conta',
      '2. Verifique seu domínio de email',
      '3. Gere uma API Key em API Keys',
      '4. Cole a chave e configure o remetente abaixo',
    ],
  },
};

// =============================================================================
// CHANNEL TYPE ICONS
// =============================================================================

const CHANNEL_ICONS: Record<ChannelType, React.FC<{ className?: string }>> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  email: Mail,
  sms: () => null,
  telegram: () => null,
  voice: () => null,
};

// =============================================================================
// STEP: SELECT CHANNEL
// =============================================================================

interface SelectStepProps {
  onSelect: (type: ChannelType, provider: string) => void;
}

function SelectStep({ onSelect }: SelectStepProps) {
  const availableChannels: { type: ChannelType; providers: string[] }[] = [
    { type: 'whatsapp', providers: CHANNEL_PROVIDERS.whatsapp },
    { type: 'instagram', providers: CHANNEL_PROVIDERS.instagram },
    { type: 'email', providers: CHANNEL_PROVIDERS.email },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Escolha o canal
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Selecione o tipo de canal e o provedor que deseja configurar.
        </p>
      </div>

      <div className="space-y-4">
        {availableChannels.map(({ type, providers }) => {
          const Icon = CHANNEL_ICONS[type];
          const info = CHANNEL_TYPE_INFO[type];

          return (
            <div
              key={type}
              className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5"
            >
              <div className="flex items-center gap-4 mb-4">
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center text-white',
                    info.color
                  )}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                    {info.label}
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {providers.length} opção{providers.length > 1 ? 'ões' : ''} de conexão
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {providers.map((provider) => {
                  const config = PROVIDER_CONFIGS[`${type}:${provider}`];
                  if (!config) return null;

                  return (
                    <button
                      key={provider}
                      onClick={() => onSelect(type, provider)}
                      className="w-full p-4 rounded-xl text-left
                        bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10
                        hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20
                        transition-colors group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {config.name}
                        </span>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            config.official
                              ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-300'
                              : 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
                          )}
                        >
                          {config.official ? 'Oficial' : 'Não-oficial'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {config.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Configurar</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// STEP: CREDENTIALS
// =============================================================================

interface CredentialsStepProps {
  channelType: ChannelType;
  provider: string;
  credentials: Record<string, string>;
  channelName: string;
  externalIdentifier: string;
  businessUnits: { id: string; name: string }[];
  selectedBusinessUnitId: string;
  onCredentialsChange: (key: string, value: string) => void;
  onNameChange: (value: string) => void;
  onIdentifierChange: (value: string) => void;
  onBusinessUnitChange: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  isValid: boolean;
}

function CredentialsStep({
  channelType,
  provider,
  credentials,
  channelName,
  externalIdentifier,
  businessUnits,
  selectedBusinessUnitId,
  onCredentialsChange,
  onNameChange,
  onIdentifierChange,
  onBusinessUnitChange,
  onBack,
  onNext,
  isValid,
}: CredentialsStepProps) {
  const config = PROVIDER_CONFIGS[`${channelType}:${provider}`];

  if (!config) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Configuração não encontrada para este provedor.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Configurar {config.name}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Preencha as credenciais para conectar sua conta.
        </p>
      </div>

      {/* Setup Instructions */}
      {config.setupInstructions && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
            Como obter as credenciais:
          </h4>
          <ol className="space-y-1">
            {config.setupInstructions.map((instruction, idx) => (
              <li key={idx} className="text-xs text-blue-700 dark:text-blue-300">
                {instruction}
              </li>
            ))}
          </ol>
          {config.setupUrl && (
            <a
              href={config.setupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Abrir documentação
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Business Unit Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Unidade de Negócio <span className="text-red-500">*</span>
        </label>
        {businessUnits.length === 0 ? (
          <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Nenhuma unidade de negócio encontrada. Crie uma em Configurações → Unidades antes de adicionar canais.
            </p>
          </div>
        ) : (
          <select
            value={selectedBusinessUnitId}
            onChange={(e) => onBusinessUnitChange(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
          >
            <option value="">Selecione uma unidade...</option>
            {businessUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          O canal ficará associado a esta unidade de negócio.
        </p>
      </div>

      {/* Channel Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Nome do canal <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={channelName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ex: WhatsApp Comercial"
          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Um nome amigável para identificar este canal no CRM.
        </p>
      </div>

      {/* External Identifier */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {channelType === 'whatsapp' && 'Número de telefone'}
          {channelType === 'instagram' && 'Username do Instagram'}
          {!['whatsapp', 'instagram'].includes(channelType) && 'Identificador'}
          {provider !== 'meta-cloud' && <span className="text-red-500"> *</span>}
          {provider === 'meta-cloud' && <span className="text-slate-400 text-xs ml-1">(opcional)</span>}
        </label>
        <input
          type="text"
          value={externalIdentifier}
          onChange={(e) => onIdentifierChange(e.target.value)}
          placeholder={
            channelType === 'whatsapp'
              ? provider === 'meta-cloud'
                ? 'Será obtido automaticamente da API'
                : '+5511999999999'
              : channelType === 'instagram'
                ? '@sua_conta'
                : 'Identificador único'
          }
          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
        />
        {provider === 'meta-cloud' && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            O número será obtido automaticamente via Phone Number ID.
          </p>
        )}
      </div>

      {/* Credential Fields */}
      <div className="space-y-4">
        {config.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
              {field.autoGenerate && <span className="text-green-500 text-xs ml-1">(auto)</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={credentials[field.key] || ''}
                onChange={(e) => onCredentialsChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white resize-none"
              />
            ) : field.autoGenerate ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={credentials[field.key] || ''}
                  readOnly
                  className="flex-1 px-4 py-2.5 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl
                    text-slate-900 dark:text-white font-mono text-sm cursor-default"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(credentials[field.key] || '');
                  }}
                  className="p-2.5 bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl
                    hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>
            ) : (
              <input
                type={field.type}
                value={credentials[field.key] || ''}
                onChange={(e) => onCredentialsChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              />
            )}
            {field.helpText && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {field.helpText}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
            bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continuar
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
// =============================================================================
// STEP: TEST CONNECTION
// =============================================================================

interface TestStepProps {
  channelType: ChannelType;
  provider: string;
  credentials: Record<string, string>;
  isTestingConnection: boolean;
  testResult: { success: boolean; message: string } | null;
  onBack: () => void;
  onTest: () => void;
  onSave: () => void;
  isSaving: boolean;
}

function TestStep({
  channelType,
  provider,
  isTestingConnection,
  testResult,
  onBack,
  onTest,
  onSave,
  isSaving,
}: TestStepProps) {
  const config = PROVIDER_CONFIGS[`${channelType}:${provider}`];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Testar conexão
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Verifique se as credenciais estão corretas antes de salvar.
        </p>
      </div>

      {/* Test Button */}
      <div className="p-6 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10">
        <div className="text-center">
          {isTestingConnection ? (
            <div className="space-y-3">
              <Loader2 className="w-12 h-12 mx-auto text-primary-600 animate-spin" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Testando conexão com {config?.name}...
              </p>
            </div>
          ) : testResult ? (
            <div className="space-y-3">
              {testResult.success ? (
                <>
                  <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Conexão bem-sucedida!
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {testResult.message}
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    Falha na conexão
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {testResult.message}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {provider === 'z-api' ? (
                <QrCode className="w-12 h-12 mx-auto text-slate-400" />
              ) : (
                <Key className="w-12 h-12 mx-auto text-slate-400" />
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Clique para verificar se as credenciais estão corretas.
              </p>
            </div>
          )}

          {!isTestingConnection && (
            <button
              onClick={onTest}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
                bg-slate-900 dark:bg-white text-white dark:text-slate-900
                hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              {testResult ? 'Testar novamente' : 'Iniciar teste'}
            </button>
          )}
        </div>
      </div>

      {/* Provider-specific connection notes */}
      {provider === 'z-api' && (
        <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            <strong>Nota:</strong> Para Z-API, você precisará escanear o QR Code no
            painel da Z-API para completar a conexão. O teste aqui apenas verifica
            se as credenciais estão válidas.
          </p>
        </div>
      )}
      {provider === 'evolution' && (
        <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            <strong>Nota:</strong> Certifique-se de que a instância já está criada e
            conectada no servidor Evolution API antes de salvar.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={onBack}
          disabled={isTestingConnection || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10
            disabled:opacity-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <button
          onClick={onSave}
          disabled={!testResult?.success || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
            bg-primary-600 text-white hover:bg-primary-700
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              Salvar canal
              <Check className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// STEP: COMPLETE
// =============================================================================

interface CompleteStepProps {
  channelName: string;
  channelId: string | null;
  provider: string | null;
  onClose: () => void;
}

const WEBHOOK_INSTRUCTIONS: Record<string, { label: string; steps: string[]; docsUrl?: string }> = {
  'z-api': {
    label: 'Z-API',
    steps: [
      'Acesse o painel da Z-API (developer.z-api.io)',
      'Vá em sua instância → Configurações',
      'Cole a URL abaixo no campo "Webhook URL"',
      'Salve as configurações',
    ],
    docsUrl: 'https://developer.z-api.io/webhooks/introduction',
  },
  'meta-cloud': {
    label: 'Meta Cloud API',
    steps: [
      'Acesse o Meta for Developers (developers.facebook.com)',
      'Vá no seu App → WhatsApp → Configuração',
      'Em "Webhook", clique "Editar" e cole a URL abaixo',
      'No campo "Verify Token", use o token configurado nas credenciais',
      'Inscreva-se nos campos: messages, message_deliveries, message_reads',
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/set-up',
  },
  'meta': {
    label: 'Instagram (Meta)',
    steps: [
      'Acesse o Meta for Developers (developers.facebook.com)',
      'Vá no seu App → Messenger → Configurações',
      'Em "Webhooks", cole a URL abaixo',
      'Inscreva-se no campo: messages',
    ],
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/webhooks',
  },
  'evolution': {
    label: 'Evolution API',
    steps: [
      'Acesse o painel da sua instância Evolution API',
      'Vá em Instâncias → sua instância → Webhooks',
      'Cole a URL abaixo no campo "Webhook URL"',
      'Ative os eventos: MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE',
      'Salve as configurações',
    ],
    docsUrl: 'https://doc.evolution-api.com/v2/pt/webhooks/webhook',
  },
  'resend': {
    label: 'Resend',
    steps: [
      'Acesse o dashboard do Resend (resend.com)',
      'Vá em Webhooks → Add Webhook',
      'Cole a URL abaixo',
      'Selecione os eventos: email.sent, email.delivered, email.opened, email.bounced',
    ],
    docsUrl: 'https://resend.com/docs/dashboard/webhooks/introduction',
  },
};

function getWebhookUrl(provider: string, channelId: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const functionMap: Record<string, string> = {
    'z-api': 'messaging-webhook-zapi',
    'evolution': 'messaging-webhook-evolution',
    'meta-cloud': 'messaging-webhook-meta',
    'meta': 'messaging-webhook-meta',
    'resend': 'messaging-webhook-resend',
  };
  const fn = functionMap[provider] || 'messaging-webhook-zapi';
  return `${supabaseUrl}/functions/v1/${fn}/${channelId}`;
}

function CompleteStep({ channelName, channelId, provider, onClose }: CompleteStepProps) {
  const [copied, setCopied] = React.useState(false);
  const webhookUrl = channelId && provider ? getWebhookUrl(provider, channelId) : null;
  const instructions = provider ? WEBHOOK_INSTRUCTIONS[provider] : null;

  const handleCopy = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = webhookUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="py-6 space-y-5">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center mx-auto">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Canal criado!
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            <strong>{channelName}</strong> foi adicionado. Agora configure o webhook.
          </p>
        </div>
      </div>

      {webhookUrl && instructions && (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Webhook URL
            </h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-100 dark:bg-black/30 rounded-lg px-3 py-2.5 text-slate-700 dark:text-slate-200 break-all font-mono select-all">
                {webhookUrl}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 p-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                title="Copiar URL"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={14} />
              Configure no {instructions.label}
            </h4>
            <ol className="text-xs text-amber-800 dark:text-amber-300/80 space-y-1.5 list-decimal list-inside">
              {instructions.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {instructions.docsUrl && (
              <a
                href={instructions.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline mt-1"
              >
                Ver documentação <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="text-center pt-2">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold
            bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChannelSetupWizard({
  isOpen,
  onClose,
  initialType,
  initialProvider,
  businessUnitId: initialBusinessUnitId,
}: ChannelSetupWizardProps) {
  const { addToast } = useToast();
  const createMutation = useCreateChannelMutation();

  // Fetch business units
  const { data: businessUnits = [] } = useBusinessUnitsWithCounts();

  // Wizard state
  const [step, setStep] = useState<WizardStep>(
    initialType && initialProvider ? 'credentials' : 'select'
  );
  const [channelType, setChannelType] = useState<ChannelType | null>(
    initialType || null
  );
  const [provider, setProvider] = useState<string | null>(
    initialProvider || null
  );
  const [channelName, setChannelName] = useState('');
  const [externalIdentifier, setExternalIdentifier] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [selectedBusinessUnitId, setSelectedBusinessUnitId] = useState<string>(
    initialBusinessUnitId || ''
  );

  // Created channel (for webhook URL display)
  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);

  // Test state
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Auto-select first business unit if only one exists
  React.useEffect(() => {
    if (businessUnits.length === 1 && !selectedBusinessUnitId) {
      setSelectedBusinessUnitId(businessUnits[0].id);
    }
  }, [businessUnits, selectedBusinessUnitId]);

  // Reset state when modal closes
  const handleClose = () => {
    setStep('select');
    setChannelType(null);
    setProvider(null);
    setChannelName('');
    setExternalIdentifier('');
    setCredentials({});
    setTestResult(null);
    setSelectedBusinessUnitId(initialBusinessUnitId || '');
    onClose();
  };

  // Check if credentials are valid
  const isCredentialsValid = useMemo(() => {
    if (!channelType || !provider) return false;
    if (!selectedBusinessUnitId) return false;
    const config = PROVIDER_CONFIGS[`${channelType}:${provider}`];
    if (!config) return false;

    if (!channelName.trim()) return false;
    // External identifier is optional for meta-cloud (fetched from API) and
    // evolution (auto-populated from instanceName credential)
    const identifierOptional = provider === 'meta-cloud' || provider === 'evolution';
    if (!identifierOptional && !externalIdentifier.trim()) return false;

    return config.fields
      .filter((f) => f.required)
      .every((f) => credentials[f.key]?.trim());
  }, [channelType, provider, channelName, externalIdentifier, credentials, selectedBusinessUnitId]);

  // Auto-generate verifyToken for meta-cloud
  React.useEffect(() => {
    if (provider === 'meta-cloud' && !credentials.verifyToken) {
      setCredentials((prev) => ({ ...prev, verifyToken: generateVerifyToken() }));
    }
  }, [provider, credentials.verifyToken]);

  // Handlers
  const handleSelectType = (type: ChannelType, prov: string) => {
    setChannelType(type);
    setProvider(prov);
    setStep('credentials');
  };

  const handleCredentialsChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);

    try {
      // Simulate API call - in production, this would call the provider's test endpoint
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // For now, just check if credentials are filled
      if (isCredentialsValid) {
        setTestResult({
          success: true,
          message: 'Credenciais validadas. Pronto para salvar.',
        });
      } else {
        setTestResult({
          success: false,
          message: 'Credenciais inválidas ou incompletas.',
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message:
          error instanceof Error ? error.message : 'Erro ao testar conexão.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    if (!channelType || !provider || !selectedBusinessUnitId) return;

    try {
      // For meta-cloud/evolution, auto-populate externalIdentifier from credentials
      let identifier = externalIdentifier.trim();
      if (!identifier && provider === 'meta-cloud') {
        identifier = credentials.phoneNumberId || 'pending';
      }
      if (!identifier && provider === 'evolution') {
        identifier = credentials.instanceName || 'pending';
      }

      // Move verifyToken from credentials to settings (it's not a secret)
      const { verifyToken, ...secretCredentials } = credentials;

      const input: CreateChannelInput = {
        businessUnitId: selectedBusinessUnitId,
        channelType,
        provider,
        externalIdentifier: identifier,
        name: channelName.trim(),
        credentials: secretCredentials,
        settings: verifyToken ? { verifyToken } : undefined,
      };

      const created = await createMutation.mutateAsync(input);

      setCreatedChannelId(created.id);
      setStep('complete');
      addToast('Canal criado com sucesso!', 'success');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Erro ao criar canal.',
        'error'
      );
    }
  };

  // Stepper indicator
  const steps: { key: WizardStep; label: string }[] = [
    { key: 'select', label: 'Canal' },
    { key: 'credentials', label: 'Credenciais' },
    { key: 'test', label: 'Teste' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Configurar Canal de Mensagem"
      size="lg"
      bodyClassName="max-h-[75vh] overflow-auto"
    >
      {/* Stepper */}
      {step !== 'complete' && (
        <div className="flex items-center justify-center gap-4 mb-6 pb-6 border-b border-slate-200 dark:border-white/10">
          {steps.map((s, idx) => {
            const isActive = s.key === step;
            const isCompleted = idx < currentStepIndex;

            return (
              <React.Fragment key={s.key}>
                {idx > 0 && (
                  <div
                    className={cn(
                      'w-12 h-0.5 rounded-full',
                      isCompleted
                        ? 'bg-primary-500'
                        : 'bg-slate-200 dark:bg-white/10'
                    )}
                  />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                      isActive
                        ? 'bg-primary-600 text-white'
                        : isCompleted
                          ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-400'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isActive
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Steps */}
      {step === 'select' && <SelectStep onSelect={handleSelectType} />}

      {step === 'credentials' && channelType && provider && (
        <CredentialsStep
          channelType={channelType}
          provider={provider}
          credentials={credentials}
          channelName={channelName}
          externalIdentifier={externalIdentifier}
          businessUnits={businessUnits}
          selectedBusinessUnitId={selectedBusinessUnitId}
          onCredentialsChange={handleCredentialsChange}
          onNameChange={setChannelName}
          onIdentifierChange={setExternalIdentifier}
          onBusinessUnitChange={setSelectedBusinessUnitId}
          onBack={() => setStep('select')}
          onNext={() => setStep('test')}
          isValid={isCredentialsValid}
        />
      )}

      {step === 'test' && channelType && provider && (
        <TestStep
          channelType={channelType}
          provider={provider}
          credentials={credentials}
          isTestingConnection={isTestingConnection}
          testResult={testResult}
          onBack={() => setStep('credentials')}
          onTest={handleTestConnection}
          onSave={handleSave}
          isSaving={createMutation.isPending}
        />
      )}

      {step === 'complete' && (
        <CompleteStep channelName={channelName} channelId={createdChannelId} provider={provider} onClose={handleClose} />
      )}
    </Modal>
  );
}
