// Safe localStorage wrapper: the app must keep working when storage is blocked or throws
// (private mode, cleared site data). Everything is versioned under one prefix.
const PREFIX = "ccarf.v1.";

export function makeStore(backendArg) {
  const mem = new Map(); // fallback for this page view if the backend fails
  // Even *reading* window.localStorage can throw (blocked cookies / sandboxed iframes).
  let backend = null;
  try { backend = backendArg !== undefined ? backendArg : globalThis.localStorage; } catch { backend = null; }
  return {
    load(key, fallback) {
      try {
        const raw = backend ? backend.getItem(PREFIX + key) : null;
        if (raw != null) return JSON.parse(raw);
      } catch { /* blocked or corrupt -> fall through */ }
      return mem.has(key) ? structuredClone(mem.get(key)) : fallback;
    },
    save(key, value) {
      mem.set(key, structuredClone(value));
      if (!backend) return false;
      try {
        backend.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      mem.delete(key);
      try { backend?.removeItem(PREFIX + key); } catch { /* ignore */ }
    },
  };
}
