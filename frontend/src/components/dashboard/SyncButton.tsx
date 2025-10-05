import { useState, useEffect, useRef } from 'react';
import http from '../../services/http';
import SyncResultsModal from './SyncResultsModal';
import ConnectivityCheckModal from './ConnectivityCheckModal';

interface SyncButtonProps {
  ubicacionId?: string;  // Si no se especifica, sincroniza todas
  onSyncComplete?: () => void;
}

interface UbicacionResultado {
  id: string;
  nombre: string;
  registros: number;
  productos: number;
  success: boolean;
}

interface TiendaStatus {
  id: string;
  nombre: string;
  ip: string;
  puerto: string;
  conectado: boolean;
  ip_alcanzable: boolean;
  tiempo_ms: number;
}

export default function SyncButton({ ubicacionId, onSyncComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Results modal state
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{
    ubicaciones: UbicacionResultado[];
    totalRegistros: number;
    tiempoEjecucion: number;
    success: boolean;
    errores: string[];
  } | null>(null);

  // Connectivity check modal state
  const [showConnectivityModal, setShowConnectivityModal] = useState(false);
  const [checkingConnectivity, setCheckingConnectivity] = useState(false);
  const [connectivityData, setConnectivityData] = useState<{
    tiendas: TiendaStatus[];
    resumen: { total: number; conectadas: number; porcentaje: number };
  } | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const pollStatus = async () => {
    try {
      const response = await http.get('/api/etl/status');
      const status = response.data;

      // Log detallado en consola para debugging
      console.log('📊 ETL Status:', {
        running: status.running,
        progress: status.progress,
        message: status.message,
        hasResult: !!status.result
      });

      // Actualizar mensaje y progreso
      const progressValue = status.progress || (status.running ? 50 : 0);
      setMessage({ type: 'info', text: status.message || 'Sincronizando...' });
      setProgress(progressValue);

      // Si terminó, procesar resultado
      if (!status.running && status.result) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        setSyncing(false);
        setProgress(100);

        // Preparar datos para el modal
        const { ubicaciones_detalle, total_registros, tiempo_ejecucion, errores } = status.result;

        console.log('✅ ETL Completado:', {
          ubicaciones: ubicaciones_detalle,
          totalRegistros: total_registros,
          tiempo: tiempo_ejecucion,
          errores
        });

        setModalData({
          ubicaciones: ubicaciones_detalle || [],
          totalRegistros: total_registros || 0,
          tiempoEjecucion: tiempo_ejecucion || 0,
          success: status.result.success,
          errores: errores || []
        });

        // Mostrar modal
        console.log('🔔 Abriendo modal de resultados...');
        setShowModal(true);

        // Mensaje de resumen rápido
        if (status.result.success) {
          const { ubicaciones_procesadas, total_registros, tiempo_ejecucion } = status.result;
          setMessage({
            type: 'success',
            text: `✅ Completado: ${ubicaciones_procesadas.length} ubicaciones, ${total_registros.toLocaleString()} registros (${Math.round(tiempo_ejecucion)}s)`
          });

          // Recargar datos después de 2 segundos
          setTimeout(() => {
            if (onSyncComplete) onSyncComplete();
          }, 2000);
        } else {
          setMessage({
            type: 'error',
            text: `❌ ${status.result.message}`
          });
        }

        // Limpiar mensaje después de 10 segundos
        setTimeout(() => setMessage(null), 10000);
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  };

  const checkConnectivity = async () => {
    try {
      setCheckingConnectivity(true);
      const response = await http.get('/api/etl/check-connectivity');

      if (response.data.success) {
        setConnectivityData({
          tiendas: response.data.tiendas,
          resumen: response.data.resumen
        });
        setShowConnectivityModal(true);
      } else {
        setMessage({
          type: 'error',
          text: `❌ Error verificando conectividad: ${response.data.error}`
        });
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (error: any) {
      console.error('Error verificando conectividad:', error);
      setMessage({
        type: 'error',
        text: `❌ Error: ${error.response?.data?.detail || 'No se pudo verificar conectividad'}`
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setCheckingConnectivity(false);
    }
  };

  const startSync = async () => {
    try {
      console.log('🔄 startSync: Iniciando sincronización...');
      setSyncing(true);
      setProgress(10);
      setMessage({ type: 'info', text: ubicacionId ? `Iniciando ${ubicacionId}...` : 'Iniciando sincronización...' });

      const body = ubicacionId ? { ubicacion_id: ubicacionId } : {};
      console.log('📤 Enviando petición POST /api/etl/sync:', body);

      // Iniciar ETL en background
      const response = await http.post('/api/etl/sync', body);
      console.log('✅ Respuesta del servidor:', response.data);

      // Comenzar polling cada 2 segundos
      console.log('⏰ Iniciando polling cada 2 segundos...');
      pollIntervalRef.current = setInterval(pollStatus, 2000);

    } catch (error: any) {
      console.error('❌ Error sincronizando:', error);
      setSyncing(false);
      setMessage({
        type: 'error',
        text: `❌ Error: ${error.response?.data?.detail || 'No se pudo conectar con el servidor'}`
      });
      setTimeout(() => setMessage(null), 10000);
    }
  };

  const handleSync = async () => {
    // TEMPORALMENTE: Sincronizar directo sin verificación de conectividad
    // TODO: Re-habilitar cuando el script de conectividad sea más rápido
    console.log('🚀 Iniciando sincronización...');
    startSync();

    // Versión original con verificación (comentada temporalmente):
    // if (ubicacionId) {
    //   startSync();
    // } else {
    //   await checkConnectivity();
    // }
  };

  const handleContinueAfterCheck = () => {
    setShowConnectivityModal(false);
    startSync();
  };

  return (
    <>
      <div className="space-y-3">
        <button
          onClick={handleSync}
          disabled={syncing || checkingConnectivity}
          className={`flex items-center px-4 py-2 rounded-md font-medium transition-colors ${
            syncing || checkingConnectivity
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {checkingConnectivity ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Verificando...
            </>
          ) : syncing ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sincronizando...
            </>
          ) : (
            <>
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {ubicacionId ? 'Sincronizar Tienda' : 'Sincronizar Todas'}
            </>
          )}
        </button>

        {/* Progress bar */}
        {syncing && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        {/* Message notification */}
        {message && (
          <div className={`p-3 rounded-md text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            <div className="flex items-start">
              {message.type === 'success' && (
                <svg className="h-5 w-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {message.type === 'error' && (
                <svg className="h-5 w-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              {message.type === 'info' && syncing && (
                <svg className="animate-spin h-5 w-5 mr-2 flex-shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <div className="flex-1">
                <p>{message.text}</p>
                {syncing && (
                  <p className="text-xs mt-1 opacity-75">El proceso puede tardar varios minutos dependiendo del número de tiendas...</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de verificación de conectividad */}
      {connectivityData && (
        <ConnectivityCheckModal
          isOpen={showConnectivityModal}
          onClose={() => setShowConnectivityModal(false)}
          onContinue={handleContinueAfterCheck}
          tiendas={connectivityData.tiendas}
          resumen={connectivityData.resumen}
        />
      )}

      {/* Modal de resultados */}
      {(() => {
        console.log('🎬 Render modal:', { showModal, hasModalData: !!modalData, modalData });
        return modalData && (
          <SyncResultsModal
            isOpen={showModal}
            onClose={() => {
              console.log('🚪 Cerrando modal');
              setShowModal(false);
            }}
            ubicaciones={modalData.ubicaciones}
            totalRegistros={modalData.totalRegistros}
            tiempoEjecucion={modalData.tiempoEjecucion}
            success={modalData.success}
            errores={modalData.errores}
          />
        );
      })()}
    </>
  );
}
