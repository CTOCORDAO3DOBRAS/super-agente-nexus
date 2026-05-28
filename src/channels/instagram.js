import axios from 'axios';
import { processMessage } from '../agents/nexus.js';

const META_GRAPH_URL = 'https://graph.facebook.com/v20.0';

/**
 * Envia uma mensagem de texto via Instagram Direct pela API do Meta.
 */
async function sendInstagramMessage(recipientId, text) {
  await axios.post(
    `${META_GRAPH_URL}/me/messages`,
    {
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    },
    { params: { access_token: process.env.META_ACCESS_TOKEN } }
  );
}

/**
 * Handler do webhook Meta (Instagram/Messenger).
 * GET: verificação inicial do webhook pela plataforma Meta.
 * POST: mensagens recebidas.
 */
export function handleInstagramWebhook(req, res) {
  if (req.method === 'GET') {
    return handleVerification(req, res);
  }
  return handleIncomingMessage(req, res);
}

function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[Instagram] Webhook verificado com sucesso.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function handleIncomingMessage(req, res) {
  console.log('[Instagram] POST recebido:' + JSON.stringify(req.body));
  // Responde 200 imediatamente conforme exigido pela Meta
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Ignora eventos que não sejam mensagens de texto
        if (!event.message?.text) continue;
        // Ignora eco das próprias mensagens
        if (event.message.is_echo) continue;

        const senderId = event.sender.id;
        const userText = event.message.text;

        console.log(`[Instagram] Mensagem recebida de: ${senderId}`);

        const { message } = await processMessage(senderId, 'instagram', userText);

        await sendInstagramMessage(senderId, message);

        console.log(`[Instagram] Resposta enviada para ${senderId}`);
      }
    }
  } catch (err) {
    console.error('[Instagram] Erro no processamento do webhook:', err.message);
  }
}
