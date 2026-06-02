import axios from 'axios';
import { processMessage } from '../agents/nexus.js';

const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}`;

/**
 * Envia uma mensagem de texto pelo WhatsApp via Z-API.
 */
export async function sendWhatsAppMessage(phone, text) {
  await axios.post(
    `${ZAPI_BASE}/send-text`,
    { phone, message: text },
    { headers: { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } }
  );
}

/**
 * Handler do webhook Z-API.
 * O Z-API envia um POST para cada mensagem recebida.
 * Estrutura esperada: { phone, text: { message }, senderName }
 */
export async function handleWhatsAppWebhook(req, res) {
  // Responde 200 imediatamente para evitar retentativas do Z-API
  res.sendStatus(200);

  try {
    const body = req.body;

    // Ignora mensagens enviadas pelo próprio bot (fromMe = true)
    if (body.fromMe) return;

    // Suporta mensagens de texto simples
    const userText = body.text?.message;
    if (!userText) return;

    const phone = body.phone;
    const senderName = body.senderName || null;

    console.log(`[WhatsApp] Mensagem de ${phone}: "${userText}"`);

    const { message } = await processMessage(phone, 'whatsapp', userText, senderName);

    await sendWhatsAppMessage(phone, message);

    console.log(`[WhatsApp] Resposta enviada para ${phone}`);
  } catch (err) {
    console.error('[WhatsApp] Erro no processamento do webhook:', err.message);
  }
}
