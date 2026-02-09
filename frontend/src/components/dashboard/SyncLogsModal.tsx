import { useEffect, useRef, useState } from 'react';

interface SyncLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ubicacionId?: string;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'warning' | 'success';
  message: string;
}

interface TiendaStatus {
  id: string;
  nombre?: string;
  status: 'pending' | 'testing' | 'processing' | 'completed' | 'error' | 'skipped';
  success?: boolean;
  registros?: number;
  error_message?: string;
  last_update?: string;
}

export default function SyncLogsModal({ isOpen, onClose, ubicacionId }: SyncLogsModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tiendasStatus, setTiendasStatus] = useState<TiendaStatus[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Poll for logs and status
  useEffect(() => {
    if (!isOpen || !isRunning) return;

    const pollLogs = async () => {
      try {
        // Poll para status y logs
        const [logsResponse, statusResponse] = await Promise.all([
          fetch('http://localhost:8001/api/etl/logs'),
          fetch('http://localhost:8001/api/etl/status')
        ]);

        const logsData = await logsResponse.json();
        const statusData = await statusResponse.json();

        if (logsData.logs && logsData.logs.length > 0) {
          setLogs(prevLogs => {
            // Solo agregar logs nuevos
            const existingMessages = new Set(prevLogs.map(l => l.message));
            const newLogs = logsData.logs.filter((log: LogEntry) => !existingMessages.has(log.message));
            return [...prevLogs, ...newLogs];
          });
        }

        if (logsData.progress !== undefined) {
          setProgress(logsData.progress);
        }

        // Actualizar status de tiendas si está disponible
        if (statusData.tiendas_status && statusData.tiendas_status.length > 0) {
          setTiendasStatus(statusData.tiendas_status);
        }

        if (logsData.status === 'completed' || logsData.status === 'failed') {
          setIsRunning(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('Error polling logs:', error);
      }
    };

    // Poll every 1 second
    pollIntervalRef.current = setInterval(pollLogs, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen, isRunning]);

  // Start sync when modal opens
  useEffect(() => {
    if (isOpen) {
      // Limpiar estado al abrir el modal
      setLogs([]);
      setTiendasStatus([]);
      setProgress(0);

      // Iniciar sincronización
      startSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const startSync = async () => {
    try {
      // Primero verificar si ya hay un ETL corriendo
      const statusCheckResponse = await fetch('http://localhost:8001/api/etl/status');
      const statusCheck = await statusCheckResponse.json();

      if (statusCheck.running) {
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `❌ Ya hay una sincronización en curso. Por favor espera a que termine.`
        }, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `ℹ️ Sincronización actual: ${statusCheck.message || 'En progreso'}`
        }]);
        setIsRunning(false);
        return;
      }

      setIsRunning(true);
      setProgress(0);

      // Fase 1: Test de conexiones
      if (!ubicacionId) {
        // Sincronización de TODAS las tiendas
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: '🔍 Fase 1: Verificando conectividad de tiendas...'
        }]);

        try {
          const testResponse = await fetch('http://localhost:8001/api/etl/test-connection-generic');
          const testData = await testResponse.json();

          if (testData.success) {
            const exitosas = testData.tiendas.filter((t: { success: boolean }) => t.success);
            const fallidas = testData.tiendas.filter((t: { success: boolean }) => !t.success);

            setLogs(prev => [...prev, {
              timestamp: new Date().toISOString(),
              level: 'success',
              message: `✅ Test completado: ${exitosas.length}/${testData.tiendas.length} tiendas disponibles`
            }]);

            // Inicializar status de tiendas
            const initialStatus: TiendaStatus[] = testData.tiendas.map((t: { tienda?: string; success: boolean }) => ({
              id: t.tienda || 'unknown',
              nombre: t.tienda || 'Desconocida',
              status: t.success ? 'pending' : 'skipped',
              success: t.success
            }));
            setTiendasStatus(initialStatus);

            if (fallidas.length > 0) {
              setLogs(prev => [...prev, {
                timestamp: new Date().toISOString(),
                level: 'warning',
                message: `⚠️ ${fallidas.length} tienda(s) sin conectividad (serán omitidas)`
              }]);

              fallidas.forEach((t: { tienda?: string; message?: string }) => {
                setLogs(prev => [...prev, {
                  timestamp: new Date().toISOString(),
                  level: 'warning',
                  message: `  • ${t.tienda}: ${t.message || 'Sin acceso'}`
                }]);
              });
            }
          } else {
            setLogs(prev => [...prev, {
              timestamp: new Date().toISOString(),
              level: 'warning',
              message: '⚠️ No se pudo ejecutar test de conectividad. Continuando...'
            }]);
          }
        } catch {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'warning',
            message: '⚠️ Error en test de conectividad. Continuando con sincronización...'
          }]);
        }

        setProgress(25);
      } else {
        // Sincronización de UNA sola tienda
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `🔍 Verificando conectividad de ${ubicacionId}...`
        }]);

        try {
          // Usar el test simple de conectividad (ping de red)
          const testResponse = await fetch('http://localhost:8001/api/etl/check-connectivity');
          const testData = await testResponse.json();

          if (testData.success && testData.tiendas) {
            const tiendaTest = testData.tiendas.find((t: { id: string }) => t.id === ubicacionId);

            if (tiendaTest) {
              if (tiendaTest.conectado) {
                setLogs(prev => [...prev, {
                  timestamp: new Date().toISOString(),
                  level: 'success',
                  message: `✅ ${ubicacionId} disponible (${tiendaTest.tiempo_ms.toFixed(0)}ms)`
                }]);

                // Inicializar status de esta tienda
                setTiendasStatus([{
                  id: ubicacionId,
                  nombre: tiendaTest.nombre,
                  status: 'pending',
                  success: true
                }]);
              } else {
                setLogs(prev => [...prev, {
                  timestamp: new Date().toISOString(),
                  level: 'warning',
                  message: `⚠️ ${ubicacionId} no respondió al test de conectividad. Intentando sincronización de todas formas...`
                }]);
                // Inicializar status de esta tienda aunque el test haya fallado
                setTiendasStatus([{
                  id: ubicacionId,
                  nombre: ubicacionId,
                  status: 'pending',
                  success: false
                }]);
              }
            } else {
              setLogs(prev => [...prev, {
                timestamp: new Date().toISOString(),
                level: 'warning',
                message: `⚠️ No se pudo verificar conectividad de ${ubicacionId}. Continuando...`
              }]);
            }
          } else {
            setLogs(prev => [...prev, {
              timestamp: new Date().toISOString(),
              level: 'warning',
              message: '⚠️ Test de conectividad no disponible. Continuando...'
            }]);
          }
        } catch {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'warning',
            message: '⚠️ Error verificando conectividad. Continuando...'
          }]);
        }

        setProgress(25);
      }

      // Fase 2: Iniciar sincronización
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: ubicacionId ? `🔄 Sincronizando ${ubicacionId}...` : '🔄 Fase 2: Iniciando sincronización de tiendas disponibles...'
      }]);

      const body = ubicacionId ? { ubicacion_id: ubicacionId } : {};
      const response = await fetch('http://localhost:8001/api/etl/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // If JSON parsing fails, use status text
        }

        // Handle specific status codes
        if (response.status === 409) {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'warning',
            message: '⚠️ Ya hay una sincronización en curso. Por favor espera a que termine.'
          }]);
        } else if (response.status === 503 || response.status === 502) {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `❌ Error del servidor: ${errorMessage}`
          }, {
            timestamp: new Date().toISOString(),
            level: 'warning',
            message: '💡 Sugerencia: Verifica que el backend esté ejecutándose correctamente'
          }]);
        } else {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `❌ Error al iniciar sincronización: ${errorMessage}`
          }]);
        }

        setIsRunning(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'success',
          message: data.message || 'ETL iniciado correctamente'
        }]);
      } else {
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: data.message || 'Error al iniciar ETL'
        }]);
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error starting sync:', error);

      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

      // Add main error log
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `❌ Error de conexión: ${errorMessage}`
      }]);

      // Check if it's a network/connection error and suggest VPN
      if (errorMessage.toLowerCase().includes('fetch') ||
          errorMessage.toLowerCase().includes('network') ||
          errorMessage.toLowerCase().includes('connect') ||
          errorMessage.toLowerCase().includes('timeout')) {
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'warning',
          message: '💡 Sugerencia: Verifica que estés conectado a la VPN para acceder a las tiendas'
        }, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'ℹ️ También verifica que el backend esté ejecutándose en http://localhost:8001'
        }]);
      }

      setIsRunning(false);
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'success':
        return 'text-green-600';
      default:
        return 'text-gray-700';
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={!isRunning ? onClose : undefined}></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`${isRunning ? 'animate-spin' : ''}`}>
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white" id="modal-title">
                    {ubicacionId ? `Sincronizando ${ubicacionId}` : 'Sincronización de Inventario'}
                  </h3>
                  <p className="text-sm text-blue-100">
                    {isRunning ? 'En progreso...' : 'Completado'}
                  </p>
                </div>
              </div>
              {!isRunning && (
                <button
                  onClick={onClose}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Progress bar */}
            {isRunning && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm text-blue-100 mb-1">
                  <span>Progreso</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-blue-900 bg-opacity-50 rounded-full h-2">
                  <div
                    className="bg-white h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Tiendas Status */}
          {tiendasStatus.length > 0 && (
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                {ubicacionId ? 'Estado de Sincronización' : 'Estado de Tiendas'}
              </h4>
              <div className={`grid gap-2 max-h-40 overflow-y-auto ${
                ubicacionId ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
              }`}>
                {tiendasStatus.map((tienda) => (
                  <div
                    key={tienda.id}
                    className={`flex items-center space-x-2 p-2 rounded text-xs ${
                      tienda.status === 'completed' ? 'bg-green-100 text-green-800' :
                      tienda.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                      tienda.status === 'error' ? 'bg-red-100 text-red-800' :
                      tienda.status === 'skipped' ? 'bg-gray-100 text-gray-500' :
                      'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    <span>
                      {tienda.status === 'completed' ? '✅' :
                       tienda.status === 'processing' ? '🔄' :
                       tienda.status === 'error' ? '❌' :
                       tienda.status === 'skipped' ? '⏭️' :
                       '⏳'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{tienda.nombre || tienda.id}</span>
                      {tienda.registros && (
                        <span className="text-xs text-gray-600">
                          {tienda.registros.toLocaleString()} registros
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs container */}
          <div className="bg-gray-50 px-6 py-4">
            <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Esperando logs...
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <div key={index} className={`flex items-start space-x-2 ${getLogColor(log.level)}`}>
                      <span className="flex-shrink-0">{getLogIcon(log.level)}</span>
                      <span className="text-gray-400 flex-shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString('es-VE')}
                      </span>
                      <span className="text-gray-200 flex-1">{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-100 px-6 py-4 flex justify-end space-x-3">
            {isRunning ? (
              <div className="flex items-center text-blue-600">
                <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sincronizando...
              </div>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
