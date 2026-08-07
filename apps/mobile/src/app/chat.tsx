import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { createHermesChatAdapter } from "@/adapters/hermes-chat-adapter";
import { ChatThread } from "@/components/chat-thread";
import { spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";
import { ConsoleApiClient } from "@/lib/api-client";
import { loadConnection, type MobileConnection } from "@/lib/session-store";

function ConnectedChat({ connection }: { connection: MobileConnection }) {
  const [adapter] = useState(() => createHermesChatAdapter(new ConsoleApiClient(connection)));
  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}><ChatThread /></AssistantRuntimeProvider>;
}

export default function ChatScreen() {
  const colors = useAppTheme();
  const [connection, setConnection] = useState<MobileConnection | null | undefined>();
  useEffect(() => { void loadConnection().then(setConnection); }, []);
  if (connection === undefined) return <View style={[styles.center, { backgroundColor: colors.canvas }]}><ActivityIndicator color={colors.accent} /></View>;
  if (!connection) return (
    <View style={[styles.center, { backgroundColor: colors.canvas }]}>
      <Text style={[styles.title, { color: colors.text }]}>Connectez votre Console</Text>
      <Text style={[styles.copy, { color: colors.muted }]}>L’assistant mobile utilise les mêmes missions, règles et validations que la Console.</Text>
      <Pressable onPress={() => router.push("/settings")} style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}><Text style={styles.buttonText}>Configurer la connexion</Text></Pressable>
    </View>
  );
  return <ConnectedChat connection={connection} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700", textAlign: "center" },
  copy: { maxWidth: 360, fontSize: 14, lineHeight: 20, textAlign: "center" },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  buttonText: { color: "#f8faff", fontSize: 14, fontWeight: "700" },
});
