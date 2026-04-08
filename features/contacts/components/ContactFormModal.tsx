import React, { useId, useState } from 'react';
import { X, Wallet, Star, Crown } from 'lucide-react';
import { Contact } from '@/types';
import { DebugFillButton } from '@/components/debug/DebugFillButton';
import { fakeContact } from '@/lib/debug';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  destino_viagem: string;
  data_viagem: string;
  quantidade_adultos: number;
  quantidade_criancas: number;
  idade_criancas: string;
  categoria_viagem: '' | 'economica' | 'intermediaria' | 'premium';
  urgencia_viagem: '' | 'imediato' | 'curto_prazo' | 'medio_prazo' | 'planejando';
  origem_lead: '' | 'instagram' | 'facebook' | 'google' | 'site' | 'whatsapp' | 'indicacao' | 'outro';
  indicado_por: string;
  observacoes_viagem: string;
}

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: ContactFormData;
  setFormData: (data: ContactFormData) => void;
  editingContact: Contact | null;
  createFakeContactsBatch?: (count: number) => Promise<void>;
  isSubmitting?: boolean;
}

const INPUT_CLASS =
  'w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500';
const LABEL_CLASS = 'block text-xs font-bold text-slate-500 uppercase mb-1';
const SECTION_TITLE_CLASS = 'text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pt-1';

const CATEGORIAS = [
  { value: 'economica',    label: 'Econômica',    desc: 'Melhor custo-benefício', Icon: Wallet },
  { value: 'intermediaria', label: 'Intermediária', desc: 'Conforto e qualidade',   Icon: Star   },
  { value: 'premium',      label: 'Premium / Luxo', desc: 'Experiência de luxo',    Icon: Crown  },
] as const;

const URGENCIAS = [
  { value: 'imediato', label: 'Imediato', desc: 'Até 30 dias' },
  { value: 'curto_prazo', label: 'Curto prazo', desc: '1–3 meses' },
  { value: 'medio_prazo', label: 'Médio prazo', desc: '3–6 meses' },
  { value: 'planejando', label: 'Planejando', desc: 'Sem pressa' },
] as const;

const ORIGENS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'site', label: 'Site' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'outro', label: 'Outro' },
] as const;

export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  formData,
  setFormData,
  editingContact,
  createFakeContactsBatch,
  isSubmitting = false,
}) => {
  const headingId = useId();
  useFocusReturn({ enabled: isOpen });
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);

  if (!isOpen) return null;

  const fillWithFakeData = () => {
    const fake = fakeContact();
    setFormData({
      name: fake.name,
      email: fake.email,
      phone: fake.phone,
      destino_viagem: fake.destino_viagem,
      data_viagem: fake.data_viagem,
      quantidade_adultos: fake.quantidade_adultos,
      quantidade_criancas: fake.quantidade_criancas,
      idade_criancas: fake.idade_criancas,
      categoria_viagem: fake.categoria_viagem,
      urgencia_viagem: fake.urgencia_viagem,
      origem_lead: fake.origem_lead,
      indicado_por: fake.indicado_por,
      observacoes_viagem: fake.observacoes_viagem,
    });
  };

  const update = (field: keyof ContactFormData, value: ContactFormData[keyof ContactFormData]) =>
    setFormData({ ...formData, [field]: value });

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      <div
        className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <h2 id={headingId} className="text-lg font-bold text-slate-900 dark:text-white font-display">
                {editingContact ? 'Editar Contato' : 'Novo Contato'}
              </h2>
              <DebugFillButton onClick={fillWithFakeData} />
              {createFakeContactsBatch && (
                <DebugFillButton
                  onClick={async () => {
                    setIsCreatingBatch(true);
                    try {
                      await createFakeContactsBatch(10);
                      onClose();
                    } finally {
                      setIsCreatingBatch(false);
                    }
                  }}
                  label={isCreatingBatch ? 'Criando...' : 'Fake x10'}
                  variant="secondary"
                  className="ml-1"
                  disabled={isCreatingBatch}
                />
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar modal"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white focus-visible-ring rounded"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="overflow-y-auto p-5 space-y-5">

            {/* SEÇÃO 1: Informações básicas */}
            <div>
              <p className={SECTION_TITLE_CLASS}>Informações básicas</p>
              <div className="space-y-3">
                <div>
                  <label className={LABEL_CLASS}>Nome Completo *</label>
                  <input
                    required
                    type="text"
                    className={INPUT_CLASS}
                    placeholder="Ex: Ana Souza"
                    value={formData.name}
                    onChange={e => update('name', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Telefone / WhatsApp</label>
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      placeholder="+5511999999999"
                      value={formData.phone}
                      onChange={e => update('phone', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Email</label>
                    <input
                      type="email"
                      className={INPUT_CLASS}
                      placeholder="ana@email.com"
                      value={formData.email}
                      onChange={e => update('email', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: Detalhes da viagem */}
            <div>
              <p className={SECTION_TITLE_CLASS}>Detalhes da viagem</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Destino *</label>
                    <input
                      required
                      type="text"
                      className={INPUT_CLASS}
                      placeholder="Ex: Orlando, Paris"
                      value={formData.destino_viagem}
                      onChange={e => update('destino_viagem', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Data prevista</label>
                    <input
                      type="date"
                      className={INPUT_CLASS}
                      value={formData.data_viagem}
                      onChange={e => update('data_viagem', e.target.value)}
                    />
                  </div>
                </div>

                {/* Urgência */}
                <div>
                  <label className={LABEL_CLASS}>Urgência *</label>
                  <select
                    required
                    className={INPUT_CLASS}
                    value={formData.urgencia_viagem}
                    onChange={e => update('urgencia_viagem', e.target.value as ContactFormData['urgencia_viagem'])}
                  >
                    <option value="">Selecione a urgência</option>
                    {URGENCIAS.map(u => (
                      <option key={u.value} value={u.value}>{u.label} — {u.desc}</option>
                    ))}
                  </select>
                </div>

                {/* Viajantes */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Adultos *</label>
                    <input
                      required
                      type="number"
                      min={1}
                      className={INPUT_CLASS}
                      value={formData.quantidade_adultos}
                      onChange={e => update('quantidade_adultos', Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Crianças</label>
                    <input
                      type="number"
                      min={0}
                      className={INPUT_CLASS}
                      value={formData.quantidade_criancas}
                      onChange={e => update('quantidade_criancas', Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                </div>

                {/* Idades das crianças — condicional */}
                {formData.quantidade_criancas > 0 && (
                  <div>
                    <label className={LABEL_CLASS}>Idades das crianças *</label>
                    <input
                      required
                      type="text"
                      className={INPUT_CLASS}
                      placeholder="Ex: 4 e 8 anos"
                      value={formData.idade_criancas}
                      onChange={e => update('idade_criancas', e.target.value)}
                    />
                  </div>
                )}

                {/* Categoria — cards clicáveis */}
                <div>
                  <label className={LABEL_CLASS}>Categoria *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIAS.map(cat => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => update('categoria_viagem', cat.value)}
                        className={[
                          'rounded-lg border px-3 py-2 text-xs font-semibold text-center transition-all',
                          formData.categoria_viagem === cat.value
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300',
                        ].join(' ')}
                      >
                        <span className="block">{cat.label}</span>
                        <span className="block text-[10px] font-normal opacity-60">{cat.desc}</span>
                      </button>
                    ))}
                  </div>
                  {/* hidden input para validação HTML5 */}
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.categoria_viagem}
                    className="sr-only"
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: Origem */}
            <div>
              <p className={SECTION_TITLE_CLASS}>Origem do lead</p>
              <div className="space-y-3">
                <div>
                  <label className={LABEL_CLASS}>Como nos encontrou? *</label>
                  <select
                    required
                    className={INPUT_CLASS}
                    value={formData.origem_lead}
                    onChange={e => update('origem_lead', e.target.value as ContactFormData['origem_lead'])}
                  >
                    <option value="">Selecione a origem</option>
                    {ORIGENS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Indicado por — condicional */}
                {formData.origem_lead === 'indicacao' && (
                  <div>
                    <label className={LABEL_CLASS}>Indicado por</label>
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      placeholder="Nome de quem indicou"
                      value={formData.indicado_por}
                      onChange={e => update('indicado_por', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* SEÇÃO 4: Observações */}
            <div>
              <p className={SECTION_TITLE_CLASS}>Observações</p>
              <div className="relative">
                <textarea
                  rows={3}
                  maxLength={1000}
                  className={`${INPUT_CLASS} resize-none`}
                  placeholder="Preferências, restrições, informações adicionais..."
                  value={formData.observacoes_viagem}
                  onChange={e => update('observacoes_viagem', e.target.value)}
                />
                <span className="absolute bottom-2 right-2 text-[10px] text-slate-400">
                  {formData.observacoes_viagem.length}/1000
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary-600 hover:bg-primary-500 text-white font-bold py-2.5 rounded-lg shadow-lg shadow-primary-600/20 transition-all"
            >
              {isSubmitting ? 'Salvando...' : editingContact ? 'Salvar Alterações' : 'Criar Contato'}
            </button>
          </form>
        </div>
      </div>
    </FocusTrap>
  );
};
