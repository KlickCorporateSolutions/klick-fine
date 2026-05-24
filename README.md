# Klick FINE

Plataforma SaaS multi-tenant para intermediários de crédito compararem propostas de crédito habitação (FINEs) extraídas automaticamente dos PDFs dos bancos portugueses.

## Stack

- **Frontend**: React 19 + Vite 6 + TypeScript 5.8 + Tailwind CSS 3 + shadcn/ui
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **AI**: Claude (Anthropic) via edge function — Haiku 4.5 (texto) + Sonnet 4.6 (vision)
- **PDF**: pdfjs-dist (extração client-side)
- **Deploy**: Vercel

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar template de env e preencher
cp .env.example .env.local
# Edita .env.local com URL e anon key do teu projeto Supabase

# 3. Correr em dev
npm run dev
```

## Estrutura

```
src/
├── components/       # Componentes UI (shadcn) + layout + features
├── pages/            # Rotas (auth, dashboard, processos, settings)
├── contexts/         # Providers React (auth, organização, branding)
├── hooks/            # Hooks customizados
├── lib/              # Utilitários, cliente Supabase, env
└── types/            # Types TypeScript
supabase/
├── migrations/       # Schema SQL versionado
└── functions/        # Edge functions Deno (analyze-fine)
```

## Roadmap

- [x] Fase 0 — Fundações (scaffold + schema multi-tenant + auth setup)
- [ ] Fase 1 — Multi-tenancy + Auth (signup, login, criar org, convidar membros)
- [ ] Fase 2 — Persistência + extração FINE portada do v1
- [ ] Fase 3 — White-label visual (branding por tenant + demo space Klick)
- [ ] Fase 4 — Sales-ready (onboarding, landing, pricing)

## Licença

Propriedade da Klick Corporate Solutions. Todos os direitos reservados.
