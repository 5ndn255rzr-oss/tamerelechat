import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// >>> À CONFIGURER : l'URL publique de ton serveur (voir README). <<<
// En test local sur le même wifi : "http://192.168.X.X:3000"
const SERVER_URL = "http://172.19.10.171:3000";

// Affiche les notifs même quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPush() {
  if (!Device.isDevice) {
    throw new Error("Il faut un vrai iPhone (pas le simulateur) pour les push.");
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    throw new Error("Notifications refusées. Active-les dans Réglages.");
  }
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  const token = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;
  return token;
}

async function api(path, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || `Erreur ${res.status}`);
  return res.json();
}

export default function App() {
  const [name, setName] = useState("");
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Choisis un nom puis enregistre-toi.");
  const tokenRef = useRef(null);
  const respSub = useRef(null);

  // Quand on tape la notif reçue -> on désamorce automatiquement.
  useEffect(() => {
    respSub.current = Notifications.addNotificationResponseReceivedListener(async () => {
      if (registered && name) {
        try {
          await api("/ack", { from: name });
          setStatus("💣 Désamorcé — bien joué.");
        } catch {}
      }
    });
    return () => respSub.current?.remove();
  }, [registered, name]);

  async function handleRegister() {
    if (!name.trim()) return Alert.alert("Choisis un nom d'abord");
    setBusy(true);
    try {
      const token = tokenRef.current || (await registerForPush());
      tokenRef.current = token;
      await api("/register", { name: name.trim(), token });
      setRegistered(true);
      setStatus("✅ Enregistré. Prêt à envoyer.");
    } catch (e) {
      Alert.alert("Oups", e.message);
      setStatus("❌ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePoke() {
    setBusy(true);
    try {
      const r = await api("/poke", { from: name.trim() });
      setStatus(`📤 Envoyé à ${r.target}. Il a ${r.deadlineSec}s ⏳`);
    } catch (e) {
      Alert.alert("Oups", e.message);
      setStatus("❌ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAck() {
    setBusy(true);
    try {
      const r = await api("/ack", { from: name.trim() });
      setStatus(r.cancelled ? "💣 Désamorcé !" : "Rien à désamorcer.");
    } catch (e) {
      Alert.alert("Oups", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.emoji}>😼</Text>
      <Text style={styles.title}>ta mère le chat</Text>

      {!registered ? (
        <View style={styles.block}>
          <TextInput
            style={styles.input}
            placeholder="Ton prénom (ex: Romain)"
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleRegister} disabled={busy}>
            <Text style={styles.btnText}>M'enregistrer</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.block}>
          <Pressable style={[styles.btn, styles.btnPoke]} onPress={handlePoke} disabled={busy}>
            <Text style={styles.btnText}>📢 RÉVEILLE L'AUTRE</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnAck]} onPress={handleAck} disabled={busy}>
            <Text style={styles.btnText}>✅ J'ai vu (désamorcer)</Text>
          </Pressable>
        </View>
      )}

      {busy && <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />}
      <Text style={styles.status}>{status}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12101a", alignItems: "center", justifyContent: "center", padding: 24 },
  emoji: { fontSize: 72 },
  title: { color: "#fff", fontSize: 30, fontWeight: "800", marginBottom: 32, letterSpacing: 0.5 },
  block: { width: "100%", gap: 14 },
  input: {
    backgroundColor: "#1e1b2e", color: "#fff", fontSize: 18, padding: 16,
    borderRadius: 14, borderWidth: 1, borderColor: "#332e4a",
  },
  btn: { padding: 18, borderRadius: 16, alignItems: "center" },
  btnPrimary: { backgroundColor: "#6c5ce7" },
  btnPoke: { backgroundColor: "#e74c3c" },
  btnAck: { backgroundColor: "#27ae60" },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  status: { color: "#aaa", fontSize: 15, marginTop: 28, textAlign: "center" },
});
