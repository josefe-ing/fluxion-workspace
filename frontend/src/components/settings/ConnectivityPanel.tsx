import { useState } from 'react';
import http from '../../services/http';

interface ConnectivityResult {
  ubicacion_id: string;
  nombre: string;
  accesible: boolean;
  tiempo_respuesta?: number;
  error?: string;
}

export default function ConnectivityPanel() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<ConnectivityResult[]>([]);
  const [lastTest, setLastTest] = useState<Date | null>(null);

  const testConnectivity = async () => {
    setTesting(true);
    setResults([]);

    try {
      const response = await http.get('/api/etl/check-connectivity');
      setResults(response.data.tiendas || []);
      setLastTest(new Date());
    } catch (error) {
      console.error('Error testing connectivity:', error);
    } finally {
      setTesting(false);
    }
  };

  const successCount = results.filter(r => r.accesible).length;
  const totalCount = results.length;
  const successRate = totalCount > 0 ? (successCount / totalCount * 100).toFixed(1) : '0';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Conectividad</h2>
              <p className="text-sm text-gray-600">VPN y acceso a tiendas</p>
            </div>
          </div>

          <button
            onClick={testConnectivity}
            disabled={testing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Testeando...
              </>
            ) : (
              <>
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Test Todas las Tiendas
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {results.length === 0 && !testing && (
          <div className="text-center py-12 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="mt-2">Haz click en "Test Todas las Tiendas" para verificar conectividad</p>
          </div>
        )}

        {testing && (
          <div className="text-center py-12">
            <svg className="animate-spin h-12 w-12 mx-auto text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="mt-4 text-gray-600">Testeando conectividad a todas las tiendas...</p>
          </div>
        )}

        {results.length > 0 && !testing && (
          <>
            {/* Summary */}
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600">Total Tiendas</div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">{totalCount}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm font-medium text-green-600">Accesibles</div>
                <div className="mt-1 text-2xl font-semibold text-green-900">{successCount}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-600">Tasa de Éxito</div>
                <div className="mt-1 text-2xl font-semibold text-blue-900">{successRate}%</div>
              </div>
            </div>

            {/* Results Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latencia</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.map((result, index) => (
                      <tr key={`${result.ubicacion_id}-${index}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {result.accesible ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                          {result.ubicacion_id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {result.nombre}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {result.accesible ? (
                            <span className={`font-medium ${result.tiempo_respuesta && result.tiempo_respuesta > 2000 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {result.tiempo_respuesta ? `${(result.tiempo_respuesta / 1000).toFixed(2)}s` : '-'}
                            </span>
                          ) : (
                            <span className="text-red-600 text-xs">{result.error || 'Timeout'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {lastTest && (
              <p className="mt-4 text-xs text-gray-500 text-right">
                Último test: {lastTest.toLocaleString('es-VE', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
