import axios from 'axios';

const N8N_WEBHOOK = 'https://cordao-3-dobras.app.n8n.cloud/webhook/69fca98e-b04e-4d77-b6f7-4e2df0359058';

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
        console.log(`[Instagram] Encaminhando para n8n: ${event.sender.id}`);
        await axios.post(N8N_WEBHOOK, {
          senderId: event.sender.id,
          message: event.message.text,
          platform: 'instagram'
        });
      }
    }
  } catch (err) {
    console.error('[Instagram] Erro:', err.message);
  }
}
