import type { Metadata } from 'next';
import SettingsPage from '@/features/settings/SettingsPage'

export const metadata: Metadata = { title: 'Configurações | NossoCRM' };

export default function Settings() {
    return <SettingsPage />
}
