import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  username: string | null;
  nombreCompleto: string | null;
  rolId: string | null;
  tiendasAsignadas: string[];
  login: (token: string, username: string, nombreCompleto?: string, rolId?: string, tiendasAsignadas?: string[]) => void;
  logout: () => void;
  hasRole: (roles: string[]) => boolean;
  canAccessStore: (storeId: string) => boolean;
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
  const [rolId, setRolId] = useState<string | null>(null);
  const [tiendasAsignadas, setTiendasAsignadas] = useState<string[]>([]);

  // Verificar si hay un token guardado al cargar
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUsername = localStorage.getItem('username');
    const savedNombreCompleto = localStorage.getItem('nombre_completo');
    const savedRolId = localStorage.getItem('rol_id');
    const savedTiendas = localStorage.getItem('tiendas_asignadas');

    if (savedToken && savedUsername) {
      setToken(savedToken);
      setUsername(savedUsername);
      setNombreCompleto(savedNombreCompleto);
      setRolId(savedRolId);
      setTiendasAsignadas(savedTiendas ? JSON.parse(savedTiendas) : []);
      setIsAuthenticated(true);
    }
  }, []);

  const login = (
    newToken: string,
    newUsername: string,
    newNombreCompleto?: string,
    newRolId?: string,
    newTiendasAsignadas?: string[]
  ) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('username', newUsername);
    if (newNombreCompleto) {
      localStorage.setItem('nombre_completo', newNombreCompleto);
    }
    if (newRolId) {
      localStorage.setItem('rol_id', newRolId);
    }
    if (newTiendasAsignadas) {
      localStorage.setItem('tiendas_asignadas', JSON.stringify(newTiendasAsignadas));
    }

    setToken(newToken);
    setUsername(newUsername);
    setNombreCompleto(newNombreCompleto || null);
    setRolId(newRolId || null);
    setTiendasAsignadas(newTiendasAsignadas || []);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    localStorage.removeItem('nombre_completo');
    localStorage.removeItem('rol_id');
    localStorage.removeItem('tiendas_asignadas');

    setToken(null);
    setUsername(null);
    setNombreCompleto(null);
    setRolId(null);
    setTiendasAsignadas([]);
    setIsAuthenticated(false);
  };

  const hasRole = (roles: string[]): boolean => {
    return rolId ? roles.includes(rolId) : false;
  };

  const canAccessStore = (storeId: string): boolean => {
    if (rolId === 'gerente_tienda') {
      return tiendasAsignadas.includes(storeId);
    }
    // Other roles can access all stores
    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        username,
        nombreCompleto,
        rolId,
        tiendasAsignadas,
        login,
        logout,
        hasRole,
        canAccessStore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
