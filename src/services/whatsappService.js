const { Client, LocalAuth } = require("whatsapp-web.js");

let client;

function start() {
  return new Promise((resolve, reject) => {
    client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: { headless: true }
    });

    client.on("qr", (qr) => {
      console.log("📱 Escaneie o QR code no WhatsApp (só na primeira vez).");
    });

    client.on("ready", () => {
      console.log("✅ WhatsApp conectado!");
      resolve();
    });

    client.on("auth_failure", (msg) => {
      console.error("❌ Falha de autenticação:", msg);
      reject(new Error("Auth failure"));
    });

    client.on("message", (message) => {
      if (message.body.toLowerCase().trim() === "ping") {
        message.reply("pong");
      }
    });

    client.initialize();
  });
}

async function sendMessage(to, text) {
  if (!client) throw new Error("WhatsApp não inicializado!");
  let dest = String(to).replace(/\D/g, "");
  if (!dest) throw new Error("Número de destino inválido");
  const chatId = `${dest}@c.us`;
  console.log("📤 Tentando enviar para:", chatId);
  return client.sendMessage(chatId, text);
}

module.exports = { start, sendMessage };
