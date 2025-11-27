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

  // Preparar datos para la gráfica (los datos ya vienen ordenados por fecha ASC desde el backend)
  const chartData = historyData?.historico
    ?.map((snap) => ({
      fecha: snap.es_actual ? `${formatFechaCorta(snap.fecha_snapshot)} (Actual)` : formatFechaCorta(snap.fecha_snapshot),
      cantidad: snap.cantidad,
      fechaCompleta: formatFecha(snap.fecha_snapshot),
      esActual: snap.es_actual,
    })) || [];

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
                {historyData.total_snapshots} snapshots encontrados
              </span>
            )}
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Evolución del Inventario</h3>
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
                    <YAxis tick={{ fontSize: 12 }} />
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
                      {historyData.historico.map((snapshot, index) => (
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
