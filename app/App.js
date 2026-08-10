// App native RELAIS — coquille WebView.
//
// Le jeu complet (chaîne mondiale, arène, carte, classements, ligues, saisons,
// boutique) est servi par le serveur relais/ et affiché ici dans une WebView.
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";

const RELAIS_URL =
  Constants?.expoConfig?.extra?.relaisUrl || "https://relais-server.onrender.com";

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <WebView
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
