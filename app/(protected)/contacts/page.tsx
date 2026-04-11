import type { Metadata } from 'next';
import { ContactsPage } from '@/features/contacts/ContactsPage'

export const metadata: Metadata = { title: 'Contatos | NossoCRM' };

export default function Contacts() {
    return <ContactsPage />
}
