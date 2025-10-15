import { useEffect, useRef, useState } from 'react';

interface SyncVentasModalProps {
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

export default function SyncVentasModal({ isOpen, onClose, ubicacionId }: SyncVentasModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tiendasStatus, setTiendasStatus] = useState<TiendaStatus[]>([]);
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set default dates (last 30 days)
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    setFechaFin(today.toISOString().split('T')[0]);
    setFechaInicio(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

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
        // Poll para status y logs de ventas
        const [logsResponse, statusResponse] = await Promise.all([
          fetch('http://localhost:8001/api/etl/ventas/logs'),
          fetch('http://localhost:8001/api/etl/ventas/status')
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
        console.error('Error polling ventas logs:', error);
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

  const startSync = async () => {
    try {
      // Validar fechas
      if (!fechaInicio || !fechaFin) {
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'error',
          message: '❌ Por favor selecciona un rango de fechas válido'
        }]);
        return;
      }

      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);

      if (inicio > fin) {
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'error',
          message: '❌ La fecha de inicio debe ser anterior a la fecha de fin'
        }]);
        return;
      }

      // Primero verificar si ya hay un ETL de ventas corriendo
      const statusCheckResponse = await fetch('http://localhost:8001/api/etl/ventas/status');
      const statusCheck = await statusCheckResponse.json();

      if (statusCheck.running) {
        setLogs([{
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `❌ Ya hay una sincronización de ventas en curso. Por favor espera a que termine.`
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
      setLogs([]);
      setTiendasStatus([]);

      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `🔄 Iniciando sincronización de ventas...`
      }, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `📅 Período: ${fechaInicio} al ${fechaFin}`
      }]);

      setProgress(25);

      // Iniciar sincronización de ventas
      const body = {
        ubicacion_id: ubicacionId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      };

      const response = await fetch('http://localhost:8001/api/etl/sync/ventas', {
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
            message: '⚠️ Ya hay una sincronización de ventas en curso. Por favor espera a que termine.'
          }]);
        } else if (response.status === 503 || response.status === 502) {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `❌ Error del servidor: ${errorMessage}`
          }, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'ℹ️ El servidor puede estar iniciando. Espera unos segundos y vuelve a intentar.'
          }]);
        } else {
          setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `❌ Error al iniciar sincronización de ventas: ${errorMessage}`
          }]);
        }
        setIsRunning(false);
        return;
      }

      const syncData = await response.json();

      if (syncData.success) {
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `✅ ${syncData.message}`
        }, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `🌍 Entorno: ${syncData.environment}`
        }]);
        setProgress(50);
      } else {
        setLogs(prev => [...prev, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `❌ Error: ${syncData.message}`
        }]);
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error starting ventas sync:', error);
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `❌ Error de conexión: ${error instanceof Error ? error.message : 'Error desconocido'}`
      }]);
      setIsRunning(false);
    }
  };

  const handleClose = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsRunning(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            Sincronización de Ventas
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Date Range Selector */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                disabled={isRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          {!isRunning && (
            <button
              onClick={startSync}
              className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Sincronizar Ventas
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {isRunning && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progreso</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Tiendas Status (if available) */}
        {tiendasStatus.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Estado por Tienda:</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {tiendasStatus.map((tienda) => (
                <div
                  key={tienda.id}
                  className={`p-2 rounded border ${
                    tienda.status === 'completed' && tienda.success
                      ? 'bg-green-50 border-green-200'
                      : tienda.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : tienda.status === 'processing'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="text-xs font-semibold">{tienda.nombre || tienda.id}</div>
                  <div className="text-xs text-gray-600">
                    {tienda.status === 'completed' && tienda.success
                      ? `✅ ${tienda.registros || 0} registros`
                      : tienda.status === 'error'
                      ? '❌ Error'
                      : tienda.status === 'processing'
                      ? '🔄 Procesando...'
                      : '⏳ Pendiente'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logs Container */}
        <div className="flex-1 overflow-auto bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm">
          {logs.length === 0 ? (
            <p className="text-gray-400">Selecciona las fechas y presiona "Sincronizar Ventas" para comenzar...</p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`mb-1 ${
                  log.level === 'error'
                    ? 'text-red-400'
                    : log.level === 'warning'
                    ? 'text-yellow-400'
                    : log.level === 'success'
                    ? 'text-green-400'
                    : 'text-gray-300'
                }`}
              >
                <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                {log.message}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleClose}
            className={`px-4 py-2 rounded ${
              isRunning
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-600 text-white hover:bg-gray-700'
            }`}
            disabled={isRunning}
          >
            {isRunning ? 'Sincronizando...' : 'Cerrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
