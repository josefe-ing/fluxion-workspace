import http from './http';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MatrizCell {
  count: number;
  porcentaje_productos: number;
  porcentaje_valor: number;
}

export interface MatrizABCXYZ {
  total_productos: number;
  total_valor: number;
  matriz: Record<string, MatrizCell>;
  resumen_abc: Record<string, MatrizCell>;
  resumen_xyz: Record<string, MatrizCell>;
}

export interface ProductoEnriquecido {
  codigo_producto: string;
  descripcion: string;
  categoria: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  matriz: string;
  valor_consumo_total: number;
  porcentaje_valor: number;
  ranking_valor: number;
  coeficiente_variacion: number | null;
  stock_actual: number;
}

export interface ClasificacionPorTienda {
  ubicacion_id: string;
  ubicacion_nombre: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  matriz: string;
  ranking_valor: number;
  valor_consumo: number;
  coeficiente_variacion: number | null;
}

export interface InventarioPorUbicacion {
  ubicacion_id: string;
  ubicacion_nombre: string;
  tipo_ubicacion: string;
  cantidad_actual: number;
  ultima_actualizacion: string | null;
}

export interface ProductoDetalleCompleto {
  producto: {
    codigo: string;
    descripcion: string;
    categoria: string;
    marca: string;
  };
  clasificaciones: ClasificacionPorTienda[];
  inventarios: InventarioPorUbicacion[];
  metricas_globales: {
    total_inventario: number;
    ubicaciones_con_stock: number;
    ubicaciones_sin_stock: number;
    total_ubicaciones: number;
  };
}

export interface VentaSemanal {
  semana: string;
  unidades: number;
  valor: number;
  promedio_diario: number;
  fecha_inicio: string | null;
}

export interface VentasSemanalesResponse {
  codigo_producto: string;
  ubicacion_id: string | null;
  semanas: VentaSemanal[];
  metricas: {
    semanas_con_ventas: number;
    total_unidades: number;
    total_valor: number;
    promedio_semanal: number;
    coeficiente_variacion: number | null;
  };
}

export interface ClasificacionHistorica {
  mes: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  matriz: string;
  ranking_valor: number;
  coeficiente_variacion: number | null;
}

export interface HistoricoClasificacionResponse {
  codigo_producto: string;
  ubicacion_id: string | null;
  clasificacion_actual: {
    abc: string;
    xyz: string;
    matriz: string;
    ranking: number;
    cv: number | null;
  };
  historico: ClasificacionHistorica[];
  nota: string;
}

// ============================================================================
// API FUNCTIONS - ABC-XYZ
// ============================================================================

export async function getMatrizABCXYZ(ubicacionId?: string): Promise<MatrizABCXYZ> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get('/api/productos/matriz-abc-xyz', { params });
  return response.data;
}

export async function getProductosPorMatriz(
  matriz: string,
  ubicacionId?: string,
  limit: number = 100,
  offset: number = 0
): Promise<ProductoEnriquecido[]> {
  const params: Record<string, string | number> = { matriz, limit, offset };
  if (ubicacionId) {
    params.ubicacion_id = ubicacionId;
  }

  const response = await http.get('/api/productos/lista-por-matriz', { params });
  return response.data;
}

// ============================================================================
// API FUNCTIONS - PRODUCTO INDIVIDUAL
// ============================================================================

export async function getProductoDetalleCompleto(
  codigo: string
): Promise<ProductoDetalleCompleto> {
  const response = await http.get(`/api/productos/${codigo}/detalle-completo`);
  return response.data;
}

export async function getVentasSemanales(
  codigo: string,
  ubicacionId?: string
): Promise<VentasSemanalesResponse> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get(`/api/productos/${codigo}/ventas-semanales`, { params });
  return response.data;
}

export async function getHistoricoClasificacion(
  codigo: string,
  ubicacionId?: string
): Promise<HistoricoClasificacionResponse> {
  const params = ubicacionId ? { ubicacion_id: ubicacionId } : {};
  const response = await http.get(`/api/productos/${codigo}/historico-clasificacion`, { params });
  return response.data;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getColorMatriz(matriz: string): string {
  const colors: Record<string, string> = {
    'AX': 'bg-green-100 text-green-800 border-green-300',
    'AY': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'AZ': 'bg-red-100 text-red-800 border-red-300',
    'BX': 'bg-blue-100 text-blue-800 border-blue-300',
    'BY': 'bg-gray-100 text-gray-800 border-gray-300',
    'BZ': 'bg-orange-100 text-orange-800 border-orange-300',
    'CX': 'bg-gray-50 text-gray-600 border-gray-200',
    'CY': 'bg-gray-50 text-gray-600 border-gray-200',
    'CZ': 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return colors[matriz] || 'bg-gray-100 text-gray-800';
}

export function getDescripcionMatriz(matriz: string): string {
  const descripciones: Record<string, string> = {
    'AX': 'Alta rotación, demanda estable - IDEAL',
    'AY': 'Alta rotación, demanda variable - MONITOREAR',
    'AZ': 'Alta rotación, demanda errática - RIESGO CRÍTICO',
    'BX': 'Rotación media, demanda estable',
    'BY': 'Rotación media, demanda variable',
    'BZ': 'Rotación media, demanda errática',
    'CX': 'Baja rotación, demanda estable',
    'CY': 'Baja rotación, demanda variable',
    'CZ': 'Baja rotación, demanda errática - CANDIDATO A ELIMINAR',
  };
  return descripciones[matriz] || 'Clasificación desconocida';
}

export function getEstrategiaMatriz(matriz: string): string {
  const estrategias: Record<string, string> = {
    'AX': 'Mantener stock óptimo. Estos productos son predecibles y valiosos.',
    'AY': 'Incrementar frecuencia de revisión. Ajustar stock según temporalidad.',
    'AZ': 'Stock de seguridad alto. Revisar proveedores alternativos. Considerar conjuntos sustituibles.',
    'BX': 'Revisar periódicamente. Considerar optimización de costos.',
    'BY': 'Análisis de patrones estacionales. Ajustar según comportamiento.',
    'BZ': 'Evaluar necesidad. Posible candidato a descontinuar o reducir SKUs.',
    'CX': 'Evaluar si es necesario mantener. Considerar pedido por demanda.',
    'CY': 'Bajo valor estratégico. Revisar rentabilidad.',
    'CZ': 'Candidato a eliminación. Liberar espacio y capital.',
  };
  return estrategias[matriz] || 'Sin estrategia definida';
}

export function getIconoMatriz(matriz: string): string {
  const iconos: Record<string, string> = {
    'AX': '✅',
    'AY': '⚠️',
    'AZ': '🚨',
    'BX': '🔵',
    'BY': '⚪',
    'BZ': '🟠',
    'CX': '⚪',
    'CY': '⚪',
    'CZ': '⚡',
  };
  return iconos[matriz] || '•';
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-VE').format(num);
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD'
  }).format(num);
}

export function formatPercentage(num: number, decimals: number = 1): string {
  return `${num.toFixed(decimals)}%`;
}
