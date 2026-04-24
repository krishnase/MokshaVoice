import { MMKV } from 'react-native-mmkv';

interface SyncStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

function makeFallback(): SyncStorage {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); },
    delete: (k) => { map.delete(k); },
  };
}

function makeStorage(id: string): SyncStorage {
  try {
    return new MMKV({ id });
  } catch {
    console.warn(`[storage] MMKV unavailable (${id}), using in-memory fallback`);
    return makeFallback();
  }
}

export const authStorage = makeStorage('auth');
