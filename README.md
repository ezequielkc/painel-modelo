# dash-modelo · Painel de Performance Konge (modelo replicável)

Repositório **master** para clonar a cada novo cliente. Lê Meta + Google pelo Windsor e entrega ao cliente um painel de relatoria na Vercel. Sem banco, sem framework.

> **Este repo não tem dado de cliente** (IDs e chaves são sempre env var) — por isso pode ficar público como referência. Os repos de cliente derivados **ficam privados.**

Referências vivas: `dash-cst` (lead-gen, frente única, com mapa) e `dash-oficinal` (e-commerce + lead-gen, duas frentes, ROAS, sem mapa). Quando for clonar, parta do master e use o repo de cliente mais próximo do perfil como segunda referência.

---

## Regra inegociável: IDV e componentes são FIXOS

O visual é autoridade, não decoração. **Não reinterpretar o estilo.** O que está congelado e não muda de cliente para cliente:

- **Paleta:** Roxo `#9146FF`, Pitch Black `#141110`, Porcelana `#FFFFFB`, Verde Menta `#7BF07F`, Pervinca `#CCC1FF` — secundárias só em destaque.
- **Tipografia:** Manrope (display) + Inter (body), pesos e escala como estão.
- **Componentes:** cards, funil, régua de cor, pills de status, abas, toolbar de período, hero, cabeçalho de PDF — CSS idêntico ao do CST/Oficinal.
- **Estrutura:** front estático na raiz + `api/` serverless, sem framework; senha por env; cache de borda + memória.

A adaptação por cliente vive **só em dados e lógica** (`api/dados.js`) e em **quais blocos do front renderizam** — nunca no CSS.

---

## A árvore de decisão (percorrer a cada cliente)

Antes de tocar no código, responder:

1. **É lead-gen, e-commerce ou híbrido?** Define se há ROAS/receita (e-comm sim → `GOOGLE_TEM_RECEITA = true`; lead-gen não → `false`).
2. **Como se separa o cliente?** Por **frente** (conta), por **território** (nome do conjunto), ou nenhum (grupo único). Define `classificaGrupo()`.
3. **Quantas contas Meta?** Uma ou várias → `META_ACCOUNTS`.
4. **Qual o campo de conversão do Meta?** Conversa de WhatsApp (padrão) ou conversão personalizada (troca `META_CONVERSA_FIELD` — senão volta zero).
5. **Quais objetivos de campanha existem?** Tráfego, WhatsApp, vendas → `kpiTipo()`. Os três **não somam** entre si.
6. **Quais os alvos de custo?** → `ALVOS` (régua de cor).
7. **Tem venda real / meta?** Se sim, entra por env `MODELO_DASHBOARD` (manual). Se não, o hero some sozinho.
8. **Quais abas fazem sentido?** Geral + Detalhe + Campanhas é o default. Se quiser aba por grupo (ex.: Farmácia/Vet, ou por território), duplicar blocos `data-v` no `index.html`.

---

## O que SEMPRE muda (e onde)

Tudo no topo de `api/dados.js`, no bloco `>>> CLIENTE: CONFIGURAÇÃO <<<`:

| Ponto | Variável / função | O que ajustar |
|---|---|---|
| Contas Meta | `META_ACCOUNTS` | IDs das contas + nome do grupo de cada |
| Conta Google | `GOOGLE_MATCH` | substring do `account_name` no Windsor |
| Tem ROAS? | `GOOGLE_TEM_RECEITA` | `true` e-comm / `false` lead-gen |
| Campo de conversa | `META_CONVERSA_FIELD` | conversa WhatsApp (padrão) ou conversão personalizada |
| Régua de cor | `ALVOS` | CPL / CPA / custo-visita alvo do plano |
| Separação | `classificaGrupo()` | por conta (frente) **ou** por nome (território) |
| Objetivo | `kpiTipo()` | regex conforme nomenclatura das campanhas |

Front (`index.html`): título/marca (placeholder "Cliente"), e — se quiser — abas por grupo.

Env vars na Vercel (nunca em código): `WINDSOR_API_KEY`, `MODELO_ACCESS_PASSWORD` (opcional), `MODELO_DASHBOARD` (opcional), `MODELO_META_1/2`, `MODELO_GOOGLE_MATCH`. Renomear o prefixo `MODELO_` para o do cliente ao clonar.

---

## Primitivos invariáveis (não mexer)

Já resolvidos e testados — quebrar isso re-introduz bugs antigos:

- **Consolidação por conjunto/campanha** antes de somar (Windsor pode vir por dia/rede → senão dobra custo/resultado).
- **Reach não é somável** como custo: frequência = impressões ÷ alcance, calculada no agregado (não somar frequência).
- **Três KPIs não somam:** o painel segmenta por grupo e objetivo, nunca agrega num "resultado" único.
- **ROAS só onde há receita real** (Google/e-comm). No Meta fica de fora — estrutural (o pixel não pega venda no setor de saúde).
- **Cards por objetivo, não por canal:** tráfego e WhatsApp não se misturam num card só (evita ruído tipo 1 conversa incidental virando CPL altíssimo).
- **Auth:** cookie HMAC assinado com a própria senha; sem senha = painel aberto. Cortina de acesso, não cofre.
- **Cache:** borda Vercel `s-maxage=300, stale-while-revalidate=600` variando por cookie + memória 15 min.

---

## Armadilhas conhecidas

- **`req.query` é `undefined`** em função serverless sem framework → ler por `new URL(req.url, "http://localhost").searchParams`.
- **ID do Google no Windsor** quando filtrar por ID: usar formato **hifenizado** (`940-741-5886`); sem hífen retorna outro cliente. (Aqui filtramos por `account_name`, mais robusto.)
- **Data do Windsor sempre explícita** — ano errado retorna campanhas de outro cliente.
- **`actions_lead` volta zero** em campanha de WhatsApp; o campo certo é a **conversa** (`actions_onsite_conversion_messaging_conversation_started_7d`). Confirmado que **popula** no Windsor.
- **`reach`/`frequency`** bateram via tool, mas confirmar na primeira execução serverless real.

---

## Setup (a cada clone)

1. Duplicar este repo → renomear para `dash-{cliente}` (privado).
2. Preencher o bloco `>>> CLIENTE <<<` em `api/dados.js` (árvore de decisão acima).
3. Trocar título/marca em `index.html` (placeholder "Cliente").
4. Renomear env prefix `MODELO_` → `{CLIENTE}_` (código + Vercel).
5. Conectar à Vercel (push na main → deploy automático).
6. Setar env vars na Vercel → Redeploy.
7. Subdomínio + CNAME.
8. Validar: grupos aparecem, Google popula (ajustar `GOOGLE_MATCH` se não), reach/frequency ok.

## Arquivos

- `index.html` — front: login + abas (Geral / Detalhe / Campanhas) + período + PDF. IDV congelado.
- `api/dados.js` — fetch Windsor, classifica grupo + KPI, agrega, devolve JSON. Bloco CLIENTE no topo.
- `api/auth.js` — senha → cookie.
- `api/_lib.js` — helpers de sessão.
