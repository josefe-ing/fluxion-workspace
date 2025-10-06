import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  username: string | null;
  nombreCompleto: string | null;
  login: (token: string, username: string, nombreCompleto?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [nombreCompleto, setNombreCompleto] = useState<string | null>(null);

  // Verificar si hay un token guardado al cargar
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUsername = localStorage.getItem('username');
    const savedNombreCompleto = localStorage.getItem('nombre_completo');

    if (savedToken && savedUsername) {
      setToken(savedToken);
      setUsername(savedUsername);
      setNombreCompleto(savedNombreCompleto);
      setIsAuthenticated(true);
    }
  }, []);

  const login = (newToken: string, newUsername: string, newNombreCompleto?: string) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('username', newUsername);
    if (newNombreCompleto) {
      localStorage.setItem('nombre_completo', newNombreCompleto);
    }

    setToken(newToken);
    setUsername(newUsername);
    setNombreCompleto(newNombreCompleto || null);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    localStorage.removeItem('nombre_completo');

    setToken(null);
    setUsername(null);
    setNombreCompleto(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        username,
        nombreCompleto,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
