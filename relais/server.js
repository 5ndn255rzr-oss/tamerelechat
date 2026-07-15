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
const players = new Map(); // id -> { name, city, country, xp, score, passes, streak, bestStreak }
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
const CITY_GEO = {
  "Paris":        { lat: 48.85, lng: 2.35,   country: "France" },
  "Londres":      { lat: 51.50, lng: -0.13,  country: "Royaume-Uni" },
  "Berlin":       { lat: 52.52, lng: 13.40,  country: "Allemagne" },
  "Madrid":       { lat: 40.42, lng: -3.70,  country: "Espagne" },
  "Rome":         { lat: 41.90, lng: 12.50,  country: "Italie" },
  "Bruxelles":    { lat: 50.85, lng: 4.35,   country: "Belgique" },
  "Genève":       { lat: 46.20, lng: 6.14,   country: "Suisse" },
  "Lisbonne":     { lat: 38.72, lng: -9.14,  country: "Portugal" },
  "Moscou":       { lat: 55.75, lng: 37.62,  country: "Russie" },
  "Istanbul":     { lat: 41.01, lng: 28.98,  country: "Turquie" },
  "Le Caire":     { lat: 30.04, lng: 31.24,  country: "Égypte" },
  "Lagos":        { lat: 6.52,  lng: 3.38,   country: "Nigeria" },
  "Dakar":        { lat: 14.72, lng: -17.47, country: "Sénégal" },
  "Abidjan":      { lat: 5.35,  lng: -4.00,  country: "Côte d'Ivoire" },
  "Nairobi":      { lat: -1.29, lng: 36.82,  country: "Kenya" },
  "Johannesburg": { lat: -26.20, lng: 28.04, country: "Afrique du Sud" },
  "Dubaï":        { lat: 25.20, lng: 55.27,  country: "Émirats" },
  "Mumbai":       { lat: 19.08, lng: 72.88,  country: "Inde" },
  "Delhi":        { lat: 28.61, lng: 77.21,  country: "Inde" },
  "Bangkok":      { lat: 13.76, lng: 100.50, country: "Thaïlande" },
  "Singapour":    { lat: 1.35,  lng: 103.82, country: "Singapour" },
  "Pékin":        { lat: 39.90, lng: 116.40, country: "Chine" },
  "Shanghai":     { lat: 31.23, lng: 121.47, country: "Chine" },
  "Séoul":        { lat: 37.57, lng: 126.98, country: "Corée" },
  "Tokyo":        { lat: 35.68, lng: 139.65, country: "Japon" },
  "Sydney":       { lat: -33.87, lng: 151.21, country: "Australie" },
  "São Paulo":    { lat: -23.55, lng: -46.63, country: "Brésil" },
  "Buenos Aires": { lat: -34.60, lng: -58.38, country: "Argentine" },
  "Mexico":       { lat: 19.43, lng: -99.13, country: "Mexique" },
  "New York":     { lat: 40.71, lng: -74.00, country: "USA" },
  "Los Angeles":  { lat: 34.05, lng: -118.24, country: "USA" },
  "Montréal":     { lat: 45.50, lng: -73.57, country: "Canada" },
};

// Rivaux de départ : la carte/les classements ne sont jamais vides.
function seedRivals() {
  const seed = [
    ["Paris", 2300], ["Londres", 2100], ["New York", 1950], ["Tokyo", 1800],
    ["Shanghai", 1700], ["Lagos", 1250], ["São Paulo", 1400], ["Mumbai", 1300],
    ["Bruxelles", 950], ["Dakar", 820], ["Sydney", 760], ["Mexico", 1100],
    ["Le Caire", 690], ["Istanbul", 880], ["Séoul", 940],
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
  };
}
function hydrate(snap) {
  if (!snap || !Array.isArray(snap.cities)) return false;
  cities.clear(); countries.clear(); continents.clear(); leagueOf.clear();
  for (const c of snap.cities) {
    leagueOf.set(c.name, c.league || 1);
    bumpTerritory(c.name, c.country, c.score); // reconstruit villes/pays/continents
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
  const tier = tierFor(p.xp);
  const nt = nextTier(p.xp);
  return {
    name: p.name,
    city: p.city,
    country: p.country,
    xp: p.xp,
    score: p.score,
    passes: p.passes,
    streak: p.streak,
    bestStreak: p.bestStreak,
    tier: tier.name,
    mult: tier.mult,
    difficulty: { sweep: tier.sweep, zone: tier.zone },
    nextTier: nt ? { name: nt.name, xpNeeded: nt.minXp - p.xp } : null,
  };
}

// --- Un joueur rejoint (choisit / hérite d'un territoire) --------------------
app.post("/api/join", (req, res) => {
  const name = (req.body?.name || "Anonyme").toString().slice(0, 20);
  const city = (req.body?.city || "Inconnue").toString().slice(0, 30);
  const country = (req.body?.country || "France").toString().slice(0, 30);
  const id = Math.random().toString(36).slice(2, 10);
  const player = { name, city, country, xp: 0, score: 0, passes: 0, streak: 0, bestStreak: 0 };
  players.set(id, player);
  console.log(`[join] ${name} (${city}, ${country}) -> ${id}`);
  res.json({ playerId: id, me: publicPlayer(player) });
});

// --- Passe réussie : banque points + XP, allonge la chaîne, nourrit le territoire
app.post("/api/pass", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu (rejoins d'abord)" });

  const tier = tierFor(p.xp);
  const gained = BASE_POINTS * tier.mult;
  p.score += gained;
  p.xp += 1;
  p.passes += 1;
  p.streak += 1;
  if (p.streak > p.bestStreak) p.bestStreak = p.streak;

  bumpTerritory(p.city, p.country, gained);

  chain.current += 1;
  if (chain.current > chain.best) chain.best = chain.current;

  res.json({ ok: true, gained, chain: chain.current, me: publicPlayer(p) });
});

// --- Raté : la chaîne mondiale tombe -----------------------------------------
app.post("/api/break", (req, res) => {
  const p = players.get(req.body?.playerId);
  if (!p) return res.status(404).json({ error: "joueur inconnu" });

  const brokeAt = chain.current;
  chain.current = 0;
  chain.lastBreakBy = p.name;
  chain.lastBreakCity = p.city;
  p.streak = 0;

  res.json({ ok: true, brokeAt, chain: 0, me: publicPlayer(p) });
});

// --- Photo instantanée du monde ----------------------------------------------
app.get("/api/state", (req, res) => {
  const me = players.get(req.query?.playerId);
  res.json({
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
  });
});

// --- LIGUES : classements par division + zones montée/descente -----------------
app.get("/api/leagues", (req, res) => {
  const standings = leagueStandings();
  const maxL = leagueOf.size ? Math.max(...leagueOf.values()) : 1;
  res.json({ leagueSize: LEAGUE_SIZE, maxLeague: maxL, standings, myLeague: myLeagueInfo(req.query?.city) });
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

// ============================================================================
// MODE « CHAÎNE HUMAINE » — le relais devient LITTÉRAL (hot-potato entre potes)
// ----------------------------------------------------------------------------
// Des potes rejoignent un salon (code à 4 lettres). L'étincelle passe de main
// en main : quand tu la reçois, tu dois la refiler à un autre AVANT la fin du
// chrono, sinon la chaîne casse et c'est TOI le maillon cramé -> ton écran te
// dit « ta mère le chat » 😼.
//
// Deux façons de jouer :
//  - WEB (humaine.html) : jouable au navigateur, sanction vocale.
//  - NATIF (app Expo) : les joueurs enregistrent un token push -> quand
//    l'étincelle t'arrive, ton iPhone SONNE même verrouillé, et si tu la lâches
//    la notif de sanction joue le son "ta mère le chat". C'est le vrai délire.
// ============================================================================
const HOT_SEC = Number(process.env.HOT_POTATO_SEC || 5);
const rooms = new Map(); // code -> room

// --- Envoi de notif push via Expo (repris du serveur "ta mère le chat") -------
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const SANCTION_SOUND = "snd_tamerelechat.caf";
async function sendPush(token, { title, body, sound, data }) {
  if (!token) return; // joueur web sans token natif : on ignore silencieusement
  const message = {
    to: token, title, body,
    sound: sound || "default",
    priority: "high",
    interruptionLevel: sound && sound !== "default" ? "time-sensitive" : "active",
    data: data || {},
  };
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error("[push] échec", err.message);
  }
}

const pid = () => Math.random().toString(36).slice(2, 10);
function newRoomCode() {
  let c;
  do { c = Math.random().toString(36).replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase(); }
  while (c.length < 4 || rooms.has(c));
  return c;
}

function roomView(room, playerId) {
  return {
    code: room.code,
    started: room.started,
    chain: room.chain,
    best: room.best,
    hostId: room.hostId,
    holderId: room.holderId,
    holderName: room.holderId ? room.players.get(room.holderId)?.name || null : null,
    isMine: room.holderId === playerId,
    secondsLeft: room.firesAt ? Math.max(0, (room.firesAt - Date.now()) / 1000) : null,
    deadline: HOT_SEC,
    players: [...room.players.entries()].map(([id, p]) => ({ id, name: p.name, isHolder: id === room.holderId, isMe: id === playerId })),
    lastLoss: room.lastLoss, // { id, playerId, name, brokeAt }
  };
}

function armTimer(room) {
  clearTimeout(room.timer);
  room.firesAt = Date.now() + HOT_SEC * 1000;
  room.timer = setTimeout(() => onTimeout(room), HOT_SEC * 1000);
}
function onTimeout(room) {
  const loserId = room.holderId;
  const loser = room.players.get(loserId);
  const broke = room.chain;
  room.chain = 0;
  room.lastLoss = { id: pid(), playerId: loserId, name: loser?.name || "?", brokeAt: broke };
  console.log(`[humaine] ${room.code} : ${room.lastLoss.name} s'est fait cramer (chaîne ${broke})`);
  // 😼 sanction sonore sur le téléphone du maillon cramé (même verrouillé)
  sendPush(loser?.token, {
    title: "😼 CRAMÉ",
    body: `t'as lâché l'étincelle (chaîne de ${broke})... ta mère le chat`,
    sound: SANCTION_SOUND,
    data: { type: "sanction", room: room.code },
  });
  // l'étincelle repart chez un autre au hasard pour relancer tout de suite
  const others = [...room.players.keys()].filter((id) => id !== loserId);
  room.holderId = others.length ? others[Math.floor(Math.random() * others.length)] : loserId;
  notifyHolder(room);
  armTimer(room);
}

// Réveille le nouveau porteur : son iPhone sonne, l'étincelle vient de lui tomber dessus.
function notifyHolder(room) {
  const h = room.players.get(room.holderId);
  sendPush(h?.token, {
    title: "✨ L'ÉTINCELLE EST À TOI",
    body: `refile-la en moins de ${HOT_SEC}s ou tu crames !`,
    data: { type: "spark", room: room.code },
  });
}

app.post("/api/room/create", (req, res) => {
  const name = (req.body?.name || "Hôte").toString().slice(0, 18);
  const token = req.body?.token || null; // token push Expo (app native) ou null (web)
  const code = newRoomCode();
  const id = pid();
  const room = { code, players: new Map([[id, { name, token }]]), hostId: id, holderId: null,
    started: false, chain: 0, best: 0, firesAt: null, timer: null, lastLoss: null };
  rooms.set(code, room);
  console.log(`[humaine] salon ${code} créé par ${name}${token ? " 📱" : ""}`);
  res.json({ code, playerId: id, room: roomView(room, id) });
});

app.post("/api/room/join", (req, res) => {
  const code = (req.body?.code || "").toString().toUpperCase().trim();
  const name = (req.body?.name || "Pote").toString().slice(0, 18);
  const token = req.body?.token || null;
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: "salon introuvable" });
  const id = pid();
  room.players.set(id, { name, token });
  res.json({ code, playerId: id, room: roomView(room, id) });
});

app.post("/api/room/start", (req, res) => {
  const room = rooms.get((req.body?.code || "").toUpperCase());
  if (!room) return res.status(404).json({ error: "salon introuvable" });
  if (req.body?.playerId !== room.hostId) return res.status(403).json({ error: "seul l'hôte peut lancer" });
  if (room.players.size < 2) return res.status(400).json({ error: "il faut au moins 2 joueurs" });
  room.started = true;
  room.chain = 0;
  room.holderId = room.hostId;
  notifyHolder(room);
  armTimer(room);
  res.json({ ok: true, room: roomView(room, req.body.playerId) });
});

app.post("/api/room/pass", (req, res) => {
  const room = rooms.get((req.body?.code || "").toUpperCase());
  if (!room) return res.status(404).json({ error: "salon introuvable" });
  const { playerId, toId } = req.body || {};
  if (room.holderId !== playerId) return res.status(409).json({ error: "tu n'as pas l'étincelle" });
  if (!room.players.has(toId) || toId === playerId) return res.status(400).json({ error: "destinataire invalide" });
  room.chain += 1;
  room.best = Math.max(room.best, room.chain);
  room.holderId = toId;
  notifyHolder(room); // 📱 réveille le destinataire : l'étincelle vient de lui tomber dessus
  armTimer(room);
  res.json({ ok: true, room: roomView(room, playerId) });
});

app.get("/api/room/state", (req, res) => {
  const room = rooms.get((req.query?.code || "").toUpperCase());
  if (!room) return res.status(404).json({ error: "salon introuvable" });
  res.json(roomView(room, req.query?.playerId));
});

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
  console.log(`RELAIS ✨ sur http://localhost:${PORT} (hot-potato ${HOT_SEC}s)`);
});
