/**
 * Função pública `getErrorMessage` do projeto.
 *
 * @param {unknown} error - Parâmetro `error`.
 * @returns {string} Retorna um valor do tipo `string`.
 */
export const getErrorMessage = (error: unknown): string => {
    if (!error) return 'Ocorreu um erro desconhecido.';

    let message = 'Erro desconhecido.';
    if (typeof error === 'string') {
        message = error;
    } else if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'object' && 'message' in error) {
        message = String((error as { message: unknown }).message);
    }

    // Mapas de tradução
    const translations: Record<string, string> = {
        'Invalid login credentials': 'Email ou senha incorretos.',
        'Email not confirmed': 'Por favor, confirme seu email antes de entrar.',
        'User not found': 'Usuário não encontrado.',
        'Password is known to be weak and easy to guess, please choose a different one.': 'A senha é muito fraca. Por favor, escolha uma senha mais forte (use letras maiúsculas, minúsculas e números).',
        'New password should be different from the old password.': 'A nova senha deve ser diferente da senha anterior.',
        'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
        'Token has expired or is invalid': 'O link expirou ou é inválido.',
        'Auth session missing!': 'Sessão expirada. Por favor, faça login novamente.',
        'User already registered': 'Este email já está cadastrado.',
        'Rate limit exceeded': 'Muitas tentativas. Por favor, aguarde um momento.',
    };

    // Verificação exata
    if (translations[message]) {
        return translations[message];
    }

    // Verificações parciais (para mensagens dinâmicas ou variações)
    if (message.includes('weak password')) return 'Sua senha é muito fraca.';
    if (message.includes('already registered')) return 'Este email já está em uso.';
    if (message.includes('invalid login')) return 'Credenciais inválidas.';
    if (message.includes('unexpected error')) return 'Ocorreu um erro inesperado. Tente novamente.';

    // Retorno original se não houver tradução (fallback)
    return message;
};
