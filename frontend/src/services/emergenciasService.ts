import http from './http';

// ============================================================================
// TYPES & INTERFACES - Emergencias
// ============================================================================

export type TipoEmergencia = 'STOCKOUT' | 'CRITICO' | 'INMINENTE' | 'ALERTA';
export type TipoAnomalia = 'STOCK_NEGATIVO' | 'VENTA_IMPOSIBLE' | 'SPIKE_VENTAS' | 'DISCREPANCIA';
export type SeveridadAnomalia = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type EstadoAnomalia = 'PENDIENTE' | 'REVISADO' | 'RESUELTO' | 'IGNORADO';
export type TriggerTipo = 'MANUAL' | 'SCHEDULER' | 'API';

export interface EmergenciaDetectada {
  ubicacion_id: string;
  nombre_tienda: string;
  producto_id: string;
  nombre_producto: string;
  categoria: string | null;
  clase_abc: string | null;
  tipo_emergencia: TipoEmergencia;
  stock_actual: number;
  ventas_hoy: number;
  demanda_restante: number;
  cobertura: number;
  factor_intensidad: number;
  horas_restantes: number | null;
  almacen_codigo: string | null;
}

export interface EmergenciasResumen {
  ubicacion_id: string;
  nombre_tienda: string;
  total_emergencias: number;
  stockouts: number;
  criticos: number;
  inminentes: number;
  alertas: number;
  factor_intensidad_promedio: number;
}

export interface AnomaliaDetectada {
  ubicacion_id: string;
  nombre_tienda: string;
  producto_id: string;
  nombre_producto: string;
  almacen_codigo: string | null;
  tipo_anomalia: TipoAnomalia;
  severidad: SeveridadAnomalia;
  valor_detectado: number;
  valor_esperado: number | null;
  desviacion_porcentual: number | null;
  descripcion: string;
  estado: EstadoAnomalia;
  fecha_deteccion: string;
}

export interface ScanRequest {
  tiendas?: string[];
  incluir_anomalias?: boolean;
  usuario?: string;
}

export interface ScanResponse {
  scan_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_ms: number;
  trigger_tipo: TriggerTipo;
  trigger_usuario: string | null;
  tiendas_escaneadas: string[];
  total_productos_analizados: number;
  total_emergencias: number;
  total_anomalias: number;
  stockouts: number;
  criticos: number;
  inminentes: number;
  alertas: number;
  emergencias: EmergenciaDetectada[];
  anomalias: AnomaliaDetectada[];
  resumen_por_tienda: EmergenciasResumen[];
}

export interface ConfigTiendaResumen {
  ubicacion_id: string;
  nombre_tienda: string;
  habilitado: boolean;
  fecha_habilitacion: string | null;
  umbral_critico: number;
  umbral_inminente: number;
  umbral_alerta: number;
}

export interface ConfigTiendasListResponse {
  total: number;
  habilitadas: number;
  tiendas: ConfigTiendaResumen[];
}

export interface FactorIntensidad {
  ubicacion_id: string;
  nombre_tienda: string;
  fecha: string;
  ventas_esperadas_hasta_ahora: number;
  ventas_reales_hasta_ahora: number;
  factor_intensidad: number;
  intensidad: string;
  hora_actual: number;
  porcentaje_dia_transcurrido: number;
}

export interface FactorIntensidadResponse {
  fecha: string;
  hora_actual: number;
  factores: FactorIntensidad[];
}

export interface HabilitarTiendaRequest {
  emails_notificacion?: string[];
  umbral_critico?: number;
  umbral_inminente?: number;
  umbral_alerta?: number;
  usuario?: string;
}

export interface OperacionExitosaResponse {
  ok: boolean;
  mensaje: string;
  ubicacion_id?: string;
  timestamp: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Ejecutar scan de emergencias
 */
export async function ejecutarScan(request: ScanRequest = {}): Promise<ScanResponse> {
  const response = await http.post('/api/emergencias/scan', request);
  return response.data;
}

/**
 * Obtener lista de emergencias del ultimo scan
 */
export async function getEmergencias(): Promise<{
  fecha_consulta: string;
  total: number;
  emergencias: EmergenciaDetectada[];
  resumen_por_tienda: EmergenciasResumen[];
}> {
  const response = await http.get('/api/emergencias/');
  return response.data;
}

/**
 * Obtener lista de anomalias
 */
export async function getAnomalias(params?: {
  ubicacion_id?: string;
  estado?: EstadoAnomalia;
  limit?: number;
}): Promise<{
  fecha_consulta: string;
  total: number;
  anomalias: AnomaliaDetectada[];
}> {
  const response = await http.get('/api/emergencias/anomalias', { params });
  return response.data;
}

/**
 * Obtener factor de intensidad del dia
 */
export async function getFactorIntensidad(): Promise<FactorIntensidadResponse> {
  const response = await http.get('/api/emergencias/factor-intensidad');
  return response.data;
}

/**
 * Obtener configuracion de todas las tiendas
 */
export async function getConfigTiendas(): Promise<ConfigTiendasListResponse> {
  const response = await http.get('/api/emergencias/config/tiendas');
  return response.data;
}

/**
 * Habilitar una tienda para emergencias
 */
export async function habilitarTienda(
  ubicacionId: string,
  request: HabilitarTiendaRequest = {}
): Promise<OperacionExitosaResponse> {
  const response = await http.post(`/api/emergencias/config/tiendas/${ubicacionId}/habilitar`, request);
  return response.data;
}

/**
 * Deshabilitar una tienda para emergencias
 */
export async function deshabilitarTienda(ubicacionId: string): Promise<OperacionExitosaResponse> {
  const response = await http.post(`/api/emergencias/config/tiendas/${ubicacionId}/deshabilitar`, {});
  return response.data;
}
