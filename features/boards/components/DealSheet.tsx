import React from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/utils/cn';

export interface DealSheetProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * DealSheet — wrapper to present deal flows as a mobile-first sheet.
 *
 * Desktop continues to use the existing modal implementation; this is used only on mobile.
 */
export function DealSheet({ isOpen, onClose, ariaLabel, children, className }: DealSheetProps) {
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={ariaLabel}
      className={cn(
        // Make the outer sheet container transparent so the deal UI can control its own surface.
        'h-[100dvh] rounded-none bg-transparent dark:bg-transparent border-0 shadow-none p-0 pb-0',
        className
      )}
    >
      {children}
    </Sheet>
  );
}

