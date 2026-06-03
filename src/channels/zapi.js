import axios from 'axios';

const ZAPI_INSTANCE = '3F4185AC8E15E135DB797AE31EDEB32B';
const ZAPI_TOKEN = 'EEEB31D83DC93B589F77D04C';
const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

export async function sendWhatsAppMessage(phone, message) {
  try {
    const numero = phone.replace(/\D/g, '');
    const response = await axios.post(`${ZAPI_BASE}/send-text`, {
      phone: numero,
      message: message
    });
    console.log(`[Z-API] Mensagem enviada para ${numero}`);
    return response.data;
  } catch (error) {
    console.error('[Z-API] Erro ao enviar:', error.response?.data || error.message);
    throw error;
  }
}

export async function receberMensagem(body) {
  const phone = body.phone?.replace(/\D/g, '');
  const message = body.text?.message || body.message || '';
  const fromMe = body.fromMe || false;
  const senderName = body.senderName || null;
  return { phone, message, fromMe, senderName };
}
