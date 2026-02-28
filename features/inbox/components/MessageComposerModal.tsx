import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Mail, MessageCircle, Sparkles, Loader2, AlertCircle, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { rewriteMessageDraft, type RewriteMessageDraftInput } from '@/lib/ai/actionsClient';
import { isConsentError, isRateLimitError } from '@/lib/supabase/ai-proxy';
import { toWhatsAppPhone, normalizePhoneE164 } from '@/lib/phone';

export type MessageChannel = 'WHATSAPP' | 'EMAIL';

export type MessageExecutedEvent = {
    channel: MessageChannel;
    /** Para EMAIL */
    subject?: string;
    message: string;
    /** Para WHATSAPP via SmartZap: ID da mensagem enviada */
    smartZapMessageId?: string;
    /** Indica se foi enviado via SmartZap (true) ou apenas wa.me (false) */
    sentViaSmartZap?: boolean;
};

interface MessageComposerModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel: MessageChannel;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    initialSubject?: string;
    initialMessage?: string;
    /** Dispara quando o usuário realmente executa (abre) WhatsApp/mailto */
    onExecuted?: (event: MessageExecutedEvent) => void;
    /** Contexto rico opcional (ex.: cockpitSnapshot) para melhorar a reescrita com IA */
    aiContext?: {
        cockpitSnapshot?: unknown;
        nextBestAction?: {
            action?: string;
            reason?: string;
            actionType?: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'WHATSAPP';
            urgency?: 'low' | 'medium' | 'high';
        };
    };
}

function formatPhoneForWhatsApp(raw?: string) {
    // wa.me usa somente dígitos (sem '+')
    return toWhatsAppPhone(raw);
}

function buildWhatsAppUrl(phone: string, message: string) {
    const text = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
    return `https://wa.me/${phone}${text}`;
}

function formatForWhatsApp(input: string) {
    let text = (input ?? '').replace(/\r\n/g, '\n').trim();
    if (!text) return '';

    // Normalize spacing around newlines
    text = text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n');

    // Ensure a space after sentence punctuation when it's missing (e.g. "minutos.Assim")
    text = text.replace(/([.!?])(?=[A-Za-zÀ-ÿ0-9])/g, '$1 ');

    // Improve readability after greeting if everything is in one paragraph
    if (!text.includes('\n')) {
        const cut = Math.min(90, text.length);
        const head = text.slice(0, cut);
        const idx = Math.max(head.indexOf('?'), head.indexOf('!'));
        if (idx > -1 && idx < 80) {
            text = text.slice(0, idx + 1) + '\n\n' + text.slice(idx + 1).trimStart();
        }
    }

    // Put common celebration emoji on its own line
    text = text.replace(/\s*(🎉|✅|✨|🚀)\s*/g, '\n$1\n');

    // Convert "Que tal X ou Y?" into a bullet list using WhatsApp list markers ("- ")
    const bulletize = (match: string, a: string, b: string) => {
        const A = a.trim().replace(/[?.!]+$/g, '');
        const B = b.trim().replace(/[?.!]+$/g, '');
        return `Que tal:\n- ${A}\n- ${B}`;
    };

    text = text.replace(/Que tal\s+([^\n?]+?)\s+ou\s+([^\n?]+?)\?/i, bulletize);
    text = text.replace(/Você\s+(?:consegue|prefere)\s+([^\n?]+?)\s+ou\s+([^\n?]+?)\?/i, (_m, a, b) => {
        const A = String(a).trim().replace(/[?.!]+$/g, '');
        const B = String(b).trim().replace(/[?.!]+$/g, '');
        return `Você prefere:\n- ${A}\n- ${B}`;
    });
    text = text.replace(/Sugest(?:ões|oes) de hor[áa]rio:\s*([^\n?]+?)\s+ou\s+([^\n?]+?)\.?/i, (_m, a, b) => {
        const A = String(a).trim().replace(/[?.!]+$/g, '');
        const B = String(b).trim().replace(/[?.!]+$/g, '');
        return `Sugestões:\n- ${A}\n- ${B}`;
    });

    // Collapse multiple blank lines again after transformations
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
}

function buildMailtoUrl(email: string, subject: string, body: string) {
    const params = new URLSearchParams();
    if (subject?.trim()) params.set('subject', subject.trim());
    if (body?.trim()) params.set('body', body.trim());
    const qs = params.toString();
    return `mailto:${email}${qs ? `?${qs}` : ''}`;
}

function formatForEmail(input: string) {
    let text = (input ?? '').replace(/\r\n/g, '\n').trim();
    if (!text) return '';

    // Normalize whitespace/newlines
    text = text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n');

    // Ensure a space after sentence punctuation when it's missing (e.g. "passos.projeto")
    text = text.replace(/([.!?])(?=[A-Za-zÀ-ÿ0-9])/g, '$1 ');

    // If everything is one block, try to introduce breaks after common separators
    if (!text.includes('\n')) {
        text = text
            .replace(/\s+(Gostaria|Queria|Podemos|Podemos\s+marcar|Você\s+teria|Sugest(?:ões|oes)\s+de\s+hor[áa]rio|Se\s+preferir|Fico\s+no\s+aguardo)\b/g, '\n\n$1')
            .replace(/\n{3,}/g, '\n\n');
    }

    // Bulletize simple "X ou Y" scheduling options into list items
    text = text.replace(
        /(Você\s+teria\s+disponibilidade\s+em|Você\s+prefere|Podemos\s+marcar\s+em)\s+([^\n?.!]+?)\s+ou\s+([^\n?.!]+?)\?/i,
        (_m, lead, a, b) => {
            const A = String(a).trim().replace(/[?.!]+$/g, '');
            const B = String(b).trim().replace(/[?.!]+$/g, '');
            return `${String(lead).trim()}:\n- ${A}\n- ${B}\n\nFaz sentido?`;
        }
    );

    // Keep paragraphs readable
    text = text
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
}

/**
 * Componente React `MessageComposerModal`.
 *
 * @param {MessageComposerModalProps} {
    isOpen,
    onClose,
    channel,
    contactName,
    contactEmail,
    contactPhone,
    initialSubject,
    initialMessage,
    onExecuted,
    aiContext,
} - Parâmetro `{
    isOpen,
    onClose,
    channel,
    contactName,
    contactEmail,
    contactPhone,
    initialSubject,
    initialMessage,
    onExecuted,
    aiContext,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export function MessageComposerModal({
    isOpen,
    onClose,
    channel,
    contactName,
    contactEmail,
    contactPhone,
    initialSubject,
    initialMessage,
    onExecuted,
    aiContext,
}: MessageComposerModalProps) {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [copied, setCopied] = useState<'subject' | 'message' | 'contact' | null>(null);
    const [isRewriting, setIsRewriting] = useState(false);
    const [rewriteError, setRewriteError] = useState<string | null>(null);
    const [aiBadge, setAiBadge] = useState(false);
    const [isSendingViaSmartZap, setIsSendingViaSmartZap] = useState(false);
    const [smartZapSent, setSmartZapSent] = useState<{ messageId?: string } | null>(null);
    const [smartZapError, setSmartZapError] = useState<string | null>(null);

    const phone = useMemo(() => formatPhoneForWhatsApp(contactPhone), [contactPhone]);
    const contactValue = useMemo(() => {
        return channel === 'WHATSAPP' ? phone : (contactEmail ?? '');
    }, [channel, phone, contactEmail]);

    const title = channel === 'WHATSAPP' ? 'Preparar WhatsApp' : 'Preparar email';

    useEffect(() => {
        if (!isOpen) return;

        setCopied(null);
        setRewriteError(null);
        setIsRewriting(false);
        setAiBadge(false);
        setSmartZapSent(null);
        setSmartZapError(null);
        setIsSendingViaSmartZap(false);
        setSubject(typeof initialSubject === 'string' ? initialSubject : '');
        const nextMsg = typeof initialMessage === 'string' ? initialMessage : '';
        setMessage(channel === 'WHATSAPP' ? formatForWhatsApp(nextMsg) : formatForEmail(nextMsg));
    }, [isOpen, initialSubject, initialMessage, channel]);

    const canOpen = useMemo(() => {
        if (channel === 'WHATSAPP') return Boolean(phone);
        return Boolean(contactEmail);
    }, [channel, phone, contactEmail]);

    const handleCopy = async (what: 'subject' | 'message' | 'contact') => {
        try {
            const value =
                what === 'subject'
                    ? subject
                    : what === 'message'
                        ? message
                        : contactValue;
            await navigator.clipboard.writeText(value ?? '');
            setCopied(what);
            setTimeout(() => setCopied(null), 1200);
        } catch {
            // ignore
        }
    };

    const handleOpen = () => {
        if (channel === 'WHATSAPP') {
            if (!phone) return;
            const formatted = formatForWhatsApp(message);
            // Keep textarea consistent with what will be sent.
            if (formatted && formatted !== message) setMessage(formatted);
            window.open(buildWhatsAppUrl(phone, formatted), '_blank');
            onExecuted?.({ channel, message: formatted });
            return;
        }

        if (!contactEmail) return;
        const formatted = formatForEmail(message);
        if (formatted && formatted !== message) setMessage(formatted);
        window.open(buildMailtoUrl(contactEmail, subject, formatted), '_blank');
        onExecuted?.({ channel, subject, message: formatted });
    };

    /**
     * Envia a mensagem diretamente via SmartZap (sem abrir o WhatsApp Web).
     * A mensagem é armazenada no banco do CRM automaticamente.
     */
    const handleSendViaSmartZap = async () => {
        if (isSendingViaSmartZap || !phone || !message.trim()) return;

        setIsSendingViaSmartZap(true);
        setSmartZapError(null);
        setSmartZapSent(null);

        const formatted = formatForWhatsApp(message);

        try {
            const e164 = normalizePhoneE164(contactPhone);
            const response = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'text', to: e164 || phone, text: formatted }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                const errMsg = data?.error || 'Falha ao enviar via SmartZap';
                setSmartZapError(errMsg);
                return;
            }

            setSmartZapSent({ messageId: data.messageId });
            onExecuted?.({ channel, message: formatted, smartZapMessageId: data.messageId, sentViaSmartZap: true });
        } catch (err) {
            setSmartZapError(err instanceof Error ? err.message : 'Erro de conexão com SmartZap');
        } finally {
            setIsSendingViaSmartZap(false);
        }
    };

    const handleRewriteWithAI = async () => {
        if (isRewriting) return;

        setIsRewriting(true);
        setRewriteError(null);

        const payload: RewriteMessageDraftInput = {
            channel,
            currentSubject: channel === 'EMAIL' ? subject : undefined,
            currentMessage: message,
            nextBestAction: aiContext?.nextBestAction,
            cockpitSnapshot: aiContext?.cockpitSnapshot,
        };

        try {
            const result = await rewriteMessageDraft(payload);

            if (channel === 'EMAIL' && typeof result.subject === 'string') {
                setSubject(result.subject);
            }
            if (typeof result.message === 'string' && result.message.trim()) {
                const next = channel === 'WHATSAPP' ? formatForWhatsApp(result.message) : formatForEmail(result.message);
                setMessage(next);
            }

            setAiBadge(true);
        } catch (err) {
            if (isConsentError(err)) {
                setRewriteError('IA não configurada (consentimento necessário). Vá em Configurações → Inteligência Artificial.');
            } else if (isRateLimitError(err)) {
                setRewriteError('IA em limite de uso no momento. Tente novamente em instantes.');
            } else {
                const msg = err instanceof Error ? err.message : 'Não foi possível reescrever com IA.';
                setRewriteError(msg);
            }
        } finally {
            setIsRewriting(false);
        }
    };

    const icon = channel === 'WHATSAPP' ? MessageCircle : Mail;
    const Icon = icon;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="xl"
            className="max-h-[90vh]"
            bodyClassName="overflow-y-auto"
            initialFocus="#message-composer-textarea"
        >
            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <div
                        className={
                            channel === 'WHATSAPP'
                                ? 'p-2 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20'
                                : 'p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        }
                    >
                        <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {contactName || 'Contato'}
                        </p>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {channel === 'WHATSAPP'
                                    ? phone
                                        ? `WhatsApp: ${phone}`
                                        : 'Sem telefone para WhatsApp'
                                    : contactEmail
                                        ? `Email: ${contactEmail}`
                                        : 'Sem email cadastrado'}
                            </p>
                            {contactValue && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy('contact')}
                                        className="p-1 rounded-md hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                                        title={copied === 'contact' ? 'Copiado' : 'Copiar contato'}
                                    >
                                        <Copy size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpen}
                                        disabled={!canOpen}
                                        className="p-1 rounded-md hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        title={channel === 'WHATSAPP' ? 'Abrir no WhatsApp' : 'Abrir no email'}
                                    >
                                        <ExternalLink size={12} />
                                    </button>
                                </>
                            )}
                        </div>
                        {aiBadge && (
                            <p className="mt-1 text-[11px] text-primary-600 dark:text-primary-400 flex items-center gap-1">
                                <Sparkles size={12} /> Reescrito com IA
                            </p>
                        )}
                    </div>
                </div>

                {channel === 'EMAIL' && (
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Assunto
                        </label>
                        <div className="flex gap-2">
                            <input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus-visible-ring"
                                placeholder="Ex: Próximos passos"
                            />
                            <button
                                type="button"
                                onClick={() => handleCopy('subject')}
                                className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
                                title="Copiar assunto"
                            >
                                <Copy size={16} />
                            </button>
                        </div>
                        {copied === 'subject' && (
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Assunto copiado</p>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Mensagem
                    </label>
                    <textarea
                        id="message-composer-textarea"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={12}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus-visible-ring resize-y min-h-80 max-h-[60vh]"
                        placeholder={
                            channel === 'WHATSAPP'
                                ? 'Ex: Oi! Podemos falar rapidinho hoje?'
                                : 'Ex: Olá, tudo bem? Seguem os próximos passos...'
                        }
                    />
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] text-slate-500 dark:text-slate-500">
                            {message.length} caracteres
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleCopy('message')}
                                className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-2"
                            >
                                <Copy size={14} />
                                {copied === 'message' ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 justify-end pt-2">
                    <div className="mr-auto">
                        <button
                            type="button"
                            onClick={handleRewriteWithAI}
                            disabled={isRewriting}
                            className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Reescrever com IA usando o contexto do cockpit"
                        >
                            {isRewriting ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Sparkles size={16} />
                            )}
                            Reescrever com IA
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                        Cancelar
                    </button>
                    {/* Envio direto via SmartZap (somente WhatsApp) */}
                    {channel === 'WHATSAPP' && (
                        <button
                            type="button"
                            onClick={handleSendViaSmartZap}
                            disabled={isSendingViaSmartZap || !canOpen || !message.trim() || !!smartZapSent}
                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            title="Enviar diretamente via SmartZap (armazena no CRM)"
                        >
                            {isSendingViaSmartZap ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Send size={16} />
                            )}
                            {smartZapSent ? 'Enviado!' : 'Enviar via SmartZap'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleOpen}
                        disabled={!canOpen}
                        className={
                            channel === 'WHATSAPP'
                                ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-slate-500 hover:bg-slate-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
                                : 'px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
                        }
                    >
                        <ExternalLink size={16} />
                        {channel === 'WHATSAPP' ? 'Abrir no WhatsApp' : 'Abrir no email'}
                    </button>
                </div>

                {/* Feedback SmartZap */}
                {smartZapSent && (
                    <div className="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-950/20 p-3">
                        <Send size={16} className="text-green-600 dark:text-green-400 mt-0.5" />
                        <p className="text-sm text-green-700 dark:text-green-300">
                            Mensagem enviada via SmartZap e salva no CRM.
                            {smartZapSent.messageId && (
                                <span className="ml-1 opacity-60 text-xs">ID: {smartZapSent.messageId}</span>
                            )}
                        </p>
                    </div>
                )}

                {smartZapError && (
                    <div className="flex items-start gap-2 rounded-lg border border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-950/20 p-3">
                        <AlertCircle size={16} className="text-orange-600 dark:text-orange-400 mt-0.5" />
                        <div>
                            <p className="text-sm text-orange-700 dark:text-orange-300">{smartZapError}</p>
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                                Use "Abrir no WhatsApp" como alternativa.
                            </p>
                        </div>
                    </div>
                )}

                {rewriteError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-950/20 p-3">
                        <AlertCircle size={16} className="text-red-600 dark:text-red-400 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{rewriteError}</p>
                    </div>
                )}
            </div>
        </Modal>
    );
}
