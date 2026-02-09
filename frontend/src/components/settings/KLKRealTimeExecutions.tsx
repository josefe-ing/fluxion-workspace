/**
 * KLK Real-Time Executions Component
 * Muestra las últimas ejecuciones del ETL KLK en tiempo real
 *
 * @author Frontend Team
 * @date 2025-11-24
 */

import { useState, useEffect, useCallback } from 'react';
import etlTrackingService, { Ejecucion, GetEjecucionesParams } from '../../services/etlTrackingService';

interface KLKRealTimeExecutionsProps {
  etl_tipo: 'inventario' | 'ventas';
  autoRefresh?: boolean;
  refreshInterval?: number; // en segundos
}

export default function KLKRealTimeExecutions({
  etl_tipo,
  autoRefresh = true,
  refreshInterval = 30
}: KLKRealTimeExecutionsProps) {
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTienda, setFiltroTienda] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroModo, setFiltroModo] = useState<string>('');

  const loadEjecuciones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await etlTrackingService.getEjecuciones({
        etl_tipo,
        ubicacion_id: filtroTienda || undefined,
        estado: (filtroEstado || undefined) as GetEjecucionesParams['estado'],
        modo: (filtroModo || undefined) as GetEjecucionesParams['modo'],
        limite: 20
      });
      setEjecuciones(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando ejecuciones');
    } finally {
      setLoading(false);
    }
  }, [etl_tipo, filtroTienda, filtroEstado, filtroModo]);

  useEffect(() => {
    loadEjecuciones();

    if (autoRefresh) {
      const interval = setInterval(loadEjecuciones, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [loadEjecuciones, autoRefresh, refreshInterval]);

  // Extract unique tiendas for filter
  const tiendasNombres = Array.from(new Set(ejecuciones.map(e => ({
    id: e.ubicacion_id,
    nombre: e.ubicacion_nombre
  }))));

  if (loading && ejecuciones.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm text-gray-600">Cargando ejecuciones...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Ejecuciones en Tiempo Real - {etl_tipo === 'ventas' ? 'Ventas' : 'Inventario'} KLK
              </h3>
              <p className="text-sm text-gray-600">
                Últimas 20 ejecuciones {autoRefresh && `• Auto-refresh cada ${refreshInterval}s`}
              </p>
            </div>
          </div>

          <button
            onClick={loadEjecuciones}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center space-x-2 shadow-sm"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm">Actualizar</span>
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center space-x-3">
          <select
            value={filtroTienda}
            onChange={(e) => setFiltroTienda(e.target.value)}
            className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Todas las tiendas</option>
            {tiendasNombres.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Todos los estados</option>
            <option value="exitoso">Exitoso</option>
            <option value="fallido">Fallido</option>
            <option value="en_proceso">En Proceso</option>
            <option value="parcial">Parcial</option>
          </select>

          <select
            value={filtroModo}
            onChange={(e) => setFiltroModo(e.target.value)}
            className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Todos los modos</option>
            <option value="incremental_30min">Incremental 30min</option>
            <option value="completo">Completo</option>
            <option value="recuperacion">Recuperación</option>
          </select>

          {(filtroTienda || filtroEstado || filtroModo) && (
            <button
              onClick={() => {
                setFiltroTienda('');
                setFiltroEstado('');
                setFiltroModo('');
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-600">❌ {error}</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tienda
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Inicio
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Modo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Período
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Registros
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duración
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Error
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ejecuciones.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="text-gray-400">
                    <svg className="mx-auto h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-sm">No hay ejecuciones registradas</p>
                  </div>
                </td>
              </tr>
            ) : (
              ejecuciones.map((ejecucion) => (
                <tr key={ejecucion.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{ejecucion.ubicacion_nombre}</div>
                    <div className="text-xs text-gray-500">{ejecucion.ubicacion_id}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(ejecucion.fecha_inicio).toLocaleString('es-VE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {etlTrackingService.formatRelativeTime(ejecucion.fecha_inicio)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${etlTrackingService.getEstadoBadgeColor(ejecucion.estado)}`}>
                      {ejecucion.estado === 'exitoso' && '✓'}
                      {ejecucion.estado === 'fallido' && '✗'}
                      {ejecucion.estado === 'en_proceso' && '○'}
                      {ejecucion.estado === 'parcial' && '◐'}
                      {' '}
                      {ejecucion.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${etlTrackingService.getModoBadgeColor(ejecucion.modo)}`}>
                      {ejecucion.modo === 'incremental_30min' && '⚡'}
                      {ejecucion.modo === 'completo' && '📦'}
                      {ejecucion.modo === 'recuperacion' && '🔧'}
                      {' '}
                      {ejecucion.modo || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {ejecucion.fecha_desde === ejecucion.fecha_hasta
                        ? ejecucion.fecha_desde
                        : `${ejecucion.fecha_desde} - ${ejecucion.fecha_hasta}`}
                    </div>
                    {ejecucion.hora_desde && ejecucion.hora_hasta && (
                      <div className="text-xs text-gray-500">
                        {ejecucion.hora_desde} - {ejecucion.hora_hasta}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {ejecucion.registros_cargados.toLocaleString()}
                      {ejecucion.estado === 'exitoso' && ejecucion.registros_cargados > 0 && (
                        <span className="text-green-600 ml-1">✓</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      extraídos: {ejecucion.registros_extraidos.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {etlTrackingService.formatDuration(ejecucion.duracion_segundos)}
                  </td>
                  <td className="px-4 py-3">
                    {ejecucion.error_tipo && (
                      <div className="max-w-xs">
                        <div className="flex items-center space-x-1">
                          <span>{etlTrackingService.getErrorTipoEmoji(ejecucion.error_tipo)}</span>
                          <span className="text-xs font-medium text-red-600">{ejecucion.error_tipo}</span>
                        </div>
                        {ejecucion.error_mensaje && (
                          <div className="text-xs text-gray-500 mt-1 truncate" title={ejecucion.error_mensaje}>
                            {ejecucion.error_mensaje.substring(0, 50)}...
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with stats */}
      {ejecuciones.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <span className="text-gray-600">
                <strong>{ejecuciones.length}</strong> ejecuciones
              </span>
              <span className="text-green-600">
                <strong>{ejecuciones.filter(e => e.estado === 'exitoso').length}</strong> exitosas
              </span>
              <span className="text-red-600">
                <strong>{ejecuciones.filter(e => e.estado === 'fallido').length}</strong> fallidas
              </span>
              <span className="text-yellow-600">
                <strong>{ejecuciones.filter(e => e.estado === 'en_proceso').length}</strong> en proceso
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Última actualización: {new Date().toLocaleTimeString('es-VE')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
