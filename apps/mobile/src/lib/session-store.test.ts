import { describe, expect, test } from "bun:test";

import {
  createBrowserSessionStorage,
  createConnectionStore,
  selectSessionStorage,
  type SessionKeyValueStore,
} from "./connection-storage";

describe("mobile connection storage", () => {
  test("routes web sessions away from the native secure-store bridge", async () => {
    const nativeStorage: SessionKeyValueStore = {
      async getItem() {
        throw new Error("native bridge unavailable");
      },
      async setItem() {
        throw new Error("native bridge unavailable");
      },
      async deleteItem() {
        throw new Error("native bridge unavailable");
      },
    };
    const browserStorage = createBrowserSessionStorage(null);
    const store = createConnectionStore(
      selectSessionStorage("web", nativeStorage, browserStorage),
    );

    await store.saveConnection({
      apiUrl: " https://console.example/ ",
      sessionToken: " token_web ",
    });

    expect(await store.loadConnection()).toEqual({
      apiUrl: "https://console.example",
      sessionToken: "token_web",
    });
  });

  test("keeps browser credentials scoped to session storage", async () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const store = createConnectionStore(
      createBrowserSessionStorage(sessionStorage),
    );

    await store.saveConnection({
      apiUrl: "https://console.example/",
      sessionToken: "session_token",
    });
    expect(await store.loadConnection()).toEqual({
      apiUrl: "https://console.example",
      sessionToken: "session_token",
    });

    await store.clearConnection();
    expect(await store.loadConnection()).toBeNull();
  });
});
