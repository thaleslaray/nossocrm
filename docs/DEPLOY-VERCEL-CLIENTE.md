# 🚀 Guia de Deploy na Vercel - NossoCRM

> **Para:** Kleber Yascom  
> **Projeto:** NossoCRM - CRM Inteligente para Agência de Viagens  
> **Data:** Março 2026  
> **Status:** ✅ Pronto para produção

---

## 📋 Resumo Executivo

| Item | Status | URL |
|------|--------|-----|
| **Repositório GitHub** | ✅ Pronto | `kleberyascom/nossocrm` |
| **Edge Function (Webhook)** | ✅ Em produção | Supabase |
| **Banco de Dados** | ✅ Configurado | Supabase |
| **Frontend (Vercel)** | ⏳ Pendente | Aguardando conexão |

---

## 🎯 O Que Você Precisa Fazer

### Passo 1: Conectar GitHub à Vercel (10 minutos)

1. **Acesse a Vercel**
   ```
   https://vercel.com/new
   ```

2. **Importe o repositório**
   - Clique em **"Import Git Repository"**
   - Selecione: `kleberyascom/nossocrm`
   - Se não aparecer, clique em **"Adjust GitHub App Permissions"**

3. **Configure o projeto**
   - **Framework Preset:** Next.js (detectado automaticamente)
   - **Root Directory:** `./` (padrão)
   - **Build Command:** `npm run build` (já preenchido)
   - **Output Directory:** `.next` (já preenchido)

4. **Clique em "Deploy"**
   - Aguarde 2-3 minutos
   - Quando concluir, você verá: "Congratulations! Your deployment has been created"

---

### Passo 2: Configurar Variáveis de Ambiente

Na Vercel, vá em **Settings → Environment Variables** e adicione:

| Nome | Valor | Onde Obter |
|------|-------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://drgsnhbtucwocpeiwdth.supabase.co` | Copiar do Dashboard Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (chave anon) | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | (chave service_role) | Supabase → Settings → API |
| `DEFAULT_ORGANIZATION_ID` | `4e72d64a-a457-45cb-b1ac-ee7d548ec584` | Já configurado |

**Como obter as chaves do Supabase:**

```
1. Acesse: https://supabase.com/dashboard/project/drgsnhbtucwocpeiwdth
2. Vá em: Settings (⚙️) → API
3. Copie as chaves:
   - Project URL
   - anon public
   - service_role (secret) ⚠️
```

**Na Vercel:**

```
Settings → Environment Variables → Add New
→ Cole cada variável
→ Marque: Production, Preview, Development
→ Save
```

---

### Passo 3: Redeploy (Após Variáveis)

Após adicionar as variáveis:

```
1. Vá em: Deployments
2. Clique nos 3 pontinhos (...) no deploy mais recente
3. Clique em: "Redeploy"
4. Aguarde 2-3 minutos
```

---

## ✅ Validação Pós-Deploy

### Teste 1: Acessar o CRM

```
URL: https://SEU-PROJETO.vercel.app
```

**Deve carregar:**
- ✅ Página de login
- ✅ Sem erros no console (F12)

---

### Teste 2: Webhook de Leads

```bash
curl -X POST 'https://drgsnhbtucwocpeiwdth.supabase.co/functions/v1/gptmaker-in' \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "Teste Deploy Vercel",
    "contato": "teste@vercel.com",
    "destino": "Fernando de Noronha",
    "data_ida": "2026-12-01",
    "data_volta": "2026-12-10",
    "urgencia": "Alta",
    "orcamento_categoria": "Premium",
    "pipeline": "Captação Viagens"
  }'
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "Lead criado com sucesso",
  "classification": {
    "classificacao": "Quente",
    "stage_label": "Lead Quente"
  },
  "deal": { /* ... */ },
  "contact": { /* ... */ }
}
```

---

## 🔗 URLs Importantes

| Serviço | URL |
|---------|-----|
| **Vercel Dashboard** | `https://vercel.com/dashboard` |
| **Supabase Dashboard** | `https://supabase.com/dashboard/project/drgsnhbtucwocpeiwdth` |
| **GitHub Repository** | `https://github.com/kleberyascom/nossocrm` |
| **Edge Function** | `https://drgsnhbtucwocpeiwdth.supabase.co/functions/v1/gptmaker-in` |

---

## 🆘 Solução de Problemas

### Erro: "Build Failed"

**Causa:** Variáveis de ambiente faltando

**Solução:**
```
1. Vercel → Settings → Environment Variables
2. Verifique se todas 4 variáveis estão presentes
3. Redeploy
```

---

### Erro: "Organization ID inválido"

**Causa:** Variável `DEFAULT_ORGANIZATION_ID` incorreta

**Solução:**
```
Verifique o valor exato:
4e72d64a-a457-45cb-b1ac-ee7d548ec584
```

---

### Erro: "Board não encontrado"

**Causa:** Board "Captação Viagens" não existe no banco

**Solução:**
```
O board já foi criado em produção.
Se o erro persistir, verifique no Supabase Dashboard:
Table Editor → boards → "Captação Viagens" deve existir
```

---

## 📞 Suporte

**Dúvidas técnicas?**

- **Documentação Completa:** `/README.md` no repositório
- **Edge Function:** `supabase/functions/gptmaker-in/index.ts`
- **Webhook Tests:** 10 testes cobrindo todos os cenários

---

## ✅ Checklist Final

- [ ] Vercel conectada ao GitHub
- [ ] 4 variáveis de ambiente configuradas
- [ ] Redeploy realizado
- [ ] Login funcionando
- [ ] Webhook testado
- [ ] Lead aparecendo no CRM

---

**Tempo estimado:** 15-20 minutos  
**Dificuldade:** Fácil (não requer programação)

---

*Documento gerado em: Março 2026*  
*Projeto: NossoCRM v1.0*
