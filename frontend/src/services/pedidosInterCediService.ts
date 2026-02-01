/**
 * Servicio para gestionar Pedidos Inter-CEDI
 * Sistema de reposición CEDI Caracas desde CEDIs Valencia (Seco, Frio, Verde)
 */

import http from './http';

// =====================================================================================
// INTERFACES
// =====================================================================================

export interface ConfiguracionDiasCobertura {
  // Productos normales (Seco/Frío)
  dias_cobertura_a: number;
  dias_cobertura_b: number;
  dias_cobertura_c: number;
  dias_cobertura_d: number;
  // Productos FRUVER (perecederos corta vida)
  dias_cobertura_fruver: number;
  // Productos Panadería (muy perecederos)
  dias_cobertura_panaderia: number;
}

export interface P75PorTienda {
  tienda_id: string;
  tienda_nombre: string;
  p75_unidades: number;
}

export interface StockPorTienda {
  tienda_id: string;
  tienda_nombre: string;
  stock_unidades: number;
}

export interface ProductoInterCedi {
  // Identificación
  codigo_producto: string;
  codigo_barras?: string;
  descripcion_producto: string;
  categoria?: string;
  grupo?: string;
  marca?: string;
  presentacion?: string;
  cuadrante?: string;
  clasificacion_abc?: string;

  // CEDI Origen
  cedi_origen_id: string;
  cedi_origen_nombre?: string;
  stock_cedi_origen: number;

  // Cantidades físicas
  unidades_por_bulto: number;
  unidad_pedido?: string; // Bulto, Blister, Cesta, KG, UND, etc.
  peso_unitario_kg?: number;

  // Demanda regional agregada
  demanda_regional_p75: number;
  demanda_regional_promedio: number;
  num_tiendas_region: number;

  // Desglose de P75 por tienda
  p75_por_tienda?: P75PorTienda[];

  // Stock en tiendas de la región
  stock_tiendas_total: number;
  stock_por_tienda?: StockPorTienda[];

  // Stock CEDI destino
  stock_actual_cedi: number;
  stock_en_transito: number;

  // Parámetros calculados
  stock_minimo_cedi: number;
  stock_seguridad_cedi: number;
  stock_maximo_cedi: number;
  punto_reorden_cedi: number;

  // Cantidades sugeridas
  cantidad_sugerida_unidades: number;
  cantidad_sugerida_bultos: number;
  cantidad_ideal_unidades?: number; // Cantidad antes de limitar por stock origen

  // Cantidades pedidas (editables)
  cantidad_pedida_unidades?: number;
  cantidad_pedida_bultos?: number;
  total_unidades?: number;

  // Control
  dias_cobertura_objetivo: number;
  razon_pedido: string;
  incluido?: boolean;
  observaciones?: string;
  linea_numero?: number;
}

export interface TotalesPorCedi {
  productos: number;
  bultos: number;
  unidades: number;
}

export interface CalcularPedidoResponse extends ConfiguracionDiasCobertura {
  productos: ProductoInterCedi[];
  productos_por_cedi_origen: Record<string, ProductoInterCedi[]>;
  total_cedis_origen: number;
  total_productos: number;
  total_bultos: number;
  total_unidades: number;
  cedi_destino_id: string;
  cedi_destino_nombre: string;
  region: string;
  num_tiendas_region: number;
  totales_por_cedi: Record<string, TotalesPorCedi>;
  // Productos excluidos explícitamente
  total_excluidos_inter_cedi: number;
  codigos_excluidos_inter_cedi: string[];
  fecha_calculo: string;
  mensaje: string;
}

export interface PedidoInterCediResumen {
  id: string;
  numero_pedido: string;
  fecha_pedido: string;
  fecha_creacion: string;
  cedi_destino_id: string;
  cedi_destino_nombre?: string;
  region?: string;
  estado: string;
  prioridad: string;
  total_cedis_origen: number;
  total_productos: number;
  total_bultos: number;
  total_unidades: number;
  total_peso_kg?: number;
  usuario_creador?: string;
  dias_desde_creacion?: number;
  productos_cedi_seco: number;
  productos_cedi_frio: number;
  productos_cedi_verde: number;
}

export interface PedidoInterCediCompleto extends PedidoInterCediResumen, ConfiguracionDiasCobertura {
  frecuencia_viajes_dias: string;
  lead_time_dias: number;
  observaciones?: string;
  notas_logistica?: string;
  notas_recepcion?: string;
  fecha_modificacion?: string;
  fecha_confirmacion?: string;
  fecha_despacho?: string;
  fecha_recepcion?: string;
  usuario_confirmador?: string;
  usuario_despachador?: string;
  usuario_receptor?: string;
  productos: ProductoInterCedi[];
  version: number;
}

export interface GuardarPedidoRequest extends ConfiguracionDiasCobertura {
  cedi_destino_id: string;
  cedi_destino_nombre?: string;
  productos: ProductoInterCedi[];
  fecha_pedido?: string;
  frecuencia_viajes_dias?: string;
  lead_time_dias?: number;
  prioridad?: string;
  observaciones?: string;
  notas_logistica?: string;
}

export interface GuardarPedidoResponse {
  id: string;
  numero_pedido: string;
  estado: string;
  total_cedis_origen: number;
  total_productos: number;
  total_bultos: number;
  total_unidades: number;
  fecha_creacion: string;
  mensaje: string;
}

export interface ConfiguracionRuta {
  id: number;
  cedi_origen_id: string;
  cedi_origen_nombre?: string;
  cedi_destino_id: string;
  cedi_destino_nombre?: string;
  lead_time_dias: number;
  frecuencia_viajes_dias: string;
  activo: boolean;
}

export interface HistorialEstado {
  id: string;
  pedido_id: string;
  estado_anterior?: string;
  estado_nuevo: string;
  motivo_cambio?: string;
  usuario: string;
  fecha_cambio: string;
}

// =====================================================================================
// CONSTANTES
// =====================================================================================

export const ESTADOS_PEDIDO_INTER_CEDI = {
  BORRADOR: 'borrador',
  CONFIRMADO: 'confirmado',
  DESPACHADO: 'despachado',
  RECIBIDO: 'recibido',
  CANCELADO: 'cancelado'
} as const;

export const ESTADO_LABELS: Record<string, string> = {
  [ESTADOS_PEDIDO_INTER_CEDI.BORRADOR]: 'Borrador',
  [ESTADOS_PEDIDO_INTER_CEDI.CONFIRMADO]: 'Confirmado',
  [ESTADOS_PEDIDO_INTER_CEDI.DESPACHADO]: 'Despachado',
  [ESTADOS_PEDIDO_INTER_CEDI.RECIBIDO]: 'Recibido',
  [ESTADOS_PEDIDO_INTER_CEDI.CANCELADO]: 'Cancelado'
};

export const ESTADO_COLORS: Record<string, string> = {
  [ESTADOS_PEDIDO_INTER_CEDI.BORRADOR]: 'bg-gray-100 text-gray-800',
  [ESTADOS_PEDIDO_INTER_CEDI.CONFIRMADO]: 'bg-blue-100 text-blue-800',
  [ESTADOS_PEDIDO_INTER_CEDI.DESPACHADO]: 'bg-yellow-100 text-yellow-800',
  [ESTADOS_PEDIDO_INTER_CEDI.RECIBIDO]: 'bg-green-100 text-green-800',
  [ESTADOS_PEDIDO_INTER_CEDI.CANCELADO]: 'bg-red-100 text-red-800'
};

export const CEDI_ORIGEN_COLORS: Record<string, string> = {
  cedi_seco: 'bg-amber-100 text-amber-800 border-amber-300',
  cedi_frio: 'bg-sky-100 text-sky-800 border-sky-300',
  cedi_verde: 'bg-emerald-100 text-emerald-800 border-emerald-300'
};

export const CEDI_ORIGEN_NOMBRES: Record<string, string> = {
  cedi_seco: 'CEDI Seco',
  cedi_frio: 'CEDI Frio',
  cedi_verde: 'CEDI Verde'
};

export const ABC_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-gray-100 text-gray-800'
};

// =====================================================================================
// FUNCIONES API
// =====================================================================================

const API_PREFIX = '/api/pedidos-inter-cedi';

/**
 * Lista pedidos Inter-CEDI con filtros opcionales
 */
export async function listarPedidosInterCedi(filtros?: {
  estado?: string;
  cedi_destino_id?: string;
  limit?: number;
}): Promise<PedidoInterCediResumen[]> {
  const params = new URLSearchParams();
  if (filtros?.estado) params.append('estado', filtros.estado);
  if (filtros?.cedi_destino_id) params.append('cedi_destino_id', filtros.cedi_destino_id);
  if (filtros?.limit) params.append('limit', filtros.limit.toString());

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await http.get(`${API_PREFIX}/${query}`);
  return response.data;
}

/**
 * Calcula pedido Inter-CEDI basado en demanda regional
 */
export async function calcularPedidoInterCedi(config: {
  cedi_destino_id: string;
  dias_cobertura_a?: number;
  dias_cobertura_b?: number;
  dias_cobertura_c?: number;
  dias_cobertura_d?: number;
  dias_cobertura_fruver?: number;
  dias_cobertura_panaderia?: number;
  frecuencia_viajes_dias?: string;
  lead_time_dias?: number;
}): Promise<CalcularPedidoResponse> {
  const response = await http.post(`${API_PREFIX}/calcular`, {
    cedi_destino_id: config.cedi_destino_id,
    dias_cobertura_a: config.dias_cobertura_a ?? 12,
    dias_cobertura_b: config.dias_cobertura_b ?? 15,
    dias_cobertura_c: config.dias_cobertura_c ?? 18,
    dias_cobertura_d: config.dias_cobertura_d ?? 18,
    dias_cobertura_fruver: config.dias_cobertura_fruver ?? 1,
    dias_cobertura_panaderia: config.dias_cobertura_panaderia ?? 1,
    frecuencia_viajes_dias: config.frecuencia_viajes_dias ?? 'Mar,Jue,Sab',
    lead_time_dias: config.lead_time_dias ?? 2.0
  });
  return response.data;
}

/**
 * Guarda pedido Inter-CEDI en estado borrador
 */
export async function guardarPedidoInterCedi(
  pedido: GuardarPedidoRequest
): Promise<GuardarPedidoResponse> {
  const response = await http.post(`${API_PREFIX}/`, pedido);
  return response.data;
}

/**
 * Obtiene pedido Inter-CEDI completo con productos
 */
export async function obtenerPedidoInterCedi(
  pedidoId: string
): Promise<PedidoInterCediCompleto> {
  const response = await http.get(`${API_PREFIX}/${pedidoId}`);
  return response.data;
}

/**
 * Elimina pedido Inter-CEDI (solo en estado borrador)
 */
export async function eliminarPedidoInterCedi(
  pedidoId: string
): Promise<{ mensaje: string }> {
  const response = await http.delete(`${API_PREFIX}/${pedidoId}`);
  return response.data;
}

/**
 * Confirma pedido (borrador -> confirmado)
 */
export async function confirmarPedidoInterCedi(
  pedidoId: string,
  datos?: { motivo?: string; usuario?: string; notas?: string }
): Promise<{ mensaje: string; numero_pedido: string; estado_nuevo: string }> {
  const response = await http.post(`${API_PREFIX}/${pedidoId}/confirmar`, datos ?? {});
  return response.data;
}

/**
 * Marca pedido como despachado (confirmado -> despachado)
 */
export async function despacharPedidoInterCedi(
  pedidoId: string,
  datos?: { motivo?: string; usuario?: string; notas?: string }
): Promise<{ mensaje: string; numero_pedido: string; estado_nuevo: string }> {
  const response = await http.post(`${API_PREFIX}/${pedidoId}/despachar`, datos ?? {});
  return response.data;
}

/**
 * Marca pedido como recibido (despachado -> recibido)
 */
export async function recibirPedidoInterCedi(
  pedidoId: string,
  datos?: { motivo?: string; usuario?: string; notas?: string }
): Promise<{ mensaje: string; numero_pedido: string; estado_nuevo: string }> {
  const response = await http.post(`${API_PREFIX}/${pedidoId}/recibir`, datos ?? {});
  return response.data;
}

/**
 * Cancela pedido (solo desde borrador)
 */
export async function cancelarPedidoInterCedi(
  pedidoId: string,
  datos?: { motivo?: string; usuario?: string; notas?: string }
): Promise<{ mensaje: string; numero_pedido: string; estado_nuevo: string }> {
  const response = await http.post(`${API_PREFIX}/${pedidoId}/cancelar`, datos ?? {});
  return response.data;
}

/**
 * Obtiene historial de cambios de estado
 */
export async function obtenerHistorialPedido(
  pedidoId: string
): Promise<HistorialEstado[]> {
  const response = await http.get(`${API_PREFIX}/${pedidoId}/historial`);
  return response.data;
}

/**
 * Obtiene configuración de rutas Inter-CEDI
 */
export async function obtenerRutasInterCedi(
  activo?: boolean
): Promise<ConfiguracionRuta[]> {
  const params = activo !== undefined ? `?activo=${activo}` : '';
  const response = await http.get(`${API_PREFIX}/config/rutas${params}`);
  return response.data;
}

/**
 * Genera URL para descargar Excel del pedido
 */
export function getExportarExcelUrl(
  pedidoId: string,
  cediOrigen?: string
): string {
  const isProduction =
    window.location.hostname.includes('cloudfront.net') ||
    window.location.hostname.includes('s3-website') ||
    window.location.hostname.includes('amazonaws.com') ||
    window.location.hostname.includes('fluxionia.co');

  const baseUrl = import.meta.env.VITE_API_URL ??
    (isProduction ? 'https://api.fluxionia.co' : 'http://localhost:8001');

  let url = `${baseUrl}${API_PREFIX}/${pedidoId}/exportar`;
  if (cediOrigen) {
    url += `?cedi_origen=${cediOrigen}`;
  }
  return url;
}

// =====================================================================================
// HISTORIAL DE VENTAS
// =====================================================================================

export interface VentaDiariaRegional {
  fecha: string;
  dia_semana: string;
  por_tienda: Record<string, number>;
  total: number;
}

export interface HistorialVentasRegionalResponse {
  codigo_producto: string;
  region: string;
  tiendas: { id: string; nombre: string }[];
  ventas_diarias: VentaDiariaRegional[];
  totales: {
    total_vendido: number;
    dias_con_venta: number;
    promedio_diario: number;
    p75_regional: number;
    p75_por_tienda: Record<string, number>;
  };
}

/**
 * Obtiene historial de ventas regional para un producto
 */
export async function obtenerHistorialVentasRegional(
  codigoProducto: string,
  cediDestinoId: string = 'cedi_caracas',
  dias: number = 30
): Promise<HistorialVentasRegionalResponse> {
  const response = await http.get(
    `${API_PREFIX}/historial-ventas/${codigoProducto}?cedi_destino_id=${cediDestinoId}&dias=${dias}`
  );
  return response.data;
}

// =====================================================================================
// HISTORIAL DE INVENTARIO CEDI
// =====================================================================================

export interface SnapshotInventario {
  fecha: string;
  cantidad: number;
}

export interface HistorialInventarioCediResponse {
  codigo_producto: string;
  descripcion_producto: string;
  ubicacion_id: string;
  ubicacion_nombre: string;
  snapshots: SnapshotInventario[];
  estadisticas: {
    max: number;
    min: number;
    promedio: number;
    actual: number;
    dias_con_datos: number;
  };
}

/**
 * Obtiene historial de inventario de un producto en un CEDI
 */
export async function obtenerHistorialInventarioCedi(
  codigoProducto: string,
  ubicacionId: string = 'cedi_caracas',
  dias: number = 30
): Promise<HistorialInventarioCediResponse> {
  const response = await http.get(
    `${API_PREFIX}/historial-inventario/${codigoProducto}?ubicacion_id=${ubicacionId}&dias=${dias}`
  );
  return response.data;
}

// =====================================================================================
// HELPERS
// =====================================================================================

/**
 * Formatea número con separadores de miles
 */
export function formatNumber(value: number | string | undefined, decimals = 0): string {
  if (value === undefined || value === null) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Agrupa productos por CEDI origen
 */
export function agruparPorCediOrigen(
  productos: ProductoInterCedi[]
): Record<string, ProductoInterCedi[]> {
  const grupos: Record<string, ProductoInterCedi[]> = {
    cedi_seco: [],
    cedi_frio: [],
    cedi_verde: []
  };

  for (const producto of productos) {
    const cedi = producto.cedi_origen_id || 'cedi_seco';
    if (grupos[cedi]) {
      grupos[cedi].push(producto);
    }
  }

  return grupos;
}

/**
 * Calcula totales de productos
 */
export function calcularTotales(productos: ProductoInterCedi[]): {
  totalProductos: number;
  totalBultos: number;
  totalUnidades: number;
} {
  const productosIncluidos = productos.filter(
    p => p.incluido !== false && (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) > 0
  );

  return {
    totalProductos: productosIncluidos.length,
    totalBultos: productosIncluidos.reduce(
      (sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos),
      0
    ),
    totalUnidades: productosIncluidos.reduce(
      (sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) * p.unidades_por_bulto,
      0
    )
  };
}
