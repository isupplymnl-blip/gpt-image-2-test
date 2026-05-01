/**
 * Global Provider Settings Store
 * Manages global provider preference with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderType } from './providers/types';

interface ProviderSettingsState {
  globalProvider: ProviderType;
  setGlobalProvider: (provider: ProviderType) => void;
}

export const useProviderSettings = create<ProviderSettingsState>()(
  persist(
    (set) => ({
      globalProvider: 'gemini',
      setGlobalProvider: (provider) => set({ globalProvider: provider }),
    }),
    {
      name: 'nano-banana-provider-settings',
    }
  )
);
