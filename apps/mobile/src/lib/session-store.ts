import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  createBrowserSessionStorage,
  createConnectionStore,
  selectSessionStorage,
  type MobileConnection,
  type SessionKeyValueStore,
} from "./connection-storage";

export type { MobileConnection } from "./connection-storage";

const secureSessionStorage: SessionKeyValueStore = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  deleteItem: SecureStore.deleteItemAsync,
};

function browserSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const connectionStore = createConnectionStore(
  selectSessionStorage(
    Platform.OS,
    secureSessionStorage,
    createBrowserSessionStorage(browserSessionStorage()),
  ),
);

export const loadConnection = connectionStore.loadConnection;
export const saveConnection = (connection: MobileConnection) =>
  connectionStore.saveConnection(connection);
export const clearConnection = connectionStore.clearConnection;
