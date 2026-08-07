import { useColorScheme } from "react-native";
import { palette } from "@/design/tokens";

export function useAppTheme() {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}
