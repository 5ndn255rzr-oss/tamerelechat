// App native RELAIS — coquille WebView + pont pub récompensée AdMob.
//
// Le jeu complet (chaîne mondiale, arène, carte, classements, ligues, saisons,
// boutique) est servi par relais/ et affiché ici dans une WebView.
//
// Quand le jeu web veut afficher une pub (revive du carton, ou débloquer un
// cosmétique), il envoie { type: "SHOW_REWARDED" } via postMessage. On charge
// et montre alors une VRAIE pub récompensée AdMob, puis on renvoie le résultat
// au web (window.__onAdResult(true|false)). C'est ce pont qui permet de gagner
// de l'argent — chaque pub complétée = un revenu.
import { useRef, useEffect, useCallback } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import mobileAds, {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

const extra = Constants?.expoConfig?.extra || {};
const RELAIS_URL = extra.relaisUrl || "https://relais-server.onrender.com";

// Unité pub récompensée : réelle si fournie (via app.config.js/eas.json),
// sinon on retombe sur l'unité de TEST officielle Google.
// Si extra.useTestAds est vrai (env ADMOB_TEST_ADS=1), on FORCE les pubs de
// test (toujours remplies) — pratique pour valider le flux avant qu'AdMob
// n'approuve/serve tes vraies pubs. À repasser à 0 pour gagner de l'argent.
const useTestAds = String(extra.useTestAds) === "true";
const configuredUnit =
  Platform.OS === "ios" ? extra.rewardedUnitIdIos : extra.rewardedUnitIdAndroid;
const REWARDED_UNIT =
  !useTestAds && configuredUnit && configuredUnit.length > 0 ? configuredUnit : TestIds.REWARDED;

export default function App() {
  const webRef = useRef(null);
  const showingRef = useRef(false);

  // Initialise le SDK AdMob une fois.
  useEffect(() => {
    mobileAds().initialize().catch(() => {});
  }, []);

  // Renvoie le résultat de la pub au jeu web.
  const sendResult = useCallback((ok) => {
    webRef.current?.injectJavaScript(`window.__onAdResult && window.__onAdResult(${ok ? "true" : "false"}); true;`);
  }, []);

  // Charge puis affiche une pub récompensée ; résout via sendResult(true/false).
  const showRewarded = useCallback(() => {
    if (showingRef.current) return; // une pub à la fois
    showingRef.current = true;

    const ad = RewardedAd.createForAdRequest(REWARDED_UNIT, {
      requestNonPersonalizedAdsOnly: true, // pas de suivi -> déclaration privacy simple
    });

    let earned = false;
    let done = false;
    const subs = [];
    const cleanup = () => subs.forEach((u) => { try { u(); } catch (e) {} });
    const finish = (ok) => {
      if (done) return;
      done = true;
      cleanup();
      showingRef.current = false;
      sendResult(ok);
    };

    subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show().catch(() => finish(false));
    }));
    subs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true; // récompense validée par AdMob
    }));
    subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned)));
    subs.push(ad.addAdEventListener(AdEventType.ERROR, () => finish(false)));

    // Sécurité : si rien ne se charge en 30 s, on abandonne proprement.
    setTimeout(() => finish(earned), 30000);

    ad.load();
  }, [sendResult]);

  const onMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch (e) { return; }
    if (msg && msg.type === "SHOW_REWARDED") showRewarded();
  }, [showRewarded]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: RELAIS_URL }}
        style={styles.web}
        originWhitelist={["*"]}
        onMessage={onMessage}
        // Signale au jeu web que ce build sait afficher de VRAIES pubs AdMob.
        // Les anciens builds ne l'injectent pas -> le web reste sur la pub simulée.
        injectedJavaScriptBeforeContentLoaded={"window.__RELAIS_NATIVE_ADS = true; true;"}
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
