import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState } from "@assistant-ui/react-native";
import { ArrowUp, Bot, UserRound } from "lucide-react-native";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { radius, spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";

function Message() {
  const colors = useAppTheme();
  const role = useAuiState((state) => state.message.role);
  const user = role === "user";
  return (
    <View style={[styles.messageRow, user && styles.userRow]}>
      {!user ? <View style={[styles.avatar, { backgroundColor: colors.control }]}><Bot color={colors.accent} size={17} /></View> : null}
      <View style={[styles.bubble, user ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface }]}>
        <MessagePrimitive.Content renderText={({ part }) => <Text selectable style={[styles.messageText, { color: user ? "#f8faff" : colors.text }]}>{part.text}</Text>} />
      </View>
      {user ? <View style={[styles.avatar, { backgroundColor: colors.control }]}><UserRound color={colors.muted} size={17} /></View> : null}
    </View>
  );
}

export function ChatThread() {
  const colors = useAppTheme();
  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: colors.canvas }]}>
      <View style={[styles.header, { borderBottomColor: colors.seam }]}>
        <View><Text style={[styles.eyebrow, { color: colors.accent }]}>ASSISTANT</Text><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Nouvelle demande</Text></View>
        <View style={[styles.live, { backgroundColor: `${colors.success}18` }]}><View style={[styles.dot, { backgroundColor: colors.success }]} /><Text style={[styles.liveText, { color: colors.text }]}>Console</Text></View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex} keyboardVerticalOffset={0}>
        <ThreadPrimitive.Root style={styles.flex}>
          <ThreadPrimitive.Empty>
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}><Bot color={colors.accent} size={27} /></View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Quel résultat voulez-vous obtenir ?</Text>
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>Décrivez le résultat attendu. La Console conservera les étapes, les preuves et les décisions.</Text>
            </View>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.MessagesFlatList autoScroll contentContainerStyle={styles.messages}>
            {() => <Message />}
          </ThreadPrimitive.MessagesFlatList>
          <ComposerPrimitive.Root style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.seam }]}>
            <ComposerPrimitive.Input accessibilityLabel="Décrire le résultat attendu" multiline placeholder="Décrire le résultat attendu…" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text }]} />
            <ComposerPrimitive.Send style={({ pressed }) => [styles.send, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}>
              <ArrowUp color="#f8faff" size={20} strokeWidth={2.4} />
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
          <Text style={[styles.disclosure, { color: colors.muted }]}>Une mission peut demander votre validation avant d’agir.</Text>
        </ThreadPrimitive.Root>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 },
  header: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0.8 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  live: { minHeight: 32, borderRadius: 16, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4 }, liveText: { fontSize: 11, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xxl, gap: spacing.md },
  emptyIcon: { width: 58, height: 58, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyTitle: { fontSize: 20, lineHeight: 26, fontWeight: "700", textAlign: "center", letterSpacing: -0.25 },
  emptyCopy: { maxWidth: 360, fontSize: 14, lineHeight: 20, textAlign: "center" },
  messages: { padding: spacing.lg, gap: spacing.lg },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }, userRow: { justifyContent: "flex-end" },
  avatar: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  messageText: { fontSize: 14, lineHeight: 21 },
  composer: { minHeight: 58, maxHeight: 142, marginHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: 7, paddingLeft: spacing.md, flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: { flex: 1, minHeight: 42, maxHeight: 120, paddingVertical: 10, fontSize: 14, lineHeight: 20 },
  send: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  disclosure: { fontSize: 10, lineHeight: 14, textAlign: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
});
