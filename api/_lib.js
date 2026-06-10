// Helpers de sessão. O prefixo "_" impede o arquivo de virar rota pública na Vercel.
const crypto = require("crypto");

const COOKIE = "modelo_sess";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

// Assina um token simples com a própria senha como segredo.
// Não é cofre, é cortina de acesso (igual ao cdc).
function sign(secret) {
  return crypto.createHmac("sha256", secret).update("ok").digest("hex");
}

function setSessionCookie(res, secret) {
  const token = sign(secret);
  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}

function isAuthed(req) {
  const pass = process.env.MODELO_ACCESS_PASSWORD;
  // Sem senha definida no Vercel = painel aberto (o Ezequiel pode optar por isso).
  if (!pass) return true;
  const cookie = req.headers.cookie || "";
  const m = cookie.match(new RegExp(`${COOKIE}=([a-f0-9]+)`));
  return !!m && m[1] === sign(pass);
}

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "unauthorized" }));
  return false;
}

module.exports = { COOKIE, setSessionCookie, isAuthed, requireAuth };
