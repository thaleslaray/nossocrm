/**
 * @fileoverview Utilitário de Classes CSS
 * 
 * Função auxiliar para combinar classes Tailwind de forma inteligente,
 * mesclando classes conflitantes corretamente.
 * 
 * @module utils/cn
 * 
 * @example
 * ```tsx
 * import { cn } from '@/lib/utils/cn';
 * 
 * // Combina classes com merge inteligente
 * cn('px-4 py-2', 'px-6'); // => 'py-2 px-6' (px-4 removido)
 * 
 * // Suporta condicionais
 * cn('base-class', isActive && 'active-class');
 * 
 * // Suporta objetos
 * cn({ 'text-red-500': hasError, 'text-green-500': isSuccess });
 * ```
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina classes CSS com suporte a condicionais e merge de Tailwind
 * 
 * Usa clsx para processar condicionais e tailwind-merge para
 * resolver conflitos de classes Tailwind.
 * 
 * @param {...ClassValue[]} inputs - Classes, objetos ou expressões condicionais
 * @returns {string} String de classes combinadas
 * 
 * @example
 * ```tsx
 * // Uso básico
 * <div className={cn('p-4', className)} />
 * 
 * // Com variantes
 * <button className={cn(
 *   'px-4 py-2 rounded',
 *   variant === 'primary' && 'bg-blue-500 text-white',
 *   variant === 'secondary' && 'bg-gray-200 text-gray-900',
 *   disabled && 'opacity-50 cursor-not-allowed'
 * )} />
 * ```
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
