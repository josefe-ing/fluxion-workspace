import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import { formatInteger } from '../../utils/formatNumber';
import OportunidadesCediModal from './OportunidadesCediModal';
import ExpansionCatalogoModal from './ExpansionCatalogoModal';

interface UbicacionRegionalDetail {
  ubicacion_id: string;
  ubicacion_nombre: string;
  tipo: string;
  almacen_codigo: string | null;
  almacen_nombre: string | null;
  total_skus: number;
  skus_con_stock: number;
  stock_cero: number;
  stock_negativo: number;
  fill_rate: number;
  dias_cobertura_a: number | null;
  dias_cobertura_b: number | null;
  dias_cobertura_c: number | null;
  riesgo_quiebre: number;
  ultima_actualizacion: string | null;
}

interface RegionSummary {
  region: string;
  total_ubicaciones: number;
  total_skus_unicos: number;
  fill_rate_promedio: number;
  dias_cobertura_a: number | null;
  dias_cobertura_b: number | null;
  dias_cobertura_c: number | null;
  total_stock_cero: number;
  total_stock_negativo: number;
  total_riesgo_quiebre: number;
  ubicaciones: UbicacionRegionalDetail[];
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
  'cedi_caracas': 'CEDI CARACAS',
};

const getFriendlyLocationName = (ubicacionId: string, ubicacionNombre: string): string => {
  return UBICACION_FRIENDLY_NAMES[ubicacionId] || ubicacionNombre;
};

export default function InventorySummary() {
  const [regionData, setRegionData] = useState<RegionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRegion, setActiveRegion] = useState<string>('VALENCIA');
  const [oportunidadesModalOpen, setOportunidadesModalOpen] = useState(false);
  const [expansionModalOpen, setExpansionModalOpen] = useState(false);
  const navigate = useNavigate();

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/ubicaciones/summary-regional');
      console.log('✅ Regional summary loaded:', response.data);
      setRegionData(response.data || []);

      // Set active region to first one if available
      if (response.data?.length > 0) {
        setActiveRegion(response.data[0].region);
      }
    } catch (error) {
      console.error('❌ Error cargando resumen regional:', error);
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

  const handleUbicacionClick = (ubicacionId: string, almacenCodigo?: string | null) => {
    if (almacenCodigo) {
      navigate(`/dashboard/${ubicacionId}?almacen=${almacenCodigo}`);
    } else {
      navigate(`/dashboard/${ubicacionId}`);
    }
  };

  const activeRegionData = regionData.find(r => r.region === activeRegion);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando resumen regional...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con tabs de región */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resumen de Inventarios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vista regional del estado de stock
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

      {/* Botones de Análisis */}
      <div className="flex gap-3">
        <button
          onClick={() => setOportunidadesModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="font-medium">Oportunidades CEDI</span>
          <span className="text-xs text-purple-500">Stock disponible sin distribuir</span>
        </button>

        <button
          onClick={() => setExpansionModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="font-medium">Expansión Catálogo</span>
          <span className="text-xs text-green-500">Productos con potencial en más tiendas</span>
        </button>
      </div>

      {activeRegionData && (
        <>
          {/* Métricas Regionales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Fill Rate */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Fill Rate</p>
                  <p className={`mt-1 text-2xl font-bold ${
                    activeRegionData.fill_rate_promedio >= 80 ? 'text-green-600' :
                    activeRegionData.fill_rate_promedio >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {activeRegionData.fill_rate_promedio.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1">SKUs con stock disponible</p>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  activeRegionData.fill_rate_promedio >= 80 ? 'bg-green-100' :
                  activeRegionData.fill_rate_promedio >= 60 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <svg className={`h-5 w-5 ${
                    activeRegionData.fill_rate_promedio >= 80 ? 'text-green-600' :
                    activeRegionData.fill_rate_promedio >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Días Cobertura ABC */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <p className="text-sm font-medium text-gray-500 mb-2">Días Cobertura</p>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium px-1.5 py-0.5 bg-red-100 text-red-700 rounded">A</span>
                  <span className={`text-sm font-semibold ${
                    (activeRegionData.dias_cobertura_a ?? 0) < 3 ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    {activeRegionData.dias_cobertura_a?.toFixed(1) ?? '-'} días
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">B</span>
                  <span className={`text-sm font-semibold ${
                    (activeRegionData.dias_cobertura_b ?? 0) < 5 ? 'text-yellow-600' : 'text-gray-900'
                  }`}>
                    {activeRegionData.dias_cobertura_b?.toFixed(1) ?? '-'} días
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">C</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {activeRegionData.dias_cobertura_c?.toFixed(1) ?? '-'} días
                  </span>
                </div>
              </div>
            </div>

            {/* Riesgo de Quiebre */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Riesgo Quiebre</p>
                  <p className={`mt-1 text-2xl font-bold ${
                    activeRegionData.total_riesgo_quiebre > 100 ? 'text-red-600' :
                    activeRegionData.total_riesgo_quiebre > 50 ? 'text-yellow-600' : 'text-gray-900'
                  }`}>
                    {formatInteger(activeRegionData.total_riesgo_quiebre)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">SKUs con &lt;1 día stock</p>
                </div>
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  activeRegionData.total_riesgo_quiebre > 100 ? 'bg-red-100' :
                  activeRegionData.total_riesgo_quiebre > 50 ? 'bg-yellow-100' : 'bg-gray-100'
                }`}>
                  <svg className={`h-5 w-5 ${
                    activeRegionData.total_riesgo_quiebre > 100 ? 'text-red-600' :
                    activeRegionData.total_riesgo_quiebre > 50 ? 'text-yellow-600' : 'text-gray-600'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Stock Cero */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Stock en Cero</p>
                  <p className="mt-1 text-2xl font-bold text-yellow-600">
                    {formatInteger(activeRegionData.total_stock_cero)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Productos agotados</p>
                </div>
                <div className="h-10 w-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <svg className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Stock Negativo */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Stock Negativo</p>
                  <p className="mt-1 text-2xl font-bold text-red-600">
                    {formatInteger(activeRegionData.total_stock_negativo)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Errores de datos</p>
                </div>
                <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla por Ubicación */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Detalle por Ubicación - {activeRegion}
              </h2>
              <span className="text-sm text-gray-500">
                {activeRegionData.ubicaciones.length} ubicaciones
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ubicación
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Almacén
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fill Rate
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center">
                        Días Cob.
                        <span className="ml-1 px-1 py-0.5 text-[10px] bg-red-100 text-red-700 rounded">A</span>
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center">
                        Días Cob.
                        <span className="ml-1 px-1 py-0.5 text-[10px] bg-yellow-100 text-yellow-700 rounded">B</span>
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center">
                        Días Cob.
                        <span className="ml-1 px-1 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded">C</span>
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Riesgo
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stock 0
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Negativos
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actualizado
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {activeRegionData.ubicaciones.map((item) => (
                    <tr
                      key={`${item.ubicacion_id}-${item.almacen_codigo || 'default'}`}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleUbicacionClick(item.ubicacion_id, item.almacen_codigo)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-medium mr-2 ${
                            item.tipo === 'cedi' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {item.tipo === 'cedi' ? 'C' : 'T'}
                          </span>
                          <span className="text-sm font-medium text-gray-900 hover:text-blue-600">
                            {getFriendlyLocationName(item.ubicacion_id, item.ubicacion_nombre)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {item.almacen_nombre ? (
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                            item.almacen_nombre.includes('PISO')
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {item.almacen_nombre}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.fill_rate >= 80 ? 'bg-green-500' :
                                item.fill_rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(item.fill_rate, 100)}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${
                            item.fill_rate >= 80 ? 'text-green-600' :
                            item.fill_rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {item.fill_rate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`text-sm font-medium ${
                          item.dias_cobertura_a !== null && item.dias_cobertura_a < 3 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {item.dias_cobertura_a?.toFixed(1) ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`text-sm font-medium ${
                          item.dias_cobertura_b !== null && item.dias_cobertura_b < 5 ? 'text-yellow-600' : 'text-gray-900'
                        }`}>
                          {item.dias_cobertura_b?.toFixed(1) ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="text-sm font-medium text-gray-900">
                          {item.dias_cobertura_c?.toFixed(1) ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                          item.riesgo_quiebre > 20 ? 'bg-red-100 text-red-700' :
                          item.riesgo_quiebre > 10 ? 'bg-yellow-100 text-yellow-700' :
                          item.riesgo_quiebre > 0 ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {item.riesgo_quiebre}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`text-sm font-medium ${item.stock_cero > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {formatInteger(item.stock_cero)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`text-sm font-medium ${item.stock_negativo > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {formatInteger(item.stock_negativo)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">
                        {formatFecha(item.ultima_actualizacion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tip */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-blue-400 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-700">
                <strong>Tip:</strong> Haz clic en cualquier ubicación para ver el detalle completo de su inventario.
                Los productos clase A tienen alta rotación y requieren monitoreo más frecuente.
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modales */}
      <OportunidadesCediModal
        isOpen={oportunidadesModalOpen}
        onClose={() => setOportunidadesModalOpen(false)}
        region={activeRegion}
      />
      <ExpansionCatalogoModal
        isOpen={expansionModalOpen}
        onClose={() => setExpansionModalOpen(false)}
        region={activeRegion}
      />
    </div>
  );
}
