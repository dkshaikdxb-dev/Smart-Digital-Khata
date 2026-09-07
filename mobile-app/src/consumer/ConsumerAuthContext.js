import { createContext, useContext } from 'react';

// Consumer session actions, supplied by ConsumerApp. signIn(token) stores the
// token and switches to the signed-in tabs; signOut() clears it and returns to
// the OTP login stack. A 401 from any request also triggers signOut.
export const ConsumerAuthContext = createContext({
  signIn: async (_token) => {},
  signOut: async () => {},
});

export function useConsumerAuth() {
  return useContext(ConsumerAuthContext);
}
