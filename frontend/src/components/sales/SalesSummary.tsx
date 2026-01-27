import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import { formatInteger } from '../../utils/formatNumber';

interface VentasRegionalDetail {
  ubicacion_id: string;
  ubicacion_nombre: string;
  tipo: string;
  total_transacciones: number;
  productos_unicos: number;
  unidades_vendidas: number;
  promedio_unidades_diarias: number | null;
  primera_venta: string | null;
  ultima_venta: string | null;
}

interface VentasRegionSummary {
  region: string;
  total_ubicaciones: number;
  total_transacciones: number;
  total_productos_unicos: number;
  total_unidades_vendidas: number;
  promedio_unidades_diarias: number | null;
  ubicaciones: VentasRegionalDetail[];
}

// Mapping de ubicaciones a nombres amigables
const UBICACION_FRIENDLY_NAMES: Record<string, string> = {
  'tienda_01': 'PERIFÉRICO',
  'tienda_02': 'AV. BOLÍVAR',
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
  'tienda_18': 'PARAÍSO',
  'tienda_19': 'GUIGUE',
  'tienda_20': 'TAZAJAL',
};

const getFriendlyLocationName = (ubicacionId: string, ubicacionNombre: string): string => {
  return UBICACION_FRIENDLY_NAMES[ubicacionId] || ubicacionNombre;
};

export default function SalesSummary() {
  const [regionData, setRegionData] = useState<VentasRegionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRegion, setActiveRegion] = useState<string>('VALENCIA');
  const navigate = useNavigate();

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/ventas/summary-regional');
      console.log('✅ Regional sales summary loaded:', response.data);
      setRegionData(response.data || []);

      // Set active region to first one if available
      if (response.data?.length > 0) {
        setActiveRegion(response.data[0].region);
      }
    } catch (error) {
      console.error('❌ Error cargando resumen regional de ventas:', error);
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleUbicacionClick = (ubicacionId: string) => {
    navigate(`/ventas/${ubicacionId}`);
  };

  const activeRegionData = regionData.find(r => r.region === activeRegion);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando resumen regional de ventas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con tabs de región */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard de Ventas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Resumen de ventas por ubicación
          </p>
        </div>

        {/* Region Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          {regionData.map((region) => (
            <button
              key={region.region}
              onClick={() => setActiveRegion(region.region)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeRegion === region.region
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {region.region}
              <span className="ml-2 text-xs text-gray-400">
                ({region.total_ubicaciones})
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeRegionData && (
        <>
          {/* Métricas Regionales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Ubicaciones */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Ubicaciones</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {activeRegionData.total_ubicaciones}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Tiendas activas</p>
                </div>
                <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Transacciones */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Transacciones</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">
                    {formatInteger(activeRegionData.total_transacciones)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Ventas registradas</p>
                </div>
                <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Productos Únicos */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Productos Únicos</p>
                  <p className="mt-1 text-2xl font-bold text-purple-600">
                    {formatInteger(activeRegionData.total_productos_unicos)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">SKUs vendidos</p>
                </div>
                <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Unidades Vendidas */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Unidades Vendidas</p>
                  <p className="mt-1 text-2xl font-bold text-orange-600">
                    {formatInteger(activeRegionData.total_unidades_vendidas)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {activeRegionData.promedio_unidades_diarias
                      ? `~${formatInteger(Math.round(activeRegionData.promedio_unidades_diarias))} unidades/día`
                      : 'Total vendido'}
                  </p>
                </div>
                <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Ubicaciones */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Detalle por Ubicación - {activeRegion}</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ubicación
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transacciones
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Productos Únicos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unidades Vendidas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Promedio Diario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Primera Venta
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Última Venta
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {activeRegionData.ubicaciones.map((item) => (
                    <tr
                      key={item.ubicacion_id}
                      onClick={() => handleUbicacionClick(item.ubicacion_id)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="text-sm font-medium text-gray-900">
                            {getFriendlyLocationName(item.ubicacion_id, item.ubicacion_nombre)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {item.tipo.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatInteger(item.total_transacciones)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatInteger(item.productos_unicos)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {formatInteger(item.unidades_vendidas)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-blue-600 font-medium">
                        {item.promedio_unidades_diarias
                          ? formatInteger(Math.round(item.promedio_unidades_diarias))
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatFecha(item.primera_venta)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatFecha(item.ultima_venta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
