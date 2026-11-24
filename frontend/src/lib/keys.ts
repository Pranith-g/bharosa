import { useCallback, useState } from "react";

// Keys arrive in the URL #fragment (browsers never send it to the server), move to localStorage,
// and the fragment is stripped at once so the key never stays in the address bar or a screenshot.
export const STORE = { guardian: "bharosa_guardian_key", parent: "bharosa_parent_key", demo: "bharosa_demo_keys" } as const;
const PREFIX = { guardian: "bg_", parent: "bp_" } as const;

export function stripHash() {
  if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
}

function readInitial(role: "guardian" | "parent"): string {
  const h = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  if (h.startsWith(PREFIX[role])) {
    localStorage.setItem(STORE[role], h);
    stripHash();
    return h;
  }
  if (h) stripHash();
  return localStorage.getItem(STORE[role]) || "";
}

export function useRoleKey(role: "guardian" | "parent") {
  const [key, setKeyState] = useState(() => readInitial(role));
  const setKey = useCallback((k: string) => {
    const v = k.trim();
    if (v) localStorage.setItem(STORE[role], v);
    else localStorage.removeItem(STORE[role]);
    setKeyState(v);
  }, [role]);
  return [key, setKey] as const;
}

export interface DemoKeys { g: string; p: string }

export function saveDemoKeys(k: DemoKeys) {
  localStorage.setItem(STORE.demo, JSON.stringify(k));
}

/** Demo mode takes both keys from `/demo#g=bg_…&p=bp_…`, then forgets the fragment. */
export function readDemoKeys(): DemoKeys | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const g = params.get("g"), p = params.get("p");
  stripHash();
  if (g?.startsWith("bg_") && p?.startsWith("bp_")) {
    saveDemoKeys({ g, p });
    return { g, p };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE.demo) || "null");
    return saved?.g && saved?.p ? saved : null;
  } catch {
    return null;
  }
}
