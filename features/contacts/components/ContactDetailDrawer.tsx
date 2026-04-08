import React from 'react';
import {
  X, Pencil, MapPin, Calendar, Users, Wallet, Star, Crown,
  Globe, MessageCircle, Phone, Mail, UserCheck, FileText, Zap, Share2,
} from 'lucide-react';
import { Contact } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

const PT_BR_LONG_DATE = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDataViagem(raw: string | undefined | null): string {
  if (!raw) return '—';
  try {
    return PT_BR_LONG_DATE.format(new Date(raw));
  } catch {
    return raw;
  }
}

function formatViajantes(adultos: number | undefined, criancas: number | undefined, idades: string | undefined): string {
  const a = adultos ?? 1;
  const c = criancas ?? 0;
  const base = `${a} ${a === 1 ? 'adulto' : 'adultos'}`;
  if (c === 0) return base;
  const suffix = idades?.trim() ? ` (idades: ${idades})` : '';
  return `${base} + ${c} ${c === 1 ? 'criança' : 'crianças'}${suffix}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

const SECTION_CLASS = 'space-y-3';
const LABEL_CLASS   = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider';
const VALUE_CLASS   = 'text-sm text-slate-800 dark:text-slate-100';

const Field: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div>
    <p className={LABEL_CLASS}>{label}</p>
    <div className={`flex items-center gap-1.5 mt-0.5 ${VALUE_CLASS}`}>
      {icon}
      <span>{value || '—'}</span>
    </div>
  </div>
);

const CATEGORIA_META: Record<string, { label: string; Icon: React.FC<{ size?: number; className?: string }> ; colorClass: string }> = {
  economica:    { label: 'Econômica',      Icon: Wallet, colorClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  intermediaria:{ label: 'Intermediária',  Icon: Star,   colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  premium:      { label: 'Premium / Luxo', Icon: Crown,  colorClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
};

const URGENCIA_META: Record<string, { label: string; colorClass: string }> = {
  imediato:    { label: 'Imediato (até 30 dias)',       colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  curto_prazo: { label: 'Curto prazo (1–3 meses)',      colorClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  medio_prazo: { label: 'Médio prazo (3–6 meses)',      colorClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  planejando:  { label: 'Planejando com antecedência',  colorClass: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400' },
};

const ORIGEM_META: Record<string, { label: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  instagram:  { label: 'Instagram',  Icon: Share2 },
  facebook:   { label: 'Facebook',   Icon: Share2 },
  google:     { label: 'Google',     Icon: Globe },
  site:       { label: 'Site',       Icon: Globe },
  whatsapp:   { label: 'WhatsApp',   Icon: MessageCircle },
  indicacao:  { label: 'Indicação',  Icon: UserCheck },
  outro:      { label: 'Outro',      Icon: Zap },
};

// ─── main component ──────────────────────────────────────────────────────────

interface ContactDetailDrawerProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (contact: Contact) => void;
}

export const ContactDetailDrawer: React.FC<ContactDetailDrawerProps> = ({
  contact,
  isOpen,
  onClose,
  onEdit,
}) => {
  if (!isOpen || !contact) return null;

  const categoria = contact.categoria_viagem ? CATEGORIA_META[contact.categoria_viagem] : null;
  const urgencia  = contact.urgencia_viagem  ? URGENCIA_META[contact.urgencia_viagem]   : null;
  const origem    = contact.origem_lead      ? ORIGEM_META[contact.origem_lead]          : null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${contact.name}`}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-dark-card border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 text-primary-700 dark:text-primary-200 flex items-center justify-center font-bold text-base shadow-sm">
              {(contact.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{contact.name}</h2>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                contact.status === 'ACTIVE'   ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' :
                contact.status === 'INACTIVE' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' :
                                                'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
              }`}>
                {contact.status === 'ACTIVE' ? 'ATIVO' : contact.status === 'INACTIVE' ? 'INATIVO' : 'PERDIDO'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(contact)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-lg transition-colors"
              aria-label={`Editar ${contact.name}`}
            >
              <Pencil size={13} aria-hidden="true" />
              Editar
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded transition-colors"
              aria-label="Fechar"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">

          {/* Seção 1 — Informações básicas */}
          <section className={SECTION_CLASS}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Informações básicas</p>
            <Field label="Telefone / WhatsApp" value={contact.phone} icon={<Phone size={12} className="text-slate-400 shrink-0" />} />
            <Field label="E-mail" value={contact.email} icon={<Mail size={12} className="text-slate-400 shrink-0" />} />
          </section>

          <hr className="border-slate-100 dark:border-white/5" />

          {/* Seção 2 — Detalhes da viagem */}
          <section className={SECTION_CLASS}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detalhes da viagem</p>

            <Field
              label="Destino"
              value={contact.destino_viagem}
              icon={<MapPin size={12} className="text-primary-500 shrink-0" />}
            />

            <Field
              label="Data prevista"
              value={formatDataViagem(contact.data_viagem)}
              icon={<Calendar size={12} className="text-slate-400 shrink-0" />}
            />

            <Field
              label="Viajantes"
              value={formatViajantes(contact.quantidade_adultos, contact.quantidade_criancas, contact.idade_criancas)}
              icon={<Users size={12} className="text-slate-400 shrink-0" />}
            />

            {/* Urgência */}
            {urgencia && (
              <div>
                <p className={LABEL_CLASS}>Urgência</p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[11px] font-semibold ${urgencia.colorClass}`}>
                  <Zap size={10} aria-hidden="true" />
                  {urgencia.label}
                </span>
              </div>
            )}

            {/* Categoria */}
            {categoria && (
              <div>
                <p className={LABEL_CLASS}>Categoria</p>
                <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${categoria.colorClass}`}>
                  <categoria.Icon size={12} aria-hidden="true" />
                  {categoria.label}
                </span>
              </div>
            )}
          </section>

          <hr className="border-slate-100 dark:border-white/5" />

          {/* Seção 3 — Origem e indicação */}
          <section className={SECTION_CLASS}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Origem e indicação</p>

            {origem && (
              <div>
                <p className={LABEL_CLASS}>Como nos encontrou</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <origem.Icon size={13} className="text-slate-400 shrink-0" />
                  <span className={VALUE_CLASS}>{origem.label}</span>
                </div>
              </div>
            )}

            {contact.indicado_por && (
              <Field
                label="Indicado por"
                value={contact.indicado_por}
                icon={<UserCheck size={12} className="text-slate-400 shrink-0" />}
              />
            )}

            {!origem && !contact.indicado_por && (
              <p className="text-xs text-slate-400 italic">Origem não informada</p>
            )}
          </section>

          {/* Seção 4 — Observações */}
          {contact.observacoes_viagem && (
            <>
              <hr className="border-slate-100 dark:border-white/5" />
              <section className={SECTION_CLASS}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Observações</p>
                <div className="flex gap-2">
                  <FileText size={13} className="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {contact.observacoes_viagem}
                  </p>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
