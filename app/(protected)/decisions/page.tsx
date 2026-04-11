import type { Metadata } from 'next';
import { DecisionQueuePage } from '@/features/decisions/DecisionQueuePage'

export const metadata: Metadata = { title: 'Decisões | NossoCRM' };

export default function Decisions() {
    return <DecisionQueuePage />
}
