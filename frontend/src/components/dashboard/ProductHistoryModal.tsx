import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';
import { formatInteger } from '../../utils/formatNumber';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceArea } from 'recharts';

interface HistorySnapshot {
  fecha_snapshot: string;
  ubicacion_id: string;
  ubicacion_nombre: string;
  almacen_codigo: string | null;
  cantidad: number;
  es_actual: boolean;
}

interface HistoryResponse {
  codigo_producto: string;
  ubicacion_id: string | null;
  almacen_codigo: string | null;
  dias: number;
  total_snapshots: number;
  historico: HistorySnapshot[];
}

interface ReconciliacionPeriodo {
  fecha_inicio: string;
  fecha_fin: string;
  almacen_codigo: string | null;
  stock_inicio: number;
  stock_fin: number;
  cambio_inventario: number;
  ventas: number;
  diferencia: number;
}

interface ReconciliacionResponse {
  codigo_producto: string;
  ubicacion_id: string;
  almacen_codigo: string | null;
  horas: number;
  total_periodos: number;
  resumen: {
    total_ventas: number;
    total_cambio_inventario: number;
    total_diferencia: number;
  };
  periodos: ReconciliacionPeriodo[];
}

interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  ubicacionId?: string;
  almacenCodigo?: string;
}

export default function ProductHistoryModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  ubicacionId,
  almacenCodigo,
}: ProductHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [reconciliacionData, setReconciliacionData] = useState<ReconciliacionResponse | null>(null);
  const [loadingReconciliacion, setLoadingReconciliacion] = useState(false);
  const [dias, setDias] = useState(1);
  const [ocultarNoche, setOcultarNoche] = useState(true); // Por defecto ocultar horario nocturno
  const [mostrarReconciliacion, setMostrarReconciliacion] = useState(false);

  // Estados para zoom interactivo
  const [zoomLeft, setZoomLeft] = useState<string | null>(null);
  const [zoomRight, setZoomRight] = useState<string | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    if (isOpen && codigoProducto) {
      loadHistory();
      if (ubicacionId) {
        loadReconciliacion();
      }
    }
  }, [isOpen, codigoProducto, ubicacionId, almacenCodigo, dias]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { dias: dias.toString() };
      if (ubicacionId) params.ubicacion_id = ubicacionId;
      if (almacenCodigo) params.almacen_codigo = almacenCodigo;

      const response = await http.get(`/api/productos/${codigoProducto}/historico-inventario`, { params });
      setHistoryData(response.data);
    } catch (error) {
      console.error('Error cargando histórico:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReconciliacion = async () => {
    if (!ubicacionId) return;

    try {
      setLoadingReconciliacion(true);
      const horas = dias * 24; // Convertir días a horas
      const params: Record<string, string> = {
        ubicacion_id: ubicacionId,
        horas: horas.toString()
      };
      if (almacenCodigo) params.almacen_codigo = almacenCodigo;

      const response = await http.get(`/api/productos/${codigoProducto}/reconciliacion-inventario`, { params });
      setReconciliacionData(response.data);
    } catch (error) {
      console.error('Error cargando reconciliación:', error);
      setReconciliacionData(null);
    } finally {
      setLoadingReconciliacion(false);
    }
  };

  const formatFecha = (fechaISO: string): string => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFechaCorta = (fechaISO: string): string => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleString('es-VE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Función para verificar si una hora está en horario nocturno (10pm - 6am)
  const esHorarioNocturno = (fechaISO: string): boolean => {
    const fecha = new Date(fechaISO);
    const hora = fecha.getHours();
    return hora >= 22 || hora < 6; // 10pm a 6am
  };

  // Filtrar datos según el toggle de horario nocturno
  const datosFiltrados = historyData?.historico?.filter((snap) => {
    if (!ocultarNoche) return true; // Mostrar todo si el toggle está desactivado
    // Siempre mostrar el actual, nunca filtrar snapshots nocturnos
    return snap.es_actual || !esHorarioNocturno(snap.fecha_snapshot);
  }) || [];

  // Contar cuántos snapshots nocturnos hay ocultos
  const snapshotsNocturnos = (historyData?.historico?.filter((snap) =>
    !snap.es_actual && esHorarioNocturno(snap.fecha_snapshot)
  ) || []).length;

  // Preparar datos para la gráfica (los datos ya vienen ordenados por fecha ASC desde el backend)
  const chartData = datosFiltrados
    .map((snap) => ({
      fecha: snap.es_actual ? `${formatFechaCorta(snap.fecha_snapshot)} (Actual)` : formatFechaCorta(snap.fecha_snapshot),
      cantidad: snap.cantidad,
      fechaCompleta: formatFecha(snap.fecha_snapshot),
      esActual: snap.es_actual,
    }));

  // Calcular estadísticas de cambio
  const calcularCambio = () => {
    if (chartData.length < 2) return null;
    const inicial = chartData[0].cantidad;
    const final = chartData[chartData.length - 1].cantidad;
    const diferencia = final - inicial;
    const porcentaje = inicial !== 0 ? ((diferencia / inicial) * 100) : 0;
    return { inicial, final, diferencia, porcentaje };
  };

  // Reset zoom cuando cambian los datos
  useEffect(() => {
    setZoomLeft(null);
    setZoomRight(null);
    setRefAreaLeft('');
    setRefAreaRight('');
  }, [historyData, dias, ocultarNoche]);

  // Datos filtrados por zoom
  const chartDataZoomed = useCallback(() => {
    if (!zoomLeft || !zoomRight) return chartData;

    const leftIndex = chartData.findIndex(d => d.fecha === zoomLeft);
    const rightIndex = chartData.findIndex(d => d.fecha === zoomRight);

    if (leftIndex === -1 || rightIndex === -1) return chartData;

    const start = Math.min(leftIndex, rightIndex);
    const end = Math.max(leftIndex, rightIndex);

    return chartData.slice(start, end + 1);
  }, [chartData, zoomLeft, zoomRight])();

  // Calcular dominio Y para datos con zoom
  const calcularDominioYZoom = (): [number, number] => {
    const data = chartDataZoomed;
    if (data.length === 0) return [0, 100];

    const cantidades = data.map(d => d.cantidad);
    const minValue = Math.min(...cantidades);
    const maxValue = Math.max(...cantidades);
    const rango = maxValue - minValue;

    // Siempre ajustar para ver mejor la variación cuando hay zoom
    if (zoomLeft && zoomRight) {
      const margen = Math.max(rango * 0.2, maxValue * 0.02, 5);
      return [
        Math.max(0, Math.floor(minValue - margen)),
        Math.ceil(maxValue + margen)
      ];
    }

    // Sin zoom: comportamiento original
    if (rango < maxValue * 0.1 && rango > 0) {
      const margen = rango * 0.5;
      return [
        Math.max(0, Math.floor(minValue - margen)),
        Math.ceil(maxValue + margen)
      ];
    }

    if (rango === 0) {
      const margen = maxValue * 0.05 || 10;
      return [Math.max(0, Math.floor(minValue - margen)), Math.ceil(maxValue + margen)];
    }

    return [0, Math.ceil(maxValue * 1.05)];
  };

  // Auto-zoom: detecta el rango con mayor variación
  const autoZoomVariacion = () => {
    if (chartData.length < 3) return;

    // Encontrar el punto donde hay un cambio significativo (>20% del rango total)
    const cantidades = chartData.map(d => d.cantidad);
    const rangoTotal = Math.max(...cantidades) - Math.min(...cantidades);

    if (rangoTotal === 0) return;

    // Buscar el último cambio grande (entrada de mercancía)
    let lastBigChangeIndex = 0;
    for (let i = 1; i < chartData.length; i++) {
      const cambio = Math.abs(cantidades[i] - cantidades[i - 1]);
      if (cambio > rangoTotal * 0.2) {
        lastBigChangeIndex = i;
      }
    }

    // Hacer zoom desde el último cambio grande hasta el final
    if (lastBigChangeIndex > 0 && lastBigChangeIndex < chartData.length - 1) {
      setZoomLeft(chartData[lastBigChangeIndex].fecha);
      setZoomRight(chartData[chartData.length - 1].fecha);
    }
  };

  // Reset zoom
  const resetZoom = () => {
    setZoomLeft(null);
    setZoomRight(null);
    setRefAreaLeft('');
    setRefAreaRight('');
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
      // Ordenar los puntos
      const leftIndex = chartData.findIndex(d => d.fecha === refAreaLeft);
      const rightIndex = chartData.findIndex(d => d.fecha === refAreaRight);

      if (leftIndex !== -1 && rightIndex !== -1) {
        const start = Math.min(leftIndex, rightIndex);
        const end = Math.max(leftIndex, rightIndex);

        // Solo zoom si seleccionó al menos 2 puntos
        if (end - start >= 1) {
          setZoomLeft(chartData[start].fecha);
          setZoomRight(chartData[end].fecha);
        }
      }
    }

    setRefAreaLeft('');
    setRefAreaRight('');
    setIsSelecting(false);
  };

  const dominioY = calcularDominioYZoom();
  const cambioStats = calcularCambio();
  const isZoomed = zoomLeft !== null && zoomRight !== null;

  // Renderizar etiqueta personalizada para cada punto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCustomLabel = (props: any) => {
    const { x, y, value, index } = props;
    if (x === undefined || y === undefined || value === undefined || index === undefined) return null;

    const totalPoints = chartDataZoomed.length;
    const isLast = index === totalPoints - 1;

    // Determinar si mostrar la etiqueta:
    // - Siempre mostrar si hay <= 20 puntos
    // - Si hay más, mostrar cada N puntos para evitar solapamiento
    const showEveryN = totalPoints <= 20 ? 1 : Math.ceil(totalPoints / 15);
    const shouldShow = isLast || index % showEveryN === 0;

    if (!shouldShow) return null;

    return (
      <text
        x={x}
        y={Number(y) - 10}
        fill={isLast ? '#10b981' : '#3b82f6'}
        fontSize={11}
        fontWeight={isLast ? 'bold' : 'normal'}
        textAnchor="middle"
      >
        {formatInteger(value)}
      </text>
    );
  };

  // Custom dot para diferenciar el punto actual
  const CustomDot = (props: { cx: number; cy: number; payload: { cantidad: number; esActual: boolean }}) => {
    const { cx, cy, payload } = props;
    if (payload.esActual) {
      return <circle cx={cx} cy={cy} r={6} fill="#10b981" stroke="#fff" strokeWidth={2} />;
    }
    return <circle cx={cx} cy={cy} r={3} fill="#3b82f6" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Histórico de Inventario</h2>
            <p className="text-sm text-gray-600 mt-1">
              {descripcionProducto} ({codigoProducto})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Período:</label>
              <select
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">Últimas 24 horas</option>
                <option value="2">Últimos 2 días</option>
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 90 días</option>
              </select>
              {historyData && (
                <span className="text-sm text-gray-600">
                  {chartData.length} de {historyData.total_snapshots} snapshots
                </span>
              )}
            </div>

            {/* Toggle para ocultar horario nocturno */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setOcultarNoche(!ocultarNoche)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ocultarNoche ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    ocultarNoche ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">
                Solo horario laboral (6am-10pm)
              </span>
              {ocultarNoche && snapshotsNocturnos > 0 && (
                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                  {snapshotsNocturnos} nocturnos ocultos
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Cargando histórico...</div>
            </div>
          ) : historyData && historyData.historico.length > 0 ? (
            <div className="space-y-6">
              {/* Gráfica */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">Evolución del Inventario</h3>
                    {isZoomed && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                        Zoom activo ({chartDataZoomed.length} puntos)
                      </span>
                    )}
                  </div>
                  {cambioStats && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-500">
                        Inicio: <span className="font-medium text-gray-700">{formatInteger(cambioStats.inicial)}</span>
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-500">
                        Actual: <span className="font-medium text-green-600">{formatInteger(cambioStats.final)}</span>
                      </span>
                      <span className={`font-semibold px-2 py-0.5 rounded ${
                        cambioStats.diferencia < 0
                          ? 'bg-red-100 text-red-700'
                          : cambioStats.diferencia > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {cambioStats.diferencia > 0 ? '+' : ''}{formatInteger(cambioStats.diferencia)}
                        {' '}({cambioStats.porcentaje > 0 ? '+' : ''}{cambioStats.porcentaje.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* Controles de zoom */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={autoZoomVariacion}
                    disabled={chartData.length < 3}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Auto-zoom variación
                  </button>
                  {isZoomed && (
                    <button
                      onClick={resetZoom}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Ver todo
                    </button>
                  )}
                  <span className="text-xs text-gray-500 ml-2">
                    💡 Arrastra en el gráfico para hacer zoom manual
                  </span>
                </div>

                <ResponsiveContainer width="100%" height={350}>
                  <LineChart
                    data={chartDataZoomed}
                    margin={{ top: 25, right: 30, left: 20, bottom: 80 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval={chartDataZoomed.length <= 20 ? 0 : Math.ceil(chartDataZoomed.length / 12)}
                      allowDataOverflow
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      domain={dominioY}
                      tickFormatter={(value) => formatInteger(value)}
                      allowDataOverflow
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                      labelFormatter={(value) => `Fecha: ${value}`}
                      formatter={(value: number) => [formatInteger(value), 'Cantidad']}
                    />
                    <Line
                      type="monotone"
                      dataKey="cantidad"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={<CustomDot cx={0} cy={0} payload={{ cantidad: 0, esActual: false }} />}
                      activeDot={{ r: 8 }}
                      name="Cantidad en Stock"
                    >
                      <LabelList dataKey="cantidad" content={renderCustomLabel} />
                    </Line>
                    {refAreaLeft && refAreaRight && (
                      <ReferenceArea
                        x1={refAreaLeft}
                        x2={refAreaRight}
                        strokeOpacity={0.3}
                        fill="#3b82f6"
                        fillOpacity={0.2}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Reconciliación Inventario vs Ventas */}
              {ubicacionId && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between cursor-pointer"
                    onClick={() => setMostrarReconciliacion(!mostrarReconciliacion)}
                  >
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <h3 className="text-lg font-semibold text-gray-900">Reconciliación: Inventario vs Ventas</h3>
                      {reconciliacionData && reconciliacionData.periodos.length > 0 && (
                        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                          reconciliacionData.resumen.total_diferencia === 0
                            ? 'bg-green-100 text-green-700'
                            : Math.abs(reconciliacionData.resumen.total_diferencia) < 5
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {reconciliacionData.resumen.total_diferencia === 0
                            ? '✓ Cuadrado'
                            : reconciliacionData.resumen.total_diferencia > 0
                              ? `+${formatInteger(reconciliacionData.resumen.total_diferencia)} entrada`
                              : `${formatInteger(reconciliacionData.resumen.total_diferencia)} diferencia`
                          }
                        </span>
                      )}
                    </div>
                    <svg
                      className={`h-5 w-5 text-gray-500 transition-transform ${mostrarReconciliacion ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {mostrarReconciliacion && (
                    <div className="p-4">
                      {loadingReconciliacion ? (
                        <div className="text-center py-4 text-gray-500">Cargando reconciliación...</div>
                      ) : reconciliacionData && reconciliacionData.periodos.length > 0 ? (
                        <>
                          {/* Resumen */}
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="bg-blue-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-blue-600 font-medium">Total Vendido</p>
                              <p className="text-xl font-bold text-blue-700">{formatInteger(reconciliacionData.resumen.total_ventas)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-600 font-medium">Cambio Inventario</p>
                              <p className={`text-xl font-bold ${reconciliacionData.resumen.total_cambio_inventario < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {reconciliacionData.resumen.total_cambio_inventario > 0 ? '+' : ''}{formatInteger(reconciliacionData.resumen.total_cambio_inventario)}
                              </p>
                            </div>
                            <div className={`rounded-lg p-3 text-center ${
                              reconciliacionData.resumen.total_diferencia === 0
                                ? 'bg-green-50'
                                : Math.abs(reconciliacionData.resumen.total_diferencia) < 5
                                  ? 'bg-yellow-50'
                                  : 'bg-red-50'
                            }`}>
                              <p className="text-xs text-gray-600 font-medium">Diferencia</p>
                              <p className={`text-xl font-bold ${
                                reconciliacionData.resumen.total_diferencia === 0
                                  ? 'text-green-600'
                                  : reconciliacionData.resumen.total_diferencia > 0
                                    ? 'text-blue-600'
                                    : 'text-red-600'
                              }`}>
                                {reconciliacionData.resumen.total_diferencia > 0 ? '+' : ''}{formatInteger(reconciliacionData.resumen.total_diferencia)}
                              </p>
                            </div>
                          </div>

                          {/* Tabla de períodos */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Período</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Stock Inicio</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Stock Fin</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Δ Inventario</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Ventas</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Diferencia</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {reconciliacionData.periodos.map((periodo, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                                      {formatFechaCorta(periodo.fecha_inicio)} → {formatFechaCorta(periodo.fecha_fin)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">{formatInteger(periodo.stock_inicio)}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{formatInteger(periodo.stock_fin)}</td>
                                    <td className={`px-3 py-2 text-right font-medium ${periodo.cambio_inventario < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      {periodo.cambio_inventario > 0 ? '+' : ''}{formatInteger(periodo.cambio_inventario)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-blue-600 font-medium">{formatInteger(periodo.ventas)}</td>
                                    <td className={`px-3 py-2 text-right font-bold ${
                                      periodo.diferencia === 0
                                        ? 'text-green-600'
                                        : periodo.diferencia > 0
                                          ? 'text-blue-600'
                                          : 'text-red-600'
                                    }`}>
                                      {periodo.diferencia > 0 ? '+' : ''}{formatInteger(periodo.diferencia)}
                                      {periodo.diferencia === 0 && ' ✓'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Leyenda */}
                          <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-4">
                            <span><span className="text-green-600 font-medium">Diferencia = 0:</span> Inventario cuadra con ventas</span>
                            <span><span className="text-blue-600 font-medium">Diferencia &gt; 0:</span> Entrada de mercancía o ajuste</span>
                            <span><span className="text-red-600 font-medium">Diferencia &lt; 0:</span> Posible merma o error</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          <p>No hay datos de reconciliación disponibles</p>
                          <p className="text-xs mt-1">Se requieren al menos 2 snapshots de inventario</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tabla */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-lg font-semibold text-gray-900">Detalle de Snapshots</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Ubicación
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Almacén
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Cantidad
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {datosFiltrados.map((snapshot, index) => (
                        <tr
                          key={index}
                          className={`hover:bg-gray-50 transition-colors ${snapshot.es_actual ? 'bg-green-50' : ''}`}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="flex items-center gap-2">
                              {formatFecha(snapshot.fecha_snapshot)}
                              {snapshot.es_actual && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Actual
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {snapshot.ubicacion_nombre}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {snapshot.almacen_codigo || '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm font-semibold text-right ${snapshot.es_actual ? 'text-green-700' : 'text-gray-900'}`}>
                            {formatInteger(snapshot.cantidad)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <svg className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No hay datos históricos disponibles para este producto</p>
              <p className="text-sm mt-1">Los snapshots se generan cada vez que se ejecuta el ETL de inventario</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
