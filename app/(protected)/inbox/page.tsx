import type { Metadata } from 'next';
import { InboxPage } from '@/features/inbox/InboxPage'

export const metadata: Metadata = { title: 'Inbox | NossoCRM' };

export default function Inbox() {
    return <InboxPage />
}
