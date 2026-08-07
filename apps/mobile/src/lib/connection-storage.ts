const API_URL_KEY = "hermes-console.api-url";
const SESSION_TOKEN_KEY = "hermes-console.session-token";

export type MobileConnection = { apiUrl: string; sessionToken: string };

export type SessionKeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
};

export function createBrowserSessionStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): SessionKeyValueStore {
  const memoryFallback = new Map<string, string>();

  return {
    async getItem(key) {
      try {
        return storage?.getItem(key) ?? memoryFallback.get(key) ?? null;
      } catch {
        return memoryFallback.get(key) ?? null;
      }
    },
    async setItem(key, value) {
      memoryFallback.set(key, value);
      try {
        storage?.setItem(key, value);
      } catch {
        // Browsers may deny session storage. Keep the value in this tab runtime.
      }
    },
    async deleteItem(key) {
      memoryFallback.delete(key);
      try {
        storage?.removeItem(key);
      } catch {
        // The in-memory copy is already cleared.
      }
    },
  };
}

export function selectSessionStorage(
  platform: string,
  nativeStorage: SessionKeyValueStore,
  webStorage: SessionKeyValueStore,
) {
  return platform === "web" ? webStorage : nativeStorage;
}

export function createConnectionStore(storage: SessionKeyValueStore) {
  return {
    async loadConnection(): Promise<MobileConnection | null> {
      const [apiUrl, sessionToken] = await Promise.all([
        storage.getItem(API_URL_KEY),
        storage.getItem(SESSION_TOKEN_KEY),
      ]);
      return apiUrl && sessionToken ? { apiUrl, sessionToken } : null;
    },

    async saveConnection(connection: MobileConnection) {
      const apiUrl = connection.apiUrl.trim().replace(/\/$/, "");
      await Promise.all([
        storage.setItem(API_URL_KEY, apiUrl),
        storage.setItem(SESSION_TOKEN_KEY, connection.sessionToken.trim()),
      ]);
    },

    async clearConnection() {
      await Promise.all([
        storage.deleteItem(API_URL_KEY),
        storage.deleteItem(SESSION_TOKEN_KEY),
      ]);
    },
  };
}
