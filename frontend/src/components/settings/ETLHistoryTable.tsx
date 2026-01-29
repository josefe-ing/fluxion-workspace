import { useState, useEffect } from 'react';
import http from '../../services/http';
import ETLExecutionDetailModal from './ETLExecutionDetailModal';

interface ETLExecution {
  id: number;
  etl_name: string;
  etl_type: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  records_extracted: number;
  records_loaded: number;
  duplicates_skipped: number;
  tiendas_count: number;
  tiendas_exitosas: number;
  tiendas_fallidas: number;
  error_phase: string | null;
  error_category: string | null;
  triggered_by: string;
}

interface Filters {
  etl_name: string;
  status: string;
  triggered_by: string;
  fecha_desde: string;
  fecha_hasta: string;
}

export default function ETLHistoryTable() {
  const [executions, setExecutions] = useState<ETLExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>({
    etl_name: '',
    status: '',
    triggered_by: '',
    fecha_desde: '',
    fecha_hasta: ''
  });

  // Auto-refresh para ejecuciones en progreso
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [filters]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Solo refrescar si hay ejecuciones en progreso
      if (executions.some(e => e.status === 'running')) {
        loadHistory();
      }
    }, 10000); // 10 segundos

    return () => clearInterval(interval);
  }, [autoRefresh, executions]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.etl_name) params.append('etl_name', filters.etl_name);
      if (filters.status) params.append('status', filters.status);
      if (filters.triggered_by) params.append('triggered_by', filters.triggered_by);
      if (filters.fecha_desde) params.append('fecha_desde', filters.fecha_desde);
      if (filters.fecha_hasta) params.append('fecha_hasta', filters.fecha_hasta);

      const response = await http.get(`/api/etl/history?${params.toString()}`);
      setExecutions(response.data);
    } catch (error: any) {
      console.error('Error loading ETL history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      running: 'bg-blue-100 text-blue-800 animate-pulse',
      success: 'bg-green-100 text-green-800',
      partial: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800'
    };
    const labels = {
      running: 'Ejecutando',
      success: 'Exitoso',
      partial: 'Parcial',
      failed: 'Fallido'
    };
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status as keyof typeof styles] || 'bg-gray-100'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const getPhaseIcon = (phase: string | null) => {
    if (!phase) return null;
    const icons: Record<string, string> = {
      extract: '📥',
      transform: '🔄',
      load: '📤'
    };
    return <span className="text-lg" title={`Error en fase: ${phase}`}>{icons[phase] || '⚠️'}</span>;
  };

  const getOriginBadge = (origin: string) => {
    const styles: Record<string, string> = {
      eventbridge: 'bg-purple-100 text-purple-800',
      fluxion_admin: 'bg-indigo-100 text-indigo-800',
      cli: 'bg-gray-100 text-gray-800'
    };
    const labels: Record<string, string> = {
      eventbridge: 'AWS',
      fluxion_admin: 'Admin',
      cli: 'CLI'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${styles[origin] || 'bg-gray-100'}`}>
        {labels[origin] || origin}
      </span>
    );
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
    return {
      date: date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const clearFilters = () => {
    setFilters({
      etl_name: '',
      status: '',
      triggered_by: '',
      fecha_desde: '',
      fecha_hasta: ''
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header con auto-refresh toggle */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Historial de Ejecuciones ETL</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1 text-sm rounded ${
              autoRefresh
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {autoRefresh ? '🔄 Auto-refresh' : '⏸️ Pausado'}
          </button>
          <button
            onClick={loadHistory}
            disabled={loading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Refrescar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="grid grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Tipo ETL</label>
            <select
              value={filters.etl_name}
              onChange={(e) => setFilters({ ...filters, etl_name: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              <option value="ventas">Ventas</option>
              <option value="inventario">Inventario</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Estado</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              <option value="success">Exitoso</option>
              <option value="partial">Parcial</option>
              <option value="failed">Fallido</option>
              <option value="running">Ejecutando</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Origen</label>
            <select
              value={filters.triggered_by}
              onChange={(e) => setFilters({ ...filters, triggered_by: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              <option value="eventbridge">AWS (Scheduled)</option>
              <option value="fluxion_admin">Admin Panel</option>
              <option value="cli">CLI (Manual)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Desde</label>
            <input
              type="date"
              value={filters.fecha_desde}
              onChange={(e) => setFilters({ ...filters, fecha_desde: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Hasta</label>
            <input
              type="date"
              value={filters.fecha_hasta}
              onChange={(e) => setFilters({ ...filters, fecha_hasta: e.target.value })}
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha/Hora</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duración</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tiendas</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registros</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origen</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {executions.map((exec) => {
              const dt = formatDateTime(exec.started_at);
              return (
                <tr key={exec.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{dt.date}</div>
                    <div className="text-xs text-gray-500">{dt.time}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-medium text-sm ${exec.etl_name === 'ventas' ? 'text-indigo-600' : 'text-purple-600'}`}>
                      {exec.etl_name.charAt(0).toUpperCase() + exec.etl_name.slice(1)}
                    </span>
                    <div className="text-xs text-gray-500">{exec.etl_type}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getStatusBadge(exec.status)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatDuration(exec.duration_seconds)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-1 text-sm">
                      <span className="text-green-600 font-medium">{exec.tiendas_exitosas}</span>
                      {exec.tiendas_fallidas > 0 && (
                        <>
                          <span className="text-gray-400">/</span>
                          <span className="text-red-600 font-medium">{exec.tiendas_fallidas}</span>
                        </>
                      )}
                      <span className="text-gray-400">/</span>
                      <span className="text-gray-600">{exec.tiendas_count}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{exec.records_loaded.toLocaleString()}</div>
                    {exec.duplicates_skipped > 0 && (
                      <div className="text-xs text-gray-500">{exec.duplicates_skipped.toLocaleString()} dup</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {exec.error_phase && (
                      <div className="flex items-center space-x-1">
                        {getPhaseIcon(exec.error_phase)}
                        <span className="text-xs text-red-600">{exec.error_category}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getOriginBadge(exec.triggered_by)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setSelectedExecution(exec.id)}
                      className="text-indigo-600 hover:text-indigo-900 font-medium"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {executions.length === 0 && !loading && (
        <div className="p-8 text-center">
          <div className="text-gray-400 text-5xl mb-3">📊</div>
          <p className="text-gray-500 text-sm">No se encontraron ejecuciones con los filtros seleccionados</p>
          {(filters.etl_name || filters.status || filters.triggered_by || filters.fecha_desde || filters.fecha_hasta) && (
            <button
              onClick={clearFilters}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="p-8 text-center">
          <div className="text-gray-400 text-lg">Cargando historial...</div>
        </div>
      )}

      {/* Modal de detalle */}
      {selectedExecution && (
        <ETLExecutionDetailModal
          executionId={selectedExecution}
          onClose={() => setSelectedExecution(null)}
        />
      )}
    </div>
  );
}
