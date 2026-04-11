'use client';

import { usePathname } from 'next/navigation';

/**
 * Maps routes to the data they actually need.
 * Used by context providers to avoid loading data unnecessarily.
 *
 * When a route is not listed, no global data is loaded (just auth).
 */
const ROUTE_NEEDS: Record<string, readonly string[]> = {
  '/boards': ['deals', 'boards', 'contacts'],
  '/contacts': ['contacts', 'companies'],
  '/activities': ['activities', 'deals'],
  '/dashboard': ['deals', 'boards', 'activities', 'contacts'],
  '/inbox': ['deals', 'activities'],
  '/reports': ['deals', 'contacts', 'boards'],
  // Pages that DON'T need global CRM data:
  // /messaging, /settings, /profile, /setup, /labs
};

/**
 * Returns whether the current route needs a specific data type.
 *
 * @example
 * ```ts
 * const needs = useRouteNeeds();
 * const enabled = needs('deals'); // true on /boards, false on /messaging
 * ```
 */
export function useRouteNeeds() {
  const pathname = usePathname();

  // Match against the first path segment (e.g., /boards/123 → /boards)
  const baseRoute = '/' + (pathname.split('/')[1] || '');
  const needs = ROUTE_NEEDS[baseRoute] ?? [];

  return (dataType: string): boolean => needs.includes(dataType);
}
