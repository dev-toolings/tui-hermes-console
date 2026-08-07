import type { ProductRunStatus, ThreadListItemDto } from "@console/core/modules/runs/types";
import { Clock3, CircleAlert, CircleCheck, CircleX, Inbox, RefreshCw } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { radius, spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useConsoleThreads } from "@/hooks/use-console-threads";

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Maintenant";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)} h`;
  return new Intl.DateTimeFormat("fr", { day: "numeric", month: "short" }).format(new Date(value));
}

function statusCopy(thread: ThreadListItemDto) {
  const status = thread.latestRun?.status;
  if (!status) return "Prête à démarrer";
  return ({ pending: "En attente", starting: "Démarrage", running: "Exécution en cours", awaiting_approval: "Validation requise", completed: "Terminée", failed: "Échec", cancelled: "Annulée" } satisfies Record<ProductRunStatus, string>)[status];
}

export default function MissionsScreen() {
  const colors = useAppTheme();
  const state = useConsoleThreads();
  const icon = (status?: ProductRunStatus) => status === "awaiting_approval" ? <CircleAlert color={colors.warning} size={21} /> : status === "completed" ? <CircleCheck color={colors.success} size={21} /> : status === "failed" || status === "cancelled" ? <CircleX color={colors.danger} size={21} /> : <Clock3 color={colors.accent} size={21} />;
  return (
    <Screen eyebrow="Travail vérifiable" title="Missions" action={<Pressable accessibilityLabel="Actualiser les missions" hitSlop={8} onPress={() => void state.refresh()} style={styles.refresh}><RefreshCw color={colors.muted} size={20} /></Pressable>}>
      {state.status === "loading" && state.threads.length === 0 ? <ActivityIndicator color={colors.accent} /> : null}
      {state.message ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><Inbox color={colors.muted} size={26} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{state.status === "disconnected" ? "Console non connectée" : "Connexion impossible"}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{state.message}</Text></View> : null}
      {state.status === "ready" && state.threads.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><Inbox color={colors.muted} size={26} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Aucune mission</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>Votre première demande apparaîtra ici avec ses preuves et décisions.</Text></View> : null}
      <View style={styles.list}>{state.threads.map((thread) => <Pressable key={thread.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/missions/[threadId]", params: { threadId: thread.id } })} style={({ pressed }) => [styles.mission, { borderBottomColor: colors.seam, opacity: pressed ? 0.68 : 1 }]}><View style={[styles.missionIcon, { backgroundColor: colors.surface }]}>{icon(thread.latestRun?.status)}</View><View style={styles.body}><Text style={[styles.title, { color: colors.text }]}>{thread.title}</Text><Text style={[styles.detail, { color: colors.muted }]}>{statusCopy(thread)}</Text></View><Text style={[styles.time, { color: colors.muted }]}>{relativeTime(thread.updatedAt)}</Text></Pressable>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  refresh: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { gap: 0 }, mission: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md }, missionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" }, body: { flex: 1, gap: spacing.xs }, title: { fontSize: 14, lineHeight: 19, fontWeight: "600" }, detail: { fontSize: 12, lineHeight: 17 }, time: { fontSize: 11, lineHeight: 16 },
  empty: { minHeight: 190, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.sm }, emptyTitle: { fontSize: 16, lineHeight: 21, fontWeight: "600" }, emptyCopy: { maxWidth: 320, fontSize: 13, lineHeight: 18, textAlign: "center" },
});
