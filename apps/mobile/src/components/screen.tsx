import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";

export function Screen({ title, eyebrow, action, children }: PropsWithChildren<{ title: string; eyebrow?: string; action?: ReactNode }>) {
  const colors = useAppTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.canvas }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heading}>
            {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text> : null}
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          </View>
          {action}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg },
  heading: { flex: 1, gap: spacing.xs },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "700", letterSpacing: -0.45 },
});
