# DigMenu — SaaS Multiempresa de Cardápios Digitais e Operação de Restaurantes

O **DigMenu** é um SaaS multiempresa para restaurantes brasileiros com assinatura exclusivamente anual (ciclo único de 12 meses), painel administrativo isolado por loja, cardápio público mobile-first (`/m/[slug]`), pedidos por mesa com QR Code (`?mesa=codigo`), cozinha ao vivo (KDS), atendimento de garçom, PDV com controle de caixa e envio de pedidos conferidos no servidor para o WhatsApp.

## Principais Funcionalidades

- **Cardápio Público Mobile-First (`/m/[slug]` e `/m/[slug]?mesa=[codigo]`)**:
  - Produtos com fotos (URL ou upload local), categorias, descrição, **tamanhos/variações** (`sizes`) e **adicionais** (`addons`).
  - Modalidades configuráveis por loja: **Entrega por bairros**, **Retirada**, **Na mesa** e **Balcão**.
  - Cálculo de subtotal, variações, adicionais e taxa de entrega **conferido no servidor** (proteção contra adulteração e divergência de preço `409 CATALOG_CHANGED`).
  - Geração automática de resumo formatado + link `wa.me` para o WhatsApp da loja e atualização imediata na Cozinha (KDS).
- **Operação Completa no Painel (`/painel`)**:
  - **Cozinha (KDS) (`/painel/cozinha`)**: fila em tempo real via WebSockets (`/ws`) com 6 estados (`novo`, `aceito`, `em_preparo`, `pronto`, `concluido`, `cancelado`), cronômetro de espera, campainha sonora via Web Audio API com controle explícito do operador e impressão de comanda térmica (80mm).
  - **Garçom / Mesas (`/painel/garcom`)**: grade de mesas e comandas, seleção de tamanhos/adicionais, envio direto à cozinha e atalho de fechamento no PDV.
  - **PDV e Caixa (`/painel/pdv`)**: abertura e fechamento de caixa com conferência de diferença, suprimentos/sangrias, recebimento de pedidos (Dinheiro com cálculo automático de troco, Pix, Cartão de Crédito e Débito) e venda rápida.
  - **Relatórios Reais (`/painel/relatorios`)**: faturamento bruto, recebido no caixa, ticket médio, ranking de produtos, modalidades, formas de pagamento, série diária e exportação CSV calculados 100% sobre os registros SQLite da loja.
  - **Mesas, QR Codes e Equipe (`/painel/configuracoes`)**: QR Code individual por mesa, placa imprimível, horários com virada da meia-noite e controle de equipe por função (`owner`, `manager`, `kitchen`, `waiter`, `cashier`).
- **Administração da Plataforma (`/admin`) e Recuperação de Senha (`/recuperar-senha`)**:
  - Console administrativo restrito por `PLATFORM_ADMIN_EMAILS` para listar lojas, métricas operacionais e bloquear/desbloquear lojas.
  - Fluxo de recuperação de senha com tokens temporários com hash SHA-256 no banco.

## Impressão Térmica (80mm) vs. Ponte Local ESC/POS

- A impressão de **comandas de cozinha** e **cupons do PDV** utiliza layout otimizado para bobina **80mm** via diálogo de impressão nativo do navegador (iframe oculto de impressão, compatível com impressoras térmicas instaladas no sistema operacional).
- Impressão silenciosa direta via protocolo bruto **ESC/POS** (USB/Rede sem caixa de diálogo) requer uma ponte local opcional instalada na máquina do caixa (como QZ Tray ou serviço local equivalente), não sendo executada diretamente pelo navegador por restrições de segurança web.

## Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste conforme necessário:

- `PORT`: Porta do servidor Express + Vite (padrão `3000`).
- `APP_URL`: URL pública da aplicação (usada em links de retorno e compartilhamento).
- `DATABASE_PATH`: Caminho do arquivo SQLite isolado (padrão `./data/digmenu_preview.db`).
- `SESSION_SECRET`: Segredo usado na assinatura de tokens de sessão e OAuth no servidor.
- `ANNUAL_PLAN_PRICE_CENTS`: Valor anual em centavos (ex.: `49900` para `R$ 499,00/ano`). Deixe vazio ou `0` enquanto o preço definitivo estiver em definição.
- `MERCADOPAGO_ACCESS_TOKEN`: Token **de teste** (`TEST-...`) ou **de produção** (`APP_USR-...`) do Mercado Pago. Sem ele, o checkout real fica indisponível e exibe as variáveis pendentes.
- `MERCADOPAGO_ALLOW_LIVE`: Defina `true` para autorizar credenciais `APP_USR-...` em produção.
- `MERCADOPAGO_WEBHOOK_SECRET`: Segredo para validação HMAC-SHA256 dos webhooks do Mercado Pago (obrigatório em produção).
- `MERCADOPAGO_PREAPPROVAL_PLAN_ID`: ID opcional do plano anual no Mercado Pago.
- `ENABLE_SUBSCRIPTION_SIMULATOR`: Em desenvolvimento fica ativo por padrão; em produção (`NODE_ENV=production`) fica desativado por segurança, a menos que definido explicitamente como `true`.
- `PLATFORM_ADMIN_EMAILS`: Lista separada por vírgula dos e-mails autorizados a acessar `/admin` e `/api/admin/*`.
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`: Credenciais do Google OAuth 2.0 (Web). Sem elas, o sistema exibe o fluxo de **Login com Google na Prévia** em desenvolvimento.

## Banco de Dados e Migrações

O servidor usa SQLite embarcado (`node:sqlite`) com chaves estrangeiras ativadas (`PRAGMA foreign_keys = ON`) e migrações versionadas executadas automaticamente na inicialização (`server/db.ts`).

Entidades modeladas com separação entre lojas e clientes individuais:
- **Lojas, Equipe e Recuperação**: `users`, `sessions`, `password_reset_tokens`, `stores`, `user_store_memberships` (com papéis `owner`, `manager`, `kitchen`, `waiter`, `cashier`)
- **Clientes Individuais (isolados do painel de lojistas)**: `customer_accounts`, `customer_sessions`
- **Catálogo, Mesas e Regras**: `categories`, `products` (com `sizes_json` e `addons_json`), `store_tables`, `store_hours`, `delivery_neighborhoods`
- **Pedidos, Caixa e Assinatura**: `orders`, `order_items` (com snapshot de tamanho/adicionais), `cash_registers`, `cash_movements`, `subscriptions`, `payment_events`

## Comandos de Execução e Teste

```bash
# Instalar dependências
npm install

# Popular manualmente o banco de demonstração
npm run db:seed

# Rodar servidor de desenvolvimento (Express + Vite + WebSocket) na porta 3000
npm run dev

# Executar testes automatizados (isolamento multiempresa, variações, KDS, PDV/caixa, relatórios e WS)
npm test

# Verificação de tipos e build de produção
npm run lint
npm run build
```

## Contas de Demonstração na Prévia

- **Lojista — Forno Napolitano** (`/m/forno-napolitano`): `marco@fornonapolitano.demo` / `demo1234`
- **Lojista — Praça Smash Burger** (`/m/praca-smash`): `lucas@pracasmash.demo` / `demo1234`
- **Cliente Individual — Camila Ferreira**: `camila@cliente.demo` / `demo1234`
- **Cliente Individual — Rafael Mendes**: `rafael@cliente.demo` / `demo1234`

## Atribuição de Referência e Licença (MIT)

O DigMenu preserva integralmente sua arquitetura e identidade próprias, adaptando fluxos operacionais inspirados em [roshanx0/restaurant-ordering-saas](https://github.com/roshanx0/restaurant-ordering-saas) (licenciado sob a **MIT License**), incluindo o modelo de painel multiempresa operacional (KDS de cozinha, atendimento de garçom, mesas com QR Code, variações/adicionais e PDV com caixa).
