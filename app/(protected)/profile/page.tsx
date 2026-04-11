import type { Metadata } from 'next';
import { ProfilePage } from '@/features/profile/ProfilePage'

export const metadata: Metadata = { title: 'Perfil | NossoCRM' };

export default function Profile() {
    return <ProfilePage />
}
