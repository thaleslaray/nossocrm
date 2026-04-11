'use client';

import React, { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { Building2, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBusinessUnits } from '@/lib/query/hooks/useBusinessUnitsQuery';
import type { BusinessUnit } from '@/lib/messaging/types';

interface BusinessUnitSelectorProps {
  selectedUnitId: string | null;
  onSelect: (unitId: string | null) => void;
  showAllOption?: boolean;
  allLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const BusinessUnitSelector = memo(function BusinessUnitSelector({
  selectedUnitId,
  onSelect,
  showAllOption = true,
  allLabel = 'Todas as unidades',
  placeholder = 'Selecionar unidade',
  className,
  disabled = false,
}: BusinessUnitSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: units = [], isLoading } = useBusinessUnits();

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId),
    [units, selectedUnitId]
  );

  const handleSelect = (unitId: string | null) => {
    onSelect(unitId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    },
    [isOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2',
          'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg',
          'text-sm text-slate-700 dark:text-slate-300',
          'hover:bg-slate-50 dark:hover:bg-white/10 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'ring-2 ring-primary-500'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="truncate">
            {isLoading
              ? 'Carregando...'
              : selectedUnit
                ? selectedUnit.name
                : showAllOption && selectedUnitId === null
                  ? allLabel
                  : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedUnitId && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
          <ChevronDown
            className={cn(
              'w-4 h-4 text-slate-400 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Options */}
          <div
            role="listbox"
            className={cn(
              'absolute z-20 w-full mt-1 py-1',
              'bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg',
              'max-h-60 overflow-y-auto'
            )}
          >
            {showAllOption && (
              <button
                type="button"
                role="option"
                aria-selected={selectedUnitId === null}
                onClick={() => handleSelect(null)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm',
                  'hover:bg-slate-50 dark:hover:bg-white/5 transition-colors',
                  selectedUnitId === null
                    ? 'text-primary-600 dark:text-primary-400 font-medium'
                    : 'text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>{allLabel}</span>
                </div>
                {selectedUnitId === null && (
                  <Check className="w-4 h-4" />
                )}
              </button>
            )}

            {units.length === 0 && !isLoading && (
              <div className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhuma unidade encontrada
              </div>
            )}

            {units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                role="option"
                aria-selected={selectedUnitId === unit.id}
                onClick={() => handleSelect(unit.id)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm',
                  'hover:bg-slate-50 dark:hover:bg-white/5 transition-colors',
                  selectedUnitId === unit.id
                    ? 'text-primary-600 dark:text-primary-400 font-medium'
                    : 'text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{unit.name}</span>
                  {unit.key && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      ({unit.key})
                    </span>
                  )}
                </div>
                {selectedUnitId === unit.id && (
                  <Check className="w-4 h-4 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default BusinessUnitSelector;
