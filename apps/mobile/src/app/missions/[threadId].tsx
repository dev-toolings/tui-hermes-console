import { latestOpenApproval, type ApprovalChoice } from "@console/core/lib/thread-snapshot-mutations";
import type { ThreadSnapshot } from "@console/core/modules/runs/types";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, CheckCircle2, CircleAlert, FileCheck2, RefreshCw, XCircle } from "lucide-react-native";
import { Download, RotateCcw, Square } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { Screen } from "@/components/screen";
import { radius, spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";
import { ConsoleApiClient } from "@/lib/api-client";
import { loadConnection } from "@/lib/session-store";

export default function MissionDetailScreen() {
  const colors = useAppTheme();
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<ApprovalChoice | null>(null);
  const [operation, setOperation] = useState<"cancel" | "retry" | string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const connection = await loadConnection();
      if (!connection || !threadId) throw new Error("La Console n’est pas connectée.");
      const result = await new ConsoleApiClient(connection).thread(threadId);
      setSnapshot(result.thread); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mission indisponible."); }
  }, [threadId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const latestRun = snapshot?.runs.at(-1) ?? null;
  useEffect(() => {
    if (!latestRun || ["completed", "failed", "cancelled"].includes(latestRun.status)) return;
    const timer = setInterval(() => void refresh(), 1_500);
    return () => clearInterval(timer);
  }, [latestRun, refresh]);

  const approval = snapshot && latestRun ? latestOpenApproval(snapshot.events, latestRun.id) : null;
  const respond = async (choice: ApprovalChoice) => {
    if (!approval || !latestRun) return;
    setResponding(choice);
    try {
      const connection = await loadConnection();
      if (!connection) throw new Error("La Console n’est pas connectée.");
      await new ConsoleApiClient(connection).respondApproval(latestRun.id, choice, approval.approvalRequestId);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Décision impossible."); }
    finally { setResponding(null); }
  };

  const client = async () => {
    const connection = await loadConnection();
    if (!connection) throw new Error("La Console n’est pas connectée.");
    return new ConsoleApiClient(connection);
  };

  const cancel = () => {
    if (!latestRun) return;
    Alert.alert("Arrêter cette mission ?", "Le résultat déjà produit restera consultable.", [
      { text: "Continuer la mission", style: "cancel" },
      { text: "Arrêter", style: "destructive", onPress: () => void (async () => {
        setOperation("cancel");
        try { await (await client()).cancelRun(latestRun.id); await refresh(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Annulation impossible."); }
        finally { setOperation(null); }
      })() },
    ]);
  };

  const retry = async () => {
    if (!latestRun) return;
    setOperation("retry");
    try { await (await client()).retryRun(latestRun.id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Relance impossible."); }
    finally { setOperation(null); }
  };

  const shareArtifact = async (artifact: NonNullable<typeof snapshot>["artifacts"][number]) => {
    setOperation(artifact.id);
    try {
      const bytes = await (await client()).artifactBytes(artifact.id);
      const safeName = artifact.filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "preuve";
      const file = new File(Paths.cache, safeName);
      file.create({ overwrite: true });
      file.write(bytes);
      if (!(await Sharing.isAvailableAsync())) throw new Error("Le partage de fichiers n’est pas disponible sur cet appareil.");
      await Sharing.shareAsync(file.uri, { mimeType: artifact.mimeType ?? undefined, dialogTitle: "Exporter la preuve" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export impossible."); }
    finally { setOperation(null); }
  };

  const statusColor = latestRun?.status === "completed" ? colors.success : latestRun?.status === "failed" || latestRun?.status === "cancelled" ? colors.danger : latestRun?.status === "awaiting_approval" ? colors.warning : colors.accent;
  return (
    <Screen eyebrow="Mission" title={snapshot?.title ?? "Chargement…"} action={<View style={styles.actions}><Pressable accessibilityLabel="Retour aux missions" onPress={() => router.back()} style={styles.iconButton}><ArrowLeft color={colors.muted} size={21} /></Pressable><Pressable accessibilityLabel="Actualiser" onPress={() => void refresh()} style={styles.iconButton}><RefreshCw color={colors.muted} size={19} /></Pressable></View>}>
      {!snapshot && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? <View role="alert" style={[styles.notice, { backgroundColor: `${colors.danger}16` }]}><XCircle color={colors.danger} size={20} /><Text style={[styles.noticeText, { color: colors.danger }]}>{error}</Text></View> : null}
      {latestRun ? <View style={[styles.status, { backgroundColor: colors.surface }]}><View style={[styles.statusDot, { backgroundColor: statusColor }]} /><View style={styles.flex}><Text style={[styles.statusTitle, { color: colors.text }]}>{latestRun.status === "awaiting_approval" ? "Votre décision est requise" : latestRun.status === "completed" ? "Mission terminée" : latestRun.status === "failed" ? "Mission en échec" : latestRun.status === "cancelled" ? "Mission annulée" : "Mission en cours"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{snapshot?.agentName} · {latestRun.runtimeSession?.model ?? snapshot?.effectiveModel}</Text></View>{["pending", "starting", "running"].includes(latestRun.status) ? <Pressable accessibilityLabel="Arrêter la mission" disabled={operation !== null} onPress={cancel} style={[styles.runAction, { backgroundColor: colors.control }]}><Square color={colors.danger} fill={colors.danger} size={13} /></Pressable> : ["failed", "cancelled"].includes(latestRun.status) ? <Pressable accessibilityLabel="Relancer la mission" disabled={operation !== null} onPress={() => void retry()} style={[styles.runAction, { backgroundColor: colors.control }]}><RotateCcw color={colors.accent} size={17} /></Pressable> : null}</View> : null}
      {approval ? <View style={[styles.approval, { backgroundColor: colors.surface, borderColor: colors.warning }]}><CircleAlert color={colors.warning} size={24} /><View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>Autorisation nécessaire</Text><Text style={[styles.copy, { color: colors.muted }]}>{approval.description ?? "Hermes demande l’autorisation avant de poursuivre."}</Text>{approval.command ? <Text selectable style={[styles.command, { backgroundColor: colors.control, color: colors.text }]}>{approval.command}</Text> : null}<View style={styles.approvalActions}>{(["once", "session", "always", "deny"] as const).filter((choice) => approval.choices.includes(choice)).map((choice) => <DecisionButton key={choice} label={{ once: "Autoriser une fois", session: "Pour cette session", always: "Toujours autoriser", deny: "Refuser" }[choice]} disabled={responding !== null} onPress={() => void respond(choice)} primary={choice === "once"} />)}</View></View></View> : null}
      {latestRun?.output ? <View style={styles.section}><View style={styles.sectionHeading}><CheckCircle2 color={colors.success} size={20} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Résultat</Text></View><Text selectable style={[styles.output, { color: colors.text, borderTopColor: colors.seam }]}>{latestRun.output}</Text></View> : null}
      {latestRun?.error ? <View style={[styles.notice, { backgroundColor: `${colors.danger}16` }]}><XCircle color={colors.danger} size={20} /><Text selectable style={[styles.noticeText, { color: colors.danger }]}>{latestRun.error}</Text></View> : null}
      {snapshot && snapshot.artifacts.length > 0 ? <View style={styles.section}><View style={styles.sectionHeading}><FileCheck2 color={colors.accent} size={20} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Preuves et fichiers</Text></View>{snapshot.artifacts.map((artifact) => <Pressable key={artifact.id} accessibilityLabel={`Exporter ${artifact.filename}`} disabled={operation !== null} onPress={() => void shareArtifact(artifact)} style={({ pressed }) => [styles.artifact, { borderTopColor: colors.seam, opacity: pressed ? 0.62 : 1 }]}><Text numberOfLines={1} style={[styles.artifactName, { color: colors.text }]}>{artifact.filename}</Text><Text style={[styles.meta, { color: colors.muted }]}>{Math.ceil(artifact.sizeBytes / 1024)} Ko</Text>{operation === artifact.id ? <ActivityIndicator color={colors.accent} size="small" /> : <Download color={colors.muted} size={18} />}</Pressable>)}</View> : null}
    </Screen>
  );

  function DecisionButton({ label, onPress, disabled, primary = false }: { label: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
    return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.decision, { backgroundColor: primary ? colors.accent : colors.control, opacity: disabled || pressed ? 0.58 : 1 }]}><Text style={[styles.decisionText, { color: primary ? "#f8faff" : colors.text }]}>{label}</Text></Pressable>;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, actions: { flexDirection: "row" }, iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  status: { minHeight: 76, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }, statusDot: { width: 10, height: 10, borderRadius: 5 }, statusTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" }, meta: { fontSize: 11, lineHeight: 16 }, runAction: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  approval: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, approvalActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }, decision: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" }, decisionText: { fontSize: 13, fontWeight: "700" },
  section: { gap: spacing.md }, sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, sectionTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" }, copy: { fontSize: 13, lineHeight: 19 }, command: { borderRadius: radius.md, padding: spacing.md, fontFamily: "monospace", fontSize: 12, lineHeight: 18 }, output: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg, fontSize: 14, lineHeight: 21 },
  notice: { minHeight: 58, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, noticeText: { flex: 1, fontSize: 13, lineHeight: 19 }, artifact: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: spacing.md }, artifactName: { flex: 1, fontSize: 13, fontWeight: "600" },
});
