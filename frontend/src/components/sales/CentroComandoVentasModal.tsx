import { useState, useEffect } from 'react';
import http from '../../services/http';
import { formatNumber, formatInteger } from '../../utils/formatNumber';

// ============================================================================
// INTERFACES
// ============================================================================

interface UltimaVentaInfo {
  numero_factura: string;
  fecha_venta: string;
  hora: string;
  cantidad_vendida: number;
}

interface AgotadoVisualItem {
  producto_id: string;
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string | null;
  stock_actual: number;
  ventas_ultimas_2_semanas: number;
  promedio_horas_entre_ventas: number;
  horas_sin_vender: number;
  factor_alerta: number;
  ultima_venta: UltimaVentaInfo | null;
  prioridad: number; // 1 = crítico, 2 = alto, 3 = medio
}

interface AgotadoVisualResponse {
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha_analisis: string;
  total_alertas: number;
  alertas_criticas: number;
  alertas_altas: number;
  alertas_medias: number;
  items: AgotadoVisualItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ubicacionId: string;
  ubicacionNombre: string;
  almacenCodigo?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const formatHoras = (horas: number): string => {
  if (horas < 1) {
    return `${Math.round(horas * 60)} min`;
  } else if (horas < 24) {
    return `${formatNumber(horas, 1)}h`;
  } else {
    const dias = Math.floor(horas / 24);
    const horasRestantes = Math.round(horas % 24);
    if (horasRestantes === 0) {
      return `${dias}d`;
    }
    return `${dias}d ${horasRestantes}h`;
  }
};

const getPrioridadColor = (prioridad: number): string => {
  switch (prioridad) {
    case 1: return 'bg-red-100 text-red-800 border-red-200';
    case 2: return 'bg-orange-100 text-orange-800 border-orange-200';
    default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  }
};

const getPrioridadLabel = (prioridad: number): string => {
  switch (prioridad) {
    case 1: return 'Crítico';
    case 2: return 'Alto';
    default: return 'Medio';
  }
};

const getFactorColor = (factor: number): string => {
  if (factor >= 4) return 'text-red-600';
  if (factor >= 3) return 'text-orange-600';
  return 'text-yellow-600';
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function CentroComandoVentasModal({
  isOpen,
  onClose,
  ubicacionId,
  ubicacionNombre,
  almacenCodigo
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AgotadoVisualResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterPrioridad, setFilterPrioridad] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Cargar datos al abrir el modal
  useEffect(() => {
    if (isOpen && ubicacionId) {
      loadData();
    }
  }, [isOpen, ubicacionId, almacenCodigo]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (almacenCodigo) {
        params.almacen_codigo = almacenCodigo;
      }

      const response = await http.get(`/api/ventas/agotados-visuales/${ubicacionId}`, { params });
      setData(response.data);
    } catch (err) {
      console.error('Error cargando agotados visuales:', err);
      setError('Error al cargar los datos. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar items
  const filteredItems = data?.items.filter(item => {
    // Filtro por prioridad
    if (filterPrioridad !== null && item.prioridad !== filterPrioridad) {
      return false;
    }
    // Filtro por búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        item.codigo_producto.toLowerCase().includes(search) ||
        item.descripcion_producto.toLowerCase().includes(search) ||
        (item.categoria?.toLowerCase().includes(search) ?? false)
      );
    }
    return true;
  }) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Panel - Centrado */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-white shadow-xl rounded-xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Centro de Comando - Agotados Visuales
              </h2>
              <p className="text-purple-100 text-sm mt-1">
                {ubicacionNombre} {almacenCodigo && `• ${almacenCodigo}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-purple-200 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            </div>
          ) : data ? (
            <div className="p-6 space-y-6">
              {/* Métricas */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">Total Alertas</p>
                  <p className="text-3xl font-bold text-gray-900">{data.total_alertas}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-red-600">Críticas</p>
                  <p className="text-3xl font-bold text-red-700">{data.alertas_criticas}</p>
                  <p className="text-xs text-red-500 mt-1">&gt;4x tiempo normal</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-orange-600">Altas</p>
                  <p className="text-3xl font-bold text-orange-700">{data.alertas_altas}</p>
                  <p className="text-xs text-orange-500 mt-1">&gt;3x tiempo normal</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-yellow-600">Medias</p>
                  <p className="text-3xl font-bold text-yellow-700">{data.alertas_medias}</p>
                  <p className="text-xs text-yellow-500 mt-1">&gt;2x tiempo normal</p>
                </div>
              </div>

              {/* Info */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-purple-600 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-purple-800 font-medium">Detección de Agotados Visuales</p>
                    <p className="text-xs text-purple-600 mt-1">
                      Productos con stock positivo que dejaron de venderse más tiempo del esperado.
                      Posibles causas: producto no está en anaquel, etiqueta incorrecta, o stock fantasma.
                    </p>
                  </div>
                </div>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-4 items-center">
                {/* Búsqueda */}
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar producto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Filtro por prioridad */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterPrioridad(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterPrioridad === null
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setFilterPrioridad(1)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterPrioridad === 1
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    Críticas
                  </button>
                  <button
                    onClick={() => setFilterPrioridad(2)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterPrioridad === 2
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}
                  >
                    Altas
                  </button>
                  <button
                    onClick={() => setFilterPrioridad(3)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterPrioridad === 3
                        ? 'bg-yellow-600 text-white'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    }`}
                  >
                    Medias
                  </button>
                </div>
              </div>

              {/* Tabla de productos */}
              {filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="h-16 w-16 mx-auto text-green-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-500 text-lg">
                    {data.total_alertas === 0
                      ? 'No hay alertas de agotados visuales'
                      : 'No hay productos que coincidan con el filtro'}
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Vel. Normal</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sin Vender</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Factor</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Última Venta</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prioridad</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredItems.map((item) => (
                        <tr key={item.producto_id} className="hover:bg-gray-50">
                          {/* Producto */}
                          <td className="px-4 py-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{item.codigo_producto}</p>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]" title={item.descripcion_producto}>
                                {item.descripcion_producto}
                              </p>
                              {item.categoria && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                  {item.categoria}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Stock */}
                          <td className="px-4 py-4 text-center">
                            <span className="text-lg font-bold text-green-600">
                              {formatInteger(item.stock_actual)}
                            </span>
                            <p className="text-xs text-gray-400">unidades</p>
                          </td>

                          {/* Velocidad Normal */}
                          <td className="px-4 py-4 text-center">
                            <span className="text-sm font-medium text-gray-700">
                              1 cada {formatHoras(item.promedio_horas_entre_ventas)}
                            </span>
                            <p className="text-xs text-gray-400">
                              {item.ventas_ultimas_2_semanas} ventas/2sem
                            </p>
                          </td>

                          {/* Sin Vender */}
                          <td className="px-4 py-4 text-center">
                            <span className={`text-lg font-bold ${getFactorColor(item.factor_alerta)}`}>
                              {formatHoras(item.horas_sin_vender)}
                            </span>
                          </td>

                          {/* Factor */}
                          <td className="px-4 py-4 text-center">
                            <span className={`text-2xl font-bold ${getFactorColor(item.factor_alerta)}`}>
                              {item.factor_alerta}x
                            </span>
                          </td>

                          {/* Última Venta */}
                          <td className="px-4 py-4 text-center">
                            {item.ultima_venta ? (
                              <div>
                                <p className="text-sm text-gray-700">{item.ultima_venta.fecha_venta}</p>
                                <p className="text-xs text-gray-500">{item.ultima_venta.hora}</p>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* Prioridad */}
                          <td className="px-4 py-4 text-center">
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${getPrioridadColor(item.prioridad)}`}>
                              {getPrioridadLabel(item.prioridad)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer info */}
              <div className="text-center text-xs text-gray-400">
                Análisis: {data.fecha_analisis} • Productos de rotación media/alta (≥5 ventas en 2 semanas, promedio &lt;24h entre ventas)
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
