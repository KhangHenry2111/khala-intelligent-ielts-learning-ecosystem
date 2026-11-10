import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);
const storageKey = 'ielts.auth.user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      localStorage.removeItem(storageKey);
    };
    const handleStorage = (event) => {
      if (event.key !== storageKey) return;
      try {
        setUser(event.newValue ? JSON.parse(event.newValue) : null);
      } catch {
        setUser(null);
      }
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

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

export function useAuth() {
  return useContext(AuthContext);
}
