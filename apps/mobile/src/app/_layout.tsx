import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Bot, House, ListChecks, Settings } from "lucide-react-native";
import { useColorScheme } from "react-native";

import { palette } from "@/design/tokens";
import { NetworkBanner } from "@/components/network-banner";

export default function RootLayout() {
  const dark = useColorScheme() === "dark";
  const colors = dark ? palette.dark : palette.light;

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.seam,
            height: 64,
            paddingTop: 7,
            paddingBottom: 7,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: ({ color }) => <House color={color} size={21} /> }} />
        <Tabs.Screen name="missions" options={{ title: "Missions", tabBarIcon: ({ color }) => <ListChecks color={color} size={21} /> }} />
        <Tabs.Screen name="chat" options={{ title: "Assistant", tabBarIcon: ({ color }) => <Bot color={color} size={21} /> }} />
        <Tabs.Screen name="settings" options={{ title: "Compte", tabBarIcon: ({ color }) => <Settings color={color} size={21} /> }} />
        <Tabs.Screen name="missions/[threadId]" options={{ href: null }} />
      </Tabs>
      <NetworkBanner />
    </>
  );
}
