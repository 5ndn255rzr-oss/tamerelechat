# RELAIS ✨ — prototype

Jeu d'adresse coopétitif : maintiens l'étincelle, allonge la **chaîne mondiale**,
fais grimper ta **ville** et ton **pays**. Sans énergie, sans attente.

Concept complet : voir [`GAME_DESIGN.md`](./GAME_DESIGN.md).

## Lancer

```bash
cd relais
npm install
npm start            # http://localhost:3001
```

Ouvre **http://localhost:3001**, choisis un blaze + une ville, et joue :
**clic / espace / touch** quand le trait blanc passe dans le vert.

- Réussi → points (× ton multiplicateur de rang) + chaîne +1.
- Raté → **la chaîne mondiale tombe à 0** 💀.
- Plus ton rang monte, plus la zone verte rétrécit et plus l'aiguille accélère.

Pour tester la **compétition à plusieurs**, ouvre plusieurs onglets avec des
villes différentes et regarde les classements bouger en direct. Des « bots »
d'autres villes jouent en continu pour montrer que le monde tourne même sans toi
(désactivable avec `RELAIS_NO_BOTS=1 npm start`).

## Endpoints

| Méthode | Route | Rôle |
|--------|-------|------|
| POST | `/api/join` | rejoindre `{name, city, country}` → `playerId` |
| POST | `/api/pass` | passe réussie `{playerId}` → points + chaîne |
| POST | `/api/break` | raté `{playerId}` → chaîne remise à 0 |
| GET  | `/api/state?playerId=` | chaîne + classements ville/pays/continent + ta ligue + toi |
| GET  | `/api/map` | villes géolocalisées (lat/lng) pour la carte du monde |
| GET  | `/api/leagues?city=` | divisions + montée/descente |
| GET  | `/api/season` | saison en cours + panthéon |
| GET  | `/api/tiers` | table des rangs / difficulté |

Chaîne Humaine (hot-potato) : `POST /api/room/{create,join,start,pass}` +
`GET /api/room/state`.

## Persistance (optionnelle)

Par défaut l'état est **en mémoire** (repart à zéro au redémarrage). Branche
**Supabase** pour que saisons, scores et ligues survivent — 2 minutes, sans
terminal : voir **[`SETUP_SUPABASE.md`](./SETUP_SUPABASE.md)**.
