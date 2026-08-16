// App native RELAIS — coquille WebView (version SANS publicité).
//
// Le jeu complet (chaîne mondiale, arène, carte, classements, ligues, saisons,
// boutique) est servi par relais/ et affiché ici dans une WebView. Cette version
// n'embarque AUCUN SDK publicitaire : tant que l'app n'est pas validée par Apple,
// les cosmétiques se débloquent directement côté web (pas de pub).
//
// Pour réintroduire les pubs récompensées AdMob plus tard (v1.1), voir l'historique
// git : App.js/app.config.js/eas.json d'avant ce commit contiennent le pont complet.
import { useRef } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";

const extra = Constants?.expoConfig?.extra || {};
const RELAIS_URL = extra.relaisUrl || "https://relais-server.onrender.com";

export default function App() {
  const webRef = useRef(null);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: RELAIS_URL }}
        style={styles.web}
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
