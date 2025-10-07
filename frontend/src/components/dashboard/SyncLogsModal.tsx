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

export default function SyncLogsModal({ isOpen, onClose, ubicacionId }: SyncLogsModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
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
        const response = await fetch('http://localhost:8001/api/etl/logs');
        const data = await response.json();

        if (data.logs && data.logs.length > 0) {
          setLogs(prevLogs => {
            // Solo agregar logs nuevos
            const existingMessages = new Set(prevLogs.map(l => l.message));
            const newLogs = data.logs.filter((log: LogEntry) => !existingMessages.has(log.message));
            return [...prevLogs, ...newLogs];
          });
        }

        if (data.progress !== undefined) {
          setProgress(data.progress);
        }

        if (data.status === 'completed' || data.status === 'failed') {
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
      startSync();
    }
  }, [isOpen]);

  const startSync = async () => {
    try {
      setIsRunning(true);
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'info',
        message: ubicacionId ? `Iniciando sincronización de ${ubicacionId}...` : 'Iniciando sincronización de todas las tiendas...'
      }]);
      setProgress(0);

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
