// Relais de notifications push pour l'appli "ta mère le chat".
//
// Rôle : 2 iPhones enregistrent leur token Expo. Quand l'un "poke" l'autre,
// on envoie une notif tout de suite, et on lance un timer de 2 min.
// Si la cible ne répond pas (pas d'ACK) dans les 2 min -> on lui envoie une
// 2e notif avec le son "ta mère le chat" 🔊 (joué même écran verrouillé).

import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
// Délai avant la sanction sonore (en secondes). 120 = 2 min. Réglable pour tester.
const DEADLINE_SEC = Number(process.env.DEADLINE_SEC || 10);
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Sons embarqués dans l'app (doivent matcher app.json > expo-notifications > sounds).
// Sert de liste blanche : on ne joue que ces sons-là.
const SOUNDS = new Set([
  "snd_tamerelechat.caf",
  "snd_reveille.caf",
  "snd_alloterre.caf",
  "snd_tesou.caf",
  "snd_debout.caf",
  "snd_reponds.caf",
  "snd_coucou.caf",
  "snd_troptard.caf",
  "snd_bipbip.caf",
  "snd_leveletoi.caf",
]);
const DEFAULT_SOUND = "snd_tamerelechat.caf";

// État en mémoire (suffisant pour 2 téléphones ; réinitialisé au redémarrage).
const devices = new Map(); // name -> { token, updatedAt }
const pending = new Map(); // targetName -> { timeout, from, firesAt }

// --- Envoi d'une notif via le service push d'Expo -------------------------
async function sendPush(token, { title, body, sound, data }) {
  const message = {
    to: token,
    title,
    body,
    sound: sound || "default", // "tamerelechat.caf" pour la sanction
    priority: "high",
    data: data || {},
  };
  if (sound && sound !== "default") {
    // iOS : marque la notif comme critique-ish (volume) — le son custom est joué
    message.interruptionLevel = "time-sensitive";
  }
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(message),
    });
    const json = await res.json();
    console.log("[push]", token.slice(0, 18) + "…", JSON.stringify(json.data || json));
    return json;
  } catch (err) {
    console.error("[push] échec", err.message);
    return { error: err.message };
  }
}

function otherDevice(name) {
  for (const key of devices.keys()) {
    if (key !== name) return key;
  }
  return null;
}

function clearPending(targetName) {
  const p = pending.get(targetName);
  if (p) {
    clearTimeout(p.timeout);
    pending.delete(targetName);
    return true;
  }
  return false;
}

// --- Un téléphone s'enregistre --------------------------------------------
app.post("/register", (req, res) => {
  const { name, token } = req.body || {};
  if (!name || !token) return res.status(400).json({ error: "name et token requis" });
  devices.set(name, { token, updatedAt: Date.now() });
  console.log(`[register] ${name} -> ${token.slice(0, 18)}…`);
  res.json({ ok: true, devices: [...devices.keys()] });
});

// --- Un téléphone en poke un autre ----------------------------------------
app.post("/poke", async (req, res) => {
  const { from } = req.body || {};
  if (!from) return res.status(400).json({ error: "from requis" });

  // Son de sanction choisi par l'expéditeur (validé contre la liste blanche).
  const sound = SOUNDS.has(req.body?.sound) ? req.body.sound : DEFAULT_SOUND;

  const target = otherDevice(from);
  if (!target) return res.status(409).json({ error: "l'autre téléphone n'est pas encore enregistré" });

  const targetDev = devices.get(target);

  // On (re)lance le timer pour la cible.
  clearPending(target);
  await sendPush(targetDev.token, {
    title: "⏰ Réponds vite !",
    body: `${from} te réveille. Tape avant ${DEADLINE_SEC}s… ou sinon 🐱`,
    data: { type: "poke", from },
  });

  const firesAt = Date.now() + DEADLINE_SEC * 1000;
  const timeout = setTimeout(async () => {
    pending.delete(target);
    const dev = devices.get(target);
    if (!dev) return;
    console.log(`[sanction] ${target} n'a pas répondu -> son 🔊`);
    await sendPush(dev.token, {
      title: "😼",
      body: "trop tard...",
      sound,
      data: { type: "sanction" },
    });
  }, DEADLINE_SEC * 1000);

  pending.set(target, { timeout, from, firesAt, sound });
  console.log(`[poke] ${from} -> ${target} (deadline ${DEADLINE_SEC}s)`);
  res.json({ ok: true, target, deadlineSec: DEADLINE_SEC });
});

// --- La cible confirme avoir vu (annule la sanction) ----------------------
app.post("/ack", (req, res) => {
  const { from } = req.body || {};
  if (!from) return res.status(400).json({ error: "from requis" });
  const cancelled = clearPending(from);
  console.log(`[ack] ${from} ${cancelled ? "a désamorcé 💣" : "(rien en attente)"}`);
  res.json({ ok: true, cancelled });
});

// --- Petit statut pour debug ----------------------------------------------
app.get("/status", (_req, res) => {
  res.json({
    deadlineSec: DEADLINE_SEC,
    devices: [...devices.keys()],
    pending: [...pending.entries()].map(([target, p]) => ({
      target,
      from: p.from,
      secondsLeft: Math.max(0, Math.round((p.firesAt - Date.now()) / 1000)),
    })),
  });
});

app.get("/", (_req, res) => res.send("tamerelechat server ok 😼"));

app.listen(PORT, () => {
  console.log(`Serveur ta-mère-le-chat sur http://localhost:${PORT} (deadline ${DEADLINE_SEC}s)`);
});
