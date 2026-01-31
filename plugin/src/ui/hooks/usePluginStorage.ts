import { useState, useEffect } from 'react';
import { PluginStorage } from '../types';
import {
  initStorage,
  getStorage,
  setStorage,
  onStorageChange,
} from '../services/storage';

interface UsePluginStorageResult {
  storage: PluginStorage;
  updateStorage: (updates: Partial<PluginStorage>) => void;
}

export function usePluginStorage(): UsePluginStorageResult {
  const [storage, setLocal] = useState<PluginStorage>({});

  useEffect(() => {
    initStorage();
    setLocal(getStorage());

    const unsubscribe = onStorageChange((data) => {
      setLocal(data);
    });

    return unsubscribe;
  }, []);

  const updateStorage = (updates: Partial<PluginStorage>): void => {
    setStorage(updates);
  };

  return { storage, updateStorage };
}
