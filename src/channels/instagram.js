import axios from 'axios';
import { processMessage } from '../agents/nexus.js';

const META_GRAPH_URL = 'https://graph.facebook.com/v20.0';
const IG_ID = '17841436054624386';

async function sendInstagramMessage(recipientId, text) {
  await axios.post(
    `${META_GRAPH_URL}/${IG_ID}/messages`,
    { recipient: { id: recipientId }, message: { text }, messaging_type: 'RESPONSE' },
    { params: { access_token: process.env.META_ACCESS_TOKEN } }
  );
}

export function handleInstagramWebhook(req, res) {
  if (req.method === 'GET') return handleVerification(req, res);
  return handleIncomingMessage(req, res);
}

function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN)
    return res.status(200).send(challenge);
  return res.sendStatus(403);
}

async function handleIncomingMessage(req, res) {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== 'instagram') return;
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message?.text || event.message.is_echo) continue;
        const senderId = event.sender.id;
        console.log(`[Instagram] Mensagem recebida de: ${senderId}`);
        const { message } = await processMessage(senderId, 'instagram', event.message.text);
        await sendInstagramMessage(senderId, message);
        console.log(`[Instagram] Resposta enviada para ${senderId}`);
      }
    }
  } catch (err) {
    console.error('[Instagram] Erro:', JSON.stringify(err.response?.data || err.message));
  }
}
