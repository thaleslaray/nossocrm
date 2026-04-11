import { Suspense } from 'react';
import { Metadata } from 'next';
import { MessagingPage } from '@/features/messaging/MessagingPage';
import { MessageThreadSkeleton } from '@/features/messaging/components';

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export const metadata: Metadata = {
  title: 'Conversa | NossoCRM',
  description: 'Visualizar conversa',
};

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;

  return (
    <Suspense fallback={<MessageThreadSkeleton />}>
      <MessagingPage initialConversationId={conversationId} />
    </Suspense>
  );
}
