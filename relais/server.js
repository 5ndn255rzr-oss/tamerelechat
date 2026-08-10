// RELAIS — backend du jeu.
//
// Concept (cf. GAME_DESIGN.md) :
//  - Une étincelle passe de joueur en joueur. Chaque "passe" réussie banque des
//    points instantanément et allonge la CHAÎNE MONDIALE (record vivant commun).
//  - Rater le défi d'adresse CASSE la chaîne (retour à 0) -> tension sociale.
//  - Plus ton RANG monte, plus le défi est dur, plus la passe rapporte gros
//    (multiplicateur). La difficulté est donc désirable, pas punitive.
//  - Chaque passe remonte dans les TERRITOIRES : ta ville et ton pays montent
//    au classement. Guerre de clocher en temps réel.
//  - Zéro énergie, zéro cooldown : tu joues autant que tu veux, quand tu veux.
//
// État 100% en mémoire (suffisant pour un proto ; repart à zéro au redémarrage).

import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadSnapshot, saveSnapshot, persistenceEnabled } from "./persistence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const PORT = process.env.PORT || 3001;

// --- Paliers de rang : seuil d'XP -> multiplicateur + difficulté --------------
// `sweep` = vitesse de l'aiguille (× base) ; `zone` = largeur de la zone verte
// (fraction de la barre). Le client s'en sert pour régler le défi d'adresse.
const TIERS = [
  { name: "Bronze",  minXp: 0,    mult: 1,  sweep: 1.0, zone: 0.30 },
  { name: "Argent",  minXp: 60,   mult: 2,  sweep: 1.35, zone: 0.23 },
  { name: "Or",      minXp: 180,  mult: 5,  sweep: 1.8,  zone: 0.17 },
  { name: "Diamant", minXp: 420,  mult: 12, sweep: 2.3,  zone: 0.12 },
  { name: "Légende", minXp: 900,  mult: 30, sweep: 3.1,  zone: 0.08 },
];

function tierFor(xp) {
  let t = TIERS[0];
  for (const tier of TIERS) if (xp >= tier.minXp) t = tier;
  return t;
}
function nextTier(xp) {
  return TIERS.find((t) => t.minXp > xp) || null;
}

const BASE_POINTS = 10; // points d'une passe avant multiplicateur

// --- État --------------------------------------------------------------------
const players = new Map(); // id (session) -> { account, name, city, country, score, passes, streak, ... }
const accounts = new Map(); // token (durable) -> { name, xp, bestStreak, breaks, offenses, createdAt }
const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

// --- Anti-triche / anti-sabotage ---------------------------------------------
const MIN_PASS_MS = 180;        // intervalle mini entre 2 passes (bloque le spam serveur)
const GRIEF_WINDOW_MS = 30000;  // fenêtre de détection du sabotage
const GRIEF_TRIP = 3;           // nb de cassures dans la fenêtre -> carton rouge
const BREAK_PENALTY = 50;       // malus de score par cassure (croissant)
const cities = new Map();  // "Ville" -> { country, score, passes }
const countries = new Map(); // "Pays" -> { score, passes }

const chain = { current: 0, best: 0, lastBreakBy: null, lastBreakCity: null };

// --- Étage CONTINENT (Ville ▸ Pays ▸ Continent ▸ Monde) -----------------------
const CONTINENT_OF = {
  "France": "Europe", "Royaume-Uni": "Europe", "Allemagne": "Europe", "Espagne": "Europe",
  "Italie": "Europe", "Belgique": "Europe", "Suisse": "Europe", "Portugal": "Europe",
  "Russie": "Europe", "Turquie": "Europe",
  "Égypte": "Afrique", "Nigeria": "Afrique", "Sénégal": "Afrique", "Côte d'Ivoire": "Afrique",
  "Kenya": "Afrique", "Afrique du Sud": "Afrique",
  "Émirats": "Asie", "Inde": "Asie", "Thaïlande": "Asie", "Singapour": "Asie",
  "Chine": "Asie", "Corée": "Asie", "Japon": "Asie",
  "Australie": "Océanie",
  "Brésil": "Amérique du Sud", "Argentine": "Amérique du Sud",
  "Mexique": "Amérique du Nord", "USA": "Amérique du Nord", "Canada": "Amérique du Nord",
};
const continentOf = (country) => CONTINENT_OF[country] || "Monde";
const continents = new Map(); // "Continent" -> { score, passes }

// --- LIGUES (montée/descente entre villes de niveau comparable) ---------------
const LEAGUE_SIZE = 6;
const leagueOf = new Map(); // ville -> n° de ligue (1 = élite). Persiste entre saisons.

// --- Coordonnées mondiales pour la CARTE DE CONQUÊTE (latitude / longitude) ----
// Le client projette (lat,lng) en équirectangulaire sur une vraie carte du monde.
// `region` sert au ZOOM NATIONAL (regroupement des villes d'un même pays).
const CITY_GEO = {
  "Paris":        { lat: 48.85, lng: 2.35,   country: "France", region: "Île-de-France" },
  "Lyon":         { lat: 45.76, lng: 4.84,   country: "France", region: "Auvergne-Rhône-Alpes" },
  "Marseille":    { lat: 43.30, lng: 5.37,   country: "France", region: "Provence-Alpes-Côte d'Azur" },
  "Nice":         { lat: 43.70, lng: 7.27,   country: "France", region: "Provence-Alpes-Côte d'Azur" },
  "Toulouse":     { lat: 43.60, lng: 1.44,   country: "France", region: "Occitanie" },
  "Bordeaux":     { lat: 44.84, lng: -0.58,  country: "France", region: "Nouvelle-Aquitaine" },
  "Lille":        { lat: 50.63, lng: 3.06,   country: "France", region: "Hauts-de-France" },
  "Nantes":       { lat: 47.22, lng: -1.55,  country: "France", region: "Pays de la Loire" },
  "Strasbourg":   { lat: 48.57, lng: 7.75,   country: "France", region: "Grand Est" },
  "Londres":      { lat: 51.50, lng: -0.13,  country: "Royaume-Uni", region: "Angleterre" },
  "Berlin":       { lat: 52.52, lng: 13.40,  country: "Allemagne", region: "Berlin" },
  "Madrid":       { lat: 40.42, lng: -3.70,  country: "Espagne", region: "Madrid" },
  "Rome":         { lat: 41.90, lng: 12.50,  country: "Italie", region: "Latium" },
  "Bruxelles":    { lat: 50.85, lng: 4.35,   country: "Belgique", region: "Bruxelles-Capitale" },
  "Genève":       { lat: 46.20, lng: 6.14,   country: "Suisse", region: "Genève" },
  "Lisbonne":     { lat: 38.72, lng: -9.14,  country: "Portugal", region: "Lisbonne" },
  "Moscou":       { lat: 55.75, lng: 37.62,  country: "Russie", region: "Moscou" },
  "Istanbul":     { lat: 41.01, lng: 28.98,  country: "Turquie", region: "Marmara" },
  "Le Caire":     { lat: 30.04, lng: 31.24,  country: "Égypte", region: "Le Caire" },
  "Lagos":        { lat: 6.52,  lng: 3.38,   country: "Nigeria", region: "Lagos" },
  "Dakar":        { lat: 14.72, lng: -17.47, country: "Sénégal", region: "Dakar" },
  "Abidjan":      { lat: 5.35,  lng: -4.00,  country: "Côte d'Ivoire", region: "Abidjan" },
  "Nairobi":      { lat: -1.29, lng: 36.82,  country: "Kenya", region: "Nairobi" },
  "Johannesburg": { lat: -26.20, lng: 28.04, country: "Afrique du Sud", region: "Gauteng" },
  "Dubaï":        { lat: 25.20, lng: 55.27,  country: "Émirats", region: "Dubaï" },
  "Mumbai":       { lat: 19.08, lng: 72.88,  country: "Inde", region: "Maharashtra" },
  "Delhi":        { lat: 28.61, lng: 77.21,  country: "Inde", region: "Delhi" },
  "Bangkok":      { lat: 13.76, lng: 100.50, country: "Thaïlande", region: "Bangkok" },
  "Singapour":    { lat: 1.35,  lng: 103.82, country: "Singapour", region: "Singapour" },
  "Pékin":        { lat: 39.90, lng: 116.40, country: "Chine", region: "Pékin" },
  "Shanghai":     { lat: 31.23, lng: 121.47, country: "Chine", region: "Shanghai" },
  "Séoul":        { lat: 37.57, lng: 126.98, country: "Corée", region: "Séoul" },
  "Tokyo":        { lat: 35.68, lng: 139.65, country: "Japon", region: "Kantō" },
  "Sydney":       { lat: -33.87, lng: 151.21, country: "Australie", region: "Nouvelle-Galles du Sud" },
  "São Paulo":    { lat: -23.55, lng: -46.63, country: "Brésil", region: "São Paulo" },
  "Buenos Aires": { lat: -34.60, lng: -58.38, country: "Argentine", region: "Buenos Aires" },
  "Mexico":       { lat: 19.43, lng: -99.13, country: "Mexique", region: "Mexico" },
  "New York":     { lat: 40.71, lng: -74.00, country: "USA", region: "New York" },
  "Los Angeles":  { lat: 34.05, lng: -118.24, country: "USA", region: "Californie" },
  "Montréal":     { lat: 45.50, lng: -73.57, country: "Canada", region: "Québec" },
};
const regionOf = (city) => CITY_GEO[city]?.region || "—";

// Rivaux de départ : la carte/les classements ne sont jamais vides.
function seedRivals() {
  const seed = [
    ["Paris", 2300], ["Londres", 2100], ["New York", 1950], ["Tokyo", 1800],
    ["Shanghai", 1700], ["Lyon", 1450], ["São Paulo", 1400], ["Mumbai", 1300],
    ["Lagos", 1250], ["Marseille", 1150], ["Mexico", 1100], ["Séoul", 940],
    ["Bruxelles", 950], ["Lille", 900], ["Istanbul", 880], ["Dakar", 820],
    ["Toulouse", 780], ["Sydney", 760], ["Le Caire", 690], ["Bordeaux", 620],
  ];
  seed.forEach(([city, score], i) => {
    if (!leagueOf.has(city)) leagueOf.set(city, Math.floor(i / LEAGUE_SIZE) + 1); // ligues initiales par rang de départ
    bumpTerritory(city, CITY_GEO[city].country, score);
  });
}

// --- SAISONS -----------------------------------------------------------------
const SEASON_SEC = Number(process.env.SEASON_SEC || 7 * 24 * 3600); // 1 semaine par défaut
let season = { number: 1, startedAt: Date.now() };
const hallOfFame = []; // [{ season, topCity, topCountry, chainBest }]

function endSeason() {
  const tc = leaderboard(cities, 1)[0];
  const tp = leaderboard(countries, 1)[0];
  hallOfFame.unshift({
    season: season.number,
    topCity: tc?.name || null,
    topCountry: tp?.name || null,
    chainBest: chain.best,
  });
  if (hallOfFame.length > 10) hallOfFame.pop();
  console.log(`[saison] fin S${season.number} — 🏆 ${tc?.name || "?"} / ${tp?.name || "?"} (chaîne ${chain.best})`);
  // montée/descente AVANT le reset (utilise les scores de la saison qui s'achève)
  applyPromotionRelegation();
  // reset des territoires + de la chaîne ; rangs perso (xp) et ligues conservés.
  cities.clear();
  countries.clear();
  continents.clear();
  chain.current = 0; chain.best = 0; chain.lastBreakBy = null; chain.lastBreakCity = null;
  for (const p of players.values()) { p.score = 0; p.streak = 0; }
  season = { number: season.number + 1, startedAt: Date.now() };
  seedRivals();
  saveSnapshot(buildSnapshot()); // fige la nouvelle saison + le panthéon
}

// --- Persistance : (dé)sérialisation de l'état durable ------------------------
function buildSnapshot() {
  return {
    season,
    hallOfFame,
    chainBest: chain.best,
    cities: [...cities.entries()].map(([name, c]) => ({
      name, country: c.country, score: c.score, league: leagueOf.get(name) || 1,
    })),
    accounts: [...accounts.entries()].map(([token, a]) => ({ token, ...a })),
  };
}
function hydrate(snap) {
  if (!snap || !Array.isArray(snap.cities)) return false;
  cities.clear(); countries.clear(); continents.clear(); leagueOf.clear();
  for (const c of snap.cities) {
    leagueOf.set(c.name, c.league || 1);
    bumpTerritory(c.name, c.country, c.score); // reconstruit villes/pays/continents
  }
  if (Array.isArray(snap.accounts)) {
    accounts.clear();
    for (const a of snap.accounts) {
      const { token, ...rest } = a;
      accounts.set(token, {
        name: rest.name, xp: rest.xp || 0, bestStreak: rest.bestStreak || 0,
        breaks: rest.breaks || 0, offenses: rest.offenses || 0, createdAt: rest.createdAt || Date.now(),
        bannedUntil: rest.bannedUntil || 0, breakTimes: Array.isArray(rest.breakTimes) ? rest.breakTimes : [],
        revives: rest.revives || 0, owned: Array.isArray(rest.owned) ? rest.owned : [],
        equipped: rest.equipped || { spark: "default", break: "glass" },
        firstDay: rest.firstDay, lastSeen: rest.lastSeen || 0, days: Array.isArray(rest.days) ? rest.days : [],
      });
    }
  }
  if (snap.season) season = snap.season;
  if (Array.isArray(snap.hallOfFame)) { hallOfFame.length = 0; hallOfFame.push(...snap.hallOfFame); }
  chain.best = snap.chainBest || 0;
  return true;
}
setInterval(() => {
  if (Date.now() - season.startedAt >= SEASON_SEC * 1000) endSeason();
}, 3000);

seedRivals();

function seasonInfo() {
  return {
    number: season.number,
    startedAt: season.startedAt,
    secondsLeft: Math.max(0, Math.round((season.startedAt + SEASON_SEC * 1000 - Date.now()) / 1000)),
    durationSec: SEASON_SEC,
  };
}

function bumpTerritory(city, country, points) {
  const c = cities.get(city) || { country, score: 0, passes: 0 };
  c.score += points;
  c.passes += 1;
  c.country = country;
  cities.set(city, c);
  // nouvelle ville -> entre dans la ligue la plus basse
  if (!leagueOf.has(city)) {
    leagueOf.set(city, leagueOf.size ? Math.max(...leagueOf.values()) : 1);
  }

  const p = countries.get(country) || { score: 0, passes: 0 };
  p.score += points;
  p.passes += 1;
  countries.set(country, p);

  const cont = continentOf(country);
  const k = continents.get(cont) || { score: 0, passes: 0 };
  k.score += points;
  k.passes += 1;
  continents.set(cont, k);
}

// Classement d'une ligue + zones montée/descente
function leagueStandings() {
  const out = {};
  for (const [city, c] of cities) {
    const lg = leagueOf.get(city) || 1;
    (out[lg] ||= []).push({ name: city, score: c.score, country: c.country });
  }
  for (const lg of Object.keys(out)) out[lg].sort((a, b) => b.score - a.score);
  return out;
}
function myLeagueInfo(cityName) {
  const lg = leagueOf.get(cityName);
  if (!lg) return null;
  const st = leagueStandings()[lg] || [];
  const pos = st.findIndex((x) => x.name === cityName) + 1;
  const maxL = leagueOf.size ? Math.max(...leagueOf.values()) : 1;
  return {
    league: lg, pos, size: st.length,
    promo: pos >= 1 && pos <= 2 && lg > 1,           // top 2 -> montée
    releg: pos > st.length - 2 && lg < maxL,          // bottom 2 -> descente
    rivals: st.slice(Math.max(0, pos - 2), pos + 1),  // voisins directs
  };
}
// Applique la montée/descente en fin de saison (sur les scores courants)
function applyPromotionRelegation() {
  const byLeague = leagueStandings();
  const maxL = leagueOf.size ? Math.max(...leagueOf.values()) : 1;
  for (const lg of Object.keys(byLeague)) {
    const list = byLeague[lg], L = Number(lg);
    list.forEach((row, idx) => {
      if (idx < 2 && L > 1) leagueOf.set(row.name, L - 1);
      else if (idx >= list.length - 2 && L < maxL) leagueOf.set(row.name, L + 1);
    });
  }
}

function leaderboard(map, n = 6) {
  return [...map.entries()]
    .map(([name, v]) => ({ name, score: v.score, passes: v.passes, country: v.country }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function publicPlayer(p) {
  const a = p.account;
  const tier = tierFor(a.xp);
  const nt = nextTier(a.xp);
  const banMs = Math.max(0, (a.bannedUntil || 0) - Date.now());
  const denom = a.xp + a.breaks;
  return {
    name: a.name,
    city: p.city,
    country: p.country,
    xp: a.xp,
    score: p.score,
    passes: p.passes,
    streak: p.streak,
    bestStreak: a.bestStreak,
    breaks: a.breaks,
    accuracy: denom ? Math.round((a.xp / denom) * 100) : 100,
    banned: banMs > 0,
    bannedFor: Math.ceil(banMs / 1000),
    revives: a.revives || 0,
    equipped: a.equipped || { spark: "default", break: "glass" },
    owned: a.owned || [],
    tier: tier.name,
    mult: tier.mult,
    difficulty: { sweep: tier.sweep, zone: tier.zone },
    nextTier: nt ? { name: nt.name, xpNeeded: nt.minXp - a.xp } : null,
  };
}

// --- Un joueur rejoint : compte durable (pseudo + rang gardés entre appareils) -
app.post("/api/join", (req, res) => {
  const name = (req.body?.name || "Anonyme").toString().slice(0, 20);
  const city = (req.body?.city || "Inconnue").toString().slice(0, 30);
  const country = (req.body?.country || "France").toString().slice(0, 30);

  let token = (req.body?.token || "").toString();
  let account = token && accounts.get(token);
  if (account) {
    account.name = name; // on garde xp/rang/breaks, on rafraîchit juste le pseudo
  } else {
    token = newToken();
    account = { name, xp: 0, bestStreak: 0, breaks: 0, offenses: 0, createdAt: Date.now(),
      bannedUntil: 0, breakTimes: [], revives: 0, owned: [], equipped: { spark: "default", break: "glass" } };
    accounts.set(token, account);
  }
  // Défauts pour les comptes restaurés d'une ancienne sauvegarde.
  if (account.bannedUntil === undefined) account.bannedUntil = 0;
  if (!Array.isArray(account.breakTimes)) account.breakTimes = [];
  if (!Array.isArray(account.owned)) account.owned = [];
  if (!account.equipped) account.equipped = { spark: "default", break: "glass" };
  if (!account.equipped.break) account.equipped.break = "glass"; // migration ancien "taunt"

  // Rétention : jour de création + jours d'activité (cohortes J1/J7).
  const day = Math.floor(Date.now() / 86400000);
  account.firstDay = account.firstDay ?? day;
  account.lastSeen = Date.now();
  account.days = account.days || [];
  if (!account.days.includes(day)) account.days.push(day);

  const id = Math.random().toString(36).slice(2, 10);
  const player = { account, name, city, country, score: 0, passes: 0, streak: 0, lastPassAt: 0,
    rewardToken: null, rewardExp: 0 };
  players.set(id, player);
  console.log(`[join] ${name} (${city}, ${country}) rang ${account.xp}xp -> ${id}`);
  res.json({ playerId: id, token, me: publicPlayer(player) });
});

// --- Pub récompensée : "revive" du carton rouge ------------------------------
// Flux : le client montre une pub -> son SDK confirme la récompense -> on émet un
// jeton -> /api/revive consomme le jeton et lève la suspension une fois.
// EN PROD : /api/ad/reward doit être appelé par la Server-Side Verification
// d'AdMob (pas par le client) pour empêcher la triche. Ici (proto) le client
// l'appelle après le callback "rewarded".
app.post("/api/ad/reward", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu" });
  p.rewardToken = newToken();
  p.rewardExp = Date.now() + 90000; // 90s pour l'utiliser
  res.json({ ok: true, rewardToken: p.rewardToken });
});

app.post("/api/revive", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu" });
  const { rewardToken } = req.body || {};
  if (!rewardToken || rewardToken !== p.rewardToken || Date.now() > p.rewardExp) {
    return res.status(403).json({ error: "récompense invalide (regarde la pub)" });
  }
  p.rewardToken = null; // consommé
  const a = p.account;
  a.bannedUntil = 0;
  a.breakTimes = [];
  a.revives = (a.revives || 0) + 1;
  // L'escalade reste : la prochaine récidive rebanne plus longtemps (anti-abus).
  console.log(`[revive] ${a.name} a levé son carton via pub (total ${a.revives})`);
  res.json({ ok: true, me: publicPlayer(p) });
});

// --- Métriques de rétention (usage interne : mesurer J1/J7) -------------------
app.get("/api/metrics", (_req, res) => {
  const today = Math.floor(Date.now() / 86400000);
  const all = [...accounts.values()];
  const eligible1 = all.filter((a) => (a.firstDay ?? today) <= today - 1);
  const eligible7 = all.filter((a) => (a.firstDay ?? today) <= today - 7);
  const ret1 = eligible1.filter((a) => (a.days || []).includes((a.firstDay ?? 0) + 1)).length;
  const ret7 = eligible7.filter((a) => (a.days || []).some((d) => d >= (a.firstDay ?? 0) + 7)).length;
  res.json({
    accounts: all.length,
    activeLast24h: all.filter((a) => Date.now() - (a.lastSeen || 0) < 86400000).length,
    J1: eligible1.length ? +(100 * ret1 / eligible1.length).toFixed(1) : null,
    J7: eligible7.length ? +(100 * ret7 / eligible7.length).toFixed(1) : null,
    J1_sample: eligible1.length,
    J7_sample: eligible7.length,
  });
});

// --- BOUTIQUE COSMÉTIQUE (100% non pay-to-win : apparence + son uniquement) ----
// price en centimes (affichage). L'achat réel se fait via l'IAP du store
// (StoreKit/RevenueCat) qui valide le reçu ; ici (proto) /api/buy débloque
// directement. Les items "default" sont gratuits et toujours possédés.
const SHOP = {
  sparks: [
    { id: "default", name: "Étincelle classique", price: 0, color: "#ffc93d" },
    { id: "neon", name: "Néon violet", price: 199, color: "#a99bff" },
    { id: "fire", name: "Brasier", price: 199, color: "#ff7a1a" },
    { id: "ice", name: "Glace", price: 199, color: "#5ad1ff" },
    { id: "gold", name: "Or massif", price: 399, color: "#ffd700" },
  ],
  // Sons de bris joués quand la chaîne casse (cosmétique audio).
  breaks: [
    { id: "glass", name: "Verre brisé", price: 0, emoji: "🔨" },
    { id: "chain", name: "Chaîne rompue", price: 199, emoji: "⛓️" },
    { id: "thunder", name: "Tonnerre", price: 299, emoji: "⚡" },
    { id: "crystal", name: "Cristal", price: 299, emoji: "💎" },
  ],
};
const SLOT = { sparks: "spark", breaks: "break" }; // catégorie boutique -> emplacement équipé
const DEFAULT_EQUIP = { spark: "default", break: "glass" };
const shopItem = (type, id) => (SHOP[type] || []).find((i) => i.id === id);

app.get("/api/shop", (req, res) => {
  const p = players.get(req.query?.playerId);
  const a = p?.account;
  res.json({ shop: SHOP, owned: a?.owned || [], equipped: a?.equipped || { ...DEFAULT_EQUIP } });
});

app.post("/api/buy", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu" });
  const { type, itemId } = req.body || {};
  const item = shopItem(type, itemId);
  if (!item) return res.status(400).json({ error: "article introuvable" });
  const a = p.account;
  // En prod : vérifier ici le reçu d'achat du store avant de débloquer.
  if (item.price > 0 && !a.owned.includes(itemId)) a.owned.push(itemId);
  a.equipped[SLOT[type]] = itemId; // on équipe direct après achat
  console.log(`[shop] ${a.name} a acheté/équipé ${type}:${itemId}`);
  res.json({ ok: true, me: publicPlayer(p) });
});

app.post("/api/equip", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu" });
  const { type, itemId } = req.body || {};
  const item = shopItem(type, itemId);
  if (!item) return res.status(400).json({ error: "article introuvable" });
  const a = p.account;
  const ownsIt = item.price === 0 || a.owned.includes(itemId);
  if (!ownsIt) return res.status(403).json({ error: "article non possédé" });
  a.equipped[SLOT[type]] = itemId;
  res.json({ ok: true, me: publicPlayer(p) });
});

// --- Passe réussie : banque points + XP, allonge la chaîne, nourrit le territoire
app.post("/api/pass", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu (rejoins d'abord)" });

  const now = Date.now();
  const a = p.account;
  // Suspendu (carton anti-sabotage) : ne peut plus marquer.
  if ((a.bannedUntil || 0) > now) {
    return res.status(403).json({ error: "suspendu", bannedFor: Math.ceil((a.bannedUntil - now) / 1000), me: publicPlayer(p) });
  }
  // Anti-triche : impossible d'enchaîner les passes plus vite qu'un humain.
  if (now - p.lastPassAt < MIN_PASS_MS) {
    return res.status(429).json({ error: "trop rapide", me: publicPlayer(p) });
  }
  p.lastPassAt = now;

  const tier = tierFor(a.xp);
  const gained = BASE_POINTS * tier.mult;
  p.score += gained;
  a.xp += 1;
  p.passes += 1;
  p.streak += 1;
  if (p.streak > a.bestStreak) a.bestStreak = p.streak;

  bumpTerritory(p.city, p.country, gained);

  chain.current += 1;
  if (chain.current > chain.best) chain.best = chain.current;

  res.json({ ok: true, gained, chain: chain.current, me: publicPlayer(p) });
  broadcastWorld(); // les autres voient ta passe instantanément
});

// --- Raté : la chaîne mondiale tombe + MALUS anti-sabotage --------------------
// Un raté isolé = petit malus (accident). Mais celui qui casse la chaîne en
// rafale (sabotage volontaire) prend un malus croissant puis un CARTON ROUGE :
// pendant sa suspension, ses ratés n'affectent plus le monde (chaîne protégée).
app.post("/api/break", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu" });

  const now = Date.now();
  const a = p.account;

  // Déjà suspendu -> sa cassure est IGNORÉE (le saboteur ne peut plus nuire).
  // Le carton vit sur le COMPTE : se reconnecter ne le réinitialise pas.
  if ((a.bannedUntil || 0) > now) {
    p.streak = 0;
    return res.json({ ok: true, ignored: true, chain: chain.current,
      bannedFor: Math.ceil((a.bannedUntil - now) / 1000), me: publicPlayer(p) });
  }

  // Fenêtre glissante des cassures récentes (sur le compte).
  a.breakTimes = (a.breakTimes || []).filter((t) => now - t < GRIEF_WINDOW_MS);
  a.breakTimes.push(now);
  a.breaks += 1;
  const recent = a.breakTimes.length;

  // Malus de score croissant avec les cassures rapprochées.
  const penalty = BREAK_PENALTY * recent;
  p.score = Math.max(0, p.score - penalty);
  p.streak = 0;

  // Carton rouge au-delà du seuil : suspension qui double à chaque récidive.
  let banSec = 0;
  if (recent >= GRIEF_TRIP) {
    a.offenses += 1;
    banSec = Math.min(120, 10 * 2 ** (a.offenses - 1)); // 10, 20, 40, 80, 120s
    a.bannedUntil = now + banSec * 1000;
    a.breakTimes = [];
    console.log(`[carton] ${a.name} suspendu ${banSec}s (récidive #${a.offenses})`);
  }

  const brokeAt = chain.current;
  chain.current = 0;
  chain.lastBreakBy = a.name;
  chain.lastBreakCity = p.city;

  res.json({ ok: true, brokeAt, chain: 0, penalty, banSec, bannedFor: banSec, recent, me: publicPlayer(p) });
  broadcastWorld();
});

// --- Photo instantanée du monde ----------------------------------------------
function buildState(playerId) {
  const me = players.get(playerId);
  return {
    season: seasonInfo(),
    hallOfFame: hallOfFame.slice(0, 3),
    chain,
    playersOnline: players.size,
    cities: leaderboard(cities),
    countries: leaderboard(countries),
    continents: leaderboard(continents),
    me: me ? publicPlayer(me) : null,
    myCityRank: me ? rankOf(cities, me.city) : null,
    myCountryRank: me ? rankOf(countries, me.country) : null,
    myContinentRank: me ? rankOf(continents, continentOf(me.country)) : null,
    myContinent: me ? continentOf(me.country) : null,
    myLeague: me ? myLeagueInfo(me.city) : null,
    myCountry: me ? me.country : null,
    myRegion: me ? regionOf(me.city) : null,
  };
}
app.get("/api/state", (req, res) => res.json(buildState(req.query?.playerId)));

// --- TEMPS RÉEL : flux SSE du monde (remplace le polling) ---------------------
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no", // évite le buffering derrière un proxy
};
const worldClients = new Set();
app.get("/api/stream", (req, res) => {
  res.writeHead(200, SSE_HEADERS);
  res.write(": ok\n\n");
  const client = { res, playerId: req.query?.playerId };
  worldClients.add(client);
  sendWorld(client);
  req.on("close", () => worldClients.delete(client));
});
function sendWorld(client) {
  try { client.res.write(`data: ${JSON.stringify(buildState(client.playerId))}\n\n`); } catch (e) {}
}
function broadcastWorld() { for (const c of worldClients) sendWorld(c); }
setInterval(broadcastWorld, 1500); // rafraîchit classements (bots) + chrono saison

// --- LIGUES : classements par division + zones montée/descente -----------------
app.get("/api/leagues", (req, res) => {
  const standings = leagueStandings();
  const maxL = leagueOf.size ? Math.max(...leagueOf.values()) : 1;
  res.json({ leagueSize: LEAGUE_SIZE, maxLeague: maxL, standings, myLeague: myLeagueInfo(req.query?.city) });
});

// --- ZOOM NATIONAL : villes d'un pays regroupées par région -------------------
app.get("/api/country", (req, res) => {
  const name = (req.query?.name || "").toString();
  const regions = new Map(); // région -> { score, cities:[{name,score}] }
  for (const [city, c] of cities) {
    if (c.country !== name) continue;
    const rg = regionOf(city);
    const r = regions.get(rg) || { score: 0, cities: [] };
    r.score += c.score;
    r.cities.push({ name: city, score: c.score });
    regions.set(rg, r);
  }
  const out = [...regions.entries()]
    .map(([region, r]) => ({ region, score: r.score, cities: r.cities.sort((a, b) => b.score - a.score) }))
    .sort((a, b) => b.score - a.score);
  res.json({ country: name, regions: out });
});

// --- CARTE DE CONQUÊTE : villes géolocalisées + qui mène -----------------------
app.get("/api/map", (_req, res) => {
  const top = leaderboard(cities, 1)[0]?.name || null;
  const maxScore = Math.max(1, ...[...cities.values()].map((c) => c.score));
  const nodes = Object.entries(CITY_GEO).map(([name, geo]) => {
    const c = cities.get(name);
    return {
      name, lat: geo.lat, lng: geo.lng, country: geo.country,
      score: c?.score || 0,
      intensity: c ? c.score / maxScore : 0, // 0..1 pour la taille/opacité
      leader: name === top,
    };
  });
  res.json({ season: seasonInfo(), leader: top, nodes });
});

function rankOf(map, name) {
  const sorted = [...map.entries()].sort((a, b) => b[1].score - a[1].score);
  const i = sorted.findIndex(([n]) => n === name);
  return i === -1 ? null : { rank: i + 1, total: sorted.length };
}

app.get("/api/tiers", (_req, res) => res.json(TIERS));
app.get("/api/season", (_req, res) => res.json({ ...seasonInfo(), hallOfFame }));
app.get("/health", (_req, res) => res.send("relais ok ✨"));

// --- Monde vivant : des "bots" d'autres villes jouent en continu --------------
// Illustre le pilier « le jeu tourne même sans toi » : la carte bouge toute
// seule, les villes rivales grimpent, la chaîne progresse — sans jamais casser.
// Villes rivales du monde entier : la carte s'anime sur tous les continents.
const BOT_CITIES = Object.keys(CITY_GEO);
if (process.env.RELAIS_NO_BOTS !== "1") {
  setInterval(() => {
    const city = BOT_CITIES[Math.floor(Math.random() * BOT_CITIES.length)];
    const country = CITY_GEO[city].country;
    const mult = [1, 2, 5, 12][Math.floor(Math.random() * 4)];
    bumpTerritory(city, country, BASE_POINTS * mult);
    if (Math.random() < 0.5) {
      chain.current += 1;
      if (chain.current > chain.best) chain.best = chain.current;
    }
  }, 900);
}

// --- Démarrage : restaure l'état persistant puis sauvegarde périodiquement ----
(async () => {
  if (persistenceEnabled) {
    const snap = await loadSnapshot();
    if (hydrate(snap)) {
      console.log(`[persist] ✅ état restauré (saison ${season.number}, ${cities.size} villes, record chaîne ${chain.best})`);
    } else {
      console.log("[persist] aucune sauvegarde trouvée — démarrage neuf");
      saveSnapshot(buildSnapshot());
    }
    const saveSec = Number(process.env.SAVE_SEC || 20);
    setInterval(() => saveSnapshot(buildSnapshot()), saveSec * 1000);
    console.log(`[persist] Supabase activé (sauvegarde toutes les ${saveSec}s)`);
  } else {
    console.log("[persist] désactivé (état en mémoire) — définis SUPABASE_URL + SUPABASE_KEY pour persister");
  }
})();

app.listen(PORT, () => {
  console.log(`RELAIS ✨ sur http://localhost:${PORT}`);
});
