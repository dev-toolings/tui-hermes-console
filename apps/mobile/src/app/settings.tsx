import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CheckCircle2, Link2, LogOut, ShieldCheck } from "lucide-react-native";

import { Screen } from "@/components/screen";
import { radius, spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";
import { ConsoleApiClient, exchangePairingCode } from "@/lib/api-client";
import { clearConnection, loadConnection, saveConnection } from "@/lib/session-store";

export default function SettingsScreen() {
  const colors = useAppTheme();
  const [apiUrl, setApiUrl] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "connected" | "error">("idle");
  const [message, setMessage] = useState("Session mobile stockée dans le trousseau sécurisé de l’appareil.");

  useEffect(() => { void loadConnection().then((value) => { if (!value) return; setApiUrl(value.apiUrl); setState("connected"); }); }, []);

  const connect = async () => {
    setState("saving");
    try {
      const normalizedUrl = apiUrl.trim().replace(/\/$/, "");
      const sessionToken = await exchangePairingCode(normalizedUrl, pairingCode);
      const connection = { apiUrl: normalizedUrl, sessionToken };
      const status = await new ConsoleApiClient(connection).status();
      if (!status.authenticated) throw new Error("La session n’est pas reconnue.");
      await saveConnection(connection);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState("connected");
      setMessage(status.user ? `Connecté avec ${status.user.email}.` : "Console connectée.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Connexion impossible.");
    }
  };

  const disconnect = async () => {
    const connection = await loadConnection();
    if (connection) await new ConsoleApiClient(connection).logout().catch(() => undefined);
    await clearConnection(); setPairingCode(""); setState("idle"); setMessage("La session a été révoquée et les identifiants locaux ont été supprimés.");
  };

  return (
    <Screen eyebrow="Accès sécurisé" title="Compte">
      <View style={styles.intro}><ShieldCheck color={colors.accent} size={24} /><View style={styles.flex}><Text style={[styles.introTitle, { color: colors.text }]}>Votre Console reste l’autorité</Text><Text style={[styles.copy, { color: colors.muted }]}>Le mobile ne communique jamais directement avec Hermes.</Text></View></View>
      <View style={styles.form}>
        <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>Adresse HTTPS de la Console</Text><TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setApiUrl} placeholder="https://console.example.com" placeholderTextColor={colors.muted} value={apiUrl} style={[styles.input, { backgroundColor: colors.control, borderColor: colors.seam, color: colors.text }]} /></View>
        <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>Code d’association à usage unique</Text><TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setPairingCode} placeholder="Coller le code créé dans Paramètres → Sécurité" placeholderTextColor={colors.muted} secureTextEntry value={pairingCode} style={[styles.input, { backgroundColor: colors.control, borderColor: colors.seam, color: colors.text }]} /><Text style={[styles.hint, { color: colors.muted }]}>Le code expire après dix minutes et ne fonctionne qu’une fois.</Text></View>
        <Pressable accessibilityRole="button" disabled={!apiUrl.trim() || !pairingCode.trim() || state === "saving"} onPress={() => void connect()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: pressed || state === "saving" ? 0.7 : (!apiUrl.trim() || !pairingCode.trim() ? 0.45 : 1) }]}><Link2 color="#f8faff" size={18} /><Text style={styles.primaryText}>{state === "saving" ? "Association…" : "Associer cet appareil"}</Text></Pressable>
      </View>
      <View accessibilityLiveRegion="polite" style={[styles.status, { backgroundColor: colors.surface }]}>{state === "connected" ? <CheckCircle2 color={colors.success} size={20} /> : null}<Text style={[styles.statusText, { color: state === "error" ? colors.danger : colors.muted }]}>{message}</Text></View>
      {state === "connected" ? <Pressable accessibilityRole="button" onPress={() => void disconnect()} style={styles.disconnect}><LogOut color={colors.danger} size={18} /><Text style={[styles.disconnectText, { color: colors.danger }]}>Retirer cet appareil</Text></Pressable> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, intro: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, introTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600", marginBottom: spacing.xs }, copy: { fontSize: 13, lineHeight: 18 },
  form: { gap: spacing.lg }, field: { gap: spacing.sm }, label: { fontSize: 13, lineHeight: 18, fontWeight: "600" }, hint: { fontSize: 11, lineHeight: 16 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 14 },
  primary: { minHeight: 48, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }, primaryText: { color: "#f8faff", fontSize: 14, fontWeight: "700" },
  status: { minHeight: 58, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }, statusText: { flex: 1, fontSize: 12, lineHeight: 17 },
  disconnect: { minHeight: 46, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm }, disconnectText: { fontSize: 13, fontWeight: "600" },
});
