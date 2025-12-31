'use client'

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { CallOptions } from '@/types/ai';

interface AIContextType {
    activeContext: CallOptions | null;
    setContext: (context: CallOptions) => void;
    clearContext: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

/**
 * Componente React `AIProvider`.
 *
 * @param {{ children: ReactNode; }} { children } - Parâmetro `{ children }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, profile } = useAuth();
    const [activeContext, setActiveContextState] = useState<CallOptions | null>(null);
    const pathname = usePathname();
    const lastSignatureRef = useRef<string | null>(null);

    // Helper to merge generic user context with specific passed context
    const setContext = useCallback((context: CallOptions) => {
        // Automatically inject user identity if not present
        const enhancedContext: CallOptions = {
            ...context,
            user: context.user || {
                id: user?.id || 'anon',
                name: profile?.nickname || profile?.first_name || user?.email || 'Usuário',
                role: profile?.role || 'user',
            }
        };
        // Guard against infinite loops: many callers rebuild objects every render.
        // We only set state if the "meaningful" context signature actually changed.
        const sig = [
            // Include identity so login/logout/profile changes refresh the context.
            enhancedContext.user?.id || 'anon',
            enhancedContext.view?.type || 'none',
            enhancedContext.view?.url || '',
            enhancedContext.activeObject?.type || 'none',
            enhancedContext.activeObject?.id || '',
            // Filters (keep primitives only)
            (enhancedContext as any)?.filters?.status || '',
            (enhancedContext as any)?.filters?.owner || '',
            (enhancedContext as any)?.filters?.search || '',
            (enhancedContext as any)?.filters?.dateRange?.start || '',
            (enhancedContext as any)?.filters?.dateRange?.end || '',
            // A few board metrics (avoid logging names / PII)
            String((enhancedContext.activeObject as any)?.metadata?.dealCount ?? ''),
            String((enhancedContext.activeObject as any)?.metadata?.pipelineValue ?? ''),
            String((enhancedContext.activeObject as any)?.metadata?.stagnantDeals ?? ''),
            String((enhancedContext.activeObject as any)?.metadata?.overdueDeals ?? ''),
        ].join('|');

        if (lastSignatureRef.current === sig) return;

        lastSignatureRef.current = sig;

        setActiveContextState(enhancedContext);
    }, [user, profile]);

    const clearContext = useCallback(() => {
        setActiveContextState(null);
    }, []);

    // 1. Set default global context if nothing is active
    useEffect(() => {
        if (!activeContext && user) {
            setActiveContextState({
                user: {
                    id: user.id,
                    name: profile?.nickname || profile?.first_name || user.email || 'Usuário',
                    role: profile?.role || 'user',
                },
                view: { type: 'global', url: pathname || '/' },
            });
        }
    }, [activeContext, user, profile, pathname]);

    // 2. Keep Global Context URL syncronized on navigation
    useEffect(() => {
        if (activeContext?.view?.type === 'global') {
            const currentUrl = pathname || '/';
            if (activeContext.view.url !== currentUrl) {
                setActiveContextState(prev => ({
                    ...prev!,
                    view: { ...prev!.view, url: currentUrl, type: 'global' }
                }));
            }
        }
    }, [pathname, activeContext]);

    return (
        <AIContext.Provider value={{ activeContext, setContext, clearContext }}>
            {children}
        </AIContext.Provider>
    );
};

/**
 * Hook React `useAI` que encapsula uma lógica reutilizável.
 * @returns {AIContextType} Retorna um valor do tipo `AIContextType`.
 */
export const useAI = () => {
    const context = useContext(AIContext);
    if (context === undefined) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
};
