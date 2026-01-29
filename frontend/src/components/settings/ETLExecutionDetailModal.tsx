import { useState, useEffect } from 'react';
import http from '../../services/http';

interface TiendaDetail {
  tienda_id: string;
  tienda_nombre: string;
  source_system: string;
  status: string;
  duration_seconds: number | null;
  records_extracted: number;
  records_loaded: number;
  duplicates_skipped: number;
  error_phase: string | null;
  error_category: string | null;
  error_message: string | null;
}

interface ETLExecutionDetail {
  id: number;
  etl_name: string;
  etl_type: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  fecha_desde: string;
  fecha_hasta: string;
  status: string;
  records_extracted: number;
  records_loaded: number;
  duplicates_skipped: number;
  gaps_recovered: number;
  extract_duration_seconds: number | null;
  transform_duration_seconds: number | null;
  load_duration_seconds: number | null;
  error_phase: string | null;
  error_category: string | null;
  error_source: string | null;
  error_message: string | null;
  error_detail: string | null;
  triggered_by: string;
  source_system: string | null;
  is_recovery: boolean;
  tiendas_detail: TiendaDetail[];
}

interface Props {
  executionId: number;
  onClose: () => void;
}

export default function ETLExecutionDetailModal({ executionId, onClose }: Props) {
  const [detail, setDetail] = useState<ETLExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDetail();
  }, [executionId]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await http.get(`/api/etl/history/${executionId}`);
      setDetail(response.data);
    } catch (err: any) {
      console.error('Error loading detail:', err);
      setError(err.response?.data?.detail || 'Error cargando detalle de ejecución');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPhaseIcon = (phase: string) => {
    const icons: Record<string, string> = {
      extract: '📥',
      transform: '🔄',
      load: '📤'
    };
    return icons[phase] || '⚠️';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl">
          <div className="text-center">
            <div className="text-gray-500 text-lg">Cargando detalles...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl max-w-md">
          <div className="text-red-600 mb-4">Error: {error}</div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto my-8">
        {/* Header */}
        <div className="sticky top-0 bg-white p-4 border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
          <h2 className="text-xl font-semibold text-gray-800">
            Ejecución #{executionId} - {detail.etl_name.charAt(0).toUpperCase() + detail.etl_name.slice(1)}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-6">
          {/* Resumen de Métricas */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Métricas Generales</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-xs text-blue-600 font-medium mb-1">Duración Total</div>
                <div className="text-2xl font-bold text-blue-900">{formatDuration(detail.duration_seconds)}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-xs text-green-600 font-medium mb-1">Registros Cargados</div>
                <div className="text-2xl font-bold text-green-900">{(detail.records_loaded || 0).toLocaleString()}</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-xs text-yellow-600 font-medium mb-1">Duplicados Omitidos</div>
                <div className="text-2xl font-bold text-yellow-900">{(detail.duplicates_skipped || 0).toLocaleString()}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-xs text-purple-600 font-medium mb-1">Sistema Origen</div>
                <div className="text-2xl font-bold text-purple-900">{detail.source_system || 'mixed'}</div>
              </div>
            </div>
          </div>

          {/* Información de Ejecución */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-xs text-gray-600 font-medium mb-1">Tipo de Ejecución</div>
              <div className="text-sm text-gray-900">{detail.etl_type}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-xs text-gray-600 font-medium mb-1">Origen</div>
              <div className="text-sm text-gray-900">
                {detail.triggered_by === 'eventbridge' && '☁️ AWS EventBridge (Scheduled)'}
                {detail.triggered_by === 'fluxion_admin' && '👤 Panel de Administrador'}
                {detail.triggered_by === 'cli' && '💻 CLI (Manual)'}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-xs text-gray-600 font-medium mb-1">Iniciado</div>
              <div className="text-sm text-gray-900">{formatDateTime(detail.started_at)}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-xs text-gray-600 font-medium mb-1">Finalizado</div>
              <div className="text-sm text-gray-900">{detail.finished_at ? formatDateTime(detail.finished_at) : 'En progreso...'}</div>
            </div>
          </div>

          {/* Tiempo por Fase */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Tiempo por Fase</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-blue-600 text-lg">📥</span>
                  <span className="text-xs text-blue-600 font-medium">EXTRACCIÓN</span>
                </div>
                <div className="text-xl font-bold text-blue-900">{formatDuration(detail.extract_duration_seconds)}</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-yellow-600 text-lg">🔄</span>
                  <span className="text-xs text-yellow-600 font-medium">TRANSFORMACIÓN</span>
                </div>
                <div className="text-xl font-bold text-yellow-900">{formatDuration(detail.transform_duration_seconds)}</div>
              </div>
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-600 text-lg">📤</span>
                  <span className="text-xs text-green-600 font-medium">CARGA</span>
                </div>
                <div className="text-xl font-bold text-green-900">{formatDuration(detail.load_duration_seconds)}</div>
              </div>
            </div>
          </div>

          {/* Error si existe */}
          {detail.error_phase && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center">
                <span className="text-lg mr-2">{getPhaseIcon(detail.error_phase)}</span>
                Error en fase: {detail.error_phase.toUpperCase()}
              </h3>
              <div className="space-y-2">
                <div className="bg-white p-3 rounded">
                  <div className="text-xs text-red-600 font-medium">Categoría</div>
                  <div className="text-sm text-red-900 font-semibold">{detail.error_category}</div>
                </div>
                {detail.error_source && (
                  <div className="bg-white p-3 rounded">
                    <div className="text-xs text-red-600 font-medium">Fuente</div>
                    <div className="text-sm text-red-900">{detail.error_source}</div>
                  </div>
                )}
                {detail.error_message && (
                  <div className="bg-white p-3 rounded">
                    <div className="text-xs text-red-600 font-medium mb-1">Mensaje</div>
                    <pre className="text-xs text-red-900 whitespace-pre-wrap font-mono bg-red-50 p-2 rounded">
                      {detail.error_message}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detalle por Tienda */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle por Tienda ({detail.tiendas_detail.length})</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sistema</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tiempo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Registros</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detail.tiendas_detail.map((t) => (
                      <tr
                        key={t.tienda_id}
                        className={t.status === 'failed' ? 'bg-red-50' : t.status === 'success' ? 'bg-green-50' : ''}
                      >
                        <td className="px-3 py-2">
                          <div className="text-sm font-medium text-gray-900">{t.tienda_nombre}</div>
                          <div className="text-xs text-gray-500">{t.tienda_id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium ${t.source_system === 'klk' ? 'text-blue-600' : 'text-purple-600'}`}>
                            {t.source_system?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-lg">
                            {t.status === 'success' ? '✅' : t.status === 'failed' ? '❌' : '⏭️'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">{formatDuration(t.duration_seconds)}</td>
                        <td className="px-3 py-2">
                          <div className="text-sm text-gray-900 font-medium">{(t.records_loaded || 0).toLocaleString()}</div>
                          {(t.duplicates_skipped || 0) > 0 && (
                            <div className="text-xs text-gray-500">{t.duplicates_skipped || 0} dup</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {t.error_category && (
                            <div>
                              <span className="text-xs text-red-600 font-medium" title={t.error_message || undefined}>
                                {getPhaseIcon(t.error_phase || '')} {t.error_category}
                              </span>
                              {t.error_message && (
                                <div className="text-xs text-red-500 mt-1 truncate max-w-xs" title={t.error_message}>
                                  {t.error_message}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
