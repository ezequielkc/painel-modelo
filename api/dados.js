// ============================================================================
// dash-modelo · api/dados.js  —  ESQUELETO REPLICÁVEL (Konge)
// ----------------------------------------------------------------------------
// Fonte de plataforma: Windsor.ai (Meta + Google). Sem token do Meta.
// O ENCANAMENTO abaixo é INVARIÁVEL (não mexer): fetch, dedup, período, cache,
// parse de URL serverless. O que muda por cliente está nos blocos marcados
// >>> CLIENTE <<< — e SÓ neles. NÃO tocar no visual nem na IDV (vive no front).
// ============================================================================

const { requireAuth } = require("./_lib");
const WINDSOR = process.env.WINDSOR_API_KEY || "";

// ====================== >>> CLIENTE: CONFIGURAÇÃO <<< =======================
// 1) Contas Meta. Cada conta tem um "grupo" (frente, território ou o que separar).
//    Se o cliente separa por NOME de conjunto (ex.: CST/território), deixe a
//    lista com um id só e faça a separação em classificaGrupo() pelo nome.
const META_ACCOUNTS = [
  { id: process.env.MODELO_META_1 || "META_ACCOUNT_ID_1", grupo: "Grupo A" },
  // { id: process.env.MODELO_META_2 || "META_ACCOUNT_ID_2", grupo: "Grupo B" },
];

// 2) Google: filtro pelo nome da conta e se há receita/ROAS (e-commerce sim; lead-gen não).
const GOOGLE_MATCH = (process.env.MODELO_GOOGLE_MATCH || "CLIENTE").toUpperCase();
const GOOGLE_TEM_RECEITA = true; // false em cliente lead-gen (Google sem conversion_value)

// 3) Campo de conversão do Meta. Padrão = conversa de WhatsApp (vale p/ a maioria).
//    Em conta que otimiza por CONVERSÃO PERSONALIZADA, esse campo volta zero —
//    troque pelo campo correto e confirme com get_fields antes.
const META_CONVERSA_FIELD = "actions_onsite_conversion_messaging_conversation_started_7d";

// 4) Alvos da régua de cor por tipo de KPI (custo baixo = bom). Ajustar ao plano.
const ALVOS = {
  conversa: { bom: 8.86, ok: 15 },   // CPL lead WhatsApp
  vendas:   { bom: 33.33, ok: 45 },  // CPA compra Google
  visitas:  { bom: 0.40, ok: 0.80 }, // custo por visita (tráfego)
};

// 5) Classificação de GRUPO. Duas formas comuns — descomente a que se aplica:
function classificaGrupo(row, canal) {
  // (A) por CONTA (ex.: Oficinal — frente por account_id):
  if (canal === "Meta") {
    const acc = META_ACCOUNTS.find((a) => String(a.id) === String(row.account_id));
    if (acc) return acc.grupo;
  }
  // (B) por NOME do conjunto (ex.: CST — território pelo nome):
  // const n = (row.adset_name || row.campaign || "").toLowerCase();
  // if (/cachoeira/.test(n)) return "Cachoeira";
  // if (/camobi/.test(n))    return "Camobi";
  return canal === "Google" ? "Grupo A" : "Outros";
}

// 6) Tipo de KPI por nomenclatura da campanha. Google sempre = vendas.
//    Ajustar a regex à nomenclatura do cliente.
function kpiTipo(canal, nome = "") {
  if (canal === "Google") return "vendas";
  const n = nome.toLowerCase();
  if (/lead|whats|wpp|local/.test(n)) return "conversa";
  if (/tr[aá]fego|site|visita/.test(n)) return "visitas";
  return "conversa";
}
// ==================== <<< FIM DA CONFIGURAÇÃO CLIENTE >>> ====================


// ===================== ENCANAMENTO INVARIÁVEL (não mexer) ====================
const TTL_MS = 15 * 60 * 1000;
const cache = new Map();
const RANGE_PRESET = { "7": "last_7d", "15": "last_14d", "30": "last_30d" };
const CONV = META_CONVERSA_FIELD;
const isData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const num = (v) => (v == null || v === "" ? 0 : Number(v)) || 0;
const META_IDS = META_ACCOUNTS.map((a) => String(a.id));

function mesPassado() {
  const n = new Date(Date.now() - 3 * 3600 * 1000);
  const y = n.getUTCFullYear(), m = n.getUTCMonth();
  const ini = new Date(Date.UTC(y, m - 1, 1));
  const fim = new Date(Date.UTC(y, m, 0));
  return { from: ini.toISOString().slice(0, 10), to: fim.toISOString().slice(0, 10) };
}
function paramData(when) {
  return (when && when.from && when.to)
    ? `date_from=${when.from}&date_to=${when.to}`
    : `date_preset=${when}`;
}

function resultado(tipo, r) {
  if (tipo === "vendas")  return num(r.conversions);
  if (tipo === "visitas") return num(r.link_clicks || r.clicks);
  return num(r.conversas);
}

// ---- Meta (Windsor) ----
async function windsorMeta(when) {
  if (!WINDSOR) return { rows: [], ok: false, motivo: "sem WINDSOR_API_KEY" };
  const fields = ["account_id","campaign","adset_name","spend","clicks","link_clicks",
                  "impressions","reach","frequency","adset_effective_status", CONV].join(",");
  const url = `https://connectors.windsor.ai/facebook?api_key=${WINDSOR}`
            + `&${paramData(when)}&fields=${fields}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { rows: [], ok: false, motivo: `Windsor HTTP ${r.status}` };
    const j = await r.json();
    const data = (Array.isArray(j) ? j : (j.data || []))
      .filter((d) => META_IDS.includes(String(d.account_id || "")));
    // consolida por conjunto (REST pode vir por dia/rede) — senão dobra custo/resultado.
    const by = {};
    for (const d of data) {
      const grupo = classificaGrupo(d, "Meta");
      const k = `${grupo}||${d.adset_name || d.campaign || "(sem nome)"}`;
      const o = by[k] || (by[k] = {
        grupo, adset_name: d.adset_name, campaign_name: d.campaign,
        spend: 0, clicks: 0, link_clicks: 0, impressions: 0, reach: 0, conversas: 0,
        status: d.adset_effective_status || "UNKNOWN",
      });
      o.spend += num(d.spend); o.clicks += num(d.clicks);
      o.link_clicks += num(d.link_clicks); o.impressions += num(d.impressions);
      o.reach += num(d.reach); o.conversas += num(d[CONV]);
      if (d.adset_effective_status) o.status = d.adset_effective_status;
    }
    return { rows: Object.values(by), ok: true };
  } catch (e) { return { rows: [], ok: false, motivo: String(e) }; }
}

// ---- Google (Windsor) ----
async function windsorGoogle(when) {
  if (!WINDSOR) return { rows: [], ok: false, motivo: "sem WINDSOR_API_KEY" };
  const base = ["account_name","campaign_name","campaign_status","cost","conversions","clicks","impressions"];
  if (GOOGLE_TEM_RECEITA) base.push("conversion_value");
  const url = `https://connectors.windsor.ai/google_ads?api_key=${WINDSOR}`
            + `&${paramData(when)}&fields=${base.join(",")}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { rows: [], ok: false, motivo: `Windsor HTTP ${r.status}` };
    const j = await r.json();
    const data = (Array.isArray(j) ? j : (j.data || []))
      .filter((d) => String(d.account_name || "").toUpperCase().includes(GOOGLE_MATCH));
    const by = {};
    for (const d of data) {
      const k = d.campaign_name || "(sem nome)";
      const grupo = classificaGrupo(d, "Google");
      const o = by[k] || (by[k] = {
        grupo, account_name: d.account_name, campaign_name: k, campaign_status: d.campaign_status,
        cost: 0, conversions: 0, conversion_value: 0, clicks: 0, impressions: 0,
      });
      o.cost += num(d.cost); o.conversions += num(d.conversions);
      o.conversion_value += num(d.conversion_value);
      o.clicks += num(d.clicks); o.impressions += num(d.impressions);
      if (d.campaign_status) o.campaign_status = d.campaign_status;
    }
    return { rows: Object.values(by), ok: true };
  } catch (e) { return { rows: [], ok: false, motivo: String(e) }; }
}

function rotuloStatus(status, spend) {
  const ativo = /ACTIVE|ENABLED/i.test(status || "");
  if (ativo && spend > 0) return "entregando";
  if (ativo) return "ativo_sem_entrega";
  return "pausado";
}

// Venda real do Dashboard cliente, injetada por env (modelo "C"). Opcional.
function vendaReal() {
  const raw = process.env.MODELO_DASHBOARD;
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const meta = num(d.meta_mes), ger = num(d.venda_geral);
    return {
      mes: d.mes || null, venda_geral: ger || null,
      venda_ecomm: num(d.venda_ecomm) || null, venda_whatsapp: num(d.venda_whatsapp) || null,
      meta_mes: meta || null, atingido_pct: meta ? (ger / meta) * 100 : null,
      fonte: "Dashboard cliente (manual)",
    };
  } catch (_) { return null; }
}

function normCampanha(canal, r) {
  const nome = r.campaign_name;
  const tipo = kpiTipo(canal, canal === "Meta" ? (r.adset_name || nome) : nome);
  const spend = canal === "Meta" ? num(r.spend) : num(r.cost);
  const res = resultado(tipo, r);
  const imp = num(r.impressions), clk = num(r.clicks);
  return {
    canal, grupo: r.grupo, nome, conjunto: r.adset_name || null, kpi_tipo: tipo,
    spend, resultado: res,
    custo_por_resultado: res ? spend / res : null,
    receita: canal === "Google" && GOOGLE_TEM_RECEITA ? num(r.conversion_value) : null,
    roas: canal === "Google" && GOOGLE_TEM_RECEITA && num(r.cost) ? num(r.conversion_value) / num(r.cost) : null,
    clicks: clk, link_clicks: canal === "Meta" ? num(r.link_clicks) : null,
    impressions: imp, reach: canal === "Meta" ? num(r.reach) : null,
    frequency: canal === "Meta" && num(r.reach) ? imp / num(r.reach) : null,
    cpm: imp ? (spend / imp) * 1000 : null, ctr: imp ? (clk / imp) * 100 : 0,
    status: rotuloStatus(canal === "Meta" ? r.status : r.campaign_status, spend),
  };
}

function agrega(metaRows, googleRows) {
  const campanhas = [
    ...metaRows.map((r) => normCampanha("Meta", r)),
    ...googleRows.map((r) => normCampanha("Google", r)),
  ];
  const ativos = campanhas.filter((c) => c.spend > 0);

  // resumo por GRUPO (não soma KPIs de tipos diferentes)
  const grupos = {};
  for (const c of ativos) {
    const g = grupos[c.grupo] || (grupos[c.grupo] = { grupo: c.grupo, spend: 0, visitas: 0, conversas: 0, vendas: 0, receita: 0 });
    g.spend += c.spend;
    if (c.kpi_tipo === "visitas")  g.visitas  += c.resultado;
    if (c.kpi_tipo === "conversa") g.conversas += c.resultado;
    if (c.kpi_tipo === "vendas")   g.vendas    += c.resultado;
    if (c.receita) g.receita += c.receita;
  }
  const resumoGrupos = Object.values(grupos).map((g) => ({ ...g, roas: g.receita && g.spend ? g.receita / g.spend : null }));

  // cards por OBJETIVO (grupo + canal + kpi_tipo) — cada card só com o que é relevante
  const cardKey = {};
  for (const c of ativos) {
    const k = `${c.grupo}||${c.canal}||${c.kpi_tipo}`;
    const o = cardKey[k] || (cardKey[k] = {
      grupo: c.grupo, canal: c.canal, kpi_tipo: c.kpi_tipo, spend: 0,
      resultado: 0, receita: 0, clicks: 0, link_clicks: 0, impressions: 0, reach: 0,
    });
    o.spend += c.spend; o.resultado += num(c.resultado);
    o.clicks += num(c.clicks); o.link_clicks += num(c.link_clicks);
    o.impressions += num(c.impressions); o.reach += num(c.reach);
    if (c.receita) o.receita += c.receita;
  }
  const canais = Object.values(cardKey).map((o) => ({
    ...o,
    custo_por_resultado: o.resultado ? o.spend / o.resultado : null,
    roas: o.receita && o.spend ? o.receita / o.spend : null,
    cpm: o.impressions ? (o.spend / o.impressions) * 1000 : null,
    ctr: o.impressions ? (o.clicks / o.impressions) * 100 : 0,
    frequency: o.reach ? o.impressions / o.reach : null,
  }));

  return { resumoGrupos, canais, campanhas };
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const u = new URL(req.url, "http://localhost"); // serverless sem framework: req.query é undefined
  const range = u.searchParams.get("range") || "7";

  let when, cacheKey;
  if (range === "custom") {
    const from = u.searchParams.get("from"), to = u.searchParams.get("to");
    if (isData(from) && isData(to)) { when = { from, to }; cacheKey = `c:${from}:${to}`; }
    else { when = "last_7d"; cacheKey = "7"; }
  } else if (range === "lastmonth") {
    when = mesPassado(); cacheKey = `lm:${when.from}`;
  } else { when = RANGE_PRESET[range] || "last_7d"; cacheKey = range; }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Vary", "Cookie");
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return res.end(JSON.stringify({ ...hit.payload, cache: true }));

  const [meta, google] = await Promise.all([windsorMeta(when), windsorGoogle(when)]);
  const ag = agrega(meta.rows, google.rows);

  const payload = {
    range, periodo: { range, from: (when && when.from) || null, to: (when && when.to) || null },
    atualizado_em: new Date().toISOString(),
    fontes: {
      meta: meta.ok ? "windsor" : "falhou", meta_motivo: meta.ok ? null : meta.motivo,
      conversa_whatsapp: meta.ok,
      google: google.ok ? "windsor" : "falhou", google_motivo: google.ok ? null : google.motivo,
      venda_real: process.env.MODELO_DASHBOARD ? "dashboard_manual" : "nao_configurado",
    },
    alvos: ALVOS, venda_real: vendaReal(), ...ag,
  };
  cache.set(cacheKey, { at: Date.now(), payload });
  return res.end(JSON.stringify(payload));
};
