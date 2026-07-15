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
Toi ▸ Ville ▸ Département ▸ Région ▸ Pays ▸ 🌍 Univers
```

- Chaque étage a **son classement en direct**.
- Un seul geste (la passe) marque des points aux **6 étages** à la fois.
- **MVP actuel** : 2 étages (Ville + Pays). Les 4 autres se branchent sur le même mécanisme d'agrégation.

### Anti-frustration compétitive
- **Saisons courtes** (ex. 1 semaine) : reset des classements → une ville battue n'est jamais éliminée, tout le monde repart avec de l'espoir.
- **Ligues avec montée/descente** (à venir) : tu affrontes des villes de taille comparable → matchs toujours serrés.
- **Le rang perso ne redescend pas** avec la saison → tu progresses toujours quelque part.

## 5. Le hook social (réutilise le moteur push de « ta mère le chat »)
- *« 🚨 Courbevoie vient de passer devant Nanterre. Reprends le lead. »*
- *« Il reste 2h. Ta ville est 2e du 92. »*
- Rivalités ville-contre-ville → les gens **recrutent leurs potes IRL** = croissance virale gratuite.

## 6. Pourquoi ça n'existe pas
- Les roguelites « no-wait » sont **solo** et se **reset** à chaque mort.
- Les jeux `.io` temps réel n'ont **pas de méta-progression persistante**.
- Les clan wars reposent sur des **clans virtuels** aléatoires, pas sur ta **vraie ville en temps réel**.
- Personne n'a fusionné **relais temps réel massif + progression persistante + zéro énergie + guerre de territoire géographique réelle**.

## 7. État du prototype (ce dossier)
Proto **web jouable** validant la boucle complète : défi d'adresse, passe/casse,
rangs + multiplicateurs, chaîne mondiale live, classements Ville & Pays, monde
vivant (bots d'autres villes). Voir `README.md` pour lancer.

### Déjà en place
- [x] Boucle chaîne mondiale (défi d'adresse, rangs, difficulté, territoires ville/pays)
- [x] **Combos** + **Mode Fièvre** collectif + **Couronne** du Porteur d'Étincelle (démo web)
- [x] **Saisons** : reset auto des territoires, panthéon des gagnants, rangs perso conservés (`/api/season`, `SEASON_SEC`)
- [x] **Carte de conquête** de l'Hexagone : villes géolocalisées, la #1 s'allume (`/api/map`)
- [x] **Chaîne Humaine** : hot-potato multijoueur en salon (web + écran natif) — `/api/room/*`
- [x] **Notifs push natives** : l'étincelle réveille l'iPhone verrouillé du destinataire ;
      le maillon cramé reçoit la notif sonore « ta mère le chat » (rebranche le moteur push d'origine)

- [x] **Carte du monde** : projection équirectangulaire, villes en lat/lng, compétition mondiale
- [x] **Étage Continents** (Ville ▸ Pays ▸ Continent ▸ Monde) — `/api/state.continents`
- [x] **Ligues avec montée/descente** : villes réparties en divisions, top 2 montent / bottom 2 descendent
      en fin de saison (`/api/leagues`, les ligues persistent entre saisons)

### Prochaines étapes
- [ ] Persistance (remplacer l'état en mémoire par une vraie base — Supabase)
- [ ] GPS réel à l'inscription (au lieu du menu déroulant)
- [ ] Temps réel poussé (WebSocket/SSE au lieu du polling)
- [ ] Départements / régions (zoom national, sous les villes d'un même pays)
