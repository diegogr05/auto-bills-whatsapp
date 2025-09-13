process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; //APENAS PARA USO LOCAL, ATUALIZAR DEPOIS
require("dotenv").config();

const whatsappService = require("./services/whatsappService");
const { checkEmail } = require("./services/emailService");

console.log("🚀 Auto Bills WhatsApp iniciado!");

whatsappService.start().then(() => {
  console.log("⏳ WhatsApp pronto. Monitorando e-mails a cada 1 minuto...");

  checkEmail();

  setInterval(checkEmail, 60 * 1000);
}).catch(err => {
  console.error("Erro iniciando WhatsApp:", err);
});