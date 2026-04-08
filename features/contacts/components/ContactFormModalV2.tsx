import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Contact } from '@/types';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { contactFormSchema } from '@/lib/validations/schemas';
import type { ContactFormData } from '@/lib/validations/schemas';

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
  } = form;

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
            error={errors.quantidade_adultos as FieldError | undefined}
            registration={register('quantidade_adultos')}
          />
          <InputField
            label="Crianças"
            type="number"
            error={errors.quantidade_criancas as FieldError | undefined}
            registration={register('quantidade_criancas')}
          />
        </div>

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
