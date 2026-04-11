import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import { Loader2, UserPlus, Crown, Briefcase, KeyRound, Mail, Check, X, Sparkles, Clock, RefreshCw, Trash2, Link, Copy, CheckCircle2 } from 'lucide-react';

interface Profile {
    id: string;
    email: string;
    role: string;
    organization_id: string;
    created_at: string;
    status: 'active' | 'pending';
    invited_at?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
}

interface InviteResult {
    email: string;
    success: boolean;
    error?: string;
}

// Gera iniciais e cor consistente baseada no email
const getAvatarProps = (email: string) => {
    const initials = email.substring(0, 2).toUpperCase();
    const colors = [
        'from-violet-500 to-purple-600',
        'from-blue-500 to-cyan-500',
        'from-emerald-500 to-teal-500',
        'from-orange-500 to-amber-500',
        'from-pink-500 to-rose-500',
        'from-indigo-500 to-blue-500',
    ];
    const colorIndex = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return { initials, gradient: colors[colorIndex] };
};

// Valida formato de email
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Componente React `UsersPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const UsersPage: React.FC = () => {
    const { profile: currentUserProfile } = useAuth();
    const { addToast } = useToast();
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newUserRole, setNewUserRole] = useState('vendedor');
    const [sendingInvites, setSendingInvites] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null); // id do usuário em ação
    const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
    const [activeInvites, setActiveInvites] = useState<any[]>([]);
    const [expirationDays, setExpirationDays] = useState<number | null>(7); // 7 days default, null = never

    const sb = supabase;

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'GET',
                headers: { accept: 'application/json' },
                credentials: 'include',
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || `Falha ao carregar usuários (HTTP ${res.status})`);
            }

            setUsers(data?.users || []);
        } catch (err) {
            console.error('Error fetching users:', err);
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchActiveInvites = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/invites', {
                method: 'GET',
                headers: { accept: 'application/json' },
                credentials: 'include',
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || `Falha ao carregar convites (HTTP ${res.status})`);
            }

            const invites = data?.invites || [];
            const nowTs = Date.now();
            const validInvites = (invites || []).filter((invite: any) => {
                // Only show invites that are not used
                if (invite.used_at) return false;
                // If no expiration, it's valid
                if (!invite.expires_at) return true;
                // Check if expiration is in the future (with small buffer for timezone issues)
                const expiresTs = Date.parse(invite.expires_at);
                return expiresTs > nowTs;
            });
            // Force state update by creating new array reference
            setActiveInvites([...validInvites]);
        } catch (error) {
            console.error('Error fetching invites:', error);
            // On error, still try to update state to empty array to clear stale data
            setActiveInvites([]);
        }
    }, []);

    const closeModal = useCallback(() => {
        setIsModalOpen(false);
        setError(null);
        setNewUserRole('vendedor');
        setExpirationDays(7);
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (isModalOpen) {
            fetchActiveInvites();
        }
    }, [fetchActiveInvites, isModalOpen]);

    if (!sb) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                        Configuração incompleta
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        O Supabase não está configurado neste ambiente. Configure as variáveis de ambiente para gerenciar usuários.
                    </p>
                </div>
            </div>
        );
    }

    const handleDeleteUser = (user: Profile) => {
        setUserToDelete(user);
    };

    const handleGenerateLink = async () => {
        setSendingInvites(true);
        setError(null);
        try {
            const expiresAt = expirationDays
                ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString()
                : null;

            const res = await fetch('/api/admin/invites', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    role: newUserRole,
                    expiresAt,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || `Erro ao gerar link (HTTP ${res.status})`);
            }

            // Force refresh of active invites and ensure state updates
            await fetchActiveInvites();
            
            // Small delay to ensure state propagation
            await new Promise(resolve => setTimeout(resolve, 100));
            
            addToast('Novo link gerado!', 'success');
        } catch (err: any) {
            setError(err.message || 'Erro ao gerar link');
        } finally {
            setSendingInvites(false);
        }
    };

    const handleDeleteInvite = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/invites/${id}`, {
                method: 'DELETE',
                headers: { accept: 'application/json' },
                credentials: 'include',
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || `Erro ao remover link (HTTP ${res.status})`);
            }

            await fetchActiveInvites();
            addToast('Link removido!', 'success');
        } catch (err: any) {
            addToast('Erro ao remover link', 'error');
        }
    };

    const copyLink = (token: string) => {
        const link = `${window.location.origin}/join?token=${token}`;
        navigator.clipboard.writeText(link);
        addToast('Link copiado!', 'success');
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete) return;

        setActionLoading(userToDelete.id);
        setUserToDelete(null);

        try {
            const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
                method: 'DELETE',
                headers: { accept: 'application/json' },
                credentials: 'include',
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || `Erro ao remover usuário (HTTP ${res.status})`);
            }

            addToast(
                userToDelete.status === 'pending' ? 'Convite cancelado' : 'Usuário removido',
                'success'
            );
            fetchUsers();
        } catch (err: any) {
            addToast(`Erro: ${err.message}`, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin h-8 w-8 text-primary-500" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">Carregando equipe...</span>
                </div>
            </div>
        );
    }

    if (currentUserProfile?.role !== 'admin') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                        <KeyRound className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Acesso Restrito</h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                        Apenas administradores podem gerenciar usuários da equipe.
                    </p>
                </div>
            </div>
        );
    }

    const admins = users.filter(u => u.role === 'admin');
    const vendedores = users.filter(u => u.role === 'vendedor');

    return (
        <div className="max-w-4xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-10">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
                            Sua Equipe
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
                            {users.length} {users.length === 1 ? 'membro' : 'membros'} • {admins.length} admin{admins.length !== 1 && 's'}, {vendedores.length} vendedor{vendedores.length !== 1 && 'es'}
                        </p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="group flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-500 transition-all shadow-lg shadow-primary-600/25 hover:shadow-xl hover:shadow-primary-600/30 hover:-translate-y-0.5 font-medium"
                    >
                        <UserPlus className="w-4 h-4 transition-transform group-hover:scale-110" />
                        Convidar
                    </button>
                </div>
            </div>

            {/* User Grid */}
            <div className="grid gap-3">
                {users.map((user) => {
                    const { initials, gradient } = getAvatarProps(user.email);
                    const isCurrentUser = user.id === currentUserProfile?.id;

                    return (
                        <div
                            key={user.id}
                            className={`group relative bg-white dark:bg-white/[0.03] border rounded-2xl p-5 transition-all duration-200 hover:shadow-lg dark:hover:bg-white/[0.05] ${isCurrentUser
                                ? 'border-primary-200 dark:border-primary-500/30 ring-1 ring-primary-100 dark:ring-primary-500/10'
                                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                {/* Avatar */}
                                <div className={`relative flex-shrink-0 h-14 w-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                                    {initials}
                                    {user.role === 'admin' && (
                                        <div className="absolute -top-1 -right-1 h-5 w-5 bg-amber-400 rounded-full flex items-center justify-center shadow-md ring-2 ring-white dark:ring-slate-900">
                                            <Crown className="h-3 w-3 text-amber-900" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                                            {user.email}
                                        </h3>
                                        {isCurrentUser && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                                                você
                                            </span>
                                        )}
                                        {user.status === 'pending' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                <Clock className="h-3 w-3" />
                                                Pendente
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <span className={`inline-flex items-center gap-1.5 text-sm ${user.role === 'admin'
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-slate-500 dark:text-slate-400'
                                            }`}>
                                            {user.role === 'admin' ? (
                                                <>
                                                    <Crown className="h-3.5 w-3.5" />
                                                    Administrador
                                                </>
                                            ) : (
                                                <>
                                                    <Briefcase className="h-3.5 w-3.5" />
                                                    Vendedor
                                                </>
                                            )}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">•</span>
                                        <span className="text-sm text-slate-400 dark:text-slate-500">
                                            {user.status === 'pending'
                                                ? `Convidado ${new Date(user.invited_at || user.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
                                                : `Desde ${new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`
                                            }
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                {!isCurrentUser && (
                                    <div className="flex items-center gap-1">
                                        {actionLoading === user.id ? (
                                            <div className="p-2">
                                                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                            </div>
                                        ) : (
                                            <>
                                                {/* Resend Invite removed as we don't use email invites anymore */}
                                                <button
                                                    onClick={() => handleDeleteUser(user)}
                                                    className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                    title={user.status === 'pending' ? 'Cancelar convite' : 'Remover usuário'}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Empty State */}
            {users.length === 0 && (
                <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 dark:bg-white/5 mb-4">
                        <UserPlus className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Nenhum membro ainda</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
                        Comece convidando membros da sua equipe para colaborar no CRM.
                    </p>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-500 transition-all font-medium"
                    >
                        <UserPlus className="w-4 h-4" />
                        Convidar primeiro membro
                    </button>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                    onClick={(e) => {
                        // Close only when clicking the backdrop (outside the panel).
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div
                        className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="px-6 pt-6 pb-4">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                                    <Link className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                                        Gerar Convite
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Crie links de acesso para sua equipe
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 pb-6">
                            {/* Active Links List */}
                            <div className="mb-6">
                                <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3">
                                    Links Ativos
                                </h3>

                                {activeInvites.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {activeInvites.map((invite) => (
                                            <div key={invite.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${invite.role === 'admin'
                                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                            : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                                            }`}>
                                                            {invite.role}
                                                        </span>
                                                        <span className="text-xs text-slate-400">
                                                            {invite.expires_at
                                                                ? `Expira em ${new Date(invite.expires_at).toLocaleDateString()}`
                                                                : 'Nunca expira'
                                                            }
                                                        </span>
                                                    </div>
                                                    <code className="block text-xs text-slate-600 dark:text-slate-300 truncate">
                                                        ...{invite.token.slice(-8)}
                                                    </code>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => copyLink(invite.token)}
                                                        className="p-2 text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                                                        title="Copiar link"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteInvite(invite.id)}
                                                        className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                        title="Revogar link"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Nenhum link ativo
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-5 border-t border-slate-100 dark:border-white/5 pt-5">
                                {/* Role Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                                        Cargo
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setNewUserRole('vendedor')}
                                            className={`relative p-3 rounded-xl border-2 text-left transition-all ${newUserRole === 'vendedor'
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <Briefcase className={`h-4 w-4 ${newUserRole === 'vendedor' ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`} />
                                                <span className={`font-medium text-sm ${newUserRole === 'vendedor' ? 'text-primary-900 dark:text-primary-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    Vendedor
                                                </span>
                                            </div>
                                            {newUserRole === 'vendedor' && (
                                                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary-500" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewUserRole('admin')}
                                            className={`relative p-3 rounded-xl border-2 text-left transition-all ${newUserRole === 'admin'
                                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <Crown className={`h-4 w-4 ${newUserRole === 'admin' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                                                <span className={`font-medium text-sm ${newUserRole === 'admin' ? 'text-amber-900 dark:text-amber-100' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    Admin
                                                </span>
                                            </div>
                                            {newUserRole === 'admin' && (
                                                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-500" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Expiration Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                                        Expiração
                                    </label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { label: '7 dias', value: 7 },
                                            { label: '30 dias', value: 30 },
                                            { label: 'Nunca', value: null }
                                        ].map((opt) => (
                                            <button
                                                key={opt.label}
                                                type="button"
                                                onClick={() => setExpirationDays(opt.value)}
                                                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${expirationDays === opt.value
                                                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Error Message */}
                                {error && (
                                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                                        <div className="h-5 w-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-xs">!</span>
                                        </div>
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-white/5">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                                >
                                    Fechar
                                </button>

                                <button
                                    onClick={handleGenerateLink}
                                    disabled={sendingInvites}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-600/25 transition-all"
                                >
                                    {sendingInvites ? (
                                        <>
                                            <Loader2 className="animate-spin h-4 w-4" />
                                            Gerando...
                                        </>
                                    ) : (
                                        <>
                                            <Link className="h-4 w-4" />
                                            Gerar Link
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                onConfirm={confirmDeleteUser}
                title={userToDelete?.status === 'pending' ? 'Cancelar Convite' : 'Remover Usuário'}
                message={userToDelete?.status === 'pending'
                    ? `Tem certeza que deseja cancelar o convite para ${userToDelete?.email}?`
                    : `Tem certeza que deseja remover ${userToDelete?.email} da equipe?`
                }
                confirmText={userToDelete?.status === 'pending' ? 'Cancelar Convite' : 'Remover'}
                cancelText="Voltar"
                variant="danger"
            />
        </div>
    );
};
