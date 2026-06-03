import { useSupabaseAuthState } from "./baileys-auth-supabase.js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import { processarMensagem } from "../agents/closer.js";

let sock = null;
let qrAtual = null;
let qrImageBase64 = null;
let statusConexao = "desconectado";
let reconectando = false;

async function handleIncomingMessage(phone, text, senderName) {
  try {
    console.log(`[WhatsApp] Mensagem recebida de ${phone}: "${text}"`);
    const { resposta } = await processarMensagem(phone, text, { nome: senderName });
    await enviarMensagemWhatsApp(phone, resposta);
    console.log(`[WhatsApp] Resposta enviada para ${phone}`);
  } catch (err) {
    console.error(`[WhatsApp] Erro ao processar mensagem de ${phone}:`, err.message);
  }
}

export async function iniciarWhatsApp() {
  if (reconectando) {
    console.log("[Baileys] Reconexão já em andamento, ignorando.");
    return;
  }

  const { state, saveCreds } = await useSupabaseAuthState();
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Nexus Agent", "Chrome", "1.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      statusConexao = "aguardando_qr";
      qrImageBase64 = await QRCode.toDataURL(qr);
      console.log("[Baileys] QR gerado — acesse /whatsapp/qr");
    }

    if (connection === "open") {
      qrAtual = null;
      qrImageBase64 = null;
      statusConexao = "conectado";
      reconectando = false;
      console.log("[Baileys] WhatsApp conectado!");
      await saveCreds();
      console.log("[Baileys] Credenciais salvas!");
    }

    if (connection === "close") {
      const codigo = new Boom(lastDisconnect?.error)?.output?.statusCode;
      statusConexao = "desconectado";
      console.log(`[Baileys] Fechado. Código: ${codigo}`);

      if (codigo === DisconnectReason.loggedOut) {
        reconectando = false;
        console.log("[Baileys] Deslogado — acesse /whatsapp/qr");
      } else if (!reconectando) {
        reconectando = true;
        console.log("[Baileys] Reconectando em 5s...");
        setTimeout(async () => {
          reconectando = false;
          await iniciarWhatsApp();
        }, 5000);
      }
    }
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
  });

  // Handler de mensagens reais recebidas pelo WhatsApp
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const phone = msg.key.remoteJid.replace("@s.whatsapp.net", "");
      if (phone.includes("g.us")) continue; // Ignorar grupos

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        null;

      if (!text) continue;

      const senderName = msg.pushName || null;
      await handleIncomingMessage(phone, text, senderName);
    }
  });

  return sock;
}

export async function enviarMensagemWhatsApp(telefone, mensagem) {
  if (!sock || statusConexao !== "conectado") {
    throw new Error("WhatsApp não conectado");
  }
  const jid = telefone.replace(/\D/g, "") + "@s.whatsapp.net";
  await sock.sendMessage(jid, { text: mensagem });
  console.log(`[Baileys] Mensagem enviada para ${telefone}`);
}

export function getQR() { return qrAtual; }
export function getQRImage() { return qrImageBase64; }
export function getStatus() { return statusConexao; }
