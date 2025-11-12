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
  // Campos adicionales para vista global (sin ubicacion_id)
  tiendas_con_clasificacion?: number;
  total_tiendas?: number;
  porcentaje_tiendas?: number;
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
  matriz?: string,
  ubicacionId?: string,
  limit: number = 100,
  offset: number = 0
): Promise<ProductoEnriquecido[]> {
  const params: Record<string, string | number> = { limit, offset };
  if (matriz) {
    params.matriz = matriz;
  }
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
    'AX': '⭐ ORO - Productos estrella con demanda constante',
    'AY': '⚠️ VIGILAR - Alto valor pero demanda fluctuante',
    'AZ': '🚨 RIESGO ALTO - Alto valor con demanda caótica',
    'BX': '🔷 CONFIABLE - Valor medio con demanda estable',
    'BY': '⚪ REVISAR - Valor medio con demanda variable',
    'BZ': '🟠 EVALUAR - Valor medio con demanda errática',
    'CX': '💤 ESTABLE - Bajo valor pero demanda constante',
    'CY': '⚫ MARGINAL - Bajo valor con demanda variable',
    'CZ': '📉 MINIMIZAR - Bajo valor y demanda caótica',
  };
  return descripciones[matriz] || 'Clasificación desconocida';
}

export function getEstrategiaMatriz(matriz: string): string {
  const estrategias: Record<string, string> = {
    'AX': '⭐ Nunca quedarse sin stock. Mantener inventario óptimo siempre. Son tus mejores productos.',
    'AY': '⚠️ Monitorear constantemente. Ajustar según patrones y estacionalidad. Alto valor requiere atención.',
    'AZ': '🚨 Stock de seguridad alto. Buscar proveedores alternativos. Considerar productos sustituibles.',
    'BX': '🔷 Revisión periódica. Fáciles de manejar. Optimizar costos de almacenamiento.',
    'BY': '⚪ Analizar caso por caso. Identificar patrones. Decidir estrategia individual.',
    'BZ': '🟠 Evaluar si vale la pena mantener. Considerar descontinuar o reducir variedad.',
    'CX': '💤 Pedido por demanda. Evaluar si liberan capital innecesario. Bajo impacto pero estables.',
    'CY': '⚫ Revisar rentabilidad real. Poco valor estratégico. Considerar eliminar del catálogo.',
    'CZ': '📉 Reducir al mínimo. Liberar espacio en almacén y capital. Evaluar descontinuar.',
  };
  return estrategias[matriz] || 'Sin estrategia definida';
}

export function getIconoMatriz(matriz: string): string {
  const iconos: Record<string, string> = {
    'AX': '⭐',
    'AY': '⚠️',
    'AZ': '🚨',
    'BX': '🔷',
    'BY': '⚪',
    'BZ': '🟠',
    'CX': '💤',
    'CY': '⚫',
    'CZ': '📉',
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

export function formatPercentageValue(value: number): string {
  // For very low values, show 3 decimals or "< 0.001%"
  if (value < 0.1) {
    return value < 0.001 ? '< 0.001%' : value.toFixed(3) + '%';
  }
  // For normal values, show 1 decimal
  return value.toFixed(1) + '%';
}
