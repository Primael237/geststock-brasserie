import { create } from 'zustand';
import type { User } from '../../shared/types';

interface AuthState {
  user: Omit<User, 'password_hash'> | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;

  setUser: (user: Omit<User, 'password_hash'> | null) => void;
  setMustChangePassword: (must: boolean) => void;
  setLoading: (loading: boolean) => void;

  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  changePassword: (userId: string, oldPass: string, newPass: string, isFirst: boolean) => Promise<{ success: boolean; error?: string }>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  mustChangePassword: false,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setMustChangePassword: (must) => set({ mustChangePassword: must }),
  setLoading: (loading) => set({ isLoading: loading }),

  login: async (username, password) => {
    try {
      const result = await window.electronAPI.login(username, password);
      if (result.success) {
        const { password_hash, ...safeUser } = result.user;
        set({
          user: safeUser,
          isAuthenticated: true,
          mustChangePassword: result.mustChangePassword,
        });
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur de connexion' };
    }
  },

  logout: async () => {
    try {
      await window.electronAPI.logout();
    } catch (_) {
      // ignore
    }
    set({ user: null, isAuthenticated: false, mustChangePassword: false });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const user = await window.electronAPI.getCurrentUser();
      if (user) {
        set({
          user,
          isAuthenticated: true,
          mustChangePassword: user.must_change_password === 1,
        });
      } else {
        set({ user: null, isAuthenticated: false, mustChangePassword: false });
      }
    } catch (_) {
      set({ user: null, isAuthenticated: false, mustChangePassword: false });
    } finally {
      set({ isLoading: false });
    }
  },

  changePassword: async (userId, oldPass, newPass, isFirst) => {
    try {
      const result = await window.electronAPI.changePassword(userId, oldPass, newPass, isFirst);
      if (result.success) {
        set({ mustChangePassword: false });
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur' };
    }
  },
}));