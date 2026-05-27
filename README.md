# Super Agente Nexus

Agente de IA para funil de vendas de produtos digitais via WhatsApp, Instagram e Email.

## Stack

- **Runtime**: Node.js 20+ (ES Modules)
- **IA**: Claude Sonnet 4.6 via `@anthropic-ai/sdk` (com prompt caching)
- **Banco de dados**: Supabase (PostgreSQL)
- **WhatsApp**: Z-API
- **Instagram**: Meta Webhooks API
- **Email**: Resend

## Funil de Vendas

```
QUALIFICACAO → OFERTA → POS_VENDA
```

O agente Nexus detecta automaticamente quando avançar o lead para o próximo estágio com base no contexto da conversa.

## Configuração local

1. Clone o repositório
2. Copie o arquivo de variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```
3. Preencha todas as variáveis no `.env`
4. Execute o SQL de setup no Supabase:
   - Acesse o SQL Editor do seu projeto Supabase
   - Cole e execute o conteúdo de `supabase_setup.sql`
5. Instale as dependências e inicie:
   ```bash
   npm install
   npm start
   ```

## Deploy no Render.com

### Passo a passo

1. Crie uma conta em [render.com](https://render.com) se ainda não tiver.

2. No Dashboard, clique em **New → Web Service**.

3. Conecte seu repositório Git (GitHub, GitLab ou Bitbucket).

4. Configure o serviço:
   | Campo | Valor |
   |-------|-------|
   | **Name** | `super-agente-nexus` |
   | **Region** | Mais próxima dos seus usuários |
   | **Branch** | `main` |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `node src/server.js` |
   | **Plan** | Free (ou Starter para produção) |

5. Em **Environment Variables**, adicione todas as variáveis do `.env.example` com seus valores reais.

6. Clique em **Create Web Service**. O Render fará o deploy automaticamente.

7. A URL do serviço será algo como `https://super-agente-nexus.onrender.com`. Use-a para configurar os webhooks.

### Configuração dos Webhooks

**WhatsApp (Z-API):**
- No painel Z-API, configure o Webhook URL como:
  `https://seu-app.onrender.com/webhook/whatsapp`

**Instagram (Meta for Developers):**
- No [Meta Developers](https://developers.facebook.com), vá em seu App → Webhooks
- Callback URL: `https://seu-app.onrender.com/webhook/instagram`
- Verify Token: o mesmo valor de `META_VERIFY_TOKEN` no seu `.env`
- Assine os campos: `messages`, `messaging_postbacks`

**Email (Resend Inbound):**
- No painel Resend, configure o Inbound Webhook URL como:
  `https://seu-app.onrender.com/webhook/email`

### Health Check

O Render usa o endpoint `/health` para monitorar o serviço:
```
GET https://seu-app.onrender.com/health
```

## Estrutura do Projeto

```
src/
├── server.js          # Express + rotas de webhook
├── agents/
│   └── nexus.js       # Lógica do agente (Claude + funil)
├── channels/
│   ├── whatsapp.js    # Handler Z-API
│   ├── instagram.js   # Handler Meta
│   └── email.js       # Handler Resend
└── db/
    └── supabase.js    # Acesso ao banco de dados
supabase_setup.sql     # DDL para criar as tabelas
.env.example           # Variáveis de ambiente necessárias
```

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic |
| `ZAPI_INSTANCE` | ID da instância Z-API |
| `ZAPI_TOKEN` | Token da instância Z-API |
| `ZAPI_CLIENT_TOKEN` | Client-Token da Z-API |
| `META_VERIFY_TOKEN` | Token de verificação do webhook Meta |
| `META_ACCESS_TOKEN` | Token de acesso da API Meta (Page/Instagram) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | Service Role Key do Supabase |
| `RESEND_API_KEY` | Chave da API Resend |
| `PORT` | Porta do servidor (padrão: 3000) |
