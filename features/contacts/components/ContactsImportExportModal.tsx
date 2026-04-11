import React, { useMemo, useState } from 'react';
import { Download, Upload, FileDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { stringifyCsv, withUtf8Bom, type CsvDelimiter } from '@/lib/utils/csv';

type Panel = 'export' | 'import';

export type ContactsExportParams = {
  search?: string;
  stage?: string | 'ALL';
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'RISK';
  dateStart?: string;
  dateEnd?: string;
  sortBy?: 'name' | 'created_at' | 'updated_at' | 'stage';
  sortOrder?: 'asc' | 'desc';
};

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);

  try {
    requestAnimationFrame(() => {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  } finally {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function parseFilenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const m = /filename="([^"]+)"/i.exec(disposition);
  return m?.[1] || null;
}

export function ContactsImportExportModal(props: {
  isOpen: boolean;
  onClose: () => void;
  exportParams: ContactsExportParams;
}) {
  const { isOpen, onClose, exportParams } = props;
  const { addToast, showToast } = useToast();
  const toast = addToast || showToast;

  const [panel, setPanel] = useState<Panel>('export');
  const [delimiter, setDelimiter] = useState<'auto' | CsvDelimiter>('auto');

  // Import state
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'upsert_by_email' | 'skip_duplicates_by_email' | 'create_only'>(
    'upsert_by_email'
  );
  const [createCompanies, setCreateCompanies] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  const templateCsv = useMemo(() => {
    const d: CsvDelimiter = delimiter === 'auto' ? ';' : delimiter;
    const header = ['name', 'email', 'phone', 'role', 'company', 'status', 'stage', 'notes'];
    const example = [
      'Maria Silva',
      'maria@empresa.com',
      '+55 11 99999-9999',
      'Compras',
      'Empresa Exemplo',
      'ACTIVE',
      'LEAD',
      'Conheci em evento',
    ];
    return withUtf8Bom(stringifyCsv([header, example], d));
  }, [delimiter]);

  const handleDownloadTemplate = () => {
    downloadText('template-contatos.csv', templateCsv, 'text/csv;charset=utf-8');
    toast?.('Template CSV baixado.', 'success');
  };

  const handleDownloadErrorReport = () => {
    const errs: Array<{ rowNumber: number; message: string }> = importResult?.errors || [];
    const d: CsvDelimiter = delimiter === 'auto' ? ';' : delimiter;
    const rows = [['rowNumber', 'message'], ...errs.map(e => [String(e.rowNumber), e.message])];
    downloadText('import-erros-contatos.csv', withUtf8Bom(stringifyCsv(rows, d)), 'text/csv;charset=utf-8');
  };

  const buildExportUrl = () => {
    const sp = new URLSearchParams();
    if (exportParams.search) sp.set('search', exportParams.search);
    if (exportParams.stage && exportParams.stage !== 'ALL') sp.set('stage', exportParams.stage);
    if (exportParams.status && exportParams.status !== 'ALL') sp.set('status', exportParams.status);
    if (exportParams.dateStart) sp.set('dateStart', exportParams.dateStart);
    if (exportParams.dateEnd) sp.set('dateEnd', exportParams.dateEnd);
    if (exportParams.sortBy) sp.set('sortBy', exportParams.sortBy);
    if (exportParams.sortOrder) sp.set('sortOrder', exportParams.sortOrder);
    if (delimiter !== 'auto') sp.set('delimiter', delimiter);
    return `/api/contacts/export?${sp.toString()}`;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const url = buildExportUrl();
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Falha ao exportar (HTTP ${res.status})`);
      }

      const disposition = res.headers.get('Content-Disposition');
      const filename = parseFilenameFromDisposition(disposition) || 'contatos.csv';
      const text = await res.text();
      downloadText(filename, text, 'text/csv;charset=utf-8');
      toast?.('Export iniciado.', 'success');
    } catch (e) {
      toast?.((e as Error)?.message || 'Erro ao exportar.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast?.('Selecione um arquivo CSV.', 'error');
      return;
    }
    setIsImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      fd.append('createCompanies', String(createCompanies));
      if (delimiter !== 'auto') fd.append('delimiter', delimiter);

      const res = await fetch('/api/contacts/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Falha ao importar (HTTP ${res.status})`);
      }
      setImportResult(data);
      const totals = data?.totals;
      toast?.(
        `Import concluído: ${totals?.created ?? 0} criados, ${totals?.updated ?? 0} atualizados, ${totals?.skipped ?? 0} ignorados, ${totals?.errors ?? 0} erros.`,
        (totals?.errors ?? 0) > 0 ? 'warning' : 'success'
      );
    } catch (e) {
      toast?.((e as Error)?.message || 'Erro ao importar.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar / Exportar contatos"
      size="lg"
      bodyClassName="space-y-5 max-h-[75vh] overflow-y-auto"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPanel('export')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              panel === 'export'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            Exportar
          </button>
          <button
            type="button"
            onClick={() => setPanel('import')}
            className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              panel === 'import'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
          >
            Importar CSV
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Delimitador
          </label>
          <select
            value={delimiter}
            onChange={e => setDelimiter(e.target.value as any)}
            className="text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1"
          >
            <option value="auto">Auto</option>
            <option value=",">, (vírgula)</option>
            <option value=";">; (ponto e vírgula)</option>
            <option value="\t">TAB</option>
          </select>
        </div>
      </div>

      {panel === 'export' && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/5 space-y-3">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              Exportar contatos (CSV)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Padrão de mercado: exportar a lista respeitando filtros/pesquisa/ordenação atuais.
            </div>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-300">
            <b>Campos exportados:</b> name, email, phone, role, company, status, stage, notes, created_at, updated_at.
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              isExporting
                ? 'bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
          >
            <FileDown size={16} /> {isExporting ? 'Gerando…' : 'Exportar CSV'}
          </button>
        </div>
      )}

      {panel === 'import' && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/5 space-y-4">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              Importar contatos (CSV)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Padrão de mercado: upload → validação → dedupe (por email) → resumo + relatório de erros.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold flex items-center gap-2"
            >
              <Download size={16} /> Baixar template
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Arquivo CSV
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 dark:text-slate-300"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Duplicados (match por email)
            </div>
            <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="importMode"
                  checked={mode === 'upsert_by_email'}
                  onChange={() => setMode('upsert_by_email')}
                />
                Atualizar se existir (recomendado)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="importMode"
                  checked={mode === 'skip_duplicates_by_email'}
                  onChange={() => setMode('skip_duplicates_by_email')}
                />
                Ignorar linhas com email já existente
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="importMode"
                  checked={mode === 'create_only'}
                  onChange={() => setMode('create_only')}
                />
                Sempre criar (pode duplicar)
              </label>
            </div>
          </div>

          <div className="space-y-1">
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={createCompanies}
              onChange={e => setCreateCompanies(e.target.checked)}
              className="mt-1"
            />
            <span>
              Criar empresas automaticamente a partir da coluna{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-white/10">company</code>
            </span>
          </label>
          <div className="text-xs text-slate-500 dark:text-slate-400 pl-7">
            Quando marcado: se o CSV vier com o nome da empresa e ela ainda não existir no CRM, nós criamos a empresa e vinculamos o contato.
            <br />
            Quando desmarcado: não criamos empresas — se a empresa não existir, o contato entra <b>sem vínculo</b> de empresa.
          </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!file || isImporting}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                !file || isImporting
                  ? 'bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              <Upload size={16} /> {isImporting ? 'Importando…' : 'Importar'}
            </button>
          </div>

          {importResult && (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-3 space-y-2">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <b>Resumo:</b> {importResult.totals?.created ?? 0} criados •{' '}
                {importResult.totals?.updated ?? 0} atualizados •{' '}
                {importResult.totals?.skipped ?? 0} ignorados •{' '}
                {importResult.totals?.errors ?? 0} erros
              </div>
              {(importResult.totals?.errors ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline w-fit"
                >
                  Baixar relatório de erros (CSV)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

