/**
 * ETL Tracking Service - Frontend
 * Consume endpoints del sistema de tracking KLK
 *
 * @author Frontend Team
 * @date 2025-11-24
 */

import http from './http';

export interface Ejecucion {
  id: number;
  etl_tipo: 'inventario' | 'ventas';
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  duracion_segundos: number | null;
  fecha_desde: string;
  fecha_hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  estado: 'en_proceso' | 'exitoso' | 'fallido' | 'parcial';
  registros_extraidos: number;
  registros_cargados: number;
  error_mensaje: string | null;
  error_tipo: 'timeout' | 'conexion' | 'api_error' | 'db_error' | null;
  modo: 'completo' | 'incremental_30min' | 'recuperacion' | null;
  version_etl: string | null;
  host: string | null;
}

export interface Gap {
  etl_tipo: 'inventario' | 'ventas';
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha_desde: string;
  fecha_hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  fecha_fallo: string;
  error_tipo: string | null;
  error_mensaje: string | null;
  horas_desde_fallo: number;
}

export interface Metrica {
  etl_tipo: 'inventario' | 'ventas';
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha: string;
  total_ejecuciones: number;
  ejecuciones_exitosas: number;
  ejecuciones_fallidas: number;
  tasa_exito_pct: number;
  duracion_promedio_seg: number | null;
  total_registros_cargados: number;
}

export interface CronStatus {
  cron_activo: boolean;
  frecuencia: string;
  proxima_ejecucion_estimada: string | null;
  ejecuciones_hoy: number;
  exitosas_hoy: number;
  fallidas_hoy: number;
}

export interface RecuperarGapRequest {
  etl_tipo: 'inventario' | 'ventas';
  ubicacion_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  hora_desde?: string;
  hora_hasta?: string;
}

export interface ConnectivityTestResult {
  status: 'disponible' | 'timeout' | 'error';
  http_status: number | null;
  latencia_ms: number | null;
  url: string;
  error?: string;
  timestamp: string;
}

export interface GetEjecucionesParams {
  etl_tipo?: 'inventario' | 'ventas';
  ubicacion_id?: string;
  modo?: 'completo' | 'incremental_30min' | 'recuperacion';
  estado?: 'en_proceso' | 'exitoso' | 'fallido' | 'parcial';
  limite?: number;
}

export interface GetGapsParams {
  etl_tipo?: 'inventario' | 'ventas';
  ubicacion_id?: string;
  max_horas?: number;
}

export interface GetMetricasParams {
  etl_tipo?: 'inventario' | 'ventas';
  ubicacion_id?: string;
  dias?: number;
}

const etlTrackingService = {
  /**
   * Obtiene ejecuciones recientes del ETL
   */
  async getEjecuciones(params?: GetEjecucionesParams): Promise<Ejecucion[]> {
    const queryParams = new URLSearchParams();

    if (params?.etl_tipo) queryParams.append('etl_tipo', params.etl_tipo);
    if (params?.ubicacion_id) queryParams.append('ubicacion_id', params.ubicacion_id);
    if (params?.modo) queryParams.append('modo', params.modo);
    if (params?.estado) queryParams.append('estado', params.estado);
    if (params?.limite) queryParams.append('limite', params.limite.toString());

    const query = queryParams.toString();
    const url = `/api/etl/tracking/ejecuciones${query ? `?${query}` : ''}`;

    const response = await http.get(url);
    return response.data;
  },

  /**
   * Obtiene gaps (ejecuciones fallidas sin recuperar)
   */
  async getGaps(params?: GetGapsParams): Promise<Gap[]> {
    const queryParams = new URLSearchParams();

    if (params?.etl_tipo) queryParams.append('etl_tipo', params.etl_tipo);
    if (params?.ubicacion_id) queryParams.append('ubicacion_id', params.ubicacion_id);
    if (params?.max_horas) queryParams.append('max_horas', params.max_horas.toString());

    const query = queryParams.toString();
    const url = `/api/etl/tracking/gaps${query ? `?${query}` : ''}`;

    const response = await http.get(url);
    return response.data;
  },

  /**
   * Obtiene métricas de confiabilidad
   */
  async getMetricas(params?: GetMetricasParams): Promise<Metrica[]> {
    const queryParams = new URLSearchParams();

    if (params?.etl_tipo) queryParams.append('etl_tipo', params.etl_tipo);
    if (params?.ubicacion_id) queryParams.append('ubicacion_id', params.ubicacion_id);
    if (params?.dias) queryParams.append('dias', params.dias.toString());

    const query = queryParams.toString();
    const url = `/api/etl/tracking/metricas${query ? `?${query}` : ''}`;

    const response = await http.get(url);
    return response.data;
  },

  /**
   * Obtiene el estado del cron KLK
   */
  async getCronStatus(): Promise<CronStatus> {
    const response = await http.get('/api/etl/tracking/cron/status');
    return response.data;
  },

  /**
   * Recupera un gap específico ejecutando el ETL
   */
  async recuperarGap(request: RecuperarGapRequest): Promise<{ mensaje: string; execution_id?: string }> {
    const response = await http.post('/api/etl/tracking/recuperar-gap', request);
    return response.data;
  },

  /**
   * Test de conectividad a API KLK
   */
  async testKLKConnectivity(): Promise<ConnectivityTestResult> {
    const response = await http.get('/api/etl/tracking/connectivity/klk');
    return response.data;
  },

  /**
   * Helper: Formatea duración en segundos a string legible
   */
  formatDuration(segundos: number | null): string {
    if (!segundos) return 'N/A';

    if (segundos < 60) {
      return `${segundos.toFixed(1)}s`;
    } else if (segundos < 3600) {
      const minutos = Math.floor(segundos / 60);
      const segs = Math.floor(segundos % 60);
      return `${minutos}m ${segs}s`;
    } else {
      const horas = Math.floor(segundos / 3600);
      const minutos = Math.floor((segundos % 3600) / 60);
      return `${horas}h ${minutos}m`;
    }
  },

  /**
   * Helper: Formatea timestamp relativo ("hace 5 min", "hace 2 horas")
   */
  formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'Ahora';
    if (diffMinutes === 1) return 'Hace 1 min';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return 'Hace 1 hora';
    if (diffHours < 24) return `Hace ${diffHours} horas`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Hace 1 día';
    return `Hace ${diffDays} días`;
  },

  /**
   * Helper: Get badge color for estado
   */
  getEstadoBadgeColor(estado: Ejecucion['estado']): string {
    switch (estado) {
      case 'exitoso':
        return 'bg-green-100 text-green-800';
      case 'fallido':
        return 'bg-red-100 text-red-800';
      case 'en_proceso':
        return 'bg-yellow-100 text-yellow-800';
      case 'parcial':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  },

  /**
   * Helper: Get badge color for modo
   */
  getModoBadgeColor(modo: Ejecucion['modo']): string {
    switch (modo) {
      case 'incremental_30min':
        return 'bg-blue-100 text-blue-800';
      case 'completo':
        return 'bg-purple-100 text-purple-800';
      case 'recuperacion':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  },

  /**
   * Helper: Get emoji for error tipo
   */
  getErrorTipoEmoji(error_tipo: string | null): string {
    switch (error_tipo) {
      case 'timeout':
        return '⏱️';
      case 'conexion':
        return '🔌';
      case 'api_error':
        return '🌐';
      case 'db_error':
        return '💾';
      default:
        return '❓';
    }
  }
};

export default etlTrackingService;
