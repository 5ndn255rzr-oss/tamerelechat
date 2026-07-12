# 😼 ta mère le chat

Petite appli entre 2 iPhones. Un bouton réveille l'autre téléphone. Si l'autre
ne tape pas la notif dans les **2 minutes**, son iPhone hurle 🔊 **« ta mère le chat »**
(même écran verrouillé), parce que le message vocal devient le *son de la notification*.

```
Tel A  ──appuie──▶  serveur  ──notif──▶  Tel B   ("Réponds vite !")
                       │
                  timer 2 min
                       │
             pas d'ACK ▼
                    serveur  ──notif 🔊──▶  Tel B  ("ta mère le chat")
```

## Structure
- `server/` — relais push Node/Express + timer de 2 min (le cerveau)
- `app/` — appli Expo (React Native) installée sur les 2 iPhones
- `app/assets/tamerelechat.caf` — le son, généré avec la voix Thomas de macOS

## 1. Lancer le serveur
```bash
cd server
npm install
npm start          # écoute sur :3000, deadline 2 min
# pour tester vite : DEADLINE_SEC=10 npm start
```
Le serveur doit être **joignable par les 2 iPhones**. Deux options :
- **Même wifi (test)** : récupère l'IP locale du Mac (`ipconfig getifaddr en0`), ex `192.168.1.10`.
- **Partout (recommandé)** : déploie sur Render, cf. section ci-dessous.

## Déploiement du serveur sur Render (gratuit, marche en 4G)

Le fichier `render.yaml` à la racine configure tout automatiquement.

1. **Mets le projet sur GitHub** (depuis la racine `~/Desktop/tamerelechat`) :
   ```bash
   git add -A && git commit -m "tamerelechat"
   ```
   Crée un repo vide sur github.com (bouton *New*), puis :
   ```bash
   git remote add origin https://github.com/TON_PSEUDO/tamerelechat.git
   git branch -M main && git push -u origin main
   ```
2. Sur **render.com** (compte gratuit) : **New ▸ Blueprint** ▸ connecte ton repo.
   Render lit `render.yaml`, crée le service et le déploie. Tu obtiens une URL type
   `https://tamerelechat-server.onrender.com`.
3. Teste-la dans un navigateur : elle doit afficher `tamerelechat server ok 😼`.
4. **Reporte cette URL** dans `app/App.js` (`SERVER_URL`) puis **rebuild l'app** (étape 3).

> ⚠️ Le plan gratuit Render **met le service en veille après 15 min d'inactivité**.
> En jouant activement (poke + ack en 10s) il reste réveillé. Après une longue pause,
> le tout 1er poke peut mettre ~30s (réveil à froid) et un poke en attente pendant la
> mise en veille est perdu. Pour un jouet c'est OK. Pour l'éviter : garde-le éveillé
> avec un ping régulier (cf. `.github/workflows/keep-alive.yml`, optionnel).

## 2. Configurer l'app
1. Dans `app/App.js`, remplace `SERVER_URL` par l'URL de ton serveur (étape 1).
2. Crée le projet EAS pour obtenir un `projectId` (nécessaire aux push Expo) :
   ```bash
   cd app
   npm install
   npx eas-cli login          # crée un compte Expo gratuit si besoin
   npx eas-cli init           # écrit automatiquement le projectId dans app.json
   ```

## 3. Installer sur les iPhones
Les **sons de notif personnalisés ne marchent PAS dans Expo Go** : il faut un vrai build.
```bash
cd app
npx eas-cli build --profile development --platform ios
```
Suis les instructions (connexion compte Apple pour enregistrer les 2 iPhones).
Installe le build sur **chaque** iPhone via le lien fourni par EAS.

> Alternative sans compte Apple payant : build local
> `npx expo run:ios --device` en branchant chaque iPhone au Mac.

## 4. Jouer
1. Sur chaque iPhone : ouvre l'app, tape un prénom, **M'enregistrer** (accepte les notifs).
2. Sur le Tel A : **📢 RÉVEILLE L'AUTRE**.
3. Le Tel B reçoit la notif. S'il la tape (ou tape **✅ J'ai vu**) → désamorcé.
4. Sinon, 2 min plus tard : 🔊 *ta mère le chat*.

## Réglages
- **Durée** : variable d'env `DEADLINE_SEC` côté serveur (défaut 120).
- **Changer la phrase / la voix** : régénère le son
  ```bash
  say -v Thomas -r 190 "ta phrase" -o /tmp/s.aiff
  afconvert /tmp/s.aiff app/assets/tamerelechat.caf -d ima4 -f caff -v
  ```
  puis rebuild l'app (le son est embarqué dans le binaire).

## Limites iOS honnêtes
- Si l'iPhone cible est en **mode Silencieux / Concentration**, le son peut être
  coupé. Pour forcer le son même en silencieux il faut l'entitlement **Critical Alerts**
  d'Apple (demande spéciale à faire sur le compte développeur) — non inclus ici.
- Sans ça : le son joue si le volume sonnerie est monté et le tel pas en silencieux.
  Largement suffisant pour l'effet blague.
