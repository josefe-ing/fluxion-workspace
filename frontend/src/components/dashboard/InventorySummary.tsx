import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import { formatInteger } from '../../utils/formatNumber';

interface UbicacionSummary {
  ubicacion_id: string;
  ubicacion_nombre: string;
  tipo_ubicacion: string;
  total_productos: number;
  stock_cero: number;
  stock_negativo: number;
  ultima_actualizacion: string | null;
  // Campos para almacenes KLK (vienen del backend)
  almacen_codigo?: string | null;
  almacen_nombre?: string | null;
}

// Mapping de ubicaciones a nombres amigables
const UBICACION_FRIENDLY_NAMES: Record<string, string> = {
  'tienda_01': 'PERIFERICO',
  'tienda_02': 'AV. BOLIVAR',
  'tienda_03': 'MAÑONGO',
  'tienda_04': 'SAN DIEGO',
  'tienda_05': 'VIVIENDA',
  'tienda_06': 'NAGUANAGUA',
  'tienda_07': 'CENTRO',
  'tienda_08': 'BOSQUE',
  'tienda_09': 'GUACARA',
  'tienda_10': 'FERIAS',
  'tienda_11': 'FLOR AMARILLO',
  'tienda_12': 'PARAPARAL',
  'tienda_13': 'NAGUANAGUA III',
  'tienda_15': 'ISABELICA',
  'tienda_16': 'TOCUYITO',
  'tienda_17': 'ARTIGAS',
  'tienda_18': 'PARAISO',
  'tienda_19': 'GUIGUE',
  'tienda_20': 'TAZAJAL',
  'cedi_seco': 'CEDI SECO',
  'cedi_frio': 'CEDI FRIO',
  'cedi_verde': 'CEDI VERDE',
  'cedi_frutas': 'CEDI FRUTAS',
};

// Función helper para obtener el nombre amigable de la ubicación
const getFriendlyLocationName = (ubicacionId: string, ubicacionNombre: string): string => {
  return UBICACION_FRIENDLY_NAMES[ubicacionId] || ubicacionNombre;
};

export default function InventorySummary() {
  const [summaryData, setSummaryData] = useState<UbicacionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);

      // El backend ahora devuelve los datos ya separados por almacén
      const response = await http.get('/api/ubicaciones/summary');

      console.log('✅ Summary loaded:', response.data?.length, 'ubicaciones/almacenes');

      setSummaryData(response.data || []);
    } catch (error) {
      console.error('❌ Error cargando resumen:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const formatFecha = (fecha: string | null): string => {
    if (!fecha) return 'No disponible';
    const date = new Date(fecha);
    return date.toLocaleString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleUbicacionClick = (ubicacionId: string) => {
    navigate(`/dashboard/${ubicacionId}`);
  };

  // Calcular totales
  const totales = summaryData.reduce((acc, item) => ({
    total_productos: acc.total_productos + item.total_productos,
    stock_cero: acc.stock_cero + item.stock_cero,
    stock_negativo: acc.stock_negativo + item.stock_negativo
  }), { total_productos: 0, stock_cero: 0, stock_negativo: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando resumen...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resumen de Inventarios</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vista general del estado de stock en todas las ubicaciones
        </p>
      </div>

      {/* Métricas Globales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Ubicaciones</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{summaryData.length}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Productos</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{formatInteger(totales.total_productos)}</p>
            </div>
            <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Stock en Cero</p>
              <p className="mt-2 text-3xl font-semibold text-yellow-600">{formatInteger(totales.stock_cero)}</p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Stock Negativo</p>
              <p className="mt-2 text-3xl font-semibold text-red-600">{formatInteger(totales.stock_negativo)}</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Resumen por Ubicación */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Detalle por Ubicación</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ubicación
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Almacén
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Productos
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock en Cero
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Disponibilidad
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock Negativo
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Última Actualización
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {summaryData.map((item) => (
                <tr
                  key={`${item.ubicacion_id}-${item.almacen_codigo || 'default'}`}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => handleUbicacionClick(item.ubicacion_id)}>
                      {getFriendlyLocationName(item.ubicacion_id, item.ubicacion_nombre)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {item.almacen_nombre ? (
                      <div className="flex flex-col items-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          item.almacen_nombre?.includes('PISO')
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {item.almacen_nombre}
                        </span>
                        <span className="text-xs text-gray-400 mt-1">{item.almacen_codigo}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.tipo_ubicacion === 'tienda'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {item.tipo_ubicacion?.toUpperCase() || 'TIENDA'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                    {formatInteger(item.total_productos)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`text-sm font-medium ${item.stock_cero > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {formatInteger(item.stock_cero)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const disponibilidad = item.total_productos > 0
                        ? ((item.total_productos - item.stock_cero) / item.total_productos * 100)
                        : 0;
                      const sinStock = item.total_productos > 0
                        ? (item.stock_cero / item.total_productos * 100)
                        : 0;

                      return (
                        <div className="flex items-center justify-center space-x-3">
                          <div className="flex-1 min-w-[120px]">
                            <div className="relative w-full h-5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300"
                                style={{ width: `${disponibilidad}%` }}
                              ></div>
                              {sinStock > 0 && (
                                <div
                                  className="absolute top-0 right-0 h-full bg-gradient-to-r from-yellow-400 to-yellow-500 transition-all duration-300"
                                  style={{ width: `${sinStock}%` }}
                                ></div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-gray-700 whitespace-nowrap min-w-[45px] text-right">
                            {disponibilidad.toFixed(1)}%
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`text-sm font-medium ${item.stock_negativo > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatInteger(item.stock_negativo)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {formatFecha(item.ultima_actualizacion)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instrucción */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="h-5 w-5 text-blue-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm text-blue-700">
              <strong>Tip:</strong> Haz clic en cualquier ubicación para ver el detalle completo de su inventario.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
