/**
 * @fileoverview UI State Store (Zustand)
 *
 * Estado de UI global que não pertence a nenhum domínio de negócio.
 * Anteriormente vivía no CRMContext — migrado para Zustand para evitar
 * re-renders desnecessários em consumidores de dados de negócio.
 */

import { create } from 'zustand';

interface UIState {
  isGlobalAIOpen: boolean;
  setIsGlobalAIOpen: (isOpen: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  activeBoardId: string;
  setActiveBoardId: (id: string) => void;
}

export const useUIState = create<UIState>((set) => ({
  isGlobalAIOpen: false,
  setIsGlobalAIOpen: (isOpen) => set({ isGlobalAIOpen: isOpen }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  activeBoardId: '',
  setActiveBoardId: (id) => set({ activeBoardId: id }),
}));
