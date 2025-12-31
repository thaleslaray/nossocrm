import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { getErrorMessage } from '@/lib/utils/errorUtils';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { isE164, normalizePhoneE164 } from '@/lib/phone';
import { Loader2, User, Mail, Shield, Calendar, Key, Check, Eye, EyeOff, Phone, Pencil, Save, Camera, X } from 'lucide-react';

/**
 * Componente React `ProfilePage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ProfilePage: React.FC = () => {
    const { profile, refreshProfile } = useAuth();

    // Em ambientes onde as variáveis de ambiente não estão configuradas,
    // nosso helper pode retornar `null` para evitar crash.
    const sb = supabase;

    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [loading, setLoading] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Performance: memoize validation (avoids regex work on unrelated state changes).
    const passwordRequirements = useMemo(() => ({
        minLength: newPassword.length >= 6,
        hasLowercase: /[a-z]/.test(newPassword),
        hasUppercase: /[A-Z]/.test(newPassword),
        hasDigit: /\d/.test(newPassword),
    }), [newPassword]);
    const isPasswordValid = useMemo(() => Object.values(passwordRequirements).every(Boolean), [passwordRequirements]);

    // Campos do perfil
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nickname, setNickname] = useState('');
    const [phone, setPhone] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    const [isChangingEmail, setIsChangingEmail] = useState(false);
    const [newEmail, setNewEmail] = useState('');

    // Carrega dados do perfil
    useEffect(() => {
        if (profile) {
            setFirstName(profile.first_name || '');
            setLastName(profile.last_name || '');
            setNickname(profile.nickname || '');
            setPhone(normalizePhoneE164(profile.phone || ''));
            setAvatarUrl(profile.avatar_url || null);
        }
    }, [profile]);

    // Performance: memoize derived display strings to avoid recompute during typing elsewhere.
    const initials = useMemo(() => {
        if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
        if (nickname) return nickname.substring(0, 2).toUpperCase();
        return profile?.email?.substring(0, 2).toUpperCase() || 'U';
    }, [firstName, lastName, nickname, profile?.email]);

    const displayName = useMemo(() => {
        if (nickname) return nickname;
        if (firstName) return firstName;
        return profile?.email?.split('@')[0] || 'Usuário';
    }, [firstName, nickname, profile?.email]);

    const fullName = useMemo(() => {
        if (firstName && lastName) return `${firstName} ${lastName}`;
        if (firstName) return firstName;
        return null;
    }, [firstName, lastName]);

    const gradient = useMemo(() => {
        const colors = [
            'from-violet-500 to-purple-600',
            'from-blue-500 to-cyan-500',
            'from-emerald-500 to-teal-500',
            'from-orange-500 to-amber-500',
            'from-pink-500 to-rose-500',
            'from-indigo-500 to-blue-500',
        ];
        const email = profile?.email || '';
        const colorIndex = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
        return colors[colorIndex];
    }, [profile?.email]);

    // Stable handlers (helps memoized children / prevents re-renders in some layouts).
    const triggerAvatarPicker = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Sem Supabase não há como salvar/atualizar perfil.
    // Hooks MUST come before early returns (rules-of-hooks).
    if (!sb) {
        return (
            <div className="p-6">
                <div className="max-w-xl mx-auto bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-6">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                        Configuração incompleta
                    </h1>
                    <p className="text-slate-600 dark:text-slate-300">
                        O Supabase não está configurado neste ambiente. Verifique as variáveis de ambiente
                        (URL e ANON KEY) para usar a página de perfil.
                    </p>
                </div>
            </div>
        );
    }

    // Upload de avatar
    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !profile?.id) return;

        // Validações
        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'Por favor, selecione uma imagem.' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'A imagem deve ter no máximo 2MB.' });
            return;
        }

        setUploadingAvatar(true);
        setMessage(null);

        try {
            // Nome único para o arquivo
            const fileExt = file.name.split('.').pop();
            const fileName = `${profile.id}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            // Upload para o Storage
            const { error: uploadError } = await sb.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Pega a URL pública
            const { data: { publicUrl } } = sb.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Adiciona timestamp para evitar cache
            const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

            // Atualiza o perfil com a URL do avatar
            const { error: updateError } = await sb
                .from('profiles')
                .update({ avatar_url: urlWithTimestamp })
                .eq('id', profile.id);

            if (updateError) throw updateError;

            setAvatarUrl(urlWithTimestamp);
            if (refreshProfile) await refreshProfile();
            setMessage({ type: 'success', text: 'Foto atualizada!' });
        } catch (err: any) {
            console.error('Upload error:', err);
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setUploadingAvatar(false);
        }
    };

    // Remove avatar
    const handleRemoveAvatar = async () => {
        if (!profile?.id) return;

        setUploadingAvatar(true);
        setMessage(null);

        try {
            // Remove do Storage (ignora erro se não existir)
            await sb.storage
                .from('avatars')
                .remove([`avatars/${profile.id}.jpg`, `avatars/${profile.id}.png`, `avatars/${profile.id}.jpeg`]);

            // Remove URL do perfil
            const { error } = await sb
                .from('profiles')
                .update({ avatar_url: null })
                .eq('id', profile.id);

            if (error) throw error;

            setAvatarUrl(null);
            if (refreshProfile) await refreshProfile();
            setMessage({ type: 'success', text: 'Foto removida!' });
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        setMessage(null);

        try {
            const normalizedPhone = normalizePhoneE164(phone);
            if (normalizedPhone && !isE164(normalizedPhone)) {
                setMessage({
                    type: 'error',
                    text: 'Telefone inválido. Use o formato E.164 (ex.: +5511999999999).',
                });
                return;
            }

            const { error } = await sb
                .from('profiles')
                .update({
                    first_name: firstName.trim() || null,
                    last_name: lastName.trim() || null,
                    nickname: nickname.trim() || null,
                    phone: normalizedPhone || null,
                })
                .eq('id', profile?.id);

            if (error) throw error;

            // Atualiza o perfil no contexto
            if (refreshProfile) await refreshProfile();

            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
            setIsEditingProfile(false);
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'As senhas não coincidem.' });
            return;
        }

        if (!isPasswordValid) {
            setMessage({ type: 'error', text: 'A senha não atende aos requisitos mínimos.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const { error } = await sb.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
            setIsChangingPassword(false);
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setLoading(false);
        }
    };

    // Altera email
    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setLoading(true);

        try {
            const { error } = await sb.auth.updateUser({ email: newEmail });
            if (error) throw error;

            setMessage({ type: 'success', text: 'E-mail de confirmação enviado para o novo endereço!' });
            setIsChangingEmail(false);
            setNewEmail('');
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto pb-10">
            {/* Header */}
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
                    Meu Perfil
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2">
                    Gerencie suas informações pessoais e segurança.
                </p>
            </div>

            {/* Mensagem de feedback */}
            {message && (
                <div className={`flex items-center gap-2 p-4 rounded-xl text-sm mb-6 ${message.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                    }`}>
                    {message.type === 'success' && <Check className="w-4 h-4" />}
                    {message.text}
                </div>
            )}

            {/* Profile Card */}
            <div className="bg-white dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-2xl p-8 mb-6">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-6">
                        {/* Avatar Grande com Upload */}
                        <div className="relative group">
                            {avatarUrl ? (
                                <Image
                                    src={avatarUrl}
                                    alt="Avatar"
                                    width={80}
                                    height={80}
                                    className="w-20 h-20 rounded-2xl object-cover shadow-xl"
                                    unoptimized
                                />
                            ) : (
                                <div className={`w-20 h-20 rounded-2xl bg-linear-to-br ${gradient} flex items-center justify-center text-white font-bold text-2xl shadow-xl`}>
                                    {initials}
                                </div>
                            )}

                            {/* Overlay de upload */}
                            <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                {uploadingAvatar ? (
                                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                                ) : (
                                    <button
                                        onClick={triggerAvatarPicker}
                                        className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                                    >
                                        <Camera className="w-5 h-5 text-white" />
                                    </button>
                                )}
                            </div>

                            {/* Botão de remover (só aparece se tem foto) */}
                            {avatarUrl && !uploadingAvatar && (
                                <button
                                    onClick={handleRemoveAvatar}
                                    className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                                    title="Remover foto"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}

                            {/* Input hidden para upload */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarUpload}
                                className="hidden"
                            />
                        </div>

                        {/* Info resumida */}
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                {displayName}
                            </h2>
                            {fullName && (
                                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                                    {fullName}
                                </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${profile?.role === 'admin'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                    }`}>
                                    <Shield className="w-3 h-3" />
                                    {profile?.role === 'admin' ? 'Admin' : 'Vendedor'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {!isEditingProfile && (
                        <button
                            onClick={() => setIsEditingProfile(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-colors"
                        >
                            <Pencil className="w-4 h-4" />
                            Editar
                        </button>
                    )}
                </div>

                {/* Modo de edição */}
                {isEditingProfile ? (
                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Nome
                                </label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 transition-all"
                                    placeholder="Seu nome"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Sobrenome
                                </label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 transition-all"
                                    placeholder="Seu sobrenome"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Apelido
                                <span className="text-slate-400 font-normal ml-1">(como gostaria de ser chamado)</span>
                            </label>
                            <input
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="w-full px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 transition-all"
                                placeholder="Seu apelido"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Telefone
                            </label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full pl-11 pr-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 transition-all"
                                    placeholder="+5511999999999"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditingProfile(false);
                                    // Reset para valores originais
                                    setFirstName(profile?.first_name || '');
                                    setLastName(profile?.last_name || '');
                                    setNickname(profile?.nickname || '');
                                    setPhone(normalizePhoneE164(profile?.phone || ''));
                                    setMessage(null);
                                }}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                disabled={savingProfile}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-lg shadow-primary-600/25 transition-all disabled:opacity-50"
                            >
                                {savingProfile ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Salvar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Modo de visualização */
                    <div className="grid gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-600 dark:text-slate-300">{profile?.email}</span>
                            </div>
                            {!isChangingEmail && (
                                <button
                                    onClick={() => setIsChangingEmail(true)}
                                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                                >
                                    Alterar
                                </button>
                            )}
                        </div>

                        {/* Alterar email form */}
                        {isChangingEmail && (
                            <form onSubmit={handleChangeEmail} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-3">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Novo E-mail
                                </label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-primary-500"
                                    placeholder="seu@novoemail.com"
                                    required
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsChangingEmail(false);
                                            setNewEmail('');
                                        }}
                                        className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {phone && (
                            <div className="flex items-center gap-3 text-sm">
                                <Phone className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-600 dark:text-slate-300">{phone}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-3 text-sm">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-500 dark:text-slate-400">
                                Membro desde {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '-'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Security Section */}
            <div className="bg-white dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Key className="w-5 h-5 text-slate-400" />
                            Segurança
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Gerencie sua senha de acesso.
                        </p>
                    </div>
                    {!isChangingPassword && (
                        <button
                            onClick={() => setIsChangingPassword(true)}
                            className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                            Alterar Senha
                        </button>
                    )}
                </div>

                {isChangingPassword && (
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Nova Senha
                            </label>
                            <div className="relative">
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary-500 transition-all pr-10"
                                    placeholder="Mínimo 6 caracteres"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords(!showPasswords)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Password Requirements */}
                            {newPassword.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Requisitos:</p>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                        <span className={passwordRequirements.minLength ? 'text-green-500' : 'text-slate-400'}>
                                            {passwordRequirements.minLength ? '✓' : '○'} Mínimo 6 caracteres
                                        </span>
                                        <span className={passwordRequirements.hasLowercase ? 'text-green-500' : 'text-slate-400'}>
                                            {passwordRequirements.hasLowercase ? '✓' : '○'} Letra minúscula
                                        </span>
                                        <span className={passwordRequirements.hasUppercase ? 'text-green-500' : 'text-slate-400'}>
                                            {passwordRequirements.hasUppercase ? '✓' : '○'} Letra maiúscula
                                        </span>
                                        <span className={passwordRequirements.hasDigit ? 'text-green-500' : 'text-slate-400'}>
                                            {passwordRequirements.hasDigit ? '✓' : '○'} Número
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Confirmar Nova Senha
                            </label>
                            <input
                                type={showPasswords ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={`w-full px-4 py-2.5 border-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all ${confirmPassword.length > 0
                                    ? (newPassword === confirmPassword && confirmPassword.length > 0)
                                        ? 'border-green-500 focus:border-green-500'
                                        : 'border-red-500 focus:border-red-500'
                                    : 'border-slate-200 dark:border-slate-700 focus:border-primary-500'
                                    }`}
                                placeholder="Digite novamente"
                                required
                            />
                            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                                <p className="mt-1 text-xs text-red-500">As senhas não coincidem</p>
                            )}
                            {confirmPassword.length > 0 && newPassword === confirmPassword && (
                                <p className="mt-1 text-xs text-green-500">✓ Senhas coincidem</p>
                            )}
                        </div>

                        {message && (
                            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${message.type === 'success'
                                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                }`}>
                                {message.type === 'success' && <Check className="w-4 h-4" />}
                                {message.text}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsChangingPassword(false);
                                    setNewPassword('');
                                    setConfirmPassword('');
                                    setMessage(null);
                                }}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-xl shadow-lg shadow-primary-600/25 transition-all disabled:opacity-50"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Salvar Senha
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}

                {!isChangingPassword && (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        Sua senha está configurada. Clique em "Alterar Senha" para modificá-la.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfilePage;
