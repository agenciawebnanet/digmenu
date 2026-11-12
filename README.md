# DigMenu — SaaS Multiempresa de Cardápios Digitais (Prévia Isolada)

O **DigMenu** é um SaaS multiempresa para restaurantes brasileiros com assinatura exclusivamente anual, painel administrativo isolado por loja, cardápio público mobile-first (`/m/[slug]`), entrega por bairros, cálculo de horários (incluindo virada da meia-noite) e envio de pedidos conferidos no servidor para o WhatsApp.

## Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste conforme necessário:

- `PORT`: Porta do servidor Express + Vite (padrão `3000`).
- `APP_URL`: URL pública da aplicação (usada em links de retorno e compartilhamento).
- `DATABASE_PATH`: Caminho do arquivo SQLite isolado da prévia (padrão `./data/digmenu_preview.db`).
- `SESSION_SECRET`: Segredo usado na assinatura de tokens de sessão no servidor.
- `ANNUAL_PLAN_PRICE_CENTS`: Valor anual em centavos (ex.: `49900` para `R$ 499,00/ano`). Deixe vazio ou `0` enquanto o preço definitivo estiver em definição.
- `MERCADOPAGO_ACCESS_TOKEN`: Token **de teste** (`TEST-...`) do Mercado Pago. Sem ele, o sistema opera automaticamente com o **Simulador da Prévia** sem cobranças reais.
- `MERCADOPAGO_WEBHOOK_SECRET`: Segredo para validação HMAC-SHA256 dos webhooks do Mercado Pago.
- `MERCADOPAGO_PREAPPROVAL_PLAN_ID`: ID opcional do plano anual no Mercado Pago.

## Banco de Dados e Migrações

O servidor usa SQLite embarcado (`node:sqlite`) com chaves estrangeiras ativadas (`PRAGMA foreign_keys = ON`) e migrações versionadas executadas automaticamente na inicialização (`server/db.ts`).

Entidades modeladas:
- `users`, `sessions`, `stores`, `user_store_memberships`
- `categories`, `products` (preços em `price_cents`)
- `store_hours`, `delivery_neighborhoods`
- `orders`, `order_items` (com snapshot de nome/preço e chave de idempotência)
- `subscriptions`, `payment_events`

Para popular manualmente o banco da prévia com as lojas de demonstração:

```bash
npm run db:seed
```

## Comandos de Execução e Teste

```bash
# Instalar dependências
npm install

# Rodar servidor de desenvolvimento (Express + Vite) na porta 3000
npm run dev

# Executar testes automatizados de isolamento, pedidos, horários e assinatura anual
npm test

# Verificação de tipos e build de produção
npm run lint
npm run build
```

## Contas de Demonstração na Prévia

- **Forno Napolitano** (`/m/forno-napolitano`): `marco@fornonapolitano.demo` / `demo1234`
- **Praça Smash Burger** (`/m/praca-smash`): `lucas@pracasmash.demo` / `demo1234`
