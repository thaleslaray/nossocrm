/**
 * T016: ConsentModal Component
 * Modal para coleta de consentimentos LGPD
 */

import React, { useState } from 'react';
import { 
  ConsentType, 
  REQUIRED_CONSENTS, 
  OPTIONAL_CONSENTS,
  CONSENT_VERSIONS 
} from '@/lib/consent/consentService';

interface ConsentModalProps {
  isOpen: boolean;
  missingConsents: ConsentType[];
  onAccept: (consents: ConsentType[]) => Promise<void>;
  onClose?: () => void;
}

const CONSENT_LABELS: Record<ConsentType, { title: string; description: string }> = {
  terms: {
    title: 'Termos de Uso',
    description: 'Li e aceito os Termos de Uso do NossoCRM.',
  },
  privacy: {
    title: 'Política de Privacidade',
    description: 'Li e aceito a Política de Privacidade, que explica como seus dados são coletados e utilizados.',
  },
  data_processing: {
    title: 'Processamento de Dados',
    description: 'Autorizo o processamento dos meus dados pessoais para uso da plataforma, conforme a LGPD.',
  },
  marketing: {
    title: 'Comunicações de Marketing',
    description: 'Aceito receber comunicações promocionais e novidades por email.',
  },
  analytics: {
    title: 'Análise de Uso',
    description: 'Autorizo a coleta de dados de uso para melhoria da plataforma.',
  },
};

/**
 * Componente React `ConsentModal`.
 *
 * @param {ConsentModalProps} {
  isOpen,
  missingConsents,
  onAccept,
  onClose,
} - Parâmetro `{
  isOpen,
  missingConsents,
  onAccept,
  onClose,
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const ConsentModal: React.FC<ConsentModalProps> = ({
  isOpen,
  missingConsents,
  onAccept,
  onClose,
}) => {
  const [selectedConsents, setSelectedConsents] = useState<Set<ConsentType>>(
    new Set([...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS])
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const requiredMissing = missingConsents.filter(c => REQUIRED_CONSENTS.includes(c));
  const optionalMissing = missingConsents.filter(c => OPTIONAL_CONSENTS.includes(c));

  const toggleConsent = (type: ConsentType) => {
    // Can't toggle required consents
    if (REQUIRED_CONSENTS.includes(type)) return;

    setSelectedConsents(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleAccept = async () => {
    // Validate all required consents are selected
    const allRequiredSelected = REQUIRED_CONSENTS.every(c => selectedConsents.has(c));
    if (!allRequiredSelected) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAccept(Array.from(selectedConsents));
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = REQUIRED_CONSENTS.every(c => selectedConsents.has(c));

  return (
    <div
      className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // Close only when clicking the backdrop (outside the panel).
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Consentimentos Necessários
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Para continuar usando o NossoCRM, precisamos do seu consentimento.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {/* Required Consents */}
          {requiredMissing.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Obrigatórios
              </h3>
              <div className="space-y-3">
                {requiredMissing.map(type => (
                  <ConsentItem
                    key={type}
                    type={type}
                    checked={selectedConsents.has(type)}
                    required
                    onChange={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Optional Consents */}
          {optionalMissing.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Opcionais
              </h3>
              <div className="space-y-3">
                {optionalMissing.map(type => (
                  <ConsentItem
                    key={type}
                    type={type}
                    checked={selectedConsents.has(type)}
                    required={false}
                    onChange={() => toggleConsent(type)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Legal Links */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border">
            <div className="flex flex-wrap gap-4 text-sm">
              <a 
                href="/termos-de-uso" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Termos de Uso (v{CONSENT_VERSIONS.terms})
              </a>
              <a 
                href="/politica-de-privacidade" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Política de Privacidade (v{CONSENT_VERSIONS.privacy})
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          <div className="flex justify-end gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleAccept}
              disabled={!canSubmit || isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Salvando...' : 'Aceitar e Continuar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ConsentItemProps {
  type: ConsentType;
  checked: boolean;
  required: boolean;
  onChange: () => void;
}

const ConsentItem: React.FC<ConsentItemProps> = ({
  type,
  checked,
  required,
  onChange,
}) => {
  const label = CONSENT_LABELS[type];

  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={required}
          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-75"
        />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white text-sm">
            {label.title}
          </span>
          {required && (
            <span className="text-xs text-red-500 font-medium">
              Obrigatório
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
          {label.description}
        </p>
      </div>
    </label>
  );
};

export default ConsentModal;
