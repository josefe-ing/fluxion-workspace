import { useState, useEffect } from 'react';
import http from '../../services/http';

interface LogEntry {
  timestamp: string;
  level: string;
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

export default function VentasETLPanel() {
  const [gaps, setGaps] = useState<GapsResponse | null>(null);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [selectedTienda, setSelectedTienda] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Load gaps on mount
  useEffect(() => {
    loadGaps();
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">ETL Ventas</h2>
              <p className="text-sm text-gray-600">Sincronización de ventas con control de fechas</p>
            </div>
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

        {/* Stats Summary */}
        {gaps && (
          <div className="grid grid-cols-3 gap-4">
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
          <div className="overflow-x-auto">
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
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
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

        {/* Log Viewer */}
        {logs.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                <span className="text-sm font-medium text-white">
                  {isRunning ? 'Running' : 'Idle'} - {logs.length} logs
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
              {logs.map((log, index) => (
                <div key={index} className={`flex items-start space-x-3 p-2 rounded ${
                  log.level === 'error' ? 'bg-red-900/30' :
                  log.level === 'success' ? 'bg-green-900/30' :
                  'bg-gray-800/50'
                }`}>
                  <span className="text-gray-500">{log.timestamp.split('T')[1]?.substring(0, 8) || ''}</span>
                  <span className={
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'success' ? 'text-green-400' :
                    'text-blue-400'
                  }>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
