import { useNetInfo } from "@react-native-community/netinfo";
import { WifiOff } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/design/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";

export function NetworkBanner() {
  const network = useNetInfo();
  const insets = useSafeAreaInsets();
  const colors = useAppTheme();
  if (network.isConnected !== false) return null;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.danger }]}>
      <WifiOff color="#fff7f8" size={16} />
      <Text style={styles.text}>Hors connexion. Aucune action ne sera envoyée avant le retour du réseau.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: "absolute", zIndex: 20, top: 0, left: 0, right: 0, minHeight: 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  text: { flexShrink: 1, color: "#fff7f8", fontSize: 11, lineHeight: 16, fontWeight: "600", textAlign: "center" },
});
