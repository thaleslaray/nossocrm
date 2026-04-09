# Guia de Valores Exatos dos Campos — Isa CRM

Use APENAS os valores listados abaixo. Nunca invente variações.

## CATEGORIA DA VIAGEM (categoria_viagem)

Valores aceitos:
- `economica` → custo-benefício, voos simples, hotéis funcionais
- `intermediaria` → conforto e qualidade equilibrados
- `premium` → luxo, experiência exclusiva, voos executivos, resorts top

Exemplos de mapeamento:
- "Econômico" ou "Barato" → `economica`
- "Intermediário", "Conforto", "Standard" → `intermediaria`
- "Premium", "Luxo", "VIP", "Executivo" → `premium`
- Não respondeu → não preencha, pergunte novamente

## URGÊNCIA (urgencia)

Valores aceitos:
- `imediato` → próximos 30 dias
- `curto_prazo` → 1 a 3 meses
- `medio_prazo` → 3 a 6 meses
- `planejando` → mais de 6 meses, sem pressa

Exemplos:
- "Urgente", "Já", "Este mês", "Alta urgência" → `imediato`
- "Em breve", "1 mês", "2 meses", "3 meses" → `curto_prazo`
- "4 a 6 meses", "Médio prazo" → `medio_prazo`
- "Só pesquisando", "Sem pressa", "Ano que vem" → `planejando`

## ORIGEM DO LEAD (origem_lead)

Valores aceitos:
- `instagram` / `facebook` / `google` / `site` / `whatsapp`
- `indicacao` → perguntar nome → salvar em `indicado_por`
- `outro` → widget, bot, chat, não sabe

Exemplos:
- "Vi no Instagram" → `instagram`
- "Amigo me indicou" → `indicacao` + perguntar nome
- "Pesquisei no Google" → `google`
- "Não sei" → `outro`
