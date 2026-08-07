import { router } from "expo-router";
import { ArrowRight, CheckCircle2, CircleAlert, Inbox, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/screen";
import { radius, spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useConsoleThreads } from "@/hooks/use-console-threads";

export default function HomeScreen() {
  const colors = useAppTheme();
  const state = useConsoleThreads();
  const approvals = state.threads.filter((thread) => thread.latestRun?.status === "awaiting_approval");
  const recent = state.threads.find((thread) => thread.latestRun?.status === "completed");
  return (
    <Screen eyebrow="Poste de contrôle" title="Bonjour" action={<Pressable accessibilityLabel="Nouvelle demande" hitSlop={8} onPress={() => router.push("/chat")} style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}><Plus color="#f8faff" size={22} strokeWidth={2.2} /></Pressable>}>
      <View style={styles.lead}><Text style={[styles.leadTitle, { color: colors.text }]}>Ce qui demande votre attention</Text><Text style={[styles.leadCopy, { color: colors.muted }]}>Décidez vite, sans perdre la trace de ce qui a réellement été exécuté.</Text></View>
      {state.status === "loading" && state.threads.length === 0 ? <ActivityIndicator color={colors.accent} /> : null}
      {approvals.length > 0 ? <Pressable accessibilityRole="button" onPress={() => router.push("/missions")} style={({ pressed }) => [styles.attention, { backgroundColor: colors.surface, borderColor: colors.warning, opacity: pressed ? 0.78 : 1 }]}><View style={[styles.stateIcon, { backgroundColor: `${colors.warning}1f` }]}><CircleAlert color={colors.warning} size={21} /></View><View style={styles.rowBody}><Text style={[styles.rowKicker, { color: colors.warning }]}>{approvals.length} validation{approvals.length > 1 ? "s" : ""} attendue{approvals.length > 1 ? "s" : ""}</Text><Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{approvals[0]!.title}</Text><Text numberOfLines={2} style={[styles.rowCopy, { color: colors.muted }]}>La mission est en pause jusqu’à votre décision.</Text></View><ArrowRight color={colors.muted} size={20} /></Pressable> : null}
      {state.status === "ready" && approvals.length === 0 ? <View style={[styles.clear, { backgroundColor: colors.surface }]}><CheckCircle2 color={colors.success} size={21} /><View style={styles.rowBody}><Text style={[styles.rowTitle, { color: colors.text }]}>Rien ne vous attend</Text><Text style={[styles.rowCopy, { color: colors.muted }]}>Aucune validation n’est requise pour le moment.</Text></View></View> : null}
      {state.message ? <Pressable onPress={() => router.push("/settings")} style={[styles.clear, { backgroundColor: colors.surface }]}><Inbox color={colors.muted} size={21} /><View style={styles.rowBody}><Text style={[styles.rowTitle, { color: colors.text }]}>Console non disponible</Text><Text style={[styles.rowCopy, { color: colors.muted }]}>{state.message}</Text></View><ArrowRight color={colors.muted} size={20} /></Pressable> : null}
      {recent ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Activité récente</Text><View style={[styles.activity, { borderTopColor: colors.seam }]}><CheckCircle2 color={colors.success} size={20} /><View style={styles.rowBody}><Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{recent.title}</Text><Text style={[styles.rowCopy, { color: colors.muted }]}>Mission terminée, résultat disponible.</Text></View></View></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" }, lead: { gap: spacing.sm }, leadTitle: { fontSize: 17, lineHeight: 22, fontWeight: "600" }, leadCopy: { fontSize: 14, lineHeight: 20, maxWidth: 440 },
  attention: { minHeight: 132, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, clear: { minHeight: 82, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }, stateIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" }, rowBody: { flex: 1, gap: spacing.xs }, rowKicker: { fontSize: 12, lineHeight: 16, fontWeight: "700" }, rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" }, rowCopy: { fontSize: 13, lineHeight: 18 }, section: { gap: spacing.md }, sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: "600" }, activity: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
});
