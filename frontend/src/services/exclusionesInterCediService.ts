/**
 * Servicio para gestión de productos excluidos de pedidos Inter-CEDI
 */

import http from './http';

// ============================================================================
// TIPOS
// ============================================================================

export interface ProductoExcluidoInterCedi {
  id: number;
  cedi_destino_id: string;
  cedi_destino_nombre?: string;
  producto_id?: string;
  codigo_producto: string;
  descripcion_producto?: string;
  categoria?: string;
  cedi_origen_id?: string;
  motivo: string;
  observaciones?: string;
  creado_por: string;
  fecha_creacion: string;
  activo: boolean;
}

export interface CrearExclusionRequest {
  cedi_destino_id: string;
  codigo_producto: string;
  motivo?: string;
  observaciones?: string;
}

export interface CargaMasivaRequest {
  cedi_destino_id: string;
  codigos_productos: string[];
  motivo?: string;
  observaciones?: string;
}

export interface CargaMasivaResponse {
  total_recibidos: number;
  exitosos: number;
  duplicados: number;
  no_encontrados: number;
  errores: string[];
}

export interface ProductoBusqueda {
  codigo: string;
  descripcion: string;
  categoria?: string;
  cedi_origen_id?: string;
}

export interface EstadisticasExclusiones {
  cedi_destino_id: string;
  total_excluidos: number;
  por_motivo: Record<string, number>;
  por_cedi_origen: Record<string, number>;
}

export interface CodigosExcluidosResponse {
  cedi_destino_id: string;
  codigos_excluidos: string[];
  total: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

export const MOTIVOS_EXCLUSION = [
  { value: 'MANUAL', label: 'Exclusión manual' },
  { value: 'SOLO_TIENDA', label: 'Se pide directo a tienda' },
  { value: 'PROVEEDOR_LOCAL', label: 'Proveedor local en destino' },
  { value: 'DESCONTINUADO', label: 'Producto descontinuado' },
  { value: 'OTRO', label: 'Otro motivo' },
];

export const CEDIS_DESTINO = [
  { id: 'cedi_caracas', nombre: 'CEDI Caracas' },
];

// ============================================================================
// FUNCIONES
// ============================================================================

/**
 * Lista productos excluidos para un CEDI destino
 */
export async function listarExclusionesInterCedi(
  cediDestinoId: string,
  options?: { search?: string; motivo?: string; limit?: number; offset?: number }
): Promise<ProductoExcluidoInterCedi[]> {
  const response = await http.get(`/api/productos-excluidos-inter-cedi/${cediDestinoId}`, {
    params: options,
  });
  return response.data;
}

/**
 * Obtiene solo los códigos excluidos (para filtrado rápido)
 */
export async function obtenerCodigosExcluidos(
  cediDestinoId: string
): Promise<CodigosExcluidosResponse> {
  const response = await http.get(`/api/productos-excluidos-inter-cedi/codigos/${cediDestinoId}`);
  return response.data;
}

/**
 * Crea una exclusión individual
 */
export async function crearExclusionInterCedi(
  data: CrearExclusionRequest
): Promise<ProductoExcluidoInterCedi> {
  const response = await http.post('/api/productos-excluidos-inter-cedi', data);
  return response.data;
}

/**
 * Carga masiva de exclusiones
 */
export async function cargaMasivaExclusiones(
  data: CargaMasivaRequest
): Promise<CargaMasivaResponse> {
  const response = await http.post('/api/productos-excluidos-inter-cedi/bulk', data);
  return response.data;
}

/**
 * Elimina una exclusión por ID
 */
export async function eliminarExclusionInterCedi(
  id: number
): Promise<{ success: boolean; message: string }> {
  const response = await http.delete(`/api/productos-excluidos-inter-cedi/${id}`);
  return response.data;
}

/**
 * Busca productos para excluir (que no estén ya excluidos)
 */
export async function buscarProductosParaExcluir(
  cediDestinoId: string,
  search: string
): Promise<ProductoBusqueda[]> {
  const response = await http.get('/api/productos-excluidos-inter-cedi/buscar-productos/', {
    params: { cedi_destino_id: cediDestinoId, search },
  });
  return response.data;
}

/**
 * Obtiene estadísticas de exclusiones
 */
export async function obtenerEstadisticasExclusiones(
  cediDestinoId: string
): Promise<EstadisticasExclusiones> {
  const response = await http.get(`/api/productos-excluidos-inter-cedi/estadisticas/${cediDestinoId}`);
  return response.data;
}
