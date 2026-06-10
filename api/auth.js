// POST /api/auth  { senha: "..." }  -> grava cookie de sessão se bater.
const { setSessionCookie } = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  const pass = process.env.MODELO_ACCESS_PASSWORD;
  // Sem senha configurada: nada a validar, painel é aberto.
  if (!pass) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, open: true }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  let body = "";
  await new Promise((r) => { req.on("data", (c) => (body += c)); req.on("end", r); });

  let senha = "";
  try { senha = (JSON.parse(body || "{}").senha || "").trim(); } catch (_) {}

  if (senha && senha === pass) {
    setSessionCookie(res, pass);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  }

  res.statusCode = 401;
  return res.end(JSON.stringify({ ok: false, error: "senha_incorreta" }));
};
