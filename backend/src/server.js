require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || "development";

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Autorise les outils sans Origin (curl, Render health check, etc.)
    if (!origin) return callback(null, true);

    if (
      NODE_ENV !== "production" ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error("Origin non autorisée par CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MAX_ODDS_REQUESTS_PER_MINUTE || 60),
  standardHeaders: true,
  legacyHeaders: false
}));

const ODDS_KEYS = [
  process.env.ODDS_API_KEY_1,
  process.env.ODDS_API_KEY_2
].filter(Boolean);

const ODDS_BASE = "https://api.the-odds-api.com/v4";

let currentKeyIndex = 0;
const cache = new Map();
const CACHE_TTL = Number(process.env.CACHE_TTL_SECONDS || 90) * 1000;

function jsonError(res, status, message, details = undefined) {
  return res.status(status).json({
    ok: false,
    error: message,
    ...(details ? { details } : {})
  });
}

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function cacheSet(key, data) {
  cache.set(key, { time: Date.now(), data });
  // Évite que le cache grossisse indéfiniment.
  if (cache.size > 500) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

function getOddsKeyOrder() {
  if (ODDS_KEYS.length <= 1) return ODDS_KEYS;
  const a = currentKeyIndex % ODDS_KEYS.length;
  const ordered = [];
  for (let i = 0; i < ODDS_KEYS.length; i++) {
    ordered.push(ODDS_KEYS[(a + i) % ODDS_KEYS.length]);
  }
  return ordered;
}

async function oddsFetch(path, params = {}) {
  if (ODDS_KEYS.length === 0) {
    const err = new Error("Aucune clé The Odds API configurée.");
    err.code = "NO_ODDS_KEYS";
    throw err;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  let lastError = null;

  for (const key of getOddsKeyOrder()) {
    const url = `${ODDS_BASE}${path}?${search.toString()}&apiKey=${encodeURIComponent(key)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000)
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (response.ok) {
        currentKeyIndex = (ODDS_KEYS.indexOf(key) + 1) % ODDS_KEYS.length;
        return { data, headers: response.headers };
      }

      // 401/403/429 : on essaie l'autre clé.
      if ([401, 403, 429].includes(response.status)) {
        lastError = new Error(
          `The Odds API HTTP ${response.status}: ${data?.message || "clé/quota"}`
        );
        continue;
      }

      const err = new Error(
        `The Odds API HTTP ${response.status}: ${data?.message || "erreur"}`
      );
      err.status = response.status;
      throw err;
    } catch (err) {
      lastError = err;
      // Réseau/timeout : on essaie l'autre clé.
    }
  }

  throw lastError || new Error("Impossible de contacter The Odds API.");
}

function normalizeSport(sport) {
  return String(sport || "").trim();
}

function normalizeMarkets(markets) {
  if (!markets) return "h2h";
  return String(markets)
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .join(",");
}

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    service: "apex-bet-backend",
    status: "online",
    node: process.version,
    oddsKeysConfigured: ODDS_KEYS.length,
    firebaseConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    aiConfigured: Boolean(process.env.AI_API_KEY),
    time: new Date().toISOString()
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    sportsSource: "The Odds API",
    oddsKeysConfigured: ODDS_KEYS.length,
    aiConfigured: Boolean(process.env.AI_API_KEY),
    firebaseConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    cacheTtlSeconds: CACHE_TTL / 1000
  });
});

app.get("/api/sports", async (req, res) => {
  const key = "sports";
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    const result = await oddsFetch("/sports");
    const data = Array.isArray(result.data) ? result.data : [];
    const payload = {
      ok: true,
      sports: data.map(s => ({
        key: s.key,
        group: s.group,
        title: s.title,
        description: s.description,
        active: s.active,
        has_outrights: s.has_outrights
      }))
    };
    cacheSet(key, payload);
    res.json(payload);
  } catch (e) {
    jsonError(res, 502, "Impossible de récupérer les sports.", e.message);
  }
});

app.get("/api/odds", async (req, res) => {
  const sport = normalizeSport(req.query.sport);
  if (!sport) {
    return jsonError(res, 400, "Le paramètre sport est obligatoire.");
  }

  const params = {
    regions: req.query.regions || "eu",
    markets: normalizeMarkets(req.query.markets || "h2h"),
    oddsFormat: req.query.oddsFormat || "decimal",
    dateFormat: req.query.dateFormat || "iso",
    bookmakers: req.query.bookmakers || undefined,
    commenceTimeFrom: req.query.commenceTimeFrom || undefined,
    commenceTimeTo: req.query.commenceTimeTo || undefined
  };

  const cacheKey = `odds:${sport}:${JSON.stringify(params)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await oddsFetch(`/sports/${encodeURIComponent(sport)}/odds`, params);
    const data = Array.isArray(result.data) ? result.data : [];

    const payload = {
      ok: true,
      sport,
      count: data.length,
      events: data
    };

    cacheSet(cacheKey, payload);

    res.json(payload);
  } catch (e) {
    jsonError(res, 502, "Impossible de récupérer les cotes.", e.message);
  }
});

app.get("/api/events", async (req, res) => {
  const sport = normalizeSport(req.query.sport);
  if (!sport) {
    return jsonError(res, 400, "Le paramètre sport est obligatoire.");
  }

  const params = {
    dateFormat: req.query.dateFormat || "iso",
    commenceTimeFrom: req.query.commenceTimeFrom || undefined,
    commenceTimeTo: req.query.commenceTimeTo || undefined
  };

  const cacheKey = `events:${sport}:${JSON.stringify(params)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await oddsFetch(`/sports/${encodeURIComponent(sport)}/events`, params);
    const data = Array.isArray(result.data) ? result.data : [];

    const payload = {
      ok: true,
      sport,
      count: data.length,
      events: data
    };

    cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    jsonError(res, 502, "Impossible de récupérer les événements.", e.message);
  }
});

// Analyse IA : le frontend envoie les données déjà récupérées.
// Cela évite d'exposer la clé IA dans Netlify.
app.post("/api/ai/analyze", async (req, res) => {
  if (!process.env.AI_API_KEY) {
    return jsonError(res, 503, "Analyse IA non activée : AI_API_KEY manque dans Render.");
  }

  const { sport, event, odds, userQuestion } = req.body || {};

  if (!event) {
    return jsonError(res, 400, "Le champ event est obligatoire.");
  }

  const systemPrompt = `
Tu es le moteur d'analyse d'Apex Bet.
Ton rôle est d'analyser des événements sportifs à partir de données fournies.
Tu ne dois jamais promettre un gain ni présenter une prédiction comme certaine.
Tu dois privilégier la sélection des événements où les données sont suffisamment cohérentes.
Si la confiance est faible, recommande de NE PAS afficher le match.
Réponds en français.
Retourne une analyse structurée avec :
- verdict
- niveau de confiance de 0 à 100
- facteurs positifs
- facteurs négatifs
- marché éventuellement intéressant
- raison de l'abstention si la confiance est insuffisante.
`;

  const userPrompt = JSON.stringify({
    sport: sport || null,
    event,
    odds: odds || null,
    question: userQuestion || null
  });

  try {
    const response = await fetch(
      process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.AI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return jsonError(res, 502, "Le service IA a refusé la requête.", data);
    }

    res.json({
      ok: true,
      analysis: data?.choices?.[0]?.message?.content || "",
      providerResponse: data
    });
  } catch (e) {
    jsonError(res, 502, "Impossible de contacter le service IA.", e.message);
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route introuvable",
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === "Origin non autorisée par CORS") {
    return jsonError(res, 403, err.message);
  }
  return jsonError(res, 500, "Erreur interne du serveur.");
});

app.listen(PORT, () => {
  console.log(`Apex Bet backend démarré sur le port ${PORT}`);
});
