import { useSupabaseAuthState } from "./baileys-auth-supabase.js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";

let sock = null;
let qrAtual = null;
let qrImageBase64 = null;
let statusConexao = "desconectado";
let reconectando = false;

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
