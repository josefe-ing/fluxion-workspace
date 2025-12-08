import { useState, useEffect } from 'react';
import http from '../../services/http';
import LogViewer from './LogViewer';
// DISABLED: ETL tracking endpoints not implemented in backend
// import KLKRealTimeExecutions from './KLKRealTimeExecutions';
// import KLKGapRecoveryPanel from './KLKGapRecoveryPanel';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface Ubicacion {
  id: string;
  nombre: string;
  tipo: string;
  sistema_pos?: string;
}

export default function InventarioETLPanel() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>('ALL');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [totalRegistros, setTotalRegistros] = useState<number>(0);

  // Load ubicaciones on mount
  useEffect(() => {
    loadUbicaciones();
  }, []);

  // Poll for logs while running
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const response = await http.get('/api/etl/logs');
        setLogs(response.data.logs || []);

        if (response.data.status === 'completed') {
          // Do one final poll after a short delay to capture final logs
          setTimeout(async () => {
            try {
              const finalResponse = await http.get('/api/etl/logs');
              setLogs(finalResponse.data.logs || []);
            } catch (error) {
              console.error('Error fetching final logs:', error);
            }
          }, 1000);

          setIsRunning(false);
          setLastSync(new Date().toISOString());

          // Get final record count
          if (response.data.result) {
            setTotalRegistros(prev => prev + (response.data.result.total_registros || 0));
          }
        }
      } catch (error) {
        console.error('Error polling logs:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const loadUbicaciones = async () => {
    try {
      const response = await http.get('/api/ubicaciones');
      setUbicaciones(response.data);
    } catch (error) {
      console.error('Error loading ubicaciones:', error);
    }
  };

  const startETL = async () => {
    if (isRunning) {
      alert('Ya hay una sincronización en ejecución. Por favor espera a que termine.');
      return;
    }

    setIsRunning(true);
    setLogs([]);

    try {
      const payload = selectedUbicacion === 'ALL' ? {} : { ubicacion_id: selectedUbicacion };

      const response = await http.post('/api/etl/sync', payload);

      // Add initial log
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'info',
        message: response.data.message
      }]);

    } catch (error: any) {
      setIsRunning(false);
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'error',
        message: error.response?.data?.detail || error.message || 'Error iniciando ETL'
      }]);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // Group ubicaciones by type
  const tiendas = ubicaciones.filter(u => u.tipo === 'tienda');
  const cedis = ubicaciones.filter(u => u.tipo === 'cedi');

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Sincronización de inventario en tiempo real desde todas las ubicaciones</p>
          </div>

          {lastSync && (
            <div className="text-sm text-gray-500">
              Última sincronización: {new Date(lastSync).toLocaleString('es-VE', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">
        {/* Controls */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Ejecución Manual</h3>

          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <label htmlFor="ubicacion-select" className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar ubicación
              </label>
              <select
                id="ubicacion-select"
                value={selectedUbicacion}
                onChange={(e) => setSelectedUbicacion(e.target.value)}
                disabled={isRunning}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="ALL">✨ Todas las ubicaciones ({tiendas.length} tiendas + {cedis.length} CEDIs)</option>

                {cedis.length > 0 && (
                  <optgroup label="CEDIs">
                    {cedis.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.id} - {u.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}

                {tiendas.length > 0 && (
                  <optgroup label="Tiendas">
                    {tiendas.map(u => {
                      const sistemaPOS = u.sistema_pos?.toUpperCase() || 'STELLAR';
                      const badge = sistemaPOS === 'KLK' ? '🔵 KLK' : '⚪ Stellar';
                      return (
                        <option key={u.id} value={u.id}>
                          {badge} | {u.id} - {u.nombre}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>

            <button
              onClick={startETL}
              disabled={isRunning}
              className="inline-flex items-center px-6 py-2 border border-transparent text-base font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Ejecutando...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Ejecutar ETL
                </>
              )}
            </button>
          </div>

          {/* Summary Stats */}
          {totalRegistros > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Total registros sincronizados hoy: <span className="font-semibold text-gray-900">{totalRegistros.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Log Viewer */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Log Viewer - Tiempo Real</h3>
          <LogViewer
            logs={logs}
            isRunning={isRunning}
            onClear={clearLogs}
          />
        </div>

        {/* KLK Monitoring Sections */}
        <div className="border-t-4 border-purple-200 pt-8 mt-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Sistema de Tracking KLK</h2>
              <p className="text-sm text-gray-600">Monitoreo en tiempo real de ejecuciones y recuperación de gaps</p>
            </div>
          </div>

          {/* Real-Time Executions - DISABLED: /api/etl/tracking/* endpoints not implemented */}
          {/*
          <div className="mb-6">
            <KLKRealTimeExecutions
              etl_tipo="inventario"
              autoRefresh={true}
              refreshInterval={30}
            />
          </div>
          */}

          {/* Gap Recovery - DISABLED: /api/etl/tracking/* endpoints not implemented */}
          {/*
          <div className="mb-6">
            <KLKGapRecoveryPanel
              etl_tipo="inventario"
              autoRefresh={true}
              refreshInterval={60}
            />
          </div>
          */}
        </div>
      </div>
    </div>
  );
}
