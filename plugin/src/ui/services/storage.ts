import { PluginStorage } from '../types';

type StorageCallback = (data: PluginStorage) => void;

let storageCache: PluginStorage = {};
let listeners: StorageCallback[] = [];
let initialized = false;

function notifyListeners(): void {
  listeners.forEach((cb) => cb(storageCache));
}

export function initStorage(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener('message', (event) => {
    const msg = event.data?.pluginMessage;
    if (msg?.type === 'storage') {
      storageCache = msg.data || {};
      notifyListeners();
    }
  });

  parent.postMessage({ pluginMessage: { type: 'get-storage' } }, '*');
}

export function getStorage(): PluginStorage {
  return storageCache;
}

export function setStorage(updates: Partial<PluginStorage>): void {
  storageCache = { ...storageCache, ...updates };
  parent.postMessage(
    { pluginMessage: { type: 'set-storage', data: storageCache } },
    '*'
  );
  notifyListeners();
}

export function onStorageChange(callback: StorageCallback): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}
