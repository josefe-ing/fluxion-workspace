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
  clase_abc: string | null;
  ventas_otras_tiendas_region: number;
  se_vende_en_region: boolean;
  score_criticidad: number;
  prioridad: number; // 1 = crítico, 2 = alto, 3 = medio
  stock_en_ultima_venta: number | null;
  diagnostico: string; // EXHIBICION, AGOTAMIENTO, REGIONAL, REPOSICION, INDETERMINADO
  diagnostico_detalle: string;
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
  // Info de horarios de operación
  hora_apertura?: string;
  hora_cierre?: string;
  tienda_abierta: boolean;
  horas_operacion_diarias: number;
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

const getDiagnosticoConfig = (diagnostico: string) => {
  switch (diagnostico) {
    case 'EXHIBICION':
      return {
        icon: '🔴',
        label: 'Exhibición',
        color: 'bg-red-100 text-red-800 border-red-300',
        tooltip: 'Problema de exhibición: producto disponible pero no visible'
      };
    case 'AGOTAMIENTO':
      return {
        icon: '🟡',
        label: 'Agotado',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        tooltip: 'Agotamiento previo, producto recién repuesto'
      };
    case 'REPOSICION':
      return {
        icon: '🟠',
        label: 'Reponer',
        color: 'bg-orange-100 text-orange-800 border-orange-300',
        tooltip: 'Stock bajo, necesita reposición urgente'
      };
    case 'REGIONAL':
      return {
        icon: '🔵',
        label: 'Regional',
        color: 'bg-blue-100 text-blue-800 border-blue-300',
        tooltip: 'No se vende en ninguna tienda de la región'
      };
    default:
      return {
        icon: '⚪',
        label: 'Análisis',
        color: 'bg-gray-100 text-gray-700 border-gray-300',
        tooltip: 'Requiere análisis adicional'
      };
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

type SortField = 'codigo' | 'stock' | 'factor' | 'sin_vender' | 'prioridad' | 'categoria' | 'criticidad' | 'abc' | 'ventas_region';
type SortOrder = 'asc' | 'desc';

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

  // Filtros
  const [filterPrioridad, setFilterPrioridad] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState<string>('');
  const [filterStockMin, setFilterStockMin] = useState<number | null>(null);
  const [filterFactorMin, setFilterFactorMin] = useState<number | null>(null);
  const [filterABC, setFilterABC] = useState<string>('');
  const [filterSeVendeRegion, setFilterSeVendeRegion] = useState<boolean | null>(null);

  // Sorting - Por defecto ordenar por tiempo sin vender (mayor a menor)
  const [sortField, setSortField] = useState<SortField>('sin_vender');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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

  // Función para manejar sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle order si es el mismo campo
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Nuevo campo, default a desc
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Obtener categorías únicas
  const categorias = Array.from(new Set(data?.items.map(item => item.categoria).filter(Boolean))) as string[];

  // Filtrar y ordenar items
  const filteredAndSortedItems = (() => {
    if (!data) return [];

    let items = data.items.filter(item => {
      // Filtro por prioridad
      if (filterPrioridad !== null && item.prioridad !== filterPrioridad) {
        return false;
      }
      // Filtro por búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!(
          item.codigo_producto.toLowerCase().includes(search) ||
          item.descripcion_producto.toLowerCase().includes(search) ||
          (item.categoria?.toLowerCase().includes(search) ?? false)
        )) {
          return false;
        }
      }
      // Filtro por categoría
      if (filterCategoria && item.categoria !== filterCategoria) {
        return false;
      }
      // Filtro por stock mínimo
      if (filterStockMin !== null && item.stock_actual < filterStockMin) {
        return false;
      }
      // Filtro por factor mínimo
      if (filterFactorMin !== null && item.factor_alerta < filterFactorMin) {
        return false;
      }
      // Filtro por ABC
      if (filterABC && item.clase_abc !== filterABC) {
        return false;
      }
      // Filtro por se vende en región
      if (filterSeVendeRegion !== null && item.se_vende_en_region !== filterSeVendeRegion) {
        return false;
      }
      return true;
    });

    // Ordenar
    items.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'codigo':
          aVal = a.codigo_producto;
          bVal = b.codigo_producto;
          break;
        case 'stock':
          aVal = a.stock_actual;
          bVal = b.stock_actual;
          break;
        case 'factor':
          aVal = a.factor_alerta;
          bVal = b.factor_alerta;
          break;
        case 'sin_vender':
          aVal = a.horas_sin_vender;
          bVal = b.horas_sin_vender;
          break;
        case 'prioridad':
          aVal = a.prioridad;
          bVal = b.prioridad;
          break;
        case 'categoria':
          aVal = a.categoria || '';
          bVal = b.categoria || '';
          break;
        case 'criticidad':
          aVal = a.score_criticidad;
          bVal = b.score_criticidad;
          break;
        case 'abc':
          // A=3, B=2, C=1, SIN_VENTAS=0
          aVal = a.clase_abc === 'A' ? 3 : a.clase_abc === 'B' ? 2 : a.clase_abc === 'C' ? 1 : 0;
          bVal = b.clase_abc === 'A' ? 3 : b.clase_abc === 'B' ? 2 : b.clase_abc === 'C' ? 1 : 0;
          break;
        case 'ventas_region':
          aVal = a.ventas_otras_tiendas_region;
          bVal = b.ventas_otras_tiendas_region;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  })();

  // Calcular estadísticas por categoría
  const estatsPorCategoria = (() => {
    if (!data) return [];
    const grouped = filteredAndSortedItems.reduce((acc, item) => {
      const cat = item.categoria || 'Sin Categoría';
      if (!acc[cat]) {
        acc[cat] = { categoria: cat, count: 0, criticos: 0, totalStock: 0 };
      }
      acc[cat].count++;
      if (item.prioridad === 1) acc[cat].criticos++;
      acc[cat].totalStock += item.stock_actual;
      return acc;
    }, {} as Record<string, { categoria: string; count: number; criticos: number; totalStock: number }>);
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  })();

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

              {/* Info de horario y estado */}
              <div className="flex gap-4">
                {/* Estado de la tienda */}
                <div className={`flex-shrink-0 px-4 py-3 rounded-lg border ${
                  data.tienda_abierta
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-100 border-gray-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      data.tienda_abierta ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                    }`} />
                    <span className={`text-sm font-medium ${
                      data.tienda_abierta ? 'text-green-700' : 'text-gray-600'
                    }`}>
                      {data.tienda_abierta ? 'Tienda Abierta' : 'Tienda Cerrada'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Horario: {data.hora_apertura || '07:00'} - {data.hora_cierre || '21:00'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {data.horas_operacion_diarias}h de operación/día
                  </p>
                </div>

                {/* Info */}
                <div className="flex-1 bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-purple-600 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm text-purple-800 font-medium">Detección de Agotados Visuales</p>
                      <p className="text-xs text-purple-600 mt-1">
                        Productos con stock positivo que dejaron de venderse más tiempo del esperado.
                        El análisis considera solo las horas de operación de la tienda.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Estadísticas por Categoría */}
              {estatsPorCategoria.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3">Distribución por Categoría</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {estatsPorCategoria.slice(0, 8).map((stat) => (
                      <div
                        key={stat.categoria}
                        className="bg-white rounded-lg p-3 border border-blue-100 cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => setFilterCategoria(filterCategoria === stat.categoria ? '' : stat.categoria)}
                      >
                        <p className="text-xs text-gray-600 truncate" title={stat.categoria}>{stat.categoria}</p>
                        <div className="flex items-baseline gap-2 mt-1">
                          <p className="text-lg font-bold text-blue-900">{stat.count}</p>
                          {stat.criticos > 0 && (
                            <span className="text-xs font-semibold text-red-600">({stat.criticos} críticos)</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{formatInteger(stat.totalStock)} unid.</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtros */}
              <div className="space-y-4">
                {/* Primera fila: Búsqueda y Prioridad */}
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

                  {/* Botón de exportar */}
                  <button
                    onClick={() => {
                      const csv = [
                        ['Código', 'Descripción', 'Categoría', 'Stock', 'Factor', 'Horas Sin Vender', 'Prioridad'].join(','),
                        ...filteredAndSortedItems.map(item => [
                          item.codigo_producto,
                          `"${item.descripcion_producto}"`,
                          item.categoria || '',
                          item.stock_actual,
                          item.factor_alerta,
                          item.horas_sin_vender,
                          getPrioridadLabel(item.prioridad)
                        ].join(','))
                      ].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `agotados-visuales-${ubicacionId}-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Exportar CSV
                  </button>
                </div>

                {/* Segunda fila: Filtros adicionales */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Categoría */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
                    <select
                      value={filterCategoria}
                      onChange={(e) => setFilterCategoria(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Todas</option>
                      {categorias.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* ABC */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Clasificación ABC</label>
                    <select
                      value={filterABC}
                      onChange={(e) => setFilterABC(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Todas</option>
                      <option value="A">A - Alta rotación</option>
                      <option value="B">B - Media rotación</option>
                      <option value="C">C - Baja rotación</option>
                    </select>
                  </div>

                  {/* Stock mínimo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Stock Mínimo</label>
                    <input
                      type="number"
                      placeholder="Ej: 10"
                      value={filterStockMin || ''}
                      onChange={(e) => setFilterStockMin(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Factor mínimo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Factor Mínimo</label>
                    <select
                      value={filterFactorMin || ''}
                      onChange={(e) => setFilterFactorMin(e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Todos</option>
                      <option value="2">&gt;2x</option>
                      <option value="3">&gt;3x</option>
                      <option value="4">&gt;4x</option>
                      <option value="5">&gt;5x</option>
                    </select>
                  </div>

                  {/* Se vende en región */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Comparación Regional</label>
                    <select
                      value={filterSeVendeRegion === null ? '' : String(filterSeVendeRegion)}
                      onChange={(e) => setFilterSeVendeRegion(e.target.value === '' ? null : e.target.value === 'true')}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Todos</option>
                      <option value="true">Se vende en región</option>
                      <option value="false">No se vende en región</option>
                    </select>
                  </div>
                </div>

                {/* Contador de resultados */}
                <div className="flex items-center justify-between text-sm">
                  <p className="text-gray-600">
                    Mostrando <span className="font-semibold text-gray-900">{filteredAndSortedItems.length}</span> de <span className="font-semibold">{data.total_alertas}</span> alertas
                  </p>
                  {(filterPrioridad !== null || searchTerm || filterCategoria || filterStockMin !== null || filterFactorMin !== null || filterABC || filterSeVendeRegion !== null) && (
                    <button
                      onClick={() => {
                        setFilterPrioridad(null);
                        setSearchTerm('');
                        setFilterCategoria('');
                        setFilterStockMin(null);
                        setFilterFactorMin(null);
                        setFilterABC('');
                        setFilterSeVendeRegion(null);
                      }}
                      className="text-purple-600 hover:text-purple-700 font-medium"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              </div>

              {/* Tabla de productos */}
              {filteredAndSortedItems.length === 0 ? (
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
                        <th
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleSort('codigo')}
                        >
                          <div className="flex items-center gap-1">
                            Producto
                            {sortField === 'codigo' && (
                              <svg className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Diagnóstico
                        </th>
                        <th
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleSort('abc')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            ABC
                            {sortField === 'abc' && (
                              <svg className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleSort('stock')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Stock
                            {sortField === 'stock' && (
                              <svg className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleSort('ventas_region')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Otras Tiendas
                            {sortField === 'ventas_region' && (
                              <svg className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Vtas/Día</th>
                        <th
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleSort('sin_vender')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Sin Vender
                            {sortField === 'sin_vender' && (
                              <svg className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Última Venta</th>
                        <th
                          className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => handleSort('prioridad')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Prioridad
                            {sortField === 'prioridad' && (
                              <svg className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredAndSortedItems.map((item) => (
                        <tr key={item.producto_id} className="hover:bg-gray-50">
                          {/* Producto */}
                          <td className="px-3 py-2">
                            <div>
                              <p className="text-xs font-medium text-gray-900">{item.codigo_producto}</p>
                              <p className="text-xs text-gray-500 truncate max-w-[180px]" title={item.descripcion_producto}>
                                {item.descripcion_producto}
                              </p>
                              {item.categoria && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                  {item.categoria}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Diagnóstico */}
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold border ${getDiagnosticoConfig(item.diagnostico).color}`}
                                title={item.diagnostico_detalle}
                              >
                                <span className="mr-1">{getDiagnosticoConfig(item.diagnostico).icon}</span>
                                {getDiagnosticoConfig(item.diagnostico).label}
                              </span>
                            </div>
                          </td>

                          {/* ABC */}
                          <td className="px-3 py-2 text-center">
                            {item.clase_abc ? (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                item.clase_abc === 'A' ? 'bg-green-600 text-white' :
                                item.clase_abc === 'B' ? 'bg-yellow-500 text-white' :
                                'bg-gray-500 text-white'
                              }`}>
                                {item.clase_abc}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>

                          {/* Stock */}
                          <td className="px-3 py-2 text-center">
                            <span className={`text-sm font-bold ${
                              item.stock_actual >= 100 ? 'text-green-600' :
                              item.stock_actual >= 50 ? 'text-yellow-600' :
                              'text-orange-600'
                            }`}>
                              {formatInteger(item.stock_actual)}
                            </span>
                          </td>

                          {/* Otras Tiendas (Región) */}
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-sm font-bold ${
                                item.ventas_otras_tiendas_region >= 20 ? 'text-red-600' :
                                item.ventas_otras_tiendas_region > 0 ? 'text-orange-600' :
                                'text-gray-400'
                              }`}>
                                {item.ventas_otras_tiendas_region}
                              </span>
                              {item.se_vende_en_region && (
                                <span className="inline-flex px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                                  ⚠ Local
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Velocidad (Ventas por día) */}
                          <td className="px-3 py-2 text-center">
                            <div className="text-sm font-medium text-gray-700">
                              {(item.ventas_ultimas_2_semanas / 14).toFixed(1)}/día
                            </div>
                            <div className="text-xs text-gray-400">
                              {item.ventas_ultimas_2_semanas} en 2sem
                            </div>
                          </td>

                          {/* Tiempo Sin Vender */}
                          <td className="px-3 py-2 text-center">
                            <div className={`text-base font-bold ${getFactorColor(item.factor_alerta)}`}>
                              {formatHoras(item.horas_sin_vender)}
                            </div>
                            <div className={`text-xs ${getFactorColor(item.factor_alerta)}`}>
                              {item.factor_alerta}x
                            </div>
                          </td>

                          {/* Última Venta */}
                          <td className="px-3 py-2 text-center">
                            {item.ultima_venta ? (
                              <div className="text-xs">
                                <div className="text-gray-700">{item.ultima_venta.fecha_venta}</div>
                                <div className="text-gray-500">{item.ultima_venta.hora}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>

                          {/* Prioridad */}
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${getPrioridadColor(item.prioridad)}`}>
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
                Análisis: {data.fecha_analisis} • Solo horas de operación ({data.hora_apertura || '07:00'}-{data.hora_cierre || '21:00'}) • Rotación media/alta (≥5 ventas/2sem)
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
