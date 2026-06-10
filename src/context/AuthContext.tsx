'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { isAuthenticated, login as doLogin, logout as doLogout } from '@/lib/storage';

interface AuthContextType {
  authenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  loading: true,
  login: () => false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState] = useState(() => ({
    authenticated: typeof window !== 'undefined' ? isAuthenticated() : false,
  }));
  const [authenticated, setAuthenticated] = useState(authState.authenticated);
  const [loading] = useState(false);

  const login = (username: string, password: string): boolean => {
    const success = doLogin(username, password);
    if (success) setAuthenticated(true);
    return success;
  };

  const logout = () => {
    doLogout();
    setAuthenticated(false);
  };

  const value = useMemo(() => ({ authenticated, loading, login, logout }), [authenticated, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}