import { useState, useEffect } from 'react';
import http from '../../services/http';
import { formatInteger } from '../../utils/formatNumber';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

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
  const [dias, setDias] = useState(1);
  const [ocultarNoche, setOcultarNoche] = useState(true); // Por defecto ocultar horario nocturno

  useEffect(() => {
    if (isOpen && codigoProducto) {
      loadHistory();
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

  // Calcular dominio del eje Y para mejor visualización
  const calcularDominioY = (): [number, number] => {
    if (chartData.length === 0) return [0, 100];

    const cantidades = chartData.map(d => d.cantidad);
    const minValue = Math.min(...cantidades);
    const maxValue = Math.max(...cantidades);
    const rango = maxValue - minValue;

    // Si la variación es menor al 10% del máximo, ajustar escala para ver mejor los cambios
    if (rango < maxValue * 0.1 && rango > 0) {
      const margen = rango * 0.5; // 50% de margen arriba y abajo del rango
      return [
        Math.max(0, Math.floor(minValue - margen)),
        Math.ceil(maxValue + margen)
      ];
    }

    // Si no hay variación o es muy poca, mostrar margen del 5%
    if (rango === 0) {
      const margen = maxValue * 0.05 || 10;
      return [Math.max(0, Math.floor(minValue - margen)), Math.ceil(maxValue + margen)];
    }

    // Variación normal: empezar desde 0 o un poco por debajo del mínimo
    return [0, Math.ceil(maxValue * 1.05)];
  };

  // Calcular estadísticas de cambio
  const calcularCambio = () => {
    if (chartData.length < 2) return null;
    const inicial = chartData[0].cantidad;
    const final = chartData[chartData.length - 1].cantidad;
    const diferencia = final - inicial;
    const porcentaje = inicial !== 0 ? ((diferencia / inicial) * 100) : 0;
    return { inicial, final, diferencia, porcentaje };
  };

  const dominioY = calcularDominioY();
  const cambioStats = calcularCambio();

  // Renderizar etiqueta personalizada para cada punto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCustomLabel = (props: any) => {
    const { x, y, value, index } = props;
    if (x === undefined || y === undefined || value === undefined || index === undefined) return null;

    const totalPoints = chartData.length;
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
                  <h3 className="text-lg font-semibold text-gray-900">Evolución del Inventario</h3>
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
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={chartData} margin={{ top: 25, right: 30, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval={chartData.length <= 20 ? 0 : Math.ceil(chartData.length / 12)}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      domain={dominioY}
                      tickFormatter={(value) => formatInteger(value)}
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
                  </LineChart>
                </ResponsiveContainer>
              </div>

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
