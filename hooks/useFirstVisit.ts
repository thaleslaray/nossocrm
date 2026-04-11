/**
 * @fileoverview Hook de Primeira Visita / Onboarding
 * 
 * Hook que gerencia o estado de onboarding do usuário, detectando
 * se é a primeira visita e permitindo controlar a exibição do wizard.
 * 
 * @module hooks/useFirstVisit
 * 
 * @example
 * ```tsx
 * function App() {
 *   const { isFirstVisit, completeOnboarding } = useFirstVisit();
 *   
 *   if (isFirstVisit) {
 *     return <OnboardingWizard onComplete={completeOnboarding} />;
 *   }
 *   
 *   return <MainApp />;
 * }
 * ```
 */

import { useState, useEffect } from 'react';

/** Chave do localStorage para persistir status do onboarding */
const ONBOARDING_KEY = 'crm_onboarding_completed';

/**
 * Hook para gerenciar estado de primeira visita/onboarding
 * 
 * Verifica se o usuário já completou o onboarding e fornece
 * funções para marcar como completo ou resetar o estado.
 * 
 * @returns {Object} Estado e controles do onboarding
 * @returns {boolean} return.isFirstVisit - Se é a primeira visita do usuário
 * @returns {() => void} return.completeOnboarding - Marca onboarding como completo
 * @returns {() => void} return.resetOnboarding - Reseta para exibir onboarding novamente
 * 
 * @example
 * ```tsx
 * function SettingsPage() {
 *   const { resetOnboarding } = useFirstVisit();
 *   
 *   return (
 *     <button onClick={resetOnboarding}>
 *       Ver tutorial novamente
 *     </button>
 *   );
 * }
 * ```
 */
export const useFirstVisit = () => {
    const [isFirstVisit, setIsFirstVisit] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        const completed = localStorage.getItem(ONBOARDING_KEY);
        return completed !== 'true';
    });

    const completeOnboarding = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setIsFirstVisit(false);
    };

    const resetOnboarding = () => {
        localStorage.removeItem(ONBOARDING_KEY);
        setIsFirstVisit(true);
    };

    return {
        isFirstVisit,
        completeOnboarding,
        resetOnboarding
    };
};
