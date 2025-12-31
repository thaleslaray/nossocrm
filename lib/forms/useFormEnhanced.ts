/**
 * Enhanced useForm hook with real-time validation
 *
 * Features:
 * - Real-time validation (onChange/onBlur modes)
 * - Auto-save drafts
 * - Performance optimized
 * - Consistent error handling
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  useForm as useRHForm,
  UseFormProps,
  FieldValues,
  UseFormReturn,
  Path,
  DefaultValues,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ZodSchema } from 'zod';
import { useFormStore } from '@/lib/stores';

// ============ TYPES ============

interface UseFormOptions<TFormData extends FieldValues> extends Omit<
  UseFormProps<TFormData>,
  'resolver'
> {
  /**
   * Zod schema for validation
   */
  schema: ZodSchema<TFormData>;

  /**
   * Form ID for draft auto-save
   */
  formId?: string;

  /**
   * Enable auto-save drafts
   */
  autoSave?: boolean;

  /**
   * Auto-save debounce delay in ms
   */
  autoSaveDelay?: number;

  /**
   * Validation mode
   * - 'onSubmit': Validate only on submit (default)
   * - 'onBlur': Validate on blur
   * - 'onChange': Validate on change (real-time)
   * - 'onTouched': Validate on first blur, then on change
   * - 'all': Validate on blur and change
   */
  validationMode?: 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all';

  /**
   * Show success state for valid fields
   */
  showSuccessState?: boolean;

  /**
   * Callback when form becomes valid
   */
  onValid?: () => void;

  /**
   * Callback when form becomes invalid
   */
  onInvalid?: (errors: Record<string, unknown>) => void;
}

interface UseFormEnhancedReturn<TFormData extends FieldValues> extends UseFormReturn<TFormData> {
  /**
   * Check if a specific field is valid
   */
  isFieldValid: (name: Path<TFormData>) => boolean;

  /**
   * Check if form has been modified
   */
  isDirty: boolean;

  /**
   * Clear saved draft
   */
  clearDraft: () => void;

  /**
   * Restore from saved draft
   */
  restoreDraft: () => boolean;

  /**
   * Form performance metrics
   */
  metrics: {
    validationCount: number;
    lastValidationTime: number;
    averageValidationTime: number;
  };
}

// ============ HOOK ============

/**
 * Hook React `useFormEnhanced` que encapsula uma lógica reutilizável.
 *
 * @param {UseFormOptions<TFormData>} {
  schema,
  formId,
  autoSave = false,
  autoSaveDelay = 1000,
  validationMode = 'onTouched',
  showSuccessState = false,
  onValid,
  onInvalid,
  defaultValues,
  ...options
} - Parâmetro `{
  schema,
  formId,
  autoSave = false,
  autoSaveDelay = 1000,
  validationMode = 'onTouched',
  showSuccessState = false,
  onValid,
  onInvalid,
  defaultValues,
  ...options
}`.
 * @returns {UseFormEnhancedReturn<TFormData>} Retorna um valor do tipo `UseFormEnhancedReturn<TFormData>`.
 */
export function useFormEnhanced<TFormData extends FieldValues>({
  schema,
  formId,
  autoSave = false,
  autoSaveDelay = 1000,
  validationMode = 'onTouched',
  showSuccessState = false,
  onValid,
  onInvalid,
  defaultValues,
  ...options
}: UseFormOptions<TFormData>): UseFormEnhancedReturn<TFormData> {
  // Store hooks
  const { saveDraft, getDraft, clearDraft: clearStoreDraft } = useFormStore();

  // Performance tracking
  const metricsRef = useRef({
    validationCount: 0,
    totalValidationTime: 0,
    lastValidationTime: 0,
  });

  // Map validation mode to RHF mode
  const mode =
    validationMode === 'onTouched'
      ? 'onTouched'
      : validationMode === 'all'
        ? 'all'
        : validationMode;

  // Initialize form
  const form = useRHForm<TFormData>({
    // @ts-expect-error - zodResolver type variance issue with TFormData generic, safe at runtime
    resolver: zodResolver(schema),
    mode,
    defaultValues: defaultValues as DefaultValues<TFormData>,
    ...options,
  });

  const { watch, formState, reset, getValues, trigger } = form;
  const { errors, isValid, isDirty, touchedFields, dirtyFields } = formState;

  // Auto-save draft
  useEffect(() => {
    if (!autoSave || !formId || !isDirty) return;

    const timer = setTimeout(() => {
      const values = getValues();
      saveDraft(formId, values as Record<string, unknown>);
    }, autoSaveDelay);

    return () => clearTimeout(timer);
  }, [autoSave, formId, isDirty, autoSaveDelay, getValues, saveDraft, watch()]);

  // Track validation performance
  useEffect(() => {
    const start = performance.now();

    return () => {
      const duration = performance.now() - start;
      metricsRef.current.validationCount++;
      metricsRef.current.totalValidationTime += duration;
      metricsRef.current.lastValidationTime = duration;
    };
  }, [errors]);

  // Callbacks for valid/invalid state
  useEffect(() => {
    if (isValid && Object.keys(touchedFields).length > 0) {
      onValid?.();
    } else if (!isValid && Object.keys(errors).length > 0) {
      onInvalid?.(errors);
    }
  }, [isValid, errors, touchedFields, onValid, onInvalid]);

  // Check if specific field is valid
  const isFieldValid = useCallback(
    (name: Path<TFormData>): boolean => {
      const fieldTouched = touchedFields[name as keyof typeof touchedFields];
      const fieldDirty = dirtyFields[name as keyof typeof dirtyFields];
      const fieldError = errors[name as keyof typeof errors];

      return !!(fieldTouched || fieldDirty) && !fieldError;
    },
    [touchedFields, dirtyFields, errors]
  );

  // Clear draft
  const clearDraft = useCallback(() => {
    if (formId) {
      clearStoreDraft(formId);
    }
  }, [formId, clearStoreDraft]);

  // Restore from draft
  const restoreDraft = useCallback((): boolean => {
    if (!formId) return false;

    const draft = getDraft(formId);
    if (draft) {
      reset(draft.data as TFormData);
      return true;
    }
    return false;
  }, [formId, getDraft, reset]);

  // Compute metrics
  const metrics = {
    validationCount: metricsRef.current.validationCount,
    lastValidationTime: metricsRef.current.lastValidationTime,
    averageValidationTime:
      metricsRef.current.validationCount > 0
        ? metricsRef.current.totalValidationTime / metricsRef.current.validationCount
        : 0,
  };

  return {
    ...form,
    isFieldValid,
    isDirty,
    clearDraft,
    restoreDraft,
    metrics,
  } as unknown as UseFormEnhancedReturn<TFormData>;
}

// ============ PERFORMANCE WRAPPER ============

/**
 * Measure form validation performance
 */
export function measureValidationPerformance<T>(
  schema: ZodSchema<T>,
  data: T
): { valid: boolean; duration: number; errors?: unknown } {
  const start = performance.now();
  const result = schema.safeParse(data);
  const duration = performance.now() - start;

  return {
    valid: result.success,
    duration,
    errors: result.success ? undefined : result.error.issues,
  };
}

// ============ REAL-TIME VALIDATION HOOK ============

/**
 * Hook for triggering real-time field validation
 */
export function useFieldValidation<TFormData extends FieldValues>(
  form: UseFormReturn<TFormData>,
  fieldName: Path<TFormData>,
  debounceMs = 300
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateField = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      form.trigger(fieldName);
    }, debounceMs);
  }, [form, fieldName, debounceMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return validateField;
}
