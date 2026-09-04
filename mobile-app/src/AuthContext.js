import { createContext } from 'react';

// Provides the login/logout actions to any screen. `signIn` is called with the
// user's role from the login response; `signOut` clears the token and returns
// to the Login screen. Values are supplied by App.js.
export const AuthContext = createContext({
  signIn: (_role) => {},
  signOut: () => {},
});
