/**
 * AgencyProfileSection - Componente para gerenciar o perfil da agência
 *
 * Permite editar informações da agência como nome, descrição, contatos,
 * branding (logo, cor primária) e metas (receita mensal, clientes)
 */
import React, { useEffect, useState } from 'react';
import { Building2, Mail, Phone, Instagram, Globe, Palette, Target, Save, RotateCcw } from 'lucide-react';
import { useAgencyProfile, useUpsertAgencyProfile } from '@/lib/query/hooks';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import type { AgencyProfile } from '@/types';

/**
 * Formata número para formato brasileiro de moeda
 */
function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

export const AgencyProfileSection: React.FC = () => {
  const { toast } = useToast();
  const { data: profile, isLoading } = useAgencyProfile();
  const upsertMutation = useUpsertAgencyProfile();

  // Form state
  const [name, setName] = useState('Ads Rocket');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366F1');
  const [monthlyGoal, setMonthlyGoal] = useState('0');
  const [clientGoal, setClientGoal] = useState('0');

  // Load profile data into form when available
  useEffect(() => {
    if (profile) {
      setName(profile.name || 'Ads Rocket');
      setDescription(profile.description || '');
      setPhone(profile.phone || '');
      setEmail(profile.email || '');
      setInstagram(profile.instagram || '');
      setWebsite(profile.website || '');
      setLogoUrl(profile.logoUrl || '');
      setPrimaryColor(profile.primaryColor || '#6366F1');
      setMonthlyGoal(String(profile.monthlyGoal || 0));
      setClientGoal(String(profile.clientGoal || 0));
    }
  }, [profile]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome da agência é obrigatório.',
        variant: 'error',
      });
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        instagram: instagram.trim() || undefined,
        website: website.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        primaryColor: primaryColor || '#6366F1',
        monthlyGoal: Number(monthlyGoal) || 0,
        clientGoal: Number(clientGoal) || 0,
      });

      toast({
        title: 'Sucesso!',
        description: 'Perfil da agência atualizado com sucesso.',
        variant: 'success',
      });

      // Dispatch event to notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm:agency-profile-updated'));
      }
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o perfil. Tente novamente.',
        variant: 'error',
      });
    }
  };

  const handleReset = () => {
    if (profile) {
      setName(profile.name || 'Ads Rocket');
      setDescription(profile.description || '');
      setPhone(profile.phone || '');
      setEmail(profile.email || '');
      setInstagram(profile.instagram || '');
      setWebsite(profile.website || '');
      setLogoUrl(profile.logoUrl || '');
      setPrimaryColor(profile.primaryColor || '#6366F1');
      setMonthlyGoal(String(profile.monthlyGoal || 0));
      setClientGoal(String(profile.clientGoal || 0));
    } else {
      setName('Ads Rocket');
      setDescription('');
      setPhone('');
      setEmail('');
      setInstagram('');
      setWebsite('');
      setLogoUrl('');
      setPrimaryColor('#6366F1');
      setMonthlyGoal('0');
      setClientGoal('0');
    }
    toast({
      title: 'Resetado',
      description: 'Formulário resetado para os valores salvos.',
      variant: 'default',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Perfil da Agência
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Configure as informações da sua agência e defina metas mensais
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={upsertMutation.isPending}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Resetar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={upsertMutation.isPending || !name.trim()}
          >
            <Save className="w-4 h-4 mr-2" />
            {upsertMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4 flex items-center">
              <Building2 className="w-4 h-4 mr-2" />
              Informações Básicas
            </h4>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Nome da Agência <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ads Rocket"
                  aria-label="Nome da Agência"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Descrição
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Agência especializada em tráfego pago..."
                  rows={3}
                  aria-label="Descrição"
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4 flex items-center">
              <Mail className="w-4 h-4 mr-2" />
              Informações de Contato
            </h4>

            <div className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  <Phone className="w-3 h-3 inline mr-1" />
                  Telefone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="(11) 99999-9999"
                  aria-label="Telefone"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  <Mail className="w-3 h-3 inline mr-1" />
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="contato@adsrocket.com"
                  aria-label="E-mail"
                />
              </div>

              {/* Instagram */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  <Instagram className="w-3 h-3 inline mr-1" />
                  Instagram
                </label>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="@adsrocket"
                  aria-label="Instagram"
                />
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  <Globe className="w-3 h-3 inline mr-1" />
                  Website
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="https://adsrocket.com"
                  aria-label="Website"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Branding & Goals */}
        <div className="space-y-4">
          {/* Branding */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4 flex items-center">
              <Palette className="w-4 h-4 mr-2" />
              Branding
            </h4>

            <div className="space-y-4">
              {/* Logo URL */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  URL do Logo
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="https://..."
                  aria-label="URL do Logo"
                />
                {logoUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center overflow-hidden">
                      <img
                        src={logoUrl}
                        alt="Logo Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500">Preview</span>
                  </div>
                )}
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Cor Primária
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-20 border border-neutral-300 dark:border-neutral-600 rounded cursor-pointer"
                    aria-label="Cor Primária"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
                    placeholder="#6366F1"
                    aria-label="Código Hex da Cor"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Goals */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4 flex items-center">
              <Target className="w-4 h-4 mr-2" />
              Metas Mensais
            </h4>

            <div className="space-y-4">
              {/* Monthly Goal */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Meta de Receita Mensal (R$)
                </label>
                <input
                  type="number"
                  value={monthlyGoal}
                  onChange={(e) => setMonthlyGoal(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="50000"
                  min="0"
                  step="1000"
                  aria-label="Meta de Receita Mensal"
                />
                {Number(monthlyGoal) > 0 && (
                  <p className="text-xs text-neutral-500 mt-1">
                    {formatBRL(Number(monthlyGoal))}
                  </p>
                )}
              </div>

              {/* Client Goal */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Meta de Clientes no Mês
                </label>
                <input
                  type="number"
                  value={clientGoal}
                  onChange={(e) => setClientGoal(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="10"
                  min="0"
                  step="1"
                  aria-label="Meta de Clientes"
                />
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          {profile && (
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 rounded-lg border border-primary/20 p-6">
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                Status Atual
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Meta Mensal:</span>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {formatBRL(profile.monthlyGoal || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Meta de Clientes:</span>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {profile.clientGoal || 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
