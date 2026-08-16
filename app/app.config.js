// Config Expo dynamique (remplace app.json) — permet d'injecter RELAIS_URL via
// une variable d'environnement au moment du build (eas.json > build.*.env).
//
// L'URL du serveur de jeu est lue depuis process.env.RELAIS_URL, avec un défaut.
// Dans le code : Constants.expoConfig.extra.relaisUrl
const RELAIS_URL = process.env.RELAIS_URL || "https://relais-server.onrender.com";

// --- Publicité ---------------------------------------------------------------
// Cette version est SANS pub : aucun SDK AdMob n'est embarqué (ni App ID, ni
// SKAdNetwork). Objectif : soumettre une app propre « sans publicité » tant
// qu'Apple n'a pas validé la v1.0. Pour réintroduire les pubs récompensées
// (v1.1), voir l'historique git d'avant ce commit (App.js/app.config.js/eas.json).

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
    plugins: ["expo-status-bar"],
    extra: {
      relaisUrl: RELAIS_URL,
      eas: {
        projectId: "d0a5047c-d94c-428e-83f8-5a3a06c44e1f",
      },
    },
    owner: "ucuai",
  },
};
