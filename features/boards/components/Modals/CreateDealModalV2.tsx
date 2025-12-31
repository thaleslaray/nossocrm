import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCRM } from '@/context/CRMContext';
import { Deal } from '@/types';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { dealFormSchema } from '@/lib/validations/schemas';
import type { DealFormData } from '@/lib/validations/schemas';

interface CreateDealModalV2Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Componente React `CreateDealModalV2`.
 *
 * @param {CreateDealModalV2Props} { isOpen, onClose } - Parâmetro `{ isOpen, onClose }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const CreateDealModalV2: React.FC<CreateDealModalV2Props> = ({ isOpen, onClose }) => {
  const { addDeal, activeBoard, activeBoardId } = useCRM();

  const form = useForm<DealFormData>({
    // @ts-expect-error - zodResolver type variance with optional value field, safe at runtime
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      title: '',
      companyName: '',
      value: 0,
      contactName: '',
      email: '',
      phone: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = form;

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const handleFormSubmit = (data: DealFormData) => {
    if (!activeBoard || !activeBoardId || activeBoard.stages.length === 0) {
      // Sem board ativo/estágios não dá para criar deal com status inicial.
      // Mantemos um fallback silencioso para evitar crash em build/runtime.
      console.warn('[CreateDealModalV2] activeBoard/activeBoardId ausentes ou sem estágios');
      return;
    }

    const companyId = 'c-' + crypto.randomUUID().substring(0, 8);
    const contactId = 'p-' + crypto.randomUUID().substring(0, 8);

    // Usa o primeiro estágio do board ativo
    const firstStage = activeBoard.stages[0];

    const deal: Deal = {
      id: crypto.randomUUID(),
      title: data.title,
      companyId: companyId,
      contactId: contactId,
      boardId: activeBoardId,
      value: data.value,
      items: [],
      status: firstStage.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      probability: 10,
      priority: 'medium',
      tags: ['Novo'],
      owner: { name: 'Eu', avatar: 'https://i.pravatar.cc/150?u=me' },
      customFields: {},
      isWon: false,
      isLost: false,
    };

    addDeal(deal, {
      companyName: data.companyName,
      contact: {
        name: data.contactName || '',
        email: data.email || '',
        phone: data.phone || '',
      },
    });

    onClose();
    reset();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo Negócio">
      {/* @ts-expect-error - handleSubmit type variance with DealFormData, safe at runtime */}
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField
          label="Nome do Negócio"
          placeholder="Ex: Contrato Anual - Acme"
          error={errors.title}
          registration={register('title')}
        />

        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Valor Estimado ($)"
            type="number"
            placeholder="0.00"
            error={errors.value}
            registration={register('value', { valueAsNumber: true })}
          />
          <InputField
            label="Empresa"
            placeholder="Empresa Ltd"
            error={errors.companyName}
            registration={register('companyName')}
          />
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-white/5">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Contato Principal</h3>
          <div className="space-y-3">
            <InputField
              label="Nome do Contato"
              placeholder="Nome do Contato"
              error={errors.contactName}
              registration={register('contactName')}
            />
            <InputField
              label="Email"
              type="email"
              placeholder="email@exemplo.com"
              error={errors.email}
              registration={register('email')}
            />
          </div>
        </div>

        <SubmitButton isLoading={isSubmitting}>Criar Negócio</SubmitButton>
      </ModalForm>
    </Modal>
  );
};
