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

// --- Coordonnées pour la CARTE DE CONQUÊTE (x/y en % sur une carte de France) -
// x: 0 (ouest) -> 100 (est) ; y: 0 (nord) -> 100 (sud). Approx suffisant pour le proto.
const CITY_GEO = {
  "Paris":      { x: 49, y: 30, country: "France" },
  "Nanterre":   { x: 46, y: 29, country: "France" },
  "Courbevoie": { x: 47, y: 28, country: "France" },
  "Lille":      { x: 54, y: 8,  country: "France" },
  "Lyon":       { x: 66, y: 60, country: "France" },
  "Marseille":  { x: 71, y: 86, country: "France" },
  "Toulouse":   { x: 42, y: 82, country: "France" },
  "Bordeaux":   { x: 30, y: 68, country: "France" },
  "Nantes":     { x: 25, y: 47, country: "France" },
  "Strasbourg": { x: 88, y: 30, country: "France" },
  "Rennes":     { x: 20, y: 38, country: "France" },
  "Nice":       { x: 82, y: 82, country: "France" },
};

// Rivaux de départ : la carte/les classements ne sont jamais vides.
function seedRivals() {
  const seed = [
    ["Paris", 2300], ["Courbevoie", 1800], ["Lyon", 1600], ["Marseille", 1250],
    ["Lille", 950], ["Toulouse", 1100], ["Bordeaux", 700], ["Nantes", 640],
    ["Strasbourg", 520], ["Nice", 810], ["Rennes", 430],
  ];
  for (const [city, score] of seed) bumpTerritory(city, "France", score);
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
  // reset des territoires + de la chaîne ; les rangs perso (xp) restent acquis.
  cities.clear();
  countries.clear();
  chain.current = 0; chain.best = 0; chain.lastBreakBy = null; chain.lastBreakCity = null;
  for (const p of players.values()) { p.score = 0; p.streak = 0; }
  season = { number: season.number + 1, startedAt: Date.now() };
  seedRivals();
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

  const p = countries.get(country) || { score: 0, passes: 0 };
  p.score += points;
  p.passes += 1;
  countries.set(country, p);
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
    me: me ? publicPlayer(me) : null,
    myCityRank: me ? rankOf(cities, me.city) : null,
    myCountryRank: me ? rankOf(countries, me.country) : null,
  });
});

// --- CARTE DE CONQUÊTE : villes géolocalisées + qui mène -----------------------
app.get("/api/map", (_req, res) => {
  const top = leaderboard(cities, 1)[0]?.name || null;
  const maxScore = Math.max(1, ...[...cities.values()].map((c) => c.score));
  const nodes = Object.entries(CITY_GEO).map(([name, geo]) => {
    const c = cities.get(name);
    return {
      name, x: geo.x, y: geo.y, country: geo.country,
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
const BOT_CITIES = [
  ["Courbevoie", "France"], ["Lyon", "France"], ["Marseille", "France"],
  ["Nanterre", "France"], ["Lille", "France"], ["Toulouse", "France"],
  ["Bruxelles", "Belgique"], ["Genève", "Suisse"], ["Montréal", "Canada"],
  ["Dakar", "Sénégal"], ["Abidjan", "Côte d'Ivoire"],
];
if (process.env.RELAIS_NO_BOTS !== "1") {
  setInterval(() => {
    const [city, country] = BOT_CITIES[Math.floor(Math.random() * BOT_CITIES.length)];
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

app.listen(PORT, () => {
  console.log(`RELAIS ✨ sur http://localhost:${PORT} (hot-potato ${HOT_SEC}s)`);
});
