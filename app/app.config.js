// Config Expo dynamique (remplace app.json) — permet d'injecter RELAIS_URL via
// une variable d'environnement au moment du build (eas.json > build.*.env).
//
// L'URL du serveur de jeu est lue depuis process.env.RELAIS_URL, avec un défaut.
// Dans le code : Constants.expoConfig.extra.relaisUrl
const RELAIS_URL = process.env.RELAIS_URL || "https://relais-server.onrender.com";

// --- AdMob ------------------------------------------------------------------
// Par défaut : identifiants de TEST officiels Google (l'app se build et montre
// des pubs de test sans compte AdMob). AVANT la mise en prod, crée ton compte
// AdMob et renseigne tes VRAIS identifiants via ces variables d'environnement
// (dans eas.json > build.production.env), sinon tu ne gagnes rien.
//
// IMPORTANT : l'App ID iOS est injecté DIRECTEMENT dans ios.infoPlist ci-dessous
// (GADApplicationIdentifier), et NON via le plugin react-native-google-mobile-ads.
// En config dynamique (app.config.js), le plugin ne lit pas toujours la clé
// racine -> l'App ID manquait dans Info.plist -> le SDK Google plantait au
// lancement (SIGABRT). Le mettre dans infoPlist est fiable à 100 %.
const ADMOB_ANDROID_APP_ID =
  process.env.ADMOB_ANDROID_APP_ID || "ca-app-pub-3940256099942544~3347511713";
const ADMOB_IOS_APP_ID =
  process.env.ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511";
// Unités "pub récompensée" (laisser vide en dev -> l'app utilise TestIds).
const REWARDED_UNIT_IOS = process.env.ADMOB_REWARDED_IOS || "";
const REWARDED_UNIT_ANDROID = process.env.ADMOB_REWARDED_ANDROID || "";

module.exports = {
  expo: {
    name: "RELAIS",
    slug: "tamerelechat", // slug interne EAS conservé (lié au projectId ci-dessous)
    scheme: "relais",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0e0b18",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.romain.relais",
      buildNumber: "1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // Géoloc : uniquement pour te rattacher à la ville la plus proche.
        NSLocationWhenInUseUsageDescription:
          "RELAIS utilise ta position une seule fois, à l'inscription, pour te placer sur la ville la plus proche. Tu peux refuser et choisir ta ville manuellement.",
        // AdMob (OBLIGATOIRE) : sans ce champ, le SDK Google Mobile Ads plante
        // au lancement. Injecté ici en dur pour ne dépendre d'aucun plugin.
        GADApplicationIdentifier: ADMOB_IOS_APP_ID,
        SKAdNetworkItems: [
          { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" }, // Google / AdMob
        ],
      },
    },
    android: {
      package: "com.romain.relais",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0e0b18",
      },
      permissions: [
        "ACCESS_COARSE_LOCATION", // ville la plus proche (facultatif)
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    // NB : le module natif react-native-google-mobile-ads est autolinké via
    // ses dépendances (package.json) — il n'a PAS besoin d'être listé ici comme
    // plugin. On l'a retiré car son plugin injectait mal l'App ID iOS (crash).
    // TODO Android : avant un build Android, ajouter la meta-data
    // com.google.android.gms.ads.APPLICATION_ID au manifeste (plugin inline).
    plugins: ["expo-status-bar"],
    extra: {
      relaisUrl: RELAIS_URL,
      rewardedUnitIdIos: REWARDED_UNIT_IOS,
      rewardedUnitIdAndroid: REWARDED_UNIT_ANDROID,
      eas: {
        projectId: "d0a5047c-d94c-428e-83f8-5a3a06c44e1f",
      },
    },
    owner: "ucuai",
  },
};
