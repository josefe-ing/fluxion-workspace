interface UbicacionResultado {
  id: string;
  nombre: string;
  registros: number;
  productos: number;
  success: boolean;
}

interface SyncResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ubicaciones: UbicacionResultado[];
  totalRegistros: number;
  tiempoEjecucion: number;
  success: boolean;
  errores?: string[];
}

export default function SyncResultsModal({
  isOpen,
  onClose,
  ubicaciones,
  totalRegistros,
  tiempoEjecucion,
  success,
  errores = []
}: SyncResultsModalProps) {
  if (!isOpen) return null;

  const exitosas = ubicaciones.filter(u => u.success);
  const fallidas = ubicaciones.filter(u => !u.success);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          {/* Header */}
          <div className={`px-6 py-4 ${success ? 'bg-green-50' : 'bg-red-50'} border-b ${success ? 'border-green-200' : 'border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {success ? (
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <div>
                  <h3 className={`text-lg font-semibold ${success ? 'text-green-900' : 'text-red-900'}`}>
                    {success ? 'Sincronización Completada' : 'Sincronización Fallida'}
                  </h3>
                  <p className={`text-sm ${success ? 'text-green-700' : 'text-red-700'}`}>
                    {success
                      ? `${exitosas.length} ubicaciones sincronizadas en ${Math.round(tiempoEjecucion)}s`
                      : 'Ocurrieron errores durante la sincronización'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            {/* Summary stats */}
            {success && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm font-medium text-blue-600">Ubicaciones</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-900">{exitosas.length}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm font-medium text-green-600">Total Registros</p>
                  <p className="mt-1 text-2xl font-semibold text-green-900">{totalRegistros.toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <p className="text-sm font-medium text-purple-600">Tiempo</p>
                  <p className="mt-1 text-2xl font-semibold text-purple-900">{Math.round(tiempoEjecucion)}s</p>
                </div>
              </div>
            )}

            {/* Ubicaciones exitosas */}
            {exitosas.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Ubicaciones Sincronizadas ({exitosas.length})
                </h4>
                <div className="space-y-2">
                  {exitosas.map((ubicacion) => (
                    <div
                      key={ubicacion.id}
                      className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 bg-green-500 rounded-full flex items-center justify-center">
                            <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ubicacion.nombre}</p>
                          <p className="text-xs text-gray-500">{ubicacion.id}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-700">{ubicacion.registros.toLocaleString()} registros</p>
                        <p className="text-xs text-green-600">{ubicacion.productos.toLocaleString()} productos</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ubicaciones fallidas */}
            {fallidas.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  Ubicaciones con Errores ({fallidas.length})
                </h4>
                <div className="space-y-2">
                  {fallidas.map((ubicacion) => (
                    <div
                      key={ubicacion.id}
                      className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 bg-red-500 rounded-full flex items-center justify-center">
                            <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ubicacion.nombre}</p>
                          <p className="text-xs text-gray-500">{ubicacion.id}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errores generales */}
            {errores.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-800 mb-2">Errores:</h4>
                <div className="space-y-1">
                  {errores.map((error, index) => (
                    <p key={index} className="text-sm text-red-700 font-mono">{error}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
