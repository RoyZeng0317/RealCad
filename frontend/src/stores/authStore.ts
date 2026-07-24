import { create } from 'zustand';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,

  checkAuth: async () => {
    try {
      const res = await axios.get('/auth/me', { withCredentials: true });
      set({ user: res.data, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  login: () => {
    window.location.href = '/auth/google';
  },

  logout: async () => {
    await axios.post('/auth/logout', {}, { withCredentials: true });
    set({ user: null });
  },
}));
