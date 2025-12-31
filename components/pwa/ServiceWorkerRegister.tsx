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
          fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'sw-register',hypothesisId:'SW1',location:'components/pwa/ServiceWorkerRegister.tsx:register',message:'Service Worker registered',data:{scope:registration.scope,active:!!registration.active,installing:!!registration.installing,waiting:!!registration.waiting},timestamp:Date.now()})}).catch(()=>{});
        }
        // #endregion

        // Monitor service worker updates
        registration.addEventListener('updatefound', () => {
          // #region agent log
          if (process.env.NODE_ENV !== 'production') {
            fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'sw-update',hypothesisId:'SW2',location:'components/pwa/ServiceWorkerRegister.tsx:updatefound',message:'Service Worker update found',data:{scope:registration.scope},timestamp:Date.now()})}).catch(()=>{});
          }
          // #endregion
        });

        // Check for existing service worker
        if (registration.active) {
          // #region agent log
          if (process.env.NODE_ENV !== 'production') {
            fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'sw-active',hypothesisId:'SW3',location:'components/pwa/ServiceWorkerRegister.tsx:register',message:'Service Worker already active',data:{scope:registration.scope,state:registration.active.state},timestamp:Date.now()})}).catch(()=>{});
          }
          // #endregion
        }
      } catch (err) {
        // #region agent log
        if (process.env.NODE_ENV !== 'production') {
          const errMsg = (err instanceof Error ? err.message : String(err || '')).slice(0, 120);
          fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'sw-error',hypothesisId:'SW4',location:'components/pwa/ServiceWorkerRegister.tsx:register',message:'Service Worker registration error',data:{errMsg},timestamp:Date.now()})}).catch(()=>{});
        }
        // #endregion
        // noop (PWA is best-effort)
      }
    };

    register();
  }, []);

  return null;
}

