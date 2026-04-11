'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        // #region agent log
        if (process.env.NODE_ENV !== 'production') {
        }
        // #endregion

        // Monitor service worker updates
        registration.addEventListener('updatefound', () => {
          // #region agent log
          if (process.env.NODE_ENV !== 'production') {
          }
          // #endregion
        });

        // Check for existing service worker
        if (registration.active) {
          // #region agent log
          if (process.env.NODE_ENV !== 'production') {
          }
          // #endregion
        }
      } catch (err) {
        // #region agent log
        if (process.env.NODE_ENV !== 'production') {
          const errMsg = (err instanceof Error ? err.message : String(err || '')).slice(0, 120);
        }
        // #endregion
        // noop (PWA is best-effort)
      }
    };

    register();
  }, []);

  return null;
}

