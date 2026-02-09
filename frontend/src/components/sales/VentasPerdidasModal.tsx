import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';
import { formatNumber, formatInteger } from '../../utils/formatNumber';
import { CSVLink } from 'react-csv';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import ProductoDetalleModal from './ProductoDetalleModal';

// ============================================================================
// INTERFACES - V3: Análisis por rango de fechas configurable
// ============================================================================

interface VentaPerdidaItemV3 {
  producto_id: string;
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string | null;
  ventas_periodo: number;           // Unidades vendidas en el período
  dias_con_ventas: number;          // Días con ventas en el período
  dias_analizados: number;          // Total días del período
  promedio_diario_periodo: number;  // Promedio diario en período
  promedio_diario_historico: number;// Promedio diario histórico
  dias_historico: number;           // Días usados para histórico
  porcentaje_vs_historico: number;  // % del histórico alcanzado
  unidades_perdidas_diarias: number;
  unidades_perdidas_total: number;
  precio_unitario_promedio: number;
  venta_perdida_usd: number;
  nivel_alerta: string;             // "critico", "alto", "medio"
  stock_actual: number;
  dias_stock_cero: number;          // Días con stock 0 en el período
}

interface VentasPerdidasResponseV3 {
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_analizados: number;
  dias_historico: number;
  total_venta_perdida_usd: number;
  total_incidentes: number;
  incidentes_criticos: number;
  incidentes_altos: number;
  incidentes_medios: number;
  producto_mayor_perdida: string | null;
  producto_mayor_perdida_valor: number;
  items: VentaPerdidaItemV3[];
}

// Tipo de período predefinido
type PeriodoPreset = 'ultimos_7_dias' | 'ultima_semana' | 'ultimos_14_dias' | 'ultimo_mes' | 'personalizado';

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

const formatUSD = (value: number): string => {
  return `$${formatNumber(value, 2)}`;
};

const getNivelAlertaColor = (nivel: string): string => {
  switch (nivel) {
    case 'critico': return 'bg-red-100 text-red-800 border-red-200';
    case 'alto': return 'bg-orange-100 text-orange-800 border-orange-200';
    default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  }
};

const getNivelAlertaLabel = (nivel: string): string => {
  switch (nivel) {
    case 'critico': return 'Crítico';
    case 'alto': return 'Alto';
    default: return 'Medio';
  }
};

// Colores para gráficos
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e'];

// ============================================================================
// COMPONENT
// ============================================================================

// Helpers para calcular fechas
const getPresetDates = (preset: PeriodoPreset): { inicio: string; fin: string } => {
  const hoy = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  switch (preset) {
    case 'ultimos_7_dias': {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 6);
      return { inicio: formatDate(inicio), fin: formatDate(hoy) };
    }
    case 'ultima_semana': {
      // Semana pasada (lunes a domingo)
      const diaSemana = hoy.getDay();
      const diasHastaDomingoPasado = diaSemana === 0 ? 7 : diaSemana;
      const domingoPasado = new Date(hoy);
      domingoPasado.setDate(domingoPasado.getDate() - diasHastaDomingoPasado);
      const lunesPasado = new Date(domingoPasado);
      lunesPasado.setDate(lunesPasado.getDate() - 6);
      return { inicio: formatDate(lunesPasado), fin: formatDate(domingoPasado) };
    }
    case 'ultimos_14_dias': {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 13);
      return { inicio: formatDate(inicio), fin: formatDate(hoy) };
    }
    case 'ultimo_mes': {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 29);
      return { inicio: formatDate(inicio), fin: formatDate(hoy) };
    }
    default:
      return { inicio: formatDate(hoy), fin: formatDate(hoy) };
  }
};

const getPresetLabel = (preset: PeriodoPreset): string => {
  switch (preset) {
    case 'ultimos_7_dias': return 'Últimos 7 días';
    case 'ultima_semana': return 'Semana pasada';
    case 'ultimos_14_dias': return 'Últimos 14 días';
    case 'ultimo_mes': return 'Último mes';
    case 'personalizado': return 'Personalizado';
  }
};

export default function VentasPerdidasModal({
  isOpen,
  onClose,
  ubicacionId,
  ubicacionNombre,
  almacenCodigo
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VentasPerdidasResponseV3 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterNivel, setFilterNivel] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'resumen' | 'detalle'>('resumen');

  // Estado para selector de período
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>('ultimos_7_dias');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Estado para modal de detalle de producto
  const [productoDetalle, setProductoDetalle] = useState<VentaPerdidaItemV3 | null>(null);

  // Inicializar fechas al abrir
  useEffect(() => {
    if (isOpen) {
      const { inicio, fin } = getPresetDates('ultimos_7_dias');
      setFechaInicio(inicio);
      setFechaFin(fin);
    }
  }, [isOpen]);

  // Manejar cambio de preset
  const handlePresetChange = (preset: PeriodoPreset) => {
    setPeriodoPreset(preset);
    if (preset !== 'personalizado') {
      const { inicio, fin } = getPresetDates(preset);
      setFechaInicio(inicio);
      setFechaFin(fin);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      };
      if (almacenCodigo) {
        params.almacen_codigo = almacenCodigo;
      }

      // Usar endpoint V3 con rango de fechas configurable
      const response = await http.get(`/api/ventas/ventas-perdidas-v3/${ubicacionId}`, { params });
      setData(response.data);
    } catch (err) {
      console.error('Error cargando ventas perdidas:', err);
      setError('Error al cargar los datos. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [ubicacionId, fechaInicio, fechaFin, almacenCodigo]);

  useEffect(() => {
    if (isOpen && ubicacionId && fechaInicio && fechaFin) {
      loadData();
    }
  }, [isOpen, ubicacionId, fechaInicio, fechaFin, loadData]);

  // Filtrar items
  const filteredItems = data?.items.filter((item: VentaPerdidaItemV3) => {
    if (filterNivel !== null && item.nivel_alerta !== filterNivel) {
      return false;
    }
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

  // Preparar datos para gráfico de barras (Top 10 productos)
  const topProductosData = data?.items.slice(0, 10).map((item: VentaPerdidaItemV3) => ({
    name: item.codigo_producto,
    descripcion: item.descripcion_producto.substring(0, 25) + (item.descripcion_producto.length > 25 ? '...' : ''),
    value: item.venta_perdida_usd,
    unidades: item.unidades_perdidas_total
  })) || [];

  // Agrupar por categoría para el gráfico de pie
  const porCategoria = data?.items.reduce((acc: Record<string, { total: number; count: number }>, item: VentaPerdidaItemV3) => {
    const cat = item.categoria || 'Sin Categoría';
    if (!acc[cat]) {
      acc[cat] = { total: 0, count: 0 };
    }
    acc[cat].total += item.venta_perdida_usd;
    acc[cat].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>) || {};

  const categoriaData = Object.entries(porCategoria)
    .map(([categoria, { total, count }]) => ({
      categoria,
      total_venta_perdida_usd: total,
      total_incidentes: count,
      porcentaje_del_total: data ? (total / data.total_venta_perdida_usd) * 100 : 0
    }))
    .sort((a, b) => b.total_venta_perdida_usd - a.total_venta_perdida_usd);

  // Preparar datos para CSV export
  const csvData = filteredItems.map((item: VentaPerdidaItemV3) => ({
    'Código': item.codigo_producto,
    'Descripción': item.descripcion_producto,
    'Categoría': item.categoria || 'Sin Categoría',
    'Stock Actual': item.stock_actual,
    'Días Stock Cero': item.dias_stock_cero,
    'Ventas Período': item.ventas_periodo,
    'Días con Ventas': item.dias_con_ventas,
    'Promedio Diario Período': item.promedio_diario_periodo,
    'Promedio Diario Histórico': item.promedio_diario_historico,
    '% vs Histórico': item.porcentaje_vs_historico,
    'Unidades Perdidas': item.unidades_perdidas_total,
    'Precio Unitario ($)': item.precio_unitario_promedio,
    'Venta Perdida ($)': item.venta_perdida_usd,
    'Nivel Alerta': getNivelAlertaLabel(item.nivel_alerta)
  }));

  // Custom tooltip para gráficos
  const CustomBarTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; descripcion: string; value: number; unidades: number } }> }) => {
    if (active && payload && payload.length) {
      const tooltipData = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="text-sm font-medium text-gray-900">{tooltipData.name}</p>
          <p className="text-xs text-gray-500 mb-2">{tooltipData.descripcion}</p>
          <p className="text-sm text-red-600 font-bold">{formatUSD(tooltipData.value)}</p>
          <p className="text-xs text-gray-500">{formatInteger(tooltipData.unidades)} unidades perdidas</p>
        </div>
      );
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative w-full max-w-7xl max-h-[95vh] bg-white shadow-xl rounded-xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-red-600 to-orange-600 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Análisis de Ventas Perdidas
              </h2>
              <p className="text-red-100 text-sm mt-1">
                {ubicacionNombre} {almacenCodigo && `• ${almacenCodigo}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-red-200 transition-colors"
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            </div>
          ) : data ? (
            <div className="p-6 space-y-6">
              {/* Selector de Período */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  {/* Presets de período */}
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-100 text-sm mr-2">Período:</span>
                    {(['ultimos_7_dias', 'ultima_semana', 'ultimos_14_dias', 'ultimo_mes'] as PeriodoPreset[]).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => handlePresetChange(preset)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          periodoPreset === preset
                            ? 'bg-white text-blue-600'
                            : 'bg-white/20 text-white hover:bg-white/30'
                        }`}
                      >
                        {getPresetLabel(preset)}
                      </button>
                    ))}
                  </div>

                  {/* Fechas personalizadas */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => {
                        setPeriodoPreset('personalizado');
                        setFechaInicio(e.target.value);
                      }}
                      className="px-2 py-1 rounded text-sm text-gray-800"
                    />
                    <span className="text-blue-100">a</span>
                    <input
                      type="date"
                      value={fechaFin}
                      onChange={(e) => {
                        setPeriodoPreset('personalizado');
                        setFechaFin(e.target.value);
                      }}
                      className="px-2 py-1 rounded text-sm text-gray-800"
                    />
                  </div>
                </div>

                {/* Info del período seleccionado */}
                <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white/20 rounded-lg p-2">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-blue-100 text-xs">Analizando</p>
                      <p className="font-semibold">{data.dias_analizados} días ({data.fecha_inicio} a {data.fecha_fin})</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-100 text-xs">Comparando con</p>
                    <p className="font-semibold">{data.dias_historico} días previos</p>
                  </div>
                </div>
              </div>

              {/* KPIs Cards */}
              <div className="grid grid-cols-4 gap-4">
                {/* Total Ventas Perdidas */}
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-5 border border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-600">Total Ventas Perdidas</p>
                      <p className="text-3xl font-bold text-red-700 mt-1">
                        {formatUSD(data.total_venta_perdida_usd)}
                      </p>
                      <p className="text-xs text-red-500 mt-1">En período vs histórico</p>
                    </div>
                    <div className="h-12 w-12 bg-red-200 rounded-full flex items-center justify-center">
                      <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Incidentes Críticos */}
                <div className="bg-gradient-to-br from-red-50 to-orange-100 rounded-xl p-5 border border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-600">Críticos</p>
                      <p className="text-3xl font-bold text-red-700 mt-1">
                        {formatInteger(data.incidentes_criticos)}
                      </p>
                      <p className="text-xs text-red-500 mt-1">&lt;30% del histórico</p>
                    </div>
                    <div className="h-12 w-12 bg-red-200 rounded-full flex items-center justify-center">
                      <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Incidentes Altos */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-5 border border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-600">Altos</p>
                      <p className="text-3xl font-bold text-orange-700 mt-1">
                        {formatInteger(data.incidentes_altos)}
                      </p>
                      <p className="text-xs text-orange-500 mt-1">Vendió &lt;50% del promedio</p>
                    </div>
                    <div className="h-12 w-12 bg-orange-200 rounded-full flex items-center justify-center">
                      <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Producto Mayor Pérdida */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-purple-600">Mayor Pérdida</p>
                      <p className="text-lg font-bold text-purple-700 mt-1 truncate" title={data.producto_mayor_perdida || '-'}>
                        {data.producto_mayor_perdida?.split(' - ')[0] || '-'}
                      </p>
                      <p className="text-sm text-purple-600 font-semibold">
                        {formatUSD(data.producto_mayor_perdida_valor)}
                      </p>
                    </div>
                    <div className="h-12 w-12 bg-purple-200 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('resumen')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'resumen'
                        ? 'border-red-500 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Resumen Visual
                  </button>
                  <button
                    onClick={() => setActiveTab('detalle')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'detalle'
                        ? 'border-red-500 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Detalle de Productos ({data.total_incidentes})
                  </button>
                </nav>
              </div>

              {activeTab === 'resumen' ? (
                /* Visualizaciones */
                <div className="grid grid-cols-2 gap-6">
                  {/* Top 10 Productos - Barras Horizontales */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Productos con Mayor Pérdida</h3>
                    {topProductosData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart
                          layout="vertical"
                          data={topProductosData}
                          margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                          <XAxis
                            type="number"
                            tickFormatter={(value) => `$${formatInteger(value)}`}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={60}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip content={<CustomBarTooltip />} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {topProductosData.map((_: unknown, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-gray-500">
                        No hay datos disponibles
                      </div>
                    )}
                  </div>

                  {/* Distribución por Categoría - Pie */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Pérdidas por Categoría</h3>
                    {categoriaData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                          <Pie
                            data={categoriaData.slice(0, 8)}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ categoria, porcentaje_del_total }: { categoria: string; porcentaje_del_total: number }) =>
                              porcentaje_del_total > 5 ? `${categoria.substring(0, 10)}${categoria.length > 10 ? '..' : ''} (${formatNumber(porcentaje_del_total, 0)}%)` : ''
                            }
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="total_venta_perdida_usd"
                            nameKey="categoria"
                          >
                            {categoriaData.slice(0, 8).map((_: unknown, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => formatUSD(value)}
                            labelFormatter={(label) => `Categoría: ${label}`}
                          />
                          <Legend
                            layout="vertical"
                            align="right"
                            verticalAlign="middle"
                            formatter={(value: string) => value.substring(0, 15) + (value.length > 15 ? '...' : '')}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-gray-500">
                        No hay datos disponibles
                      </div>
                    )}
                  </div>

                  {/* Tabla resumen por categoría */}
                  <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen por Categoría</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Incidentes</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Venta Perdida</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% del Total</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {categoriaData.map((cat, index) => (
                            <tr key={cat.categoria} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center">
                                  <div
                                    className="w-3 h-3 rounded-full mr-2"
                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                  />
                                  <span className="text-sm font-medium text-gray-900">{cat.categoria}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-600">
                                {formatInteger(cat.total_incidentes)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                                {formatUSD(cat.total_venta_perdida_usd)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end">
                                  <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                    <div
                                      className="bg-red-500 h-2 rounded-full"
                                      style={{ width: `${Math.min(cat.porcentaje_del_total, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-600">
                                    {formatNumber(cat.porcentaje_del_total, 1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* Tabla de Detalle */
                <div className="space-y-4">
                  {/* Filtros y Export */}
                  <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex flex-wrap gap-4 items-center flex-1">
                      {/* Búsqueda */}
                      <div className="flex-1 min-w-[200px] max-w-md">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Buscar por código, descripción o categoría..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                          <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                      </div>

                      {/* Filtro por nivel de alerta */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setFilterNivel(null)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            filterNivel === null
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Todos
                        </button>
                        <button
                          onClick={() => setFilterNivel('critico')}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            filterNivel === 'critico'
                              ? 'bg-red-600 text-white'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          Crítico ({data.incidentes_criticos})
                        </button>
                        <button
                          onClick={() => setFilterNivel('alto')}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            filterNivel === 'alto'
                              ? 'bg-orange-600 text-white'
                              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          }`}
                        >
                          Alto ({data.incidentes_altos})
                        </button>
                      </div>
                    </div>

                    {/* Export Button */}
                    <CSVLink
                      data={csvData}
                      filename={`ventas-perdidas-${ubicacionId}-${data.fecha_inicio}-a-${data.fecha_fin}.csv`}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Exportar CSV
                    </CSVLink>
                  </div>

                  {/* Info de resultados */}
                  <div className="text-sm text-gray-500">
                    Mostrando {filteredItems.length} de {data.total_incidentes} productos
                  </div>

                  {/* Tabla */}
                  {filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                      <svg className="h-16 w-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-gray-500 text-lg">
                        {data.total_incidentes === 0
                          ? 'No hay ventas perdidas detectadas en este slot'
                          : 'No hay productos que coincidan con el filtro'}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Días Stock 0</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prom/Día Período</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prom/Día Hist.</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">% vs Hist.</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Uds. Perdidas</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-red-50">Venta Perdida</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nivel</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filteredItems.map((item: VentaPerdidaItemV3) => (
                              <tr
                                key={item.producto_id}
                                className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                onClick={() => setProductoDetalle(item)}
                                title="Clic para ver detalle de ventas e inventario"
                              >
                                {/* Producto */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-900">{item.codigo_producto}</p>
                                      <p className="text-xs text-gray-500 truncate max-w-[180px]" title={item.descripcion_producto}>
                                        {item.descripcion_producto}
                                      </p>
                                      {item.categoria && (
                                        <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                          {item.categoria}
                                        </span>
                                      )}
                                    </div>
                                    <svg className="h-4 w-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </div>
                                </td>

                                {/* Stock */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-sm font-bold ${item.stock_actual === 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatInteger(item.stock_actual)}
                                  </span>
                                </td>

                                {/* Días Stock 0 */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-sm font-semibold ${item.dias_stock_cero > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                    {item.dias_stock_cero > 0 ? item.dias_stock_cero : '-'}
                                  </span>
                                </td>

                                {/* Promedio Diario Período */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-sm font-semibold ${item.promedio_diario_periodo === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                    {formatNumber(item.promedio_diario_periodo, 2)}
                                  </span>
                                </td>

                                {/* Promedio Diario Histórico */}
                                <td className="px-4 py-3 text-center">
                                  <span className="text-sm text-gray-600">
                                    {formatNumber(item.promedio_diario_historico, 2)}
                                  </span>
                                </td>

                                {/* % vs Histórico */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-sm font-bold ${
                                    item.porcentaje_vs_historico <= 30 ? 'text-red-600' :
                                    item.porcentaje_vs_historico <= 50 ? 'text-orange-600' : 'text-yellow-600'
                                  }`}>
                                    {formatNumber(item.porcentaje_vs_historico, 0)}%
                                  </span>
                                </td>

                                {/* Unidades Perdidas */}
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatNumber(item.unidades_perdidas_total, 1)}
                                  </span>
                                </td>

                                {/* Venta Perdida */}
                                <td className="px-4 py-3 text-right bg-red-50">
                                  <span className="text-sm font-bold text-red-700">
                                    {formatUSD(item.venta_perdida_usd)}
                                  </span>
                                </td>

                                {/* Nivel */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold border ${getNivelAlertaColor(item.nivel_alerta)}`}>
                                    {getNivelAlertaLabel(item.nivel_alerta)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer info */}
              <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
                Período: {data.fecha_inicio} a {data.fecha_fin} ({data.dias_analizados} días) • Comparando con {data.dias_historico} días previos •
                Cálculo: Unidades Perdidas = Promedio Histórico - Ventas Actuales
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal de detalle de producto */}
      {productoDetalle && (
        <ProductoDetalleModal
          isOpen={!!productoDetalle}
          onClose={() => setProductoDetalle(null)}
          codigoProducto={productoDetalle.codigo_producto}
          descripcionProducto={productoDetalle.descripcion_producto}
          ubicacionId={ubicacionId}
          ubicacionNombre={ubicacionNombre}
        />
      )}
    </div>
  );
}
