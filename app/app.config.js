// Config Expo dynamique (remplace app.json) — permet d'injecter RELAIS_URL via
// une variable d'environnement au moment du build (eas.json > build.*.env).
//
// L'URL du serveur de jeu est lue depuis process.env.RELAIS_URL, avec un défaut.
// Dans le code : Constants.expoConfig.extra.relaisUrl
const RELAIS_URL = process.env.RELAIS_URL || "https://relais-server.onrender.com";

// Sons embarqués. snd_break = son de bris joué quand la chaîne casse.
const SOUNDS = [
  "./assets/snd_break.wav",
  "./assets/snd_tamerelechat.caf",
  "./assets/snd_reveille.caf",
  "./assets/snd_alloterre.caf",
  "./assets/snd_tesou.caf",
  "./assets/snd_debout.caf",
  "./assets/snd_reponds.caf",
  "./assets/snd_coucou.caf",
  "./assets/snd_troptard.caf",
  "./assets/snd_bipbip.caf",
  "./assets/snd_leveletoi.caf",
];

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
        UIBackgroundModes: ["remote-notification"],
        ITSAppUsesNonExemptEncryption: false,
        // Géoloc : uniquement pour te rattacher à la ville la plus proche.
        NSLocationWhenInUseUsageDescription:
          "RELAIS utilise ta position une seule fois, à l'inscription, pour te placer sur la ville la plus proche. Tu peux refuser et choisir ta ville manuellement.",
        // ATT (App Tracking Transparency) : requis dès qu'un SDK de pub est ajouté.
        NSUserTrackingUsageDescription:
          "Cette autorisation permet d'afficher des publicités plus pertinentes. Tu peux refuser, le jeu marche pareil.",
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
        "POST_NOTIFICATIONS", // notifs Chaîne Humaine (Android 13+)
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      ["expo-notifications", { sounds: SOUNDS }],
      "expo-status-bar",
    ],
    extra: {
      relaisUrl: RELAIS_URL,
      eas: {
        projectId: "d0a5047c-d94c-428e-83f8-5a3a06c44e1f",
      },
    },
    owner: "ucuai",
  },
};
