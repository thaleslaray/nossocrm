import React, { useMemo, useState } from 'react';
import { Copy, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Board, JourneyDefinition, RegistryTemplate } from '@/types';
import { useToast } from '@/context/ToastContext';

function slugify(input: string) {
  return (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-') // keep letters/numbers (unicode), replace rest with '-'
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildJourneyFromBoards(
  opts: { schemaVersion: string; journeyName?: string; boards: Board[]; slugPrefix?: string }
): JourneyDefinition {
  const { schemaVersion, journeyName, boards, slugPrefix } = opts;

  const usedSlugs = new Set<string>();
  const mkSlug = (name: string) => {
    const base = slugify(`${slugPrefix ? `${slugPrefix}-` : ''}${name}`) || 'board';
    let s = base;
    let i = 2;
    while (usedSlugs.has(s)) {
      s = `${base}-${i}`;
      i += 1;
    }
    usedSlugs.add(s);
    return s;
  };

  return {
    schemaVersion,
    name: journeyName,
    boards: boards.map(b => ({
      slug: mkSlug(b.name),
      name: b.name,
      columns: b.stages.map(s => ({
        name: s.label,
        color: s.color,
        linkedLifecycleStage: s.linkedLifecycleStage,
      })),
      strategy: {
        agentPersona: b.agentPersona,
        goal: b.goal,
        entryTrigger: b.entryTrigger,
      },
    })),
  };
}

type Mode = 'board' | 'journey';

export function ExportTemplateModal(props: {
  isOpen: boolean;
  onClose: () => void;
  boards: Board[];
  activeBoard: Board;
}) {
  const { isOpen, onClose, boards, activeBoard } = props;
  const { addToast } = useToast();

  const [mode, setMode] = useState<Mode>('board');

  // Journey metadata
  const [schemaVersion, setSchemaVersion] = useState('1.0');
  const [journeyName, setJourneyName] = useState(() => `Jornada - ${activeBoard.name}`);
  const [slugPrefix, setSlugPrefix] = useState('');

  // Selected boards for journey (keep order)
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>(() => [activeBoard.id]);

  const selectedBoards = useMemo(() => {
    const byId = new Map(boards.map(b => [b.id, b]));
    return selectedBoardIds.map(id => byId.get(id)).filter(Boolean) as Board[];
  }, [boards, selectedBoardIds]);

  // Registry snippet (optional helper)
  const [templateId, setTemplateId] = useState(() => slugify(activeBoard.name) || 'my-template');
  const [templatePath, setTemplatePath] = useState(() => `sales/${slugify(activeBoard.name) || 'my-template'}`);
  const [templateName, setTemplateName] = useState(() => activeBoard.name);
  const [templateDescription, setTemplateDescription] = useState(() => activeBoard.description || 'Template exportado do CRM');
  const [templateAuthor, setTemplateAuthor] = useState('thaleslaray');
  const [templateVersion, setTemplateVersion] = useState('1.0.0');
  const [templateTags, setTemplateTags] = useState('kanban,crm');

  const registrySnippet: RegistryTemplate = useMemo(() => {
    const tags = templateTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    return {
      id: templateId.trim() || 'my-template',
      path: templatePath.trim() || 'sales/my-template',
      name: templateName.trim() || 'Template',
      description: templateDescription.trim() || '',
      author: templateAuthor.trim() || '',
      version: templateVersion.trim() || '1.0.0',
      tags,
    };
  }, [templateId, templatePath, templateName, templateDescription, templateAuthor, templateVersion, templateTags]);

  const journeyJson = useMemo(() => {
    if (mode === 'board') {
      return buildJourneyFromBoards({
        schemaVersion,
        journeyName: activeBoard.name,
        boards: [activeBoard],
        slugPrefix: slugPrefix.trim() || undefined,
      });
    }

    return buildJourneyFromBoards({
      schemaVersion,
      journeyName: journeyName.trim() || undefined,
      boards: selectedBoards,
      slugPrefix: slugPrefix.trim() || undefined,
    });
  }, [mode, schemaVersion, slugPrefix, activeBoard, journeyName, selectedBoards]);

  const canExportJourney = mode === 'journey' ? selectedBoards.length > 0 : true;

  const toggleBoard = (boardId: string) => {
    setSelectedBoardIds(prev => {
      if (prev.includes(boardId)) {
        // Keep at least 1 selected.
        const next = prev.filter(id => id !== boardId);
        return next.length === 0 ? prev : next;
      }
      return [...prev, boardId];
    });
  };

  const moveSelected = (boardId: string, dir: -1 | 1) => {
    setSelectedBoardIds(prev => {
      const idx = prev.indexOf(boardId);
      if (idx === -1) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const handleCopyRegistrySnippet = async () => {
    const text = JSON.stringify(registrySnippet, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      addToast('Snippet do registry.json copiado!', 'success');
    } catch {
      addToast('Não consegui copiar (permissão do navegador).', 'error');
    }
  };

  const handleDownloadJourney = () => {
    if (!canExportJourney) {
      addToast('Selecione ao menos 1 board para exportar a jornada.', 'error');
      return;
    }
    const base = slugify(mode === 'board' ? activeBoard.name : (journeyName || 'journey'));
    const filename = `${base || 'journey'}.journey.json`;
    downloadJson(filename, journeyJson);
    addToast('Download iniciado.', 'success');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar template (comunidade)"
      size="xl"
      bodyClassName="space-y-6"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('board')}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${mode === 'board'
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
        >
          Exportar Board
        </button>
        <button
          type="button"
          onClick={() => setMode('journey')}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${mode === 'journey'
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10'
            }`}
        >
          Exportar Jornada
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/5">
            <div className="text-sm font-bold text-slate-900 dark:text-white">1) Baixar `journey.json`</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Formato compatível com o import da aba <b>Community</b>.
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">schemaVersion</label>
                <input
                  value={schemaVersion}
                  onChange={e => setSchemaVersion(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">slug prefix (opcional)</label>
                <input
                  value={slugPrefix}
                  onChange={e => setSlugPrefix(e.target.value)}
                  placeholder="ex: sales"
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm"
                />
              </div>

              {mode === 'journey' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">nome da jornada</label>
                  <input
                    value={journeyName}
                    onChange={e => setJourneyName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            {mode === 'journey' && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">boards da jornada (ordem importa)</div>
                <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-2 max-h-64 overflow-auto space-y-1">
                  {boards.map(b => {
                    const checked = selectedBoardIds.includes(b.id);
                    const isSelected = checked;
                    return (
                      <div key={b.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-white/10">
                        <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBoard(b.id)}
                          />
                          <span className="truncate">{b.name}</span>
                        </label>
                        {isSelected && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveSelected(b.id, -1)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10"
                              aria-label="Mover para cima"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSelected(b.id, 1)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10"
                              aria-label="Mover para baixo"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadJourney}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold flex items-center gap-2"
              >
                <Download size={16} /> Baixar journey.json
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/5">
            <div className="text-sm font-bold text-slate-900 dark:text-white">2) Snippet para `registry.json`</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Cole isso na lista `templates` do seu repositório de comunidade.
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">id</label>
                <input value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">path</label>
                <input value={templatePath} onChange={e => setTemplatePath(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">name</label>
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">description</label>
                <input value={templateDescription} onChange={e => setTemplateDescription(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">author</label>
                <input value={templateAuthor} onChange={e => setTemplateAuthor(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">version</label>
                <input value={templateVersion} onChange={e => setTemplateVersion(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">tags (separadas por vírgula)</label>
                <input value={templateTags} onChange={e => setTemplateTags(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyRegistrySnippet}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold flex items-center gap-2"
              >
                <Copy size={16} /> Copiar snippet
              </button>
            </div>

            <div className="mt-3">
              <pre className="text-xs whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-3 max-h-48 overflow-auto">
                {JSON.stringify(registrySnippet, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

