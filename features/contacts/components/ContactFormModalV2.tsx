import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Contact } from '@/types';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { contactFormSchema } from '@/lib/validations/schemas';
import type { ContactFormData } from '@/lib/validations/schemas';

const selectClass =
  'w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200';
const labelClass = 'block text-xs font-bold text-slate-500 uppercase mb-1';
const errorMsgClass = 'text-xs text-red-500 mt-1';

type ContactFormInput = z.input<typeof contactFormSchema>;

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ContactFormData) => void;
  editingContact: Contact | null;
}

export const ContactFormModalV2: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingContact,
}) => {
  const travelDefaults = {
    destino_viagem: editingContact?.destino_viagem || '',
    data_viagem: editingContact?.data_viagem || '',
    quantidade_adultos: editingContact?.quantidade_adultos ?? 1,
    quantidade_criancas: editingContact?.quantidade_criancas ?? 0,
    idade_criancas: editingContact?.idade_criancas || '',
    categoria_viagem: editingContact?.categoria_viagem,
    urgencia_viagem: editingContact?.urgencia_viagem,
    origem_lead: editingContact?.origem_lead,
    indicado_por: editingContact?.indicado_por || '',
    observacoes_viagem: editingContact?.observacoes_viagem || '',
  };

  const form = useForm<ContactFormInput>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: editingContact?.name || '',
      email: editingContact?.email || '',
      phone: editingContact?.phone || '',
      ...travelDefaults,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = form;

  const qtdCriancas = watch('quantidade_criancas');
  const origemLead = watch('origem_lead');

  // Reset form when modal opens with different contact
  React.useEffect(() => {
    if (isOpen) {
      reset({
        name: editingContact?.name || '',
        email: editingContact?.email || '',
        phone: editingContact?.phone || '',
        destino_viagem: editingContact?.destino_viagem || '',
        data_viagem: editingContact?.data_viagem || '',
        quantidade_adultos: editingContact?.quantidade_adultos ?? 1,
        quantidade_criancas: editingContact?.quantidade_criancas ?? 0,
        idade_criancas: editingContact?.idade_criancas || '',
        categoria_viagem: editingContact?.categoria_viagem,
        urgencia_viagem: editingContact?.urgencia_viagem,
        origem_lead: editingContact?.origem_lead,
        indicado_por: editingContact?.indicado_por || '',
        observacoes_viagem: editingContact?.observacoes_viagem || '',
      });
    }
  }, [isOpen, editingContact, reset]);

  const handleFormSubmit = (data: ContactFormInput) => {
    const parsed = contactFormSchema.parse(data);
    onSubmit(parsed);
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingContact ? 'Editar Contato' : 'Novo Contato'}
    >
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField
          label="Nome Completo"
          placeholder="Ex: Ana Souza"
          error={errors.name}
          registration={register('name')}
        />

        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Telefone / WhatsApp"
            placeholder="+5511999999999"
            hint="Formato E.164 (ex.: +5511999999999)"
            error={errors.phone}
            registration={register('phone')}
          />
          <InputField
            label="Email"
            type="email"
            placeholder="ana@email.com"
            error={errors.email}
            registration={register('email')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Destino *"
            placeholder="Ex: Orlando, Paris"
            error={errors.destino_viagem}
            registration={register('destino_viagem')}
          />
          <InputField
            label="Data prevista"
            type="date"
            error={errors.data_viagem}
            registration={register('data_viagem')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Adultos *"
            type="number"
            error={errors.quantidade_adultos as any}
            registration={register('quantidade_adultos')}
          />
          <InputField
            label="Crianças"
            type="number"
            error={errors.quantidade_criancas as any}
            registration={register('quantidade_criancas')}
          />
        </div>

        {Number(qtdCriancas) > 0 && (
          <InputField
            label="Idades das Crianças *"
            placeholder="Ex: 5, 8"
            hint="Separe as idades por vírgula"
            error={errors.idade_criancas}
            registration={register('idade_criancas')}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Categoria *</label>
            <select className={selectClass} {...register('categoria_viagem')}>
              <option value="">Selecione...</option>
              <option value="economica">Econômica</option>
              <option value="intermediaria">Intermediária</option>
              <option value="premium">Premium</option>
            </select>
            {errors.categoria_viagem && <p className={errorMsgClass}>{errors.categoria_viagem.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Urgência *</label>
            <select className={selectClass} {...register('urgencia_viagem')}>
              <option value="">Selecione...</option>
              <option value="imediato">Imediato</option>
              <option value="curto_prazo">Curto prazo</option>
              <option value="medio_prazo">Médio prazo</option>
              <option value="planejando">Planejando</option>
            </select>
            {errors.urgencia_viagem && <p className={errorMsgClass}>{errors.urgencia_viagem.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelClass}>Origem do Lead *</label>
          <select className={selectClass} {...register('origem_lead')}>
            <option value="">Selecione...</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="google">Google</option>
            <option value="site">Site</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="indicacao">Indicação</option>
            <option value="outro">Outro</option>
          </select>
          {errors.origem_lead && <p className={errorMsgClass}>{errors.origem_lead.message}</p>}
        </div>

        {origemLead === 'indicacao' && (
          <InputField
            label="Indicado por"
            placeholder="Nome de quem indicou"
            error={errors.indicado_por}
            registration={register('indicado_por')}
          />
        )}

        <InputField
          label="Observações"
          placeholder="Preferências, restrições..."
          error={errors.observacoes_viagem}
          registration={register('observacoes_viagem')}
        />

        <SubmitButton isLoading={isSubmitting}>
          {editingContact ? 'Salvar Alterações' : 'Criar Contato'}
        </SubmitButton>
      </ModalForm>
    </Modal>
  );
};
