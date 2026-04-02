/**
 * Consent Management Service
 * T048: Allow users to revoke AI consent
 * 
 * LGPD Compliant - Art. 8º §5 (revogação de consentimento)
 */
import { supabase } from './client';

export interface UserConsent {
  id: string;
  user_id: string;
  version: string;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  ai_data_sharing: boolean;
  marketing_emails: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  revoked_at: string | null;
}

export const consentsService = {
  /**
   * Get current active consent for user
   */
  async getCurrentConsent(): Promise<{ data: UserConsent | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { data: null, error: new Error('Not authenticated') };
      }

      const { data, error } = await supabase
        .from('user_consents')
        .select('*')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return { data: null, error };
      }

      return { data: data as UserConsent | null, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Give consent with specific permissions
   */
  async giveConsent(consent: {
    version: string;
    termsAccepted: boolean;
    privacyAccepted: boolean;
    aiDataSharing: boolean;
    marketingEmails: boolean;
  }): Promise<{ data: UserConsent | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { data: null, error: new Error('Not authenticated') };
      }

      // First revoke any existing consent
      await supabase
        .from('user_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('revoked_at', null);

      // Create new consent record
      const { data, error } = await supabase
        .from('user_consents')
        .insert({
          user_id: user.id,
          version: consent.version,
          terms_accepted: consent.termsAccepted,
          privacy_accepted: consent.privacyAccepted,
          ai_data_sharing: consent.aiDataSharing,
          marketing_emails: consent.marketingEmails,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        })
        .select()
        .single();

      if (error) return { data: null, error };
      return { data: data as UserConsent, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Revoke all AI consent
   * LGPD Art. 8º §5 - Right to revoke consent
   */
  async revokeAIConsent(): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: new Error('Not authenticated') };
      }

      // Get current consent
      const { data: currentConsent } = await supabase
        .from('user_consents')
        .select('*')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .maybeSingle();

      if (!currentConsent) {
        return { error: new Error('No active consent found') };
      }

      // Revoke current consent
      await supabase
        .from('user_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', currentConsent.id);

      // Create new consent without AI data sharing
      const { error } = await supabase
        .from('user_consents')
        .insert({
          user_id: user.id,
          version: currentConsent.version,
          terms_accepted: currentConsent.terms_accepted,
          privacy_accepted: currentConsent.privacy_accepted,
          ai_data_sharing: false, // Revoked
          marketing_emails: currentConsent.marketing_emails,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        });

      if (error) return { error };

      // Log revocation to audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'REVOKE_AI_CONSENT',
        resource_type: 'consent',
        resource_id: user.id,
        severity: 'info',
      });

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Revoke all consent (full opt-out)
   */
  async revokeAllConsent(): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: new Error('Not authenticated') };
      }

      const { error } = await supabase
        .from('user_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('revoked_at', null);

      if (error) return { error };

      // Log full revocation to audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'REVOKE_ALL_CONSENT',
        resource_type: 'consent',
        resource_id: user.id,
        severity: 'warning',
      });

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Check if user has given specific consent
   */
  async hasConsent(type: 'terms' | 'privacy' | 'ai' | 'marketing'): Promise<boolean> {
    const { data: consent } = await this.getCurrentConsent();
    if (!consent) return false;

    switch (type) {
      case 'terms':
        return consent.terms_accepted;
      case 'privacy':
        return consent.privacy_accepted;
      case 'ai':
        return consent.ai_data_sharing;
      case 'marketing':
        return consent.marketing_emails;
      default:
        return false;
    }
  },

  /**
   * Get consent history for user
   */
  async getConsentHistory(): Promise<{ data: UserConsent[] | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { data: null, error: new Error('Not authenticated') };
      }

      const { data, error } = await supabase
        .from('user_consents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) return { data: null, error };
      return { data: data as UserConsent[], error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};

export default consentsService;
