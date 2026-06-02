import 'dotenv/config';
import express from 'express';
import { handleWhatsAppWebhook } from './channels/whatsapp.js';
import { handleInstagramWebhook } from './channels/instagram.js';
import { handleEmailWebhook } from './channels/email.js';
import leadsRouter from './leads.js';
import { verificarFollowUps, reativarLeadsPerdidos } from './agents/closer.js';
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());
app.use('/leads', leadsRouter);
app.use('/lp', leadsRouter);
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

// ─── CRON JOBS: FOLLOW-UP E REATIVAÇÃO ───────────────────────────────────────
import { sendWhatsAppMessage } from './channels/whatsapp.js';

// Follow-up: verifica a cada 30 minutos
setInterval(async () => {
  try { await verificarFollowUps(sendWhatsAppMessage); }
  catch (err) { console.error('[CRON FOLLOW-UP]', err); }
}, 30 * 60 * 1000);

// Reativação: agenda para rodar diariamente às 10h
const agendarReativacao = () => {
  const agora = new Date();
  const prox = new Date(); prox.setHours(10,0,0,0);
  if (prox <= agora) prox.setDate(prox.getDate() + 1);
  setTimeout(async () => {
    try { await reativarLeadsPerdidos(sendWhatsAppMessage); }
    catch (err) { console.error('[CRON REATIVACAO]', err); }
    agendarReativacao();
  }, prox - agora);
  console.log('[CRON] Reativação agendada para', prox.toLocaleString('pt-BR'));
};
agendarReativacao();
console.log('[CRON] Jobs iniciados');
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Nexus] Servidor rodando na porta ${PORT}`);
});

app.get('/privacy', (_req, res) => {
  res.send('<h1>Privacy Policy</h1><p>MLARS Nexus Agent does not store personal data. Messages are processed in real-time only.</p>');
});

// Auto-refresh do token Instagram a cada 50 dias
import axios from 'axios';
async function refreshInstagramToken() {
  try {
    const res = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: { grant_type: 'ig_refresh_token', access_token: process.env.META_ACCESS_TOKEN }
    });
    console.log('[Nexus] Token Instagram renovado:', res.data.access_token?.slice(0, 20) + '...');
  } catch (e) {
    console.error('[Nexus] Erro ao renovar token:', e.message);
  }
}
// setInterval(refreshInstagramToken, 1000 * 60 * 60 * 24 * 50); // DESATIVADO — token inválido // a cada 50 dias

// ── Baileys WhatsApp ──────────────────────────────────────────
import { iniciarWhatsApp, getQR, getStatus } from "./channels/whatsapp-baileys.js";
import qrcode from "qrcode";

iniciarWhatsApp().catch(console.error);

app.get("/whatsapp/status", (req, res) => {
  res.json({ status: getStatus() });
});

app.get("/whatsapp/qr", async (req, res) => {
  const qr = getQR();
  if (!qr) {
    return res.json({ conectado: getStatus() === "conectado", qr: null });
  }
  const qrImg = await qrcode.toDataURL(qr);
  res.send(`<html><body style="background:#000;display:flex;justify-content:center;align-items:center;height:100vh">
    <div style="text-align:center">
      <img src="${qrImg}" style="width:300px"/>
      <p style="color:#fff;font-family:sans-serif;margin-top:16px">Escaneie com o WhatsApp</p>
      <p style="color:#666;font-size:12px">Atualiza automaticamente em 10s</p>
    </div>
    <script>setTimeout(()=>location.reload(),10000)</script>
  </body></html>`);
});

app.post("/whatsapp/enviar", async (req, res) => {
  try {
    const { telefone, mensagem } = req.body;
    
    await sendWhatsAppMessage(telefone, mensagem);
    res.json({ sucesso: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});
