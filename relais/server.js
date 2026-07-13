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
let seasonStart = Date.now();
const players = new Map(); // id -> { name, city, country, xp, score, passes, streak, bestStreak }
const cities = new Map();  // "Ville" -> { country, score, passes }
const countries = new Map(); // "Pays" -> { score, passes }

const chain = { current: 0, best: 0, lastBreakBy: null, lastBreakCity: null };

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
    seasonStart,
    chain,
    playersOnline: players.size,
    cities: leaderboard(cities),
    countries: leaderboard(countries),
    me: me ? publicPlayer(me) : null,
    myCityRank: me ? rankOf(cities, me.city) : null,
    myCountryRank: me ? rankOf(countries, me.country) : null,
  });
});

function rankOf(map, name) {
  const sorted = [...map.entries()].sort((a, b) => b[1].score - a[1].score);
  const i = sorted.findIndex(([n]) => n === name);
  return i === -1 ? null : { rank: i + 1, total: sorted.length };
}

app.get("/api/tiers", (_req, res) => res.json(TIERS));
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

app.listen(PORT, () => {
  console.log(`RELAIS ✨ sur http://localhost:${PORT}`);
});
