import { useSupabaseAuthState } from "./baileys-auth-supabase.js";
import makeWASocket, {
  
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sock = null;
let qrAtual = null;
let statusConexao = "desconectado";

export async function iniciarWhatsApp() {
  const { state, saveCreds } = await useSupabaseAuthState();
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: ["Nexus Agent", "Chrome", "1.0"],
    syncFullHistory: false,
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      statusConexao = "aguardando_qr";
      qrcode.generate(qr, { small: true });
      console.log("[Baileys] QR Code gerado — escaneie pelo WhatsApp");
    }
    if (connection === "open") {
      qrAtual = null;
      statusConexao = "conectado";
      console.log("[Baileys] WhatsApp conectado!");
    }
    if (connection === "close") {
      const codigo = new Boom(lastDisconnect?.error)?.output?.statusCode;
      statusConexao = "desconectado";
      if (codigo !== DisconnectReason.loggedOut) {
        console.log("[Baileys] Reconectando...");
        iniciarWhatsApp();
      } else {
        console.log("[Baileys] Deslogado — escaneie novamente");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
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
export function getStatus() { return statusConexao; }
