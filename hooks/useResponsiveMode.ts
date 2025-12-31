'use client';

import { useEffect, useMemo, useState } from 'react';
import { getResponsiveMode, type ResponsiveMode } from '@/lib/utils/responsive';

export interface ResponsiveInfo {
  mode: ResponsiveMode;
  width: number;
}

export function useResponsiveMode(): ResponsiveInfo {
  // Hydration safety: start with desktop (1024) on both server and client to avoid mismatch
  // Then update on mount to actual width
  const [width, setWidth] = useState<number>(1024);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Set actual width after mount to avoid hydration mismatch
    setIsHydrated(true);
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const mode = useMemo(() => getResponsiveMode(width), [width]);

  return { mode, width };
}
