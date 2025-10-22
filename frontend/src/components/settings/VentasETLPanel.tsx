import { useState, useEffect } from 'react';
import http from '../../services/http';
import LogViewer from './LogViewer';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface GapInfo {
  ubicacion_id: string;
  ubicacion_nombre: string;
  total_registros: number;
  fecha_mas_antigua: string;
  fecha_mas_reciente: string;
  dias_atrasados: number;
  dias_totales_periodo: number;
  dias_con_data: number;
  dias_faltantes: number;
  completitud_porcentaje: number;
  necesita_actualizacion: boolean;
  tiene_gaps_historicos: boolean;
}

interface GapsResponse {
  tiendas: GapInfo[];
  total_tiendas: number;
  tiendas_desactualizadas: number;
  tiendas_con_gaps: number;
}

interface SchedulerStatus {
  enabled: boolean;
  is_running: boolean;
  last_execution: string | null;
  next_execution: string | null;
  execution_time: string;
  daily_summary: {
    inicio?: string;
    fecha_procesada?: string;
    total_tiendas?: number;
    exitosas?: number;
    fallidas?: number;
    tiendas_exitosas?: string[];
    tiendas_fallidas?: string[];
  };
  retry_config: {
    max_retries: number;
    retry_interval_minutes: number;
    pending_retries: string[];
    failed_stores: Record<string, number>;
  };
}

export default function VentasETLPanel() {
  const [gaps, setGaps] = useState<GapsResponse | null>(null);
  const [loadingGaps, setLoadingGaps] = useState(false);

  // Manual ETL state
  const [selectedTienda, setSelectedTienda] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [loadingScheduler, setLoadingScheduler] = useState(false);

  // Scheduler manual execution with custom dates
  const [schedulerFechaInicio, setSchedulerFechaInicio] = useState<string>('');
  const [schedulerFechaFin, setSchedulerFechaFin] = useState<string>('');
  const [showSchedulerCustomDates, setShowSchedulerCustomDates] = useState(false);

  // Load gaps and scheduler status on mount
  useEffect(() => {
    loadGaps();
    loadSchedulerStatus();

    // Set default dates for yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    setSchedulerFechaInicio(yesterdayStr);
    setSchedulerFechaFin(yesterdayStr);

    // Poll scheduler status every 30 seconds
    const interval = setInterval(loadSchedulerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadGaps = async () => {
    setLoadingGaps(true);
    try {
      const response = await http.get('/api/ventas/gaps');
      setGaps(response.data);
    } catch (error) {
      console.error('Error cargando gaps:', error);
    } finally {
      setLoadingGaps(false);
    }
  };

  const loadSchedulerStatus = async () => {
    setLoadingScheduler(true);
    try {
      const response = await http.get('/api/etl/scheduler/status');
      setSchedulerStatus(response.data);
    } catch (error) {
      console.error('Error cargando status del scheduler:', error);
    } finally {
      setLoadingScheduler(false);
    }
  };

  const toggleScheduler = async () => {
    if (!schedulerStatus) return;

    try {
      const endpoint = schedulerStatus.enabled ? '/api/etl/scheduler/disable' : '/api/etl/scheduler/enable';
      await http.post(endpoint, {});
      await loadSchedulerStatus();
    } catch (error) {
      console.error('Error toggling scheduler:', error);
      alert('Error al cambiar estado del scheduler');
    }
  };

  const triggerSchedulerNow = async () => {
    if (!schedulerStatus) return;

    if (schedulerStatus.is_running) {
      alert('El scheduler ya está ejecutando un ETL automático');
      return;
    }

    if (!schedulerFechaInicio || !schedulerFechaFin) {
      alert('Por favor selecciona las fechas de inicio y fin');
      return;
    }

    const confirmar = confirm(
      `¿Ejecutar ETL automático para TODAS las tiendas?\n\n` +
      `Período: ${schedulerFechaInicio} al ${schedulerFechaFin}\n` +
      `Total tiendas: ${gaps?.total_tiendas || 16}\n\n` +
      `Esto puede tomar varios minutos. Los logs se verán en el servidor backend.`
    );

    if (!confirmar) return;

    try {
      const response = await http.post('/api/etl/scheduler/trigger', {
        fecha_inicio: schedulerFechaInicio,
        fecha_fin: schedulerFechaFin
      });

      alert(
        `ETL automático iniciado exitosamente!\n\n` +
        `${response.data.message}\n\n` +
        `Los logs aparecen en el servidor backend:\n` +
        `tail -f /tmp/fluxion_backend.log`
      );

      await loadSchedulerStatus();
    } catch (error: any) {
      console.error('Error triggering scheduler:', error);
      alert(error.response?.data?.detail || 'Error al ejecutar ETL automático');
    }
  };

  const startETL = async () => {
    if (!selectedTienda) {
      alert('Por favor selecciona una tienda');
      return;
    }

    if (!fechaInicio || !fechaFin) {
      alert('Por favor ingresa fechas de inicio y fin');
      return;
    }

    setIsRunning(true);
    setLogs([]);

    try {
      const payload = {
        ubicacion_id: selectedTienda,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      };

      const response = await http.post('/api/etl/sync/ventas', payload);

      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'info',
        message: response.data.message || 'ETL de ventas iniciado'
      }]);

    } catch (error: any) {
      setIsRunning(false);
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'error',
        message: error.response?.data?.detail || error.message || 'Error iniciando ETL de ventas'
      }]);
    }
  };

  // Poll for logs while running
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const response = await http.get('/api/etl/ventas/logs');
        setLogs(response.data.logs || []);

        if (response.data.status === 'completed') {
          setTimeout(async () => {
            try {
              const finalResponse = await http.get('/api/etl/ventas/logs');
              setLogs(finalResponse.data.logs || []);
            } catch (error) {
              console.error('Error fetching final logs:', error);
            }
          }, 1000);

          setIsRunning(false);
          loadGaps(); // Reload gaps after completion
        }
      } catch (error) {
        console.error('Error polling logs:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getStatusBadge = (tienda: GapInfo) => {
    if (tienda.dias_atrasados > 7) return 'bg-red-100 text-red-800';
    if (tienda.dias_atrasados > 3) return 'bg-yellow-100 text-yellow-800';
    if (tienda.dias_atrasados > 1) return 'bg-orange-100 text-orange-800';
    return 'bg-green-100 text-green-800';
  };

  const fillGapForTienda = (tienda: GapInfo) => {
    setSelectedTienda(tienda.ubicacion_id);
    setFechaInicio(tienda.fecha_mas_reciente);
    setFechaFin(new Date().toISOString().split('T')[0]);
  };

  const fillHistoricoForTienda = (tienda: GapInfo) => {
    setSelectedTienda(tienda.ubicacion_id);
    setFechaInicio('2024-09-01'); // Mínimo: septiembre 2024
    setFechaFin(tienda.fecha_mas_reciente);
  };

  return (
    <div>
      {/* Header with Refresh Button */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Sincronización de ventas históricas con análisis de gaps y control de fechas</p>
          </div>

          <button
            onClick={loadGaps}
            disabled={loadingGaps}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 flex items-center space-x-2"
          >
            <svg className={`h-4 w-4 ${loadingGaps ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">

        {/* ETL Automático Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">ETL Automático</h3>
                <p className="text-sm text-gray-600">Sincronización diaria automática con reintentos</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={toggleScheduler}
                disabled={loadingScheduler || schedulerStatus?.is_running}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  schedulerStatus?.enabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                {schedulerStatus?.enabled ? '✓ Habilitado' : '○ Deshabilitado'}
              </button>

              <button
                onClick={() => setShowSchedulerCustomDates(!showSchedulerCustomDates)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center space-x-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Configurar Fechas</span>
              </button>
            </div>
          </div>

          {schedulerStatus && (
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-500 mb-1">Próxima Ejecución</div>
                <div className="text-sm font-semibold text-gray-900">
                  {schedulerStatus.next_execution
                    ? new Date(schedulerStatus.next_execution).toLocaleString('es-VE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'N/A'}
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-500 mb-1">Última Ejecución</div>
                <div className="text-sm font-semibold text-gray-900">
                  {schedulerStatus.last_execution
                    ? new Date(schedulerStatus.last_execution).toLocaleString('es-VE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Nunca'}
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-500 mb-1">Reintentos Pendientes</div>
                <div className="text-sm font-semibold text-gray-900">
                  {schedulerStatus.retry_config.pending_retries.length} tiendas
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="text-xs text-gray-500 mb-1">Estado</div>
                <div className={`text-sm font-semibold ${schedulerStatus.is_running ? 'text-green-600' : 'text-gray-500'}`}>
                  {schedulerStatus.is_running ? '🟢 Ejecutando' : '○ Inactivo'}
                </div>
              </div>
            </div>
          )}

          {/* Custom Date Selection for Scheduler */}
          {showSchedulerCustomDates && (
            <div className="bg-white rounded-lg p-4 border border-blue-200 mb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Ejecutar ETL Automático con Fechas Personalizadas</h4>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={schedulerFechaInicio}
                    onChange={(e) => setSchedulerFechaInicio(e.target.value)}
                    disabled={schedulerStatus?.is_running}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={schedulerFechaFin}
                    onChange={(e) => setSchedulerFechaFin(e.target.value)}
                    disabled={schedulerStatus?.is_running}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={triggerSchedulerNow}
                    disabled={loadingScheduler || schedulerStatus?.is_running || !schedulerStatus?.enabled || !schedulerFechaInicio || !schedulerFechaFin}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Ejecutar Todas las Tiendas</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                💡 Esto ejecutará el ETL para TODAS las tiendas ({gaps?.total_tiendas || 16}) en el rango seleccionado.
                Puede tomar varios minutos dependiendo del período.
              </div>
            </div>
          )}

          {/* Daily Summary */}
          {schedulerStatus?.daily_summary?.total_tiendas && schedulerStatus.daily_summary.total_tiendas > 0 && (
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Último Resumen - {schedulerStatus.daily_summary.fecha_procesada}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{schedulerStatus.daily_summary.total_tiendas}</div>
                  <div className="text-xs text-gray-500">Total Procesadas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{schedulerStatus.daily_summary.exitosas}</div>
                  <div className="text-xs text-gray-500">Exitosas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{schedulerStatus.daily_summary.fallidas}</div>
                  <div className="text-xs text-gray-500">Fallidas</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual ETL Section */}
        <div className="border-t-2 border-gray-200 pt-6">
          <div className="flex items-center space-x-3 mb-4">
            <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">ETL Manual</h3>
              <p className="text-sm text-gray-600">Sincronización bajo demanda para períodos específicos</p>
            </div>
          </div>

          {/* Stats Summary */}
          {gaps && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">{gaps.total_tiendas}</div>
                <div className="text-sm text-blue-700">Total Tiendas</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">{gaps.tiendas_desactualizadas}</div>
                <div className="text-sm text-orange-700">Desactualizadas</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-600">{gaps.tiendas_con_gaps}</div>
                <div className="text-sm text-yellow-700">Con Gaps Históricos</div>
              </div>
            </div>
          )}

          {/* Gaps Table */}
          {gaps && (
            <div className="overflow-x-auto mb-6">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registros</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Más Antigua</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Última Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Días Atrás</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completitud</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {gaps.tiendas.map((tienda) => (
                    <tr key={tienda.ubicacion_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{tienda.ubicacion_nombre}</div>
                        <div className="text-xs text-gray-500">{tienda.ubicacion_id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {tienda.total_registros.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tienda.fecha_mas_antigua}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tienda.fecha_mas_reciente}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(tienda)}`}>
                          {tienda.dias_atrasados} días
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${tienda.completitud_porcentaje >= 95 ? 'bg-green-500' : 'bg-yellow-500'}`}
                              style={{ width: `${tienda.completitud_porcentaje}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-600">{tienda.completitud_porcentaje}%</span>
                        </div>
                        {tienda.dias_faltantes > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            {tienda.dias_faltantes} días faltantes
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm space-x-2">
                        {tienda.necesita_actualizacion && (
                          <button
                            onClick={() => fillGapForTienda(tienda)}
                            className="text-indigo-600 hover:text-indigo-900 text-xs"
                          >
                            Actualizar
                          </button>
                        )}
                        {tienda.tiene_gaps_historicos && (
                          <button
                            onClick={() => fillHistoricoForTienda(tienda)}
                            className="text-purple-600 hover:text-purple-900 text-xs"
                          >
                            Recuperar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Manual ETL Form */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Ejecución Manual</h3>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tienda
                </label>
                <select
                  value={selectedTienda}
                  onChange={(e) => setSelectedTienda(e.target.value)}
                  disabled={isRunning}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:opacity-50"
                >
                  <option value="">Seleccionar...</option>
                  {gaps?.tiendas.map(t => (
                    <option key={t.ubicacion_id} value={t.ubicacion_id}>
                      {t.ubicacion_nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  disabled={isRunning}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha Fin
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  disabled={isRunning}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:opacity-50"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={startETL}
                  disabled={isRunning || !selectedTienda || !fechaInicio || !fechaFin}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isRunning ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Ejecutando...</span>
                    </>
                  ) : (
                    <span>Ejecutar ETL</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Log Viewer with same style as Inventario */}
          {logs.length > 0 && (
            <LogViewer
              logs={logs}
              isRunning={isRunning}
              onClear={clearLogs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
