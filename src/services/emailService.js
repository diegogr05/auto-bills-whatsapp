require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const fs = require("fs-extra");
const path = require("path");
const pdfParse = require("pdf-parse");

const whatsappService = require("./whatsappService");

const tmpDir = path.resolve(__dirname, "..", "..", "tmp");
fs.ensureDirSync(tmpDir);

const config = {
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: process.env.EMAIL_HOST || "imap.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "993", 10),
    tls: process.env.EMAIL_TLS === "false" ? false : true,
    authTimeout: 30000,
  },
};

function extractCodeFromText(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\r\n/g, " ").replace(/\n/g, " ");

  let m = cleaned.match(/\d{47}/);
  if (m) return m[0].slice(0, 47);

  m = cleaned.match(/\d{44}/);
  if (m) return m[0].slice(0, 44);

  const candidates = cleaned.match(/([0-9.\s]{30,120})/g);
  if (candidates) {
    for (const cand of candidates) {
      const digits = cand.replace(/[\s.]/g, "");
      if (digits.length >= 47) return digits.slice(0, 47);
      if (digits.length >= 44) return digits.slice(0, 44);
    }
  }

  const allDigits = cleaned.replace(/\D/g, "");
  if (allDigits.length >= 47) return allDigits.slice(0, 47);
  if (allDigits.length >= 44) return allDigits.slice(0, 44);

  return null;
}

function extractValueFromText(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\r\n/g, " ").replace(/\n/g, " ");
  const values = [];

  // R$
  let m;
  const regexR = /R\$\s?([\d\.\,]+)/g;
  while ((m = regexR.exec(cleaned)) !== null) {
    values.push(m[1]);
  }

  const regexNum = /(\d{1,3}(?:[.\d{3}])*,\d{2})/g;
  while ((m = regexNum.exec(cleaned)) !== null) {
    values.push(m[1]);
  }

  if (values.length === 0) return null;

  const nums = values
    .map(s => parseFloat(String(s).replace(/\./g, "").replace(",", ".")))
    .filter(v => !isNaN(v));

  if (nums.length === 0) return null;
  const max = Math.max(...nums);
  return max.toFixed(2).replace(".", ",");
}

function detectTypeByCode(code) {
  if (!code) return "desconhecido";
  if (code.startsWith("36490")) return "internet";
  if (code.startsWith("34191")) return "luz";
  return "outro";
}

async function processAttachment(att) {
  const filename = `${Date.now()}_${(att.filename || "attachment").replace(/\s/g, "_")}`;
  const filepath = path.join(tmpDir, filename);
  await fs.writeFile(filepath, att.content);
  console.log("📎 Anexo salvo em", filepath);

  let text = null;
  const ct = (att.contentType || "").toLowerCase();
  if (ct.includes("pdf") || filepath.toLowerCase().endsWith(".pdf")) {
    try {
      const data = await pdfParse(att.content);
      text = data.text || null;
    } catch (err) {
      console.warn("⚠️ pdf-parse falhou:", err.message || err);
    }
  }
  return { filepath, text };
}

async function checkEmail() {
  let connection;
  try {
    connection = await imaps.connect(config);
    await connection.openBox("INBOX");

    const searchCriteria = ["UNSEEN"];
    const fetchOptions = { bodies: [""], struct: true, markSeen: false };
    const messages = await connection.search(searchCriteria, fetchOptions);

    console.log(`📩 Encontradas ${messages.length} mensagens NÃO lidas.`);

    for (const item of messages) {
      const all = item.parts.find(p => p.which === "");
      const raw = all?.body || "";
      const parsed = await simpleParser(raw);

      console.log("-------------------------------------");
      console.log("De:", parsed.from?.text);
      console.log("Assunto:", parsed.subject);

      const bodyText = String(parsed.text || parsed.html || "");
      let code = extractCodeFromText(bodyText);
      let value = extractValueFromText(bodyText);
      let type = detectTypeByCode(code);

      if ((!code || !value || type === "desconhecido") && parsed.attachments?.length > 0) {
        for (const att of parsed.attachments) {
          const { text } = await processAttachment(att);
          if (text) {
            if (!code) code = extractCodeFromText(text);
            if (!value) value = extractValueFromText(text);
            if (type === "desconhecido") type = detectTypeByCode(code);
            if (code && value && type !== "desconhecido") break;
          }
        }
      }

      if (code || value) if (code || value) {
  console.log("✅ Resultado extraído:");
  console.log("   Código:", code || "não encontrado");
  console.log("   Valor:", value || "não encontrado");
  console.log("   Tipo:", type);

  const dest = process.env.DEFAULT_PHONE;
  if (dest) {
    const resumo = [
      "📢 Nova fatura detectada:",
      `Tipo: ${type}`,
    ];
    if (value) resumo.push(`Valor: R$ ${value}`);
    resumo.push("Código: "); 
    resumo.push("(Enviada automaticamente)");

    try {
      await whatsappService.sendMessage(dest, resumo.join("\n"));
      if (code) {
        await whatsappService.sendMessage(dest, code);
      }
      console.log("📲 Enviado para WhatsApp:", dest);
    } catch (err) {
      console.error("❌ Erro ao enviar pelo WhatsApp:", err.message || err);
    }
  }
}
 else {
        console.log("Nenhum dado detectado nesta mensagem.");
      }

      await connection.addFlags(item.attributes.uid, "\\Seen");
    }
  } catch (err) {
    console.error("❌ Erro ao checar emails:", err.message || err);
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = { checkEmail };
