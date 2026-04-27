import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Company } from '@/types';
import { Modal, ModalForm } from '@/components/ui/Modal';
import { InputField, SubmitButton } from '@/components/ui/FormField';
import { companyFormSchema } from '@/lib/validations/schemas';
import type { CompanyFormData } from '@/lib/validations/schemas';

type CompanyFormInput = z.input<typeof companyFormSchema>;

interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CompanyFormData) => void;
  editingCompany: Company | null;
}

export const CompanyFormModal: React.FC<CompanyFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingCompany,
}) => {
  const customFields = (editingCompany as any)?.custom_fields ?? {};

  const form = useForm<CompanyFormInput>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: editingCompany?.name || '',
      industry: editingCompany?.industry || '',
      website: editingCompany?.website || '',
      num_funcionarios: customFields.num_funcionarios ?? undefined,
      cnae: customFields.cnae || '',
      nrs_aplicaveis: customFields.nrs_aplicaveis || '',
      data_ultimo_aso: customFields.data_ultimo_aso || '',
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = form;

  React.useEffect(() => {
    if (isOpen) {
      const cf = (editingCompany as any)?.custom_fields ?? {};
      reset({
        name: editingCompany?.name || '',
        industry: editingCompany?.industry || '',
        website: editingCompany?.website || '',
        num_funcionarios: cf.num_funcionarios ?? undefined,
        cnae: cf.cnae || '',
        nrs_aplicaveis: cf.nrs_aplicaveis || '',
        data_ultimo_aso: cf.data_ultimo_aso || '',
      });
    }
  }, [isOpen, editingCompany, reset]);

  const handleFormSubmit = (data: CompanyFormInput) => {
    const parsed = companyFormSchema.parse(data);
    onSubmit(parsed);
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingCompany ? 'Editar Empresa' : 'Nova Empresa'}
    >
      <ModalForm onSubmit={handleSubmit(handleFormSubmit)}>
        <InputField
          label="Nome"
          placeholder="Ex: Construtora Silva LTDA"
          required
          error={errors.name}
          registration={register('name')}
        />

        <InputField
          label="Setor"
          placeholder="Ex: Construção Civil"
          error={errors.industry}
          registration={register('industry')}
        />

        <InputField
          label="Website"
          placeholder="empresa.com"
          hint="Sem http(s) (vamos normalizar automaticamente)."
          error={errors.website}
          registration={register('website')}
        />

        <InputField
          label="Nº de Funcionários"
          placeholder="Ex: 85"
          type="number"
          error={errors.num_funcionarios}
          registration={register('num_funcionarios')}
        />

        <InputField
          label="CNAE"
          placeholder="Ex: 4120-4/00 — Construção de edifícios"
          error={errors.cnae}
          registration={register('cnae')}
        />

        <InputField
          label="NRs Aplicáveis"
          placeholder="Ex: NR-7, NR-9, NR-15"
          hint="Separe por vírgula."
          error={errors.nrs_aplicaveis}
          registration={register('nrs_aplicaveis')}
        />

        <InputField
          label="Data do Último ASO"
          type="date"
          error={errors.data_ultimo_aso}
          registration={register('data_ultimo_aso')}
        />

        <SubmitButton isLoading={isSubmitting}>
          {editingCompany ? 'Salvar Alterações' : 'Criar Empresa'}
        </SubmitButton>
      </ModalForm>
    </Modal>
  );
};
