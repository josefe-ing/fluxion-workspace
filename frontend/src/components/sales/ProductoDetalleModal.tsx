import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';
import { formatNumber, formatInteger } from '../../utils/formatNumber';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Legend
} from 'recharts';

// ============================================================================
// INTERFACES
// ============================================================================

interface HistorialDataPoint {
  fecha: string;
  timestamp: number;
  ventas: number;
  inventario: number | null;
  es_estimado: boolean;
}

interface DiagnosticoVentaPerdida {
  tipo: string; // "ruptura_stock", "falta_exhibicion", "baja_demanda", "sin_diagnostico"
  confianza: number;
  descripcion: string;
  evidencia: string[];
}

interface HistorialProductoResponse {
  producto_id: string;
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string | null;
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  granularidad: string; // "diario" o "horario"
  datos: HistorialDataPoint[];
  total_ventas_periodo: number;
  promedio_diario_ventas: number;
  stock_promedio: number;
  stock_actual: number;
  dias_con_stock_cero: number;
  diagnostico: DiagnosticoVentaPerdida | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  ubicacionId: string;
  ubicacionNombre: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const formatFechaCorta = (fechaISO: string): string => {
  const fecha = new Date(fechaISO);
  // Detectar si es formato horario (tiene T y hora)
  if (fechaISO.includes('T')) {
    return fecha.toLocaleString('es-VE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return fecha.toLocaleString('es-VE', {
    month: 'short',
    day: 'numeric'
  });
};

const getDiagnosticoColor = (tipo: string): { bg: string; text: string; icon: string } => {
  switch (tipo) {
    case 'ruptura_stock':
      return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: '🚨' };
    case 'falta_exhibicion':
      return { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', icon: '📦' };
    case 'baja_demanda':
      return { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: '📉' };
    default:
      return { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', icon: '❓' };
  }
};

const getDiagnosticoTitulo = (tipo: string): string => {
  switch (tipo) {
    case 'ruptura_stock': return 'Ruptura de Stock';
    case 'falta_exhibicion': return 'Posible Falta de Exhibición';
    case 'baja_demanda': return 'Baja Demanda';
    default: return 'Diagnóstico No Determinado';
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProductoDetalleModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  ubicacionId,
  ubicacionNombre
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HistorialProductoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granularidad, setGranularidad] = useState<'diario' | 'horario'>('diario');
  const [dias, setDias] = useState(30);

  // Estados para zoom interactivo
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    if (isOpen && codigoProducto && ubicacionId) {
      loadData();
    }
  }, [isOpen, codigoProducto, ubicacionId, granularidad, dias]);

  // Reset zoom cuando cambian los datos
  useEffect(() => {
    setZoomLeft(null);
    setZoomRight(null);
    setRefAreaLeft('');
    setRefAreaRight('');
  }, [data, granularidad, dias]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const fechaFin = new Date().toISOString().split('T')[0];
      const fechaInicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response = await http.get(`/api/productos/${codigoProducto}/historial-ventas-inventario`, {
        params: {
          ubicacion_id: ubicacionId,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          granularidad,
          incluir_diagnostico: true
        }
      });
      setData(response.data);
    } catch (err) {
      console.error('Error cargando historial:', err);
      setError('Error al cargar los datos. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // Preparar datos para el gráfico
  const chartData = data?.datos.map((d) => ({
    fecha: d.fecha,
    fechaLabel: formatFechaCorta(d.fecha),
    ventas: d.ventas,
    inventario: d.inventario,
    timestamp: d.timestamp
  })) || [];

  // Datos filtrados por zoom
  const chartDataZoomed = useCallback(() => {
    if (!zoomLeft || !zoomRight) return chartData;

    const leftIndex = chartData.findIndex(d => d.fechaLabel === zoomLeft);
    const rightIndex = chartData.findIndex(d => d.fechaLabel === zoomRight);

    if (leftIndex === -1 || rightIndex === -1) return chartData;

    const start = Math.min(leftIndex, rightIndex);
    const end = Math.max(leftIndex, rightIndex);

    return chartData.slice(start, end + 1);
  }, [chartData, zoomLeft, zoomRight])();

  // Calcular dominio Y para ventas
  const calcularDominioYVentas = (): [number, number] => {
    const datos = chartDataZoomed;
    if (datos.length === 0) return [0, 10];

    const ventas = datos.map(d => d.ventas);
    const maxValue = Math.max(...ventas);
    return [0, Math.ceil(maxValue * 1.1) || 10];
  };

  // Calcular dominio Y para inventario
  const calcularDominioYInventario = (): [number, number] => {
    const datos = chartDataZoomed;
    if (datos.length === 0) return [0, 100];

    const inventarios = datos.map(d => d.inventario).filter((v): v is number => v !== null);
    if (inventarios.length === 0) return [0, 100];

    const minValue = Math.min(...inventarios);
    const maxValue = Math.max(...inventarios);
    const rango = maxValue - minValue;

    // Si hay zoom activo, ajustar para ver mejor la variación
    if (zoomLeft && zoomRight && rango > 0) {
      const margen = Math.max(rango * 0.2, 5);
      return [
        Math.max(0, Math.floor(minValue - margen)),
        Math.ceil(maxValue + margen)
      ];
    }

    return [0, Math.ceil(maxValue * 1.1) || 100];
  };

  // Handlers para selección de rango con mouse
  const handleMouseDown = (e: { activeLabel?: string }) => {
    if (e.activeLabel) {
      setRefAreaLeft(e.activeLabel);
      setIsSelecting(true);
    }
  };

  const handleMouseMove = (e: { activeLabel?: string }) => {
    if (isSelecting && e.activeLabel) {
      setRefAreaRight(e.activeLabel);
    }
  };

  const handleMouseUp = () => {
    if (refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight) {
      const leftIndex = chartData.findIndex(d => d.fechaLabel === refAreaLeft);
      const rightIndex = chartData.findIndex(d => d.fechaLabel === refAreaRight);

      if (leftIndex !== -1 && rightIndex !== -1) {
        const start = Math.min(leftIndex, rightIndex);
        const end = Math.max(leftIndex, rightIndex);

        if (end - start >= 1) {
          setZoomLeft(chartData[start].fechaLabel);
          setZoomRight(chartData[end].fechaLabel);
          // Cambiar a granularidad horaria cuando hacemos zoom
          if (granularidad === 'diario' && end - start <= 7) {
            setGranularidad('horario');
          }
        }
      }
    }

    setRefAreaLeft('');
    setRefAreaRight('');
    setIsSelecting(false);
  };

  // Reset zoom
  const resetZoom = () => {
    setZoomLeft(null);
    setZoomRight(null);
    setRefAreaLeft('');
    setRefAreaRight('');
    if (granularidad === 'horario') {
      setGranularidad('diario');
    }
  };

  const isZoomed = zoomLeft !== null && zoomRight !== null;
  const dominioYVentas = calcularDominioYVentas();
  const dominioYInventario = calcularDominioYInventario();

  // Custom Tooltip
  interface TooltipPayload {
    dataKey: string;
    name: string;
    value: number;
    color: string;
    payload: {
      fecha: string;
      fechaLabel: string;
      ventas: number;
      inventario: number | null;
    };
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-2">{d.fechaLabel}</p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
              Ventas: <span className="font-semibold text-blue-600">{formatNumber(d.ventas, 1)}</span> unidades
            </p>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-2"></span>
              Stock: <span className="font-semibold text-emerald-600">
                {d.inventario !== null ? formatInteger(d.inventario) : 'Sin datos'}
              </span>
              {d.inventario !== null && ' unidades'}
            </p>
          </div>
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
      <div className="relative w-full max-w-6xl max-h-[95vh] bg-white shadow-xl rounded-xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center">
                <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Detalle de Producto
              </h2>
              <p className="text-indigo-100 text-sm mt-1">
                {descripcionProducto} ({codigoProducto})
              </p>
              <p className="text-indigo-200 text-xs mt-0.5">
                {ubicacionNombre}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-indigo-200 transition-colors"
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            </div>
          ) : data ? (
            <div className="p-6 space-y-6">
              {/* Diagnóstico */}
              {data.diagnostico && (
                <div className={`rounded-xl p-5 border-2 ${getDiagnosticoColor(data.diagnostico.tipo).bg}`}>
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{getDiagnosticoColor(data.diagnostico.tipo).icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-lg font-bold ${getDiagnosticoColor(data.diagnostico.tipo).text}`}>
                          {getDiagnosticoTitulo(data.diagnostico.tipo)}
                        </h3>
                        <span className={`text-sm font-medium px-3 py-1 rounded-full ${getDiagnosticoColor(data.diagnostico.tipo).bg} ${getDiagnosticoColor(data.diagnostico.tipo).text}`}>
                          {data.diagnostico.confianza.toFixed(0)}% confianza
                        </span>
                      </div>
                      <p className={`mt-1 ${getDiagnosticoColor(data.diagnostico.tipo).text}`}>
                        {data.diagnostico.descripcion}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {data.diagnostico.evidencia.map((ev, i) => (
                          <span key={i} className="text-xs bg-white/50 px-2 py-1 rounded-full">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* KPIs */}
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <p className="text-xs font-medium text-blue-600">Total Ventas</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {formatNumber(data.total_ventas_periodo, 1)}
                  </p>
                  <p className="text-xs text-blue-500">en {dias} días</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                  <p className="text-xs font-medium text-indigo-600">Promedio Diario</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-1">
                    {formatNumber(data.promedio_diario_ventas, 2)}
                  </p>
                  <p className="text-xs text-indigo-500">unidades/día</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                  <p className="text-xs font-medium text-emerald-600">Stock Actual</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {formatInteger(data.stock_actual)}
                  </p>
                  <p className="text-xs text-emerald-500">unidades</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <p className="text-xs font-medium text-purple-600">Stock Promedio</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    {formatNumber(data.stock_promedio, 1)}
                  </p>
                  <p className="text-xs text-purple-500">en el período</p>
                </div>
                <div className={`rounded-xl p-4 border ${data.dias_con_stock_cero > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`text-xs font-medium ${data.dias_con_stock_cero > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Días Stock Cero
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${data.dias_con_stock_cero > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {data.dias_con_stock_cero}
                  </p>
                  <p className={`text-xs ${data.dias_con_stock_cero > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {data.dias_con_stock_cero > 0 ? 'días sin inventario' : 'sin rupturas'}
                  </p>
                </div>
              </div>

              {/* Controles del gráfico */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Período:</label>
                    <select
                      value={dias}
                      onChange={(e) => setDias(Number(e.target.value))}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="7">7 días</option>
                      <option value="14">14 días</option>
                      <option value="30">30 días</option>
                      <option value="60">60 días</option>
                      <option value="90">90 días</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Granularidad:</label>
                    <select
                      value={granularidad}
                      onChange={(e) => setGranularidad(e.target.value as 'diario' | 'horario')}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="diario">Diario</option>
                      <option value="horario">Por hora</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isZoomed && (
                    <button
                      onClick={resetZoom}
                      className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Ver todo
                    </button>
                  )}
                  <span className="text-xs text-gray-500">
                    💡 Arrastra en el gráfico para hacer zoom
                  </span>
                </div>
              </div>

              {/* Gráfico combinado */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Ventas vs Inventario
                    {isZoomed && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                        Zoom activo ({chartDataZoomed.length} puntos)
                      </span>
                    )}
                  </h3>
                </div>

                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart
                    data={chartDataZoomed}
                    margin={{ top: 20, right: 60, left: 20, bottom: 80 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="fechaLabel"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval={chartDataZoomed.length <= 15 ? 0 : Math.ceil(chartDataZoomed.length / 12)}
                    />
                    <YAxis
                      yAxisId="ventas"
                      orientation="left"
                      tick={{ fontSize: 11, fill: '#3b82f6' }}
                      domain={dominioYVentas}
                      tickFormatter={(value) => formatInteger(value)}
                      label={{ value: 'Ventas', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 12 }}
                    />
                    <YAxis
                      yAxisId="inventario"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#10b981' }}
                      domain={dominioYInventario}
                      tickFormatter={(value) => formatInteger(value)}
                      label={{ value: 'Inventario', angle: 90, position: 'insideRight', fill: '#10b981', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(value) => <span className="text-sm text-gray-600">{value}</span>}
                    />

                    {/* Barras de ventas */}
                    <Bar
                      yAxisId="ventas"
                      dataKey="ventas"
                      name="Ventas (unidades)"
                      fill="#3b82f6"
                      fillOpacity={0.7}
                      radius={[2, 2, 0, 0]}
                    />

                    {/* Línea de inventario */}
                    <Line
                      yAxisId="inventario"
                      type="monotone"
                      dataKey="inventario"
                      name="Inventario (unidades)"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 3 }}
                      activeDot={{ r: 6, fill: '#059669' }}
                      connectNulls
                    />

                    {/* Área de selección para zoom */}
                    {refAreaLeft && refAreaRight && (
                      <ReferenceArea
                        x1={refAreaLeft}
                        x2={refAreaRight}
                        strokeOpacity={0.3}
                        fill="#6366f1"
                        fillOpacity={0.2}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>

                {/* Leyenda explicativa */}
                <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-3 bg-blue-500 rounded opacity-70"></div>
                    <span>Ventas: Unidades vendidas por período</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-emerald-500"></div>
                    <span>Inventario: Stock al final del período</span>
                  </div>
                </div>
              </div>

              {/* Interpretación */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-indigo-100">
                <h4 className="text-sm font-semibold text-indigo-800 mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Cómo interpretar este gráfico
                </h4>
                <ul className="text-xs text-indigo-700 space-y-1">
                  <li>• <strong>Caída de inventario + caída de ventas:</strong> Posible ruptura de stock - el producto se agotó</li>
                  <li>• <strong>Inventario estable + ventas bajas:</strong> Posible falta de exhibición o problema de demanda</li>
                  <li>• <strong>Picos de inventario:</strong> Reposiciones o entradas de mercancía</li>
                  <li>• <strong>Usa el zoom</strong> para ver el detalle por hora y encontrar el momento exacto del problema</li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
