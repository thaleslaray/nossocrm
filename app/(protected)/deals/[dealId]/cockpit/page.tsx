import type { Metadata } from 'next';
import DealCockpitFocusClient from '@/features/deals/cockpit/DealCockpitFocusClient';

/**
 * Cockpit (verdadeiro/original) - UI do Focus (Inbox) como rota canônica.
 * URL: /deals/[dealId]/cockpit
 */
export async function generateMetadata({ params }: { params: Promise<{ dealId: string }> }): Promise<Metadata> {
  const { dealId } = await params;
  return { title: `Deal ${dealId} | NossoCRM` };
}

export default async function DealCockpitPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  return <DealCockpitFocusClient dealId={dealId} />;
}
