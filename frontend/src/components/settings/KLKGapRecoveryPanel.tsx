/**
 * KLK Gap Recovery Panel
 * Muestra gaps (ejecuciones fallidas) y permite recuperarlos manualmente
 *
 * @author Frontend Team
 * @date 2025-11-24
 */

import { useState, useEffect } from 'react';
import etlTrackingService, { Gap } from '../../services/etlTrackingService';

interface KLKGapRecoveryPanelProps {
  etl_tipo: 'inventario' | 'ventas';
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function KLKGapRecoveryPanel({
  etl_tipo,
  autoRefresh = true,
  refreshInterval = 60
}: KLKGapRecoveryPanelProps) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState<string | null>(null); // gap ID being recovered

  const loadGaps = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await etlTrackingService.getGaps({
        etl_tipo,
        max_horas: 168 // 7 días
      });
      setGaps(data);
    } catch (err: any) {
      setError(err.message || 'Error cargando gaps');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGaps();

    if (autoRefresh) {
      const interval = setInterval(loadGaps, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [etl_tipo, autoRefresh, refreshInterval]);

  const handleRecuperarGap = async (gap: Gap) => {
    const gapKey = `${gap.ubicacion_id}-${gap.fecha_desde}-${gap.hora_desde || ''}`;

    const confirmar = confirm(
      `¿Recuperar gap de ${gap.ubicacion_nombre}?\n\n` +
      `Período: ${gap.fecha_desde} ${gap.hora_desde ? `${gap.hora_desde} - ${gap.hora_hasta}` : ''}\n` +
      `Error anterior: ${gap.error_tipo || 'unknown'}\n\n` +
      `Esto ejecutará el ETL en modo recuperación.`
    );

    if (!confirmar) return;

    setRecovering(gapKey);

    try {
      await etlTrackingService.recuperarGap({
        etl_tipo: gap.etl_tipo,
        ubicacion_id: gap.ubicacion_id,
        fecha_desde: gap.fecha_desde,
        fecha_hasta: gap.fecha_hasta,
        hora_desde: gap.hora_desde || undefined,
        hora_hasta: gap.hora_hasta || undefined
      });

      alert('✅ Recuperación iniciada exitosamente.\n\nLos resultados aparecerán en la tabla de ejecuciones.');

      // Reload gaps after short delay
      setTimeout(loadGaps, 2000);
    } catch (err: any) {
      alert(`❌ Error recuperando gap: ${err.message}`);
    } finally {
      setRecovering(null);
    }
  };

  const getUrgenciaBadge = (horas: number) => {
    if (horas < 2) return { color: 'bg-yellow-100 text-yellow-800', text: 'Reciente' };
    if (horas < 12) return { color: 'bg-orange-100 text-orange-800', text: 'Urgente' };
    if (horas < 48) return { color: 'bg-red-100 text-red-800', text: 'Crítico' };
    return { color: 'bg-purple-100 text-purple-800', text: 'Muy Crítico' };
  };

  if (loading && gaps.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <svg className="animate-spin h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm text-gray-600">Verificando gaps...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Gaps por Recuperar - {etl_tipo === 'ventas' ? 'Ventas' : 'Inventario'} KLK
              </h3>
              <p className="text-sm text-gray-600">
                Ejecuciones fallidas que necesitan recuperación {autoRefresh && `• Auto-refresh cada ${refreshInterval}s`}
              </p>
            </div>
          </div>

          <button
            onClick={loadGaps}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center space-x-2 shadow-sm"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-600">❌ {error}</p>
        </div>
      )}

      {/* Stats Summary */}
      {gaps.length > 0 && (
        <div className="px-6 py-4 bg-orange-50 border-b border-orange-100">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-2xl font-bold text-orange-600">{gaps.length}</div>
              <div className="text-xs text-gray-600">Total Gaps</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {gaps.filter(g => g.horas_desde_fallo >= 48).length}
              </div>
              <div className="text-xs text-gray-600">Críticos (&gt;48h)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {Array.from(new Set(gaps.map(g => g.ubicacion_id))).length}
              </div>
              <div className="text-xs text-gray-600">Tiendas Afectadas</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {gaps.filter(g => g.error_tipo === 'timeout').length}
              </div>
              <div className="text-xs text-gray-600">Timeouts</div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {gaps.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-400">
              <svg className="mx-auto h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium">✅ No hay gaps pendientes</p>
              <p className="text-xs text-gray-500 mt-1">Todas las ejecuciones han sido exitosas</p>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tienda
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fallo Detectado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Urgencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Período Fallido
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {gaps.map((gap, index) => {
                const gapKey = `${gap.ubicacion_id}-${gap.fecha_desde}-${gap.hora_desde || ''}`;
                const urgencia = getUrgenciaBadge(gap.horas_desde_fallo);
                const isRecovering = recovering === gapKey;

                return (
                  <tr key={index} className={`hover:bg-gray-50 ${urgencia.color.includes('red') ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{gap.ubicacion_nombre}</div>
                      <div className="text-xs text-gray-500">{gap.ubicacion_id}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(gap.fecha_fallo).toLocaleString('es-VE', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {etlTrackingService.formatRelativeTime(gap.fecha_fallo)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${urgencia.color}`}>
                          {urgencia.text}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          {gap.horas_desde_fallo.toFixed(1)}h atrás
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {gap.fecha_desde === gap.fecha_hasta
                          ? gap.fecha_desde
                          : `${gap.fecha_desde} - ${gap.fecha_hasta}`}
                      </div>
                      {gap.hora_desde && gap.hora_hasta && (
                        <div className="text-xs text-gray-500">
                          {gap.hora_desde} - {gap.hora_hasta}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1">
                        <span>{etlTrackingService.getErrorTipoEmoji(gap.error_tipo)}</span>
                        <span className="text-xs font-medium text-red-600">{gap.error_tipo || 'unknown'}</span>
                      </div>
                      {gap.error_mensaje && (
                        <div className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={gap.error_mensaje}>
                          {gap.error_mensaje.substring(0, 40)}...
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleRecuperarGap(gap)}
                        disabled={isRecovering}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRecovering ? (
                          <>
                            <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Recuperando...
                          </>
                        ) : (
                          <>
                            <svg className="-ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Recuperar
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {gaps.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <div className="text-gray-600">
              💡 <strong>Tip:</strong> Los gaps se recuperan automáticamente en la próxima ejecución normal (max 5 por ejecución)
            </div>
            <div className="text-gray-500">
              Última actualización: {new Date().toLocaleTimeString('es-VE')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
