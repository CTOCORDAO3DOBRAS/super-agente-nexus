import { processarMensagem } from '../agents/closer.js';
import { enviarMensagemWhatsApp } from './whatsapp-baileys.js';

/**
 * Handler do webhook — recebe mensagens e processa com Agente 09
 */
export async function handleWhatsAppWebhook(req, res) {
  res.sendStatus(200);
  try {
    const body = req.body;

    if (body.fromMe) return;

    const userText = body.text?.message || body.text;
    if (!userText) return;

    const phone = body.phone;
    const senderName = body.senderName || null;

    console.log(`[WhatsApp] Mensagem de ${phone}: "${userText}"`);

    const { resposta: message } = await processarMensagem(phone, userText, { nome: senderName });

    await enviarMensagemWhatsApp(phone, message);

    console.log(`[WhatsApp] Resposta enviada para ${phone}`);
  } catch (err) {
    console.error('[WhatsApp] Erro no webhook:', err.message);
  }
}
