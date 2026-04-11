/**
 * Defaults por provider — fonte única de verdade.
 * Usados apenas como fallback quando o banco retorna null
 * (ex: org recém-criada antes do primeiro save).
 */
export const AI_DEFAULT_MODELS = {
  google: 'gemini-2.0-flash',
} as const;

export const AI_DEFAULT_PROVIDER = 'google' as const;
