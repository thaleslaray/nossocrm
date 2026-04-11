# Agent Handoff + Telegram Notification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um toggle por estágio ("Notificar time quando lead chegar aqui") que faz o agente parar de responder e disparar uma notificação via Telegram para o grupo/canal/usuário configurado.

**Architecture:** Um campo `notify_team` em `stage_ai_config` controla quando o agente faz handoff por estágio, independente de keywords. A notificação é enviada para um bot Telegram configurado em `organization_settings`. O handoff existente (`handleHandoff`) é reutilizado — adicionamos apenas o trigger e o dispatch.

**Tech Stack:** Next.js 15+ App Router, Supabase (PostgreSQL), TypeScript, Telegram Bot API (fetch nativo, sem SDK), Zod, TanStack Query, Radix UI + Tailwind.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `supabase/migrations/20260406150000_agent_handoff_telegram.sql` | Criar | Schema: `notify_team` + campos Telegram |
| `lib/notifications/telegram.ts` | Criar | Client do Telegram Bot API |
| `lib/ai/agent/types.ts` | Modificar | Adicionar `notify_team` ao `StageAIConfig` |
| `lib/ai/agent/agent.service.ts` | Modificar | Trigger handoff quando `notify_team=true` |
| `lib/query/hooks/useStageAIConfigQuery.ts` | Modificar | Incluir `notify_team` na mutation |
| `app/api/settings/ai/route.ts` | Modificar | Schema + handler para campos Telegram |
| `features/settings/components/ai/TelegramNotificationSettings.tsx` | Criar | UI de configuração do bot |
| `features/settings/components/ai/index.ts` | Modificar | Exportar novo componente |
| `features/settings/AICenterSettings.tsx` | Modificar | Renderizar `TelegramNotificationSettings` |
| `features/settings/components/StageAIConfig.tsx` | Modificar | Toggle `notify_team` no modal do estágio |

---

## Task 1: Migration — Schema

**Files:**
- Create: `supabase/migrations/20260406150000_agent_handoff_telegram.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260406150000_agent_handoff_telegram.sql

-- 1. Adicionar notify_team ao stage_ai_config
ALTER TABLE stage_ai_config
  ADD COLUMN IF NOT EXISTS notify_team BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN stage_ai_config.notify_team IS
  'Quando true, o agente faz handoff e notifica o time ao invés de responder';

-- 2. Adicionar campos Telegram ao organization_settings
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

COMMENT ON COLUMN organization_settings.telegram_bot_token IS
  'Token do bot do Telegram para notificações internas (ex: 123456:ABC-DEF...)';
COMMENT ON COLUMN organization_settings.telegram_chat_id IS
  'Chat ID do grupo, canal ou usuário que recebe notificações (ex: -1001234567890 ou @canal)';
```

- [ ] **Step 2: Aplicar a migration**

```bash
npx supabase db push
```

Expected: `Applying migration 20260406150000_agent_handoff_telegram.sql... done`

- [ ] **Step 3: Verificar as colunas no banco**

```bash
source ~/.claude/.env 2>/dev/null; source .env.local 2>/dev/null
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/stage_ai_config?limit=1" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('notify_team' in (list(d[0].keys()) if d else []))"
```

Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260406150000_agent_handoff_telegram.sql
git commit -m "feat(db): add notify_team to stage_ai_config and telegram fields to org settings"
```

---

## Task 2: Telegram Notification Service

**Files:**
- Create: `lib/notifications/telegram.ts`

- [ ] **Step 1: Criar o serviço**

```typescript
// lib/notifications/telegram.ts

/**
 * Envia uma mensagem para um chat do Telegram via Bot API.
 *
 * @param botToken - Token do bot (formato: "123456:ABC-DEF...")
 * @param chatId   - ID do chat, grupo, canal ou @username
 * @param text     - Mensagem em formato HTML simples
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[Telegram] Falha ao enviar notificação:', res.status, body);
    // Não lança erro — falha de notificação não deve interromper o fluxo do agente
  }
}

/**
 * Formata a mensagem de handoff para o Telegram.
 */
export function formatHandoffMessage(params: {
  contactName: string;
  dealTitle: string | undefined;
  stageName: string;
  lastMessage: string;
  appUrl?: string;
  dealId?: string;
}): string {
  const { contactName, dealTitle, stageName, lastMessage, appUrl, dealId } = params;

  const lines: string[] = [
    '🤝 <b>Lead pronto para atendimento</b>',
    '',
    `👤 <b>${contactName}</b>`,
  ];

  if (dealTitle) lines.push(`📋 ${dealTitle}`);
  lines.push(`📍 Estágio: ${stageName}`);
  lines.push(`💬 "${lastMessage.slice(0, 120)}${lastMessage.length > 120 ? '...' : ''}"`);

  if (appUrl && dealId) {
    lines.push('');
    lines.push(`👉 <a href="${appUrl}/deals/${dealId}">Abrir no CRM</a>`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 2: Verificar que compila sem erros**

```bash
npx tsc --noEmit 2>&1 | grep "telegram" | head -10
```

Expected: nenhuma saída (sem erros)

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/telegram.ts
git commit -m "feat(notifications): add Telegram bot notification service"
```

---

## Task 3: TypeScript Types — notify_team

**Files:**
- Modify: `lib/ai/agent/types.ts`
- Modify: `lib/query/hooks/useStageAIConfigQuery.ts`

- [ ] **Step 1: Adicionar `notify_team` ao `StageAIConfig`**

Em `lib/ai/agent/types.ts`, localizar a interface `StageAIConfig` (linha ~13) e adicionar o campo:

```typescript
export interface StageAIConfig {
  id: string;
  organization_id: string;
  board_id: string;
  stage_id: string;
  enabled: boolean;
  notify_team: boolean;        // ← ADICIONAR esta linha
  system_prompt: string;
  stage_goal: string | null;
  advancement_criteria: string[];
  settings: StageAISettings;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Adicionar `notify_team` ao `StageAIConfigInput`**

Em `lib/query/hooks/useStageAIConfigQuery.ts`, localizar `StageAIConfigInput` (linha ~19) e adicionar:

```typescript
export interface StageAIConfigInput {
  board_id: string;
  stage_id: string;
  enabled: boolean;
  notify_team?: boolean;       // ← ADICIONAR esta linha
  system_prompt: string;
  stage_goal?: string;
  advancement_criteria?: string[];
  settings?: Partial<StageAISettings>;
  ai_model?: string;
}
```

- [ ] **Step 3: Incluir `notify_team` no `configData` da mutation**

No mesmo arquivo, dentro de `useUpsertStageAIConfigMutation`, localizar o objeto `configData` (após linha ~120) e adicionar:

```typescript
const configData = {
  organization_id: profile.organization_id,
  board_id: input.board_id,
  stage_id: input.stage_id,
  enabled: input.enabled,
  notify_team: input.notify_team ?? false,   // ← ADICIONAR esta linha
  system_prompt: input.system_prompt,
  stage_goal: input.stage_goal || null,
  advancement_criteria: input.advancement_criteria || [],
  settings: {
    max_messages_per_conversation: 10,
    response_delay_seconds: 5,
    handoff_keywords: ['falar com humano', 'atendente', 'pessoa real'],
    business_hours_only: false,
    ...input.settings,
  },
  ai_model: input.ai_model || null,
};
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | grep -E "types\.ts|useStageAI" | head -10
```

Expected: nenhuma saída

- [ ] **Step 5: Commit**

```bash
git add lib/ai/agent/types.ts lib/query/hooks/useStageAIConfigQuery.ts
git commit -m "feat(types): add notify_team to StageAIConfig and mutation input"
```

---

## Task 4: Agent Service — Handoff por Estágio

**Files:**
- Modify: `lib/ai/agent/agent.service.ts`

O objetivo é: logo após verificar as handoff keywords (passo 7), adicionar um passo 7.5 que verifica `config.notify_team`. Se verdadeiro, chama `handleHandoff` (já existente) E dispara a notificação Telegram.

- [ ] **Step 1: Adicionar import do Telegram no topo do arquivo**

Localizar os imports existentes (primeiras linhas do arquivo) e adicionar:

```typescript
import { sendTelegramMessage, formatHandoffMessage } from '@/lib/notifications/telegram';
```

- [ ] **Step 2: Adicionar o passo 7.5 no fluxo principal**

Localizar o bloco do passo 7 (handoff keywords, linha ~395-410). Após o `if (handoffKeyword)` block (que termina com `}`), adicionar:

```typescript
  // 7.5. Verificar handoff por estágio (notify_team)
  if (config.notify_team) {
    const handoffResult = await handleHandoff(
      supabase,
      conversationId,
      organizationId,
      context,
      `Estágio "${context.currentStage?.name ?? 'atual'}" configurado para atendimento humano`
    );

    // Disparar notificação Telegram se configurado
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('telegram_bot_token, telegram_chat_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (orgSettings?.telegram_bot_token && orgSettings?.telegram_chat_id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      const message = formatHandoffMessage({
        contactName: context.contact?.name ?? 'Lead',
        dealTitle: context.deal?.title,
        stageName: context.currentStage?.name ?? 'Desconhecido',
        lastMessage: incomingMessage,
        appUrl,
        dealId: context.deal?.id,
      });

      await sendTelegramMessage(
        orgSettings.telegram_bot_token,
        orgSettings.telegram_chat_id,
        message
      );
    }

    return { success: true, decision: handoffResult };
  }
```

- [ ] **Step 3: Verificar que `context.currentStage` existe no tipo de contexto**

```bash
grep -n "currentStage\|ConversationContext" lib/ai/agent/agent.service.ts | head -10
```

Se `currentStage` não existir no contexto, checar qual é o campo correto com:

```bash
grep -n "interface.*Context\|stage.*name\|stageName" lib/ai/agent/agent.service.ts | head -15
```

Adaptar o `context.currentStage?.name` para o campo correto (pode ser `context.stage?.name` ou similar).

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "agent.service" | head -10
```

Expected: nenhuma saída

- [ ] **Step 5: Commit**

```bash
git add lib/ai/agent/agent.service.ts
git commit -m "feat(agent): trigger handoff + Telegram notification when notify_team=true"
```

---

## Task 5: Settings API — Campos Telegram

**Files:**
- Modify: `app/api/settings/ai/route.ts`

- [ ] **Step 1: Adicionar campos Telegram ao Zod schema**

Localizar `UpdateOrgAISettingsSchema` (linha ~17). Substituir o `.strict()` final pela versão com campos Telegram:

```typescript
const UpdateOrgAISettingsSchema = z
  .object({
    aiEnabled: z.boolean().optional(),
    aiProvider: z.enum(['google', 'openai', 'anthropic']).optional(),
    aiModel: z.string().min(1).max(200).optional(),
    aiGoogleKey: z.string().optional(),
    aiOpenaiKey: z.string().optional(),
    aiAnthropicKey: z.string().optional(),
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
  })
  .strict();
```

- [ ] **Step 2: Adicionar handler dos campos Telegram no POST**

Localizar o bloco de mapeamento de campos (após linha ~156, onde estão os `if (updates.aiEnabled !== undefined)`). Adicionar após os campos existentes:

```typescript
  const telegramBotToken = normalizeKey(updates.telegramBotToken);
  if (telegramBotToken !== undefined) dbUpdates.telegram_bot_token = telegramBotToken;

  const telegramChatId = normalizeKey(updates.telegramChatId);
  if (telegramChatId !== undefined) dbUpdates.telegram_chat_id = telegramChatId;
```

- [ ] **Step 3: Expor campos Telegram no GET**

Localizar o bloco onde o GET monta a resposta (procurar por `return json({` no handler GET). Adicionar os campos à resposta:

```typescript
return json({
  // ... campos existentes ...
  telegramBotToken: orgSettings?.telegram_bot_token ? '••••••••' : null,  // mascarar
  telegramChatId: orgSettings?.telegram_chat_id ?? null,
  hasTelegramBot: !!orgSettings?.telegram_bot_token,
});
```

> **Nota**: O token é mascarado no GET igual às API keys — nunca retornar o valor real.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "settings/ai/route" | head -10
```

Expected: nenhuma saída

- [ ] **Step 5: Commit**

```bash
git add app/api/settings/ai/route.ts
git commit -m "feat(api): add telegram bot token and chat ID to AI settings endpoint"
```

---

## Task 6: UI — TelegramNotificationSettings Component

**Files:**
- Create: `features/settings/components/ai/TelegramNotificationSettings.tsx`
- Modify: `features/settings/components/ai/index.ts`

- [ ] **Step 1: Criar o componente**

```typescript
// features/settings/components/ai/TelegramNotificationSettings.tsx
'use client';

import { useState } from 'react';
import { MessageCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAISettingsQuery } from '@/lib/query/hooks/useAIConfigQuery';

export function TelegramNotificationSettings() {
  const { data: settings, isLoading } = useAISettingsQuery();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasTelegramBot = settings?.hasTelegramBot ?? false;

  const handleSave = async () => {
    if (!chatId.trim()) return;
    setIsSaving(true);
    setSaved(false);

    try {
      const body: Record<string, string> = { telegramChatId: chatId.trim() };
      if (botToken.trim()) body.telegramBotToken = botToken.trim();

      await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setSaved(true);
      setBotToken('');
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
          <MessageCircle size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Notificações via Telegram
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            O agente avisa o time quando um lead precisa de atenção.
          </p>
        </div>
        {hasTelegramBot && (
          <span className="ml-auto text-xs bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
            Configurado
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="telegram-token" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Token do Bot
          </Label>
          <Input
            id="telegram-token"
            type="password"
            placeholder={hasTelegramBot ? '••••••••' : 'Cole o token do BotFather'}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            className="text-sm"
            autoComplete="off"
          />
          <p className="text-xs text-slate-400">
            Crie um bot no{' '}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              @BotFather
            </a>{' '}
            e cole o token aqui.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="telegram-chat-id" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Chat ID
          </Label>
          <Input
            id="telegram-chat-id"
            type="text"
            placeholder="Ex: -1001234567890 ou @meucanal"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="text-sm"
          />
          <p className="text-xs text-slate-400">
            ID do grupo, canal ou usuário que vai receber as notificações.
          </p>
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || (!botToken.trim() && !chatId.trim())}
          className="w-full"
        >
          {isSaving ? (
            <Loader2 size={14} className="animate-spin mr-2" />
          ) : saved ? (
            <Check size={14} className="mr-2" />
          ) : null}
          {saved ? 'Salvo!' : 'Salvar configuração'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Exportar no index.ts**

Em `features/settings/components/ai/index.ts`, adicionar:

```typescript
export { TelegramNotificationSettings } from './TelegramNotificationSettings';
```

- [ ] **Step 3: Verificar que o `useAISettingsQuery` expõe `hasTelegramBot`**

```bash
grep -n "hasTelegramBot\|telegramChat\|telegram" lib/query/hooks/useAIConfigQuery.ts | head -10
```

Se não existir, adicionar o campo ao hook. Localizar onde o hook mapeia a resposta da API e adicionar:

```typescript
hasTelegramBot: data?.hasTelegramBot ?? false,
telegramChatId: data?.telegramChatId ?? null,
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "TelegramNotification\|AICenterSettings" | head -10
```

Expected: nenhuma saída

- [ ] **Step 5: Commit**

```bash
git add features/settings/components/ai/TelegramNotificationSettings.tsx \
        features/settings/components/ai/index.ts
git commit -m "feat(ui): add TelegramNotificationSettings component"
```

---

## Task 7: Settings Page — Renderizar TelegramNotificationSettings

**Files:**
- Modify: `features/settings/AICenterSettings.tsx`

- [ ] **Step 1: Importar o novo componente**

No topo de `features/settings/AICenterSettings.tsx`, adicionar ao import existente de `./components/ai`:

```typescript
import { AIAgentConfigSection, TelegramNotificationSettings } from './components/ai';
```

- [ ] **Step 2: Renderizar na página**

Dentro do `return` do componente, após `<AIAgentConfigSection />`, adicionar:

```tsx
<TelegramNotificationSettings />
```

- [ ] **Step 3: Verificar visualmente**

```bash
# O servidor deve estar rodando na porta 3000
open http://localhost:3000/settings
```

Navegar para a aba de AI. O card "Notificações via Telegram" deve aparecer abaixo da seção do agente.

- [ ] **Step 4: Commit**

```bash
git add features/settings/AICenterSettings.tsx
git commit -m "feat(ui): render TelegramNotificationSettings in AI settings page"
```

---

## Task 8: UI — Toggle notify_team no StageEditorModal

**Files:**
- Modify: `features/settings/components/StageAIConfig.tsx`

Este é o modal que abre quando o usuário clica em configurar um estágio específico. Precisamos adicionar o toggle `notify_team`.

- [ ] **Step 1: Adicionar `notify_team` ao state do modal**

Localizar `StageEditorModal` (componente interno, linha ~440). O componente tem `onSave` que recebe `{ system_prompt, stage_goal?, advancement_criteria? }`. Precisamos:

1. Adicionar `notify_team` ao estado local:

```typescript
const [notifyTeam, setNotifyTeam] = useState(config?.notify_team ?? false);
```

2. Incluir no `isDirty`:

```typescript
const isDirty =
  prompt !== (config?.system_prompt || '') ||
  goal !== (config?.stage_goal || '') ||
  criteria !== (config?.advancement_criteria?.join('\n') || '') ||
  notifyTeam !== (config?.notify_team ?? false);  // ← ADICIONAR
```

- [ ] **Step 2: Atualizar o `handleSave` para incluir `notify_team`**

Localizar `handleSave` dentro do modal (linha ~498):

```typescript
const handleSave = () => {
  onSave({
    system_prompt: prompt,
    stage_goal: goal || undefined,
    advancement_criteria: criteria.split('\n').filter(Boolean),
    notify_team: notifyTeam,   // ← ADICIONAR
  });
};
```

- [ ] **Step 3: Atualizar o tipo de `onSave`**

Localizar a prop `onSave` do modal (linha ~444):

```typescript
onSave: (data: {
  system_prompt: string;
  stage_goal?: string;
  advancement_criteria?: string[];
  notify_team?: boolean;   // ← ADICIONAR
}) => void;
```

- [ ] **Step 4: Adicionar o toggle no JSX do modal**

Localizar a área de conteúdo do modal (após o textarea de prompt e antes dos botões de ação). Adicionar o toggle de handoff:

```tsx
{/* Toggle: Notificar time */}
<div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
  <div>
    <p className="text-sm font-medium text-slate-900 dark:text-white">
      Notificar time quando lead chegar aqui
    </p>
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
      O agente para de responder e avisa o time via Telegram.
    </p>
  </div>
  <Switch
    checked={notifyTeam}
    onCheckedChange={setNotifyTeam}
  />
</div>
```

Adicionar o import do `Switch` se não existir:

```typescript
import { Switch } from '@/components/ui/switch';
```

- [ ] **Step 5: Atualizar `handleSaveConfig` no componente pai**

Localizar `handleSaveConfig` (linha ~94) e garantir que `notify_team` é passado para a mutation:

```typescript
const handleSaveConfig = (stageId: string, data: {
  system_prompt: string;
  stage_goal?: string;
  advancement_criteria?: string[];
  notify_team?: boolean;   // ← ADICIONAR ao tipo
}) => {
  const config = configMap.get(stageId);
  upsertMutation.mutate({
    board_id: boardId,
    stage_id: stageId,
    enabled: config?.enabled ?? false,
    ...data,
  });
};
```

- [ ] **Step 6: Typecheck completo**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: nenhuma saída (zero erros)

- [ ] **Step 7: Rodar testes**

```bash
npx vitest run --reporter=dot 2>&1 | tail -10
```

Expected: todos os testes passando

- [ ] **Step 8: Commit final**

```bash
git add features/settings/components/StageAIConfig.tsx
git commit -m "feat(ui): add notify_team toggle to stage AI config modal"
```

---

## Task 9: Variável de Ambiente — APP_URL

**Files:**
- Modify: `.env.local` (se necessário)

O `formatHandoffMessage` usa `process.env.NEXT_PUBLIC_APP_URL` para montar o link no Telegram.

- [ ] **Step 1: Verificar se a variável existe**

```bash
grep "NEXT_PUBLIC_APP_URL" .env.local .env 2>/dev/null
```

- [ ] **Step 2: Adicionar se não existir**

Em `.env.local`:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Em produção (Vercel), configurar `NEXT_PUBLIC_APP_URL=https://seu-dominio.com.br`.

- [ ] **Step 3: Commit se .env.example existir**

```bash
# Só adicionar ao .env.example, nunca ao .env.local (já está no .gitignore)
echo "NEXT_PUBLIC_APP_URL=" >> .env.example
git add .env.example
git commit -m "chore: document NEXT_PUBLIC_APP_URL env var"
```

---

## Verificação End-to-End

Após todas as tasks:

```
1. Abrir Settings → AI
   ✓ Card "Notificações via Telegram" aparece
   ✓ Campos de token e chat ID funcionam
   ✓ Salvar persiste no banco

2. Abrir Settings → Pipeline → [qualquer board]
   ✓ No modal de um estágio, o toggle "Notificar time" aparece
   ✓ Ativar e salvar persiste no banco

3. Simular com MCP:
   crm.ai.simulate.run_conversation({
     messages: ["Olá, tenho interesse", "sou diretor"],
     stageId: "<ID do estágio com notify_team=true>"
   })
   ✓ action: "handoff" no resultado
   ✓ Mensagem aparece no Telegram configurado

4. Typecheck + testes:
   npx tsc --noEmit
   npx vitest run --reporter=dot
```
