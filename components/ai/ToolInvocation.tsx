import React, { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { ToolInvocation as ToolInvocationType } from '@/hooks/useAgent';

interface ToolInvocationProps {
    toolInvocation: ToolInvocationType;
    addToolResult: (args: { toolCallId: string; result: any }) => void;
}

export const ToolInvocation: React.FC<ToolInvocationProps> = ({ toolInvocation, addToolResult }) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const toolName = toolInvocation.toolName;
    const { toolCallId, state } = toolInvocation;
    const args = toolInvocation.args;

    const handleApprove = async () => {
        setIsExecuting(true);
        try {
            // Este componente fazia aprovações de ferramentas via `/api/ai/actions`.
            // Como adotamos corte seco, o endpoint foi removido.
            // Migração: ferramentas devem ser executadas pelo agente em `POST /api/ai/chat` (stack novo).
            throw new Error(
                'Aprovação/executar ferramentas via /api/ai/actions foi removida. Use o chat novo (/api/ai/chat) e as tools do agente.'
            );
        } catch (error: unknown) {
            console.error('Tool execution error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            addToolResult({ toolCallId, result: `Error: ${errorMessage}` });
        } finally {
            setIsExecuting(false);
        }
    };

    if (state === 'result') {
        // Extract user-friendly message from result
        const result = toolInvocation.result;
        let displayText = '';

        if (typeof result === 'string') {
            displayText = result;
        } else if (result?.message) {
            displayText = result.message;
        } else if (result?.error) {
            displayText = `❌ ${result.error}`;
        } else if (result?.deals) {
            displayText = `✅ ${result.count || result.deals.length} deal(s) encontrado(s)`;
        } else if (result?.metrics) {
            displayText = `✅ Win Rate: ${result.metrics.winRate}%`;
        } else if (result?.success !== undefined) {
            displayText = result.success ? '✅ Concluído' : '❌ Falhou';
        } else {
            displayText = '✅ Concluído';
        }

        return (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
                <Check size={14} className="text-green-500 shrink-0" />
                <span className="font-mono uppercase tracking-wider">{getToolLabel(toolName)}</span>
                <span className="text-slate-400 dark:text-slate-500">•</span>
                <span className="truncate">{displayText}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm text-sm my-2">
            <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                </div>
                <span>Aprovar Ação: <span className="font-semibold">{getToolLabel(toolName)}</span></span>
            </div>

            <div className="bg-slate-50 dark:bg-black/20 p-3 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 overflow-x-auto border border-slate-100 dark:border-white/5">
                {JSON.stringify(args, null, 2)}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => addToolResult({ toolCallId, result: 'User denied request' })}
                    disabled={isExecuting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-bold rounded-lg transition-all border border-slate-200 hover:border-red-200 disabled:opacity-50"
                >
                    <X size={14} />
                    Rejeitar
                </button>
                <button
                    onClick={handleApprove}
                    disabled={isExecuting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50"
                >
                    {isExecuting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {isExecuting ? 'Executando...' : 'Aprovar'}
                </button>
            </div>
        </div>
    );
};

function getToolLabel(name: string): string {
    switch (name) {
        case 'createActivity': return 'Agendar Atividade';
        case 'sendWhatsApp': return 'Enviar WhatsApp';
        case 'moveDeal': return 'Mover Negócio';
        case 'searchDeals': return 'Buscar Negócios';
        default: return name;
    }
}
