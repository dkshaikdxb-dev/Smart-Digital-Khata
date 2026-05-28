import { create } from 'zustand';

const useAuthStore = create(set => ({
  user: null,
  token: null,

  setAuth: payload =>
    set({
      user: payload.user,
      token: payload.token
    }),

  logout: () =>
    set({
      user: null,
      token: null
    })
}));

export default useAuthStore;
