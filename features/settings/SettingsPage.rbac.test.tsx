import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useSearchParams: () => ({
    get: () => null,
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('./hooks/useSettingsController', () => ({
  useSettingsController: () => ({
    defaultRoute: '/boards',
    setDefaultRoute: vi.fn(),

    customFieldDefinitions: [],
    newFieldLabel: '',
    setNewFieldLabel: vi.fn(),
    newFieldType: 'text',
    setNewFieldType: vi.fn(),
    newFieldOptions: '',
    setNewFieldOptions: vi.fn(),
    editingId: null,
    startEditingField: vi.fn(),
    cancelEditingField: vi.fn(),
    handleSaveField: vi.fn(),
    removeCustomField: vi.fn(),

    availableTags: ['VIP'],
    newTagName: '',
    setNewTagName: vi.fn(),
    handleAddTag: vi.fn(),
    removeTag: vi.fn(),
  }),
}))

// Evita depender de providers (Toast/Boards/Supabase) ao renderizar a aba Integrações no teste.
vi.mock('./components/ApiKeysSection', () => ({
  ApiKeysSection: () => (
    <div>
      <h3>API (Integrações)</h3>
    </div>
  ),
}))

vi.mock('./components/WebhooksSection', () => ({
  WebhooksSection: () => (
    <div>
      <h3>Webhooks</h3>
    </div>
  ),
}))

vi.mock('./components/McpSection', () => ({
  McpSection: () => (
    <div>
      <h3>MCP</h3>
    </div>
  ),
}))

vi.mock('./components/ChannelsSection', () => ({
  ChannelsSection: () => (
    <div>
      <h3>Canais de Comunicação</h3>
    </div>
  ),
}))

vi.mock('./components/BusinessUnitsSection', () => ({
  BusinessUnitsSection: () => (
    <div>
      <h3>Unidades de Negócio</h3>
    </div>
  ),
}))

vi.mock('./components/ai/AIAgentConfigSection', () => ({
  AIAgentConfigSection: () => (
    <div>
      <h3>Configuração IA</h3>
    </div>
  ),
}))

import SettingsPage from './SettingsPage'
import { useAuth } from '@/context/AuthContext'

const useAuthMock = vi.mocked(useAuth)

describe('SettingsPage RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('vendedor não vê seções de configuração do sistema', () => {
    useAuthMock.mockReturnValue({
      profile: { role: 'vendedor' },
    } as any)

    render(<SettingsPage />)

    expect(
      screen.queryByRole('heading', { name: /^Gerenciamento de Tags$/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /^Campos Personalizados$/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /^API \(Integrações\)$/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Webhooks$/i })).not.toBeInTheDocument()

    // Preferências pessoais seguem visíveis
    expect(screen.getByRole('heading', { name: /página inicial/i })).toBeInTheDocument()
    // Tabs pessoais seguem visíveis
    expect(screen.getByRole('button', { name: /central de i\.a/i })).toBeInTheDocument()
  })

  it('admin vê seções de configuração do sistema', async () => {
    useAuthMock.mockReturnValue({
      profile: { role: 'admin' },
    } as any)

    render(<SettingsPage />)

    expect(
      screen.getByRole('heading', { name: /^Gerenciamento de Tags$/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /^Campos Personalizados$/i })
    ).toBeInTheDocument()
    // Admin também vê as abas extras
    const integrationsTab = screen.getByRole('button', { name: /integrações/i })
    expect(integrationsTab).toBeInTheDocument()
    fireEvent.click(integrationsTab)

    // Sub-tabs dentro de Integrações
    const channelsSubTab = await screen.findByRole('button', { name: /Canais/i })
    const webhooksSubTab = await screen.findByRole('button', { name: /^Webhooks$/i })
    const apiSubTab = await screen.findByRole('button', { name: /^API$/i })
    const mcpSubTab = await screen.findByRole('button', { name: /^MCP$/i })
    expect(channelsSubTab).toBeInTheDocument()
    expect(webhooksSubTab).toBeInTheDocument()
    expect(apiSubTab).toBeInTheDocument()
    expect(mcpSubTab).toBeInTheDocument()

    // Default é Canais (Messaging)
    expect(await screen.findByRole('heading', { name: /^Canais de Comunicação$/i })).toBeInTheDocument()

    fireEvent.click(webhooksSubTab)
    expect(await screen.findByRole('heading', { name: /^Webhooks$/i })).toBeInTheDocument()

    fireEvent.click(apiSubTab)
    expect(await screen.findByRole('heading', { name: /^API \(Integrações\)$/i })).toBeInTheDocument()

    fireEvent.click(mcpSubTab)
    expect(await screen.findByRole('heading', { name: /^MCP$/i })).toBeInTheDocument()
  })
})
