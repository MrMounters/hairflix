import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
export type RecordData = Record<string, any>;
export type Snapshot = {
  user: RecordData;
  state: Record<string, any>;
  defaults: Record<string, RecordData>;
  locations: RecordData[];
  capabilities: RecordData;
  revision: number;
};
const BASE = (
  process.env.EXPO_PUBLIC_APP_API_URL ||
  (Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : "")
).replace(/\/$/, "");
const TOKEN_KEY = "hairflix.session.v1." + BASE.replace(/[^a-zA-Z0-9]/g, "_");
const credentials = {
  get: async () =>
    Platform.OS === "web"
      ? sessionStorage.getItem(TOKEN_KEY)
      : SecureStore.getItemAsync(TOKEN_KEY),
  set: async (v: string) => {
    if (Platform.OS === "web") sessionStorage.setItem(TOKEN_KEY, v);
    else await SecureStore.setItemAsync(TOKEN_KEY, v);
  },
  clear: async () => {
    if (Platform.OS === "web") sessionStorage.removeItem(TOKEN_KEY);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};
type Client = {
  snapshot: Snapshot | null;
  loading: boolean;
  busy: boolean;
  error: string;
  configured: boolean;
  clearError: () => void;
  login: (data: RecordData) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  act: (type: string, payload?: RecordData) => Promise<any>;
  request: (path: string, body?: RecordData) => Promise<any>;
};
const Context = createContext<Client | null>(null);
export function usePlatform() {
  return useContext(Context)!;
}
export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const token = useRef(""),
    pending = useRef<{ signature: string; id: string } | null>(null),
    mounted = useRef(true),
    locked = useRef(false);
  const request = async (path: string, body?: RecordData) => {
    if (!BASE)
      throw Error(
        "Set EXPO_PUBLIC_APP_API_URL to your Hairflix server URL before building.",
      );
    const res = await fetch(BASE + "/api/platform/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token.current ? { Authorization: "Bearer " + token.current } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        token.current = "";
        await credentials.clear();
        setSnapshot(null);
      }
      throw Error(json.error || "Could not complete this request.");
    }
    return json;
  };
  const refresh = async () => {
    if (!token.current) return;
    const session = token.current;
    const state = await request("state");
    if (mounted.current && session === token.current)
      setSnapshot((current) =>
        current?.user.id === state.user.id && current!.revision > state.revision
          ? current
          : state,
      );
  };
  useEffect(() => {
    mounted.current = true;
    credentials
      .get()
      .then(async (v) => {
        token.current = v || "";
        await refresh();
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const timer = setInterval(() => {
      if (AppState.currentState === "active")
        refresh().catch((e) => setError(e.message));
    }, 15000);
    const listener = AppState.addEventListener("change", (v) => {
      if (v === "active") refresh().catch((e) => setError(e.message));
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (locked.current) throw Error("Wait for the current change to finish.");
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
      throw e;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const login = async (data: RecordData) =>
    run(async () => {
      const result = await request("auth/session", data);
      await credentials.set(result.token);
      token.current = result.token;
      await refresh();
    });
  const logout = async () =>
    run(async () => {
      await request("auth/logout", {});
      await credentials.clear();
      token.current = "";
      setSnapshot(null);
    });
  const act = async (type: string, payload: RecordData = {}) =>
    run(async () => {
      const signature = JSON.stringify({ type, payload });
      if (pending.current?.signature !== signature)
        pending.current = {
          signature,
          id:
            Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
        };
      const result = await request("action", {
        type,
        payload,
        requestId: pending.current.id,
      });
      if (type === "account.delete") {
        await credentials.clear();
        token.current = "";
        setSnapshot(null);
      } else await refresh();
      pending.current = null;
      return result.result;
    });
  return (
    <Context.Provider
      value={{
        snapshot,
        loading,
        busy,
        error,
        configured: !!BASE,
        clearError: () => setError(""),
        login,
        logout,
        refresh,
        act,
        request,
      }}
    >
      {children}
    </Context.Provider>
  );
}
