// App native RELAIS — coquille WebView.
//
// Le jeu complet (chaîne mondiale, arène, carte, classements, ligues, saisons,
// boutique, Chaîne Humaine) est servi par le serveur relais/ et affiché ici
// dans une WebView. On enregistre le token push natif et on l'injecte dans la
// page (window.__RELAIS_PUSH_TOKEN) pour que la Chaîne Humaine réveille l'iPhone
// même verrouillé quand l'étincelle arrive.
import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

const RELAIS_URL =
  Constants?.expoConfig?.extra?.relaisUrl || "https://relais-server.onrender.com";

// Affiche les notifs même app au premier plan (réveil de l'étincelle).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getPushToken() {
  try {
    if (!Device.isDevice) return null;
    const { status } = await Notifications.getPermissionsAsync();
    let s = status;
    if (s !== "granted") s = (await Notifications.requestPermissionsAsync()).status;
    if (s !== "granted") return null;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getPushToken().then((t) => { setToken(t); setReady(true); });
  }, []);

  if (!ready) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator color="#ffc93d" size="large" />
      </View>
    );
  }

  const inject = `window.__RELAIS_PUSH_TOKEN=${JSON.stringify(token)};true;`;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <WebView
        source={{ uri: RELAIS_URL }}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={inject}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}><ActivityIndicator color="#ffc93d" size="large" /></View>
        )}
        contentInsetAdjustmentBehavior="never"
        setSupportMultipleWindows={false}
        geolocationEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e0b18" },
  web: { flex: 1, backgroundColor: "#0e0b18" },
  center: { flex: 1, backgroundColor: "#0e0b18", alignItems: "center", justifyContent: "center" },
});
