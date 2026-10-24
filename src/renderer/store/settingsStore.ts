import { create } from 'zustand';

const DEFAULT_DEPOT_NAME = 'GESTSTOCK BRASSERIE';

interface SettingsState {
  depotName: string;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  setDepotName: (name: string) => Promise<{ success: boolean; error?: string }>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  depotName: DEFAULT_DEPOT_NAME,
  loaded: false,

  loadSettings: async () => {
    try {
      const r = await window.electronAPI.getSettings();
      if (r.success) {
        set({
          depotName: r.settings.depot_name?.trim() || DEFAULT_DEPOT_NAME,
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch (_) {
      set({ loaded: true });
    }
  },

  setDepotName: async (name: string) => {
    const clean = name.trim();
    if (!clean) return { success: false, error: 'Le nom du dépôt est obligatoire.' };
    const r = await window.electronAPI.updateSetting('depot_name', clean);
    if (r.success) set({ depotName: clean });
    return r;
  },
}));
