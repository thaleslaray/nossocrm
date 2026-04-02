import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams: SearchParams | undefined) {
  if (!searchParams) return '';

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, value);
    }
  }
  return qs.toString();
}

/**
 * Alias route: `/pipeline` (legacy) -> `/boards` (current).
 * Preserves search params like `status`, `view`, `deal`, etc.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const qs = toQueryString(params);
  redirect(qs ? `/boards?${qs}` : '/boards');
}

