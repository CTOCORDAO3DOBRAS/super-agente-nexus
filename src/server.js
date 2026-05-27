import 'dotenv/config';
import express from 'express';
import { handleWhatsAppWebhook } from './channels/whatsapp.js';
import { handleInstagramWebhook } from './channels/instagram.js';
import { handleEmailWebhook } from './channels/email.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Rota de verificação de saúde — usada pelo Render para monitorar o serviço
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'Nexus', timestamp: new Date().toISOString() });
});

// Webhook Z-API: recebe mensagens do WhatsApp
app.post('/webhook/whatsapp', handleWhatsAppWebhook);

// Webhook Meta: verificação (GET) e mensagens do Instagram (POST)
app.get('/webhook/instagram', handleInstagramWebhook);
app.post('/webhook/instagram', handleInstagramWebhook);

// Webhook de email inbound via Resend
app.post('/webhook/email', handleEmailWebhook);

app.listen(PORT, () => {
  console.log(`[Nexus] Servidor rodando na porta ${PORT}`);
});
