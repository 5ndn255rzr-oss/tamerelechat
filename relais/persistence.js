// Persistance Supabase (optionnelle) pour que saisons + classements survivent
// aux redémarrages (Render endort/relance le service).
//
// Activée dès que SUPABASE_URL et SUPABASE_KEY sont définis (sinon : no-op, on
// reste en mémoire comme avant). On stocke un seul instantané JSON dans une
// table `relais_state` (une ligne id=1, colonne jsonb `data`). Voir SETUP.md.

// Normalise l'URL : on tolère un espace, un "/" final ou un "/rest/v1" collé
// par erreur (cause fréquente de l'erreur PostgREST "Invalid path", PGRST125).
const URL = (process.env.SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "")       // enlève les "/" finaux
  .replace(/\/rest\/v1$/, "") // enlève un "/rest/v1" collé par erreur
  .replace(/\/+$/, "");
const KEY = (process.env.SUPABASE_KEY || "").trim();
const TABLE = process.env.SUPABASE_TABLE || "relais_state";

export const persistenceEnabled = !!(URL && KEY);

function headers(extra = {}) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra };
}

// Charge l'instantané au démarrage (ou null si vide / désactivé).
export async function loadSnapshot() {
  if (!persistenceEnabled) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/${TABLE}?id=eq.1&select=data`, { headers: headers() });
    if (!res.ok) { console.error("[persist] load HTTP", res.status); return null; }
    const rows = await res.json();
    return rows?.[0]?.data || null;
  } catch (e) {
    console.error("[persist] load échec", e.message);
    return null;
  }
}

// Sauvegarde (upsert) l'instantané. Fire-and-forget côté appelant.
export async function saveSnapshot(data) {
  if (!persistenceEnabled) return;
  try {
    const res = await fetch(`${URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify([{ id: 1, data, updated_at: new Date().toISOString() }]),
    });
    if (!res.ok) console.error("[persist] save HTTP", res.status, await res.text());
  } catch (e) {
    console.error("[persist] save échec", e.message);
  }
}
