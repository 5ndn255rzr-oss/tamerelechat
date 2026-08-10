# RELAIS ✨ — Game Design

> Un jeu d'adresse **coopétitif** (coopératif + compétitif) : une étincelle passe
> de joueur en joueur, chacun la maintient en vie, et chaque passe fait monter sa
> **ville** et son **pays** au classement mondial. Sans énergie, sans attente.

## 1. La promesse
- **Addictif** : boucle courte, skill-based, feedback instantané.
- **Zéro frustration d'attente** : pas d'énergie, pas de cooldown, pas de « reviens dans 4h ».
- **De la progression quand même** : rangs perso persistants + territoires qui grimpent.

### L'inversion du modèle « énergie »
Les jeux classiques te font **attendre eux** (jauge qui se recharge). RELAIS inverse :
**c'est le jeu qui t'attend, toi**. Pendant ton absence, le monde tourne (autres
joueurs + villes rivales), et quand tu reviens il y a une **pile d'opportunités**
(chaîne à défendre, classement à reprendre) — jamais une jauge vide qui t'interdit
de jouer.

> Slogan design : **« Le jeu ne te fait jamais attendre. C'est lui qui t'attend. »**

## 2. La boucle de jeu
1. **Grab** — tu ouvres, une étincelle est live immédiatement (pool mondial toujours plein).
2. **Hold** — défi d'adresse : tape quand l'aiguille passe dans la zone verte.
3. **Pass** — réussi → points banqués **instantanément**, la **chaîne mondiale** +1.
4. **Repeat** — pas de « game over ». Rater ne casse pas TA partie : ça **casse la chaîne commune** (retour à 0) → tension sociale, pas punition perso.

## 3. Progression & montée en difficulté
La difficulté est **désirable** : plus tu montes, plus c'est dur, plus ça rapporte.

| Rang    | Seuil XP | Multiplicateur | Zone verte | Vitesse aiguille |
|---------|---------:|:--------------:|:----------:|:----------------:|
| Bronze  | 0        | ×1             | large      | lente            |
| Argent  | 60       | ×2             | ↓          | ↑                |
| Or      | 180      | ×5             | ↓↓         | ↑↑               |
| Diamant | 420      | ×12            | ↓↓↓        | ↑↑↑              |
| Légende | 900      | ×30            | minuscule  | rapide           |

→ Un seul joueur **Légende** pèse autant que 30 débutants. Le skill se traduit
directement en **puissance territoriale** : une petite ville avec 2-3 tueurs peut
renverser une métropole molle.

## 4. Territoires (la couche compétitive)
Chaque passe remonte dans une hiérarchie géographique emboîtée :

```
Toi ▸ Ville ▸ Région ▸ Pays ▸ Continent ▸ 🌍 Monde
```

- Chaque étage a **son classement en direct**.
- Un seul geste (la passe) marque des points à tous les étages à la fois.
- **Implémenté** : Ville, Pays et Continent en classement live (`/api/state`), plus
  le **zoom national par région** (`/api/country?name=`). Le tout sur une **vraie
  carte du monde** (projection équirectangulaire).

### Anti-frustration compétitive
- **Saisons courtes** (ex. 1 semaine) : reset des classements → une ville battue n'est jamais éliminée, tout le monde repart avec de l'espoir.
- **Ligues avec montée/descente** (à venir) : tu affrontes des villes de taille comparable → matchs toujours serrés.
- **Le rang perso ne redescend pas** avec la saison → tu progresses toujours quelque part.

## 5. Le hook social (notifications push)
- *« 🚨 Courbevoie vient de passer devant Nanterre. Reprends le lead. »*
- *« Il reste 2h. Ta ville est 2e du 92. »*
- Rivalités ville-contre-ville → les gens **recrutent leurs potes IRL** = croissance virale gratuite.
- Bouton **« Défie tes potes »** (partage natif) pour ramener des joueurs.

## 6. Pourquoi ça n'existe pas
- Les roguelites « no-wait » sont **solo** et se **reset** à chaque mort.
- Les jeux `.io` temps réel n'ont **pas de méta-progression persistante**.
- Les clan wars reposent sur des **clans virtuels** aléatoires, pas sur ta **vraie ville en temps réel**.
- Personne n'a fusionné **relais temps réel massif + progression persistante + zéro énergie + guerre de territoire géographique réelle**.

## 7. État du prototype (ce dossier)
Jeu **web jouable** complet : défi d'adresse, passe/casse, rangs + multiplicateurs,
chaîne mondiale live, classements Ville/Pays/Continent, carte du monde, ligues,
saisons, boutique, monde vivant (bots). Voir `README.md` pour lancer.

**App native (iOS/Android)** : coquille **WebView** (`app/App.js`) qui charge ce jeu
web. Toute la logique de jeu reste en un seul endroit (le web).

> Le mode « Chaîne Humaine » (hot-potato entre potes) a été **retiré** : le jeu
> est recentré sur la **chaîne mondiale**, son cœur.

### Déjà en place
- [x] Boucle chaîne mondiale (défi d'adresse, rangs, difficulté, territoires ville/pays)
- [x] **Combos** + **Mode Fièvre** collectif + **Couronne** du Porteur d'Étincelle (démo web)
- [x] **Saisons** : reset auto des territoires, panthéon des gagnants, rangs perso conservés (`/api/season`, `SEASON_SEC`)
- [x] **Carte de conquête** : villes géolocalisées, la #1 s'allume (`/api/map`) — d'abord
      l'Hexagone, puis remplacée par la **carte du monde** (cf. plus bas)
- [x] **Son de bris** quand la chaîne casse (le prank « ta mère le chat » a été retiré)
- [~] ~~Chaîne Humaine (hot-potato)~~ — **retirée** : jeu recentré sur la chaîne mondiale

- [x] **Carte du monde** : projection équirectangulaire, villes en lat/lng, compétition mondiale
- [x] **Étage Continents** (Ville ▸ Pays ▸ Continent ▸ Monde) — `/api/state.continents`
- [x] **Ligues avec montée/descente** : villes réparties en divisions, top 2 montent / bottom 2 descendent
      en fin de saison (`/api/leagues`, les ligues persistent entre saisons)

- [x] **Persistance Supabase** : saisons, panthéon, scores et ligues survivent aux
      redémarrages (instantané JSON, sauvegarde périodique + fin de saison). Voir
      `SETUP_SUPABASE.md`. Sans clés → repli automatique en mémoire.

- [x] **GPS réel** à l'inscription : bouton « ma position » → place le joueur sur la
      ville la plus proche (repli menu si refusé)
- [x] **Temps réel (SSE)** : `/api/stream` remplace le polling — push serveur→client
      instantané (la chaîne des autres bouge en direct), repli polling auto
- [x] **Zoom national (régions)** : `/api/country?name=` regroupe les villes d'un pays
      par région ; panneau « 🔎 régions » côté client

- [x] **Comptes durables** : token renvoyé au join, pseudo + rang (xp, bestStreak)
      gardés entre sessions/appareils, persistés dans l'instantané Supabase
- [x] **Anti-triche** : passes trop rapprochées rejetées côté serveur (429)
- [x] **Malus anti-sabotage** : casser la chaîne coûte des points (croissant) ; 3
      cassures en 30 s = carton rouge (suspension 10→120 s). Pendant la suspension,
      passes refusées et cassures ignorées → la chaîne mondiale est protégée. Le
      carton vit sur le **compte** (se reconnecter ne l'annule pas).

## Monétisation (hybrid-casual, 100 % équitable — aucun pay-to-win)
- [x] **Pub récompensée** : « revive » du carton rouge. `/api/ad/reward` (émet un
      jeton ; en prod = callback SSV AdMob) + `/api/revive` (consomme le jeton, lève
      la suspension une fois). L'escalade des bans persiste (anti-abus).
- [x] **Boutique cosmétique** : skins d'étincelle + **sons de bris** (Verre, Chaîne,
      Tonnerre, Cristal) joués quand la chaîne casse (`/api/shop`, `/api/buy`,
      `/api/equip`). Ownership sur le compte, persistée. Achat réel via l'IAP du
      store (stub en proto). Apparence + son uniquement, aucun avantage.
- [x] **Viralité** : bouton « Défie tes potes » (partage natif / Web Share API).
- [x] **Mesure de rétention** : `firstDay`/`days`/`lastSeen` par compte + `/api/metrics`
      (comptes, actifs 24 h, J1/J7 cohortes).
- [x] **Politique de confidentialité** (`/privacy.html`, modèle à compléter — requis pour les pubs).
- [ ] **Pass de saison** — *à brancher quand J7 > ~15 %* (repose sur le système de saisons déjà là).

### À faire avant / après la sortie
- [ ] Brancher le vrai SDK AdMob (rewarded) + IAP store (StoreKit/RevenueCat) dans l'app Expo
- [ ] Auth forte (e-mail / OAuth) au lieu du token local
- [ ] Modération des pseudos, limite de création de comptes (anti-spam mémoire)
- [ ] Sons/haptique enrichis, thème clair
