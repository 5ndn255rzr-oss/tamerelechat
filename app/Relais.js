// Écran natif « RELAIS — Chaîne Humaine » (hot-potato entre potes).
//
// Différence clé avec la version web : ici chaque joueur enregistre son token
// push Expo. Quand l'étincelle t'arrive, ton iPhone SONNE même verrouillé
// (notif "✨ à toi"), et si tu la lâches, la notif de sanction joue le son
// "ta mère le chat" 😼. C'est le serveur relais/ qui envoie ces push.
//
// >>> À CONFIGURER : l'URL publique de ton service relais sur Render. <<<
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

const RELAIS_URL = "https://relais-server.onrender.com"; // <-- remplace par ton URL Render

async function registerForPush() {
  if (!Device.isDevice) throw new Error("Il faut un vrai iPhone (pas le simulateur).");
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") throw new Error("Notifications refusées. Active-les dans Réglages.");
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

async function api(path, body) {
  const res = await fetch(`${RELAIS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
  return json;
}

export default function Relais({ goBack }) {
  const [screen, setScreen] = useState("home"); // home | lobby | play
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const idRef = useRef(null);
  const codeRef = useRef(null);
  const tokenRef = useRef(null);
  const isHostRef = useRef(false);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function ensureToken() {
    if (!tokenRef.current) tokenRef.current = await registerForPush();
    return tokenRef.current;
  }

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!codeRef.current) return;
      try {
        const r = await fetch(`${RELAIS_URL}/api/room/state?code=${codeRef.current}&playerId=${idRef.current}`).then((x) => x.json());
        if (!r.error) {
          setRoom(r);
          if (r.started) setScreen("play");
        }
      } catch (e) {}
    }, 600);
  }

  async function handleCreate() {
    if (!name.trim()) return Alert.alert("Choisis un blaze");
    setBusy(true);
    try {
      const token = await ensureToken();
      const r = await api("/api/room/create", { name: name.trim(), token });
      idRef.current = r.playerId; codeRef.current = r.code; isHostRef.current = true;
      setRoom(r.room); setScreen("lobby"); startPolling();
    } catch (e) { Alert.alert("Oups", e.message); } finally { setBusy(false); }
  }

  async function handleJoin() {
    if (!name.trim()) return Alert.alert("Choisis un blaze");
    if (codeInput.trim().length < 4) return Alert.alert("Tape le code à 4 lettres");
    setBusy(true);
    try {
      const token = await ensureToken();
      const r = await api("/api/room/join", { code: codeInput.trim().toUpperCase(), name: name.trim(), token });
      idRef.current = r.playerId; codeRef.current = r.code; isHostRef.current = false;
      setRoom(r.room); setScreen("lobby"); startPolling();
    } catch (e) { Alert.alert("Oups", e.message); } finally { setBusy(false); }
  }

  async function handleStart() {
    try { await api("/api/room/start", { code: codeRef.current, playerId: idRef.current }); }
    catch (e) { setMsg("❌ " + e.message); }
  }

  async function handlePass(toId) {
    try { await api("/api/room/pass", { code: codeRef.current, playerId: idRef.current, toId }); }
    catch (e) { setMsg("❌ " + e.message); }
  }

  // ----- Rendus -----
  if (screen === "home") {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.center}>
          <Text style={s.logo}>CHAÎNE HUMAINE 😼</Text>
          <Text style={s.tag}>refile l'étincelle ou t'es cramé</Text>
          <TextInput style={s.input} placeholder="Ton blaze" placeholderTextColor="#888"
            value={name} onChangeText={setName} maxLength={18} />
          <Pressable style={[s.btn, s.primary]} onPress={handleCreate} disabled={busy}>
            <Text style={s.btnTxt}>Créer un salon</Text>
          </Pressable>
          <Text style={s.or}>— ou rejoins tes potes —</Text>
          <TextInput style={[s.input, s.code]} placeholder="CODE" placeholderTextColor="#888"
            value={codeInput} onChangeText={setCodeInput} maxLength={4} autoCapitalize="characters" />
          <Pressable style={[s.btn, s.ghost]} onPress={handleJoin} disabled={busy}>
            <Text style={s.btnTxt}>Rejoindre</Text>
          </Pressable>
          {busy && <ActivityIndicator color="#fff" style={{ marginTop: 14 }} />}
          <Pressable onPress={goBack}><Text style={s.back}>← retour</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "lobby") {
    const players = room?.players || [];
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.center}>
          <Text style={s.label}>CODE DU SALON</Text>
          <Text style={s.bigCode}>{room?.code || "····"}</Text>
          <Text style={s.sub}>Partage ce code. Chacun ouvre RELAIS et le tape.</Text>
          <View style={{ width: "100%", gap: 8, marginVertical: 16 }}>
            {players.map((p) => (
              <View key={p.id} style={s.pchip}>
                <Text style={s.pname}>{p.name}{p.isMe ? "  (toi)" : ""}</Text>
              </View>
            ))}
          </View>
          {isHostRef.current ? (
            <Pressable style={[s.btn, s.primary, players.length < 2 && s.disabled]}
              onPress={handleStart} disabled={players.length < 2}>
              <Text style={s.btnTxt}>{players.length < 2 ? "En attente d'un pote…" : "Démarrer"}</Text>
            </Pressable>
          ) : <Text style={s.sub}>en attente que l'hôte démarre…</Text>}
          <Text style={s.msg}>{msg}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // play
  const isMine = room?.isMine;
  const others = (room?.players || []).filter((p) => !p.isMe);
  const sLeft = room?.secondsLeft ?? 0;
  const loss = room?.lastLoss;
  const iLost = loss && loss.playerId === idRef.current;
  return (
    <SafeAreaView style={[s.root, isMine && s.rootHot, iLost && s.rootDoom]}>
      <ScrollView contentContainerStyle={s.play}>
        <Text style={s.chain}>{room?.chain ?? 0}</Text>
        <Text style={s.label}>passes d'affilée · record {room?.best ?? 0}</Text>
        <Text style={s.timer}>{sLeft.toFixed(1)}s</Text>

        {isMine ? (
          <View style={s.holdCard}>
            <Text style={s.holdBig}>✨ TU AS L'ÉTINCELLE</Text>
            <Text style={s.sub}>refile-la VITE 👇</Text>
            <View style={s.grid}>
              {others.map((p) => (
                <Pressable key={p.id} style={s.passBtn} onPress={() => handlePass(p.id)}>
                  <Text style={s.passTxt}>→ {p.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={s.waitCard}>
            <Text style={s.waitWho}>✨ chez {room?.holderName || "?"}</Text>
            <Text style={s.sub}>tiens-toi prêt, ça peut te tomber dessus</Text>
          </View>
        )}

        {loss ? (
          <Text style={s.doom}>
            {iLost ? `😼 CRAMÉ — chaîne de ${loss.brokeAt} lâchée` : `🔥 ${loss.name} s'est fait cramer (${loss.brokeAt})`}
          </Text>
        ) : null}
        <Text style={s.msg}>{msg}</Text>
        <Pressable onPress={goBack}><Text style={s.back}>← quitter</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e0b18" },
  rootHot: { backgroundColor: "#1c1608" },
  rootDoom: { backgroundColor: "#2a0d16" },
  center: { padding: 24, alignItems: "center", justifyContent: "center", flexGrow: 1, gap: 12 },
  play: { padding: 24, alignItems: "center", flexGrow: 1, gap: 8 },
  logo: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  tag: { color: "#6f679a", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 18 },
  input: { width: "100%", backgroundColor: "#1a1630", color: "#fff", fontSize: 16, padding: 15,
    borderRadius: 14, borderWidth: 1, borderColor: "#2f2850" },
  code: { textAlign: "center", letterSpacing: 8, fontSize: 22, fontWeight: "800" },
  btn: { width: "100%", padding: 16, borderRadius: 16, alignItems: "center" },
  primary: { backgroundColor: "#7c5cff" },
  ghost: { backgroundColor: "#221c3d", borderWidth: 1, borderColor: "#2f2850" },
  disabled: { opacity: 0.45 },
  btnTxt: { color: "#fff", fontSize: 17, fontWeight: "800" },
  or: { color: "#6f679a", fontSize: 12, marginVertical: 4 },
  back: { color: "#a99bff", fontSize: 13, marginTop: 22 },
  label: { color: "#9a92c0", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" },
  bigCode: { color: "#ffc93d", fontSize: 48, fontWeight: "900", letterSpacing: 8 },
  sub: { color: "#9a92c0", fontSize: 14, textAlign: "center", marginTop: 6 },
  pchip: { backgroundColor: "#1a1630", borderWidth: 1, borderColor: "#2f2850", borderRadius: 14, padding: 14 },
  pname: { color: "#fff", fontWeight: "600", fontSize: 15 },
  msg: { color: "#9a92c0", fontSize: 13, marginTop: 12, textAlign: "center", minHeight: 18 },
  chain: { color: "#ffc93d", fontSize: 44, fontWeight: "900" },
  timer: { color: "#fff", fontSize: 26, fontWeight: "800", marginVertical: 12 },
  holdCard: { width: "100%", backgroundColor: "#1a1630", borderColor: "#ffc93d", borderWidth: 1,
    borderRadius: 22, padding: 18, alignItems: "center" },
  holdBig: { color: "#ffc93d", fontSize: 22, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", width: "100%", gap: 10, marginTop: 14 },
  passBtn: { width: "47%", backgroundColor: "#7c5cff", borderRadius: 14, padding: 16, alignItems: "center" },
  passTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  waitCard: { width: "100%", backgroundColor: "#1a1630", borderColor: "#2f2850", borderWidth: 1,
    borderRadius: 22, padding: 26, alignItems: "center" },
  waitWho: { color: "#fff", fontSize: 22, fontWeight: "900" },
  doom: { color: "#ff4d6d", fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 14 },
});
