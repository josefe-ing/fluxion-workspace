import http from './http';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Ubicacion {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  region: string | null;
  ciudad: string | null;
  superficie_m2: number | null;
  activo: boolean;
  visible_pedidos: boolean;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Obtiene lista de ubicaciones (tiendas y CEDIs)
 * @param tipo Filtrar por tipo: 'tienda' o 'cedi'
 * @returns Array de ubicaciones
 */
export async function getUbicaciones(tipo?: 'tienda' | 'cedi'): Promise<Ubicacion[]> {
  const params = tipo ? { tipo } : {};
  const response = await http.get('/api/ubicaciones', { params });
  return response.data;
}

/**
 * Obtiene solo tiendas (sin CEDIs)
 * @returns Array de tiendas
 */
export async function getTiendas(): Promise<Ubicacion[]> {
  return getUbicaciones('tienda');
}

/**
 * Obtiene solo CEDIs (sin tiendas)
 * @returns Array de CEDIs
 */
export async function getCedis(): Promise<Ubicacion[]> {
  return getUbicaciones('cedi');
}

/**
 * Obtiene solo ubicaciones visibles para el módulo de Pedidos Sugeridos
 * @returns Array de ubicaciones visibles
 */
export async function getUbicacionesVisiblesPedidos(): Promise<Ubicacion[]> {
  const response = await http.get('/api/ubicaciones', {
    params: { visible_pedidos: true }
  });
  return response.data;
}
