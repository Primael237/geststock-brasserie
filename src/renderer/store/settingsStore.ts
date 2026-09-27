import { create } from 'zustand';

const DEFAULT_DEPOT_NAME = 'GESTSTOCK BRASSERIE';

interface SettingsState {
  depotName: string;
  loaded: boolean;
  loadSettings: () => Promise<void>;
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
}));
