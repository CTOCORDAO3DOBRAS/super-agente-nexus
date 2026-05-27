import axios from 'axios';
import { processMessage } from '../agents/nexus.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Envia um email de resposta via Resend.
 */
async function sendEmail(to, subject, text) {
  await axios.post(
    RESEND_API_URL,
    {
      from: 'Nexus <nexus@seudominio.com>',
      to: [to],
      subject,
      text,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Extrai texto limpo de um email, removendo respostas anteriores citadas.
 * Heurística simples: corta no primeiro padrão "Em <data>, <nome> escreveu:"
 */
function extractEmailBody(rawBody) {
  if (!rawBody) return '';
  const cutPatterns = [
    /^Em .+escreveu:/m,
    /^On .+wrote:/m,
    /^-{3,}/m,
    /^_{3,}/m,
  ];
  let body = rawBody;
  for (const pattern of cutPatterns) {
    const match = body.search(pattern);
    if (match > 20) {
      body = body.substring(0, match);
      break;
    }
  }
  return body.trim();
}

/**
 * Handler do webhook de email.
 * Compatível com o formato de inbound do Resend (webhook de recebimento).
 * Estrutura esperada: { from, subject, text, html }
 */
export async function handleEmailWebhook(req, res) {
  res.sendStatus(200);

  try {
    const { from, subject, text } = req.body;
    if (!from || !text) return;

    // Usa o endereço de email como identificador do lead
    const email = from.match(/<(.+)>/) ? from.match(/<(.+)>/)[1] : from;
    const name = from.includes('<') ? from.split('<')[0].trim() : null;

    const userText = extractEmailBody(text);
    if (!userText) return;

    console.log(`[Email] Mensagem de ${email}: "${userText.substring(0, 80)}..."`);

    const { message } = await processMessage(email, 'email', userText, name);

    // Mantém o mesmo assunto com prefixo Re: para parecer uma resposta real
    const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject || 'Sua mensagem'}`;

    await sendEmail(email, replySubject, message);

    console.log(`[Email] Resposta enviada para ${email}`);
  } catch (err) {
    console.error('[Email] Erro no processamento do webhook:', err.message);
  }
}
