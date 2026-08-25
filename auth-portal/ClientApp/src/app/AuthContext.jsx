import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
const storageKey = 'ielts.auth.user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; }
  });

  const signIn = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem(storageKey, JSON.stringify(nextUser));
  };
  const signOut = () => {
    setUser(null);
    localStorage.removeItem(storageKey);
  };
  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
