import type { Metadata } from 'next';
import SettingsPage from '@/features/settings/SettingsPage'

export const metadata: Metadata = { title: 'Integrações | NossoCRM' };

export default function SettingsIntegracoes() {
  return <SettingsPage tab="integrations" />
}
