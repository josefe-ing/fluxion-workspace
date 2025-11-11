import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  getProductoDetalleCompleto,
  getVentasSemanales,
  getHistoricoClasificacion,
  ProductoDetalleCompleto,
  VentasSemanalesResponse,
  HistoricoClasificacionResponse,
  formatCurrency,
  getIconoMatriz,
  getDescripcionMatriz,
  getEstrategiaMatriz
} from '../../services/productosService';
import ClasificacionHistoricoChart from './charts/ClasificacionHistoricoChart';

interface ProductoDetalleModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigo: string;
}

const ProductoDetalleModal: React.FC<ProductoDetalleModalProps> = ({ isOpen, onClose, codigo }) => {
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<ProductoDetalleCompleto | null>(null);
  const [ventasSemanales, setVentasSemanales] = useState<VentasSemanalesResponse | null>(null);
  const [historico, setHistorico] = useState<HistoricoClasificacionResponse | null>(null);
  const [loadingVentas, setLoadingVentas] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(true);

  useEffect(() => {
    if (isOpen && codigo) {
      loadData();
    }
  }, [isOpen, codigo]);

  const loadData = async () => {
    setLoading(true);
    setLoadingVentas(true);
    setLoadingHistorico(true);
    try {
      // Load product details, sales data, and historico in parallel
      const [detalleData, ventasData, historicoData] = await Promise.all([
        getProductoDetalleCompleto(codigo),
        getVentasSemanales(codigo),
        getHistoricoClasificacion(codigo)
      ]);
      setDetalle(detalleData);
      setVentasSemanales(ventasData);
      setHistorico(historicoData);
    } catch (error) {
      console.error('Error loading producto detalle:', error);
    } finally {
      setLoading(false);
      setLoadingVentas(false);
      setLoadingHistorico(false);
    }
  };

  // Calculate insights based on classifications
  const getInsights = () => {
    if (!detalle || !ventasSemanales) return [];

    const insights: { type: 'info' | 'warning' | 'success' | 'error'; text: string }[] = [];

    // Get most common classification
    const clasificacionCounts: Record<string, number> = {};
    detalle.clasificaciones.forEach(c => {
      const matriz = c.matriz || `${c.clasificacion_abc}${c.clasificacion_xyz}`;
      clasificacionCounts[matriz] = (clasificacionCounts[matriz] || 0) + 1;
    });

    const mostCommonMatriz = Object.entries(clasificacionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    if (mostCommonMatriz) {
      const abc = mostCommonMatriz[0];
      const xyz = mostCommonMatriz[1];

      // ABC insights
      if (abc === 'A') {
        insights.push({
          type: 'success',
          text: `Clasificación A: Este producto es de alta rotación y representa un alto porcentaje del valor de ventas. Mantener stock óptimo es crítico.`
        });
      } else if (abc === 'B') {
        insights.push({
          type: 'info',
          text: `Clasificación B: Este producto tiene rotación media. Revisar periódicamente para optimizar costos.`
        });
      } else if (abc === 'C') {
        insights.push({
          type: 'warning',
          text: `Clasificación C: Este producto tiene baja rotación. Considerar si es necesario mantener en inventario.`
        });
      }

      // XYZ insights with CV
      const cv = ventasSemanales.metricas.coeficiente_variacion;
      if (xyz === 'X' && cv !== null) {
        insights.push({
          type: 'success',
          text: `Clasificación X (CV: ${cv.toFixed(2)}): Demanda estable y predecible. Ideal para planificación de inventario.`
        });
      } else if (xyz === 'Y' && cv !== null) {
        insights.push({
          type: 'info',
          text: `Clasificación Y (CV: ${cv.toFixed(2)}): Demanda variable. Incrementar frecuencia de revisión y ajustar según temporalidad.`
        });
      } else if (xyz === 'Z' && cv !== null) {
        insights.push({
          type: 'warning',
          text: `Clasificación Z (CV: ${cv.toFixed(2)}): Demanda errática e impredecible. Considerar stock de seguridad alto o proveedores alternativos.`
        });
      }

      // Strategy recommendation
      const estrategia = getEstrategiaMatriz(mostCommonMatriz);
      insights.push({
        type: 'info',
        text: `Estrategia recomendada: ${estrategia}`
      });
    }

    // Stock insights
    const sinStock = detalle.metricas_globales.ubicaciones_sin_stock;
    const totalUbicaciones = detalle.metricas_globales.total_ubicaciones;
    if (sinStock > totalUbicaciones * 0.5) {
      insights.push({
        type: 'error',
        text: `Alerta: ${sinStock} de ${totalUbicaciones} ubicaciones están sin stock. Revisar urgentemente.`
      });
    } else if (sinStock > 0) {
      insights.push({
        type: 'warning',
        text: `${sinStock} ubicaciones sin stock. Considerar redistribución o reabastecimiento.`
      });
    }

    return insights;
  };

  // Calculate trend based on recent weeks
  const getTrend = (semanas: typeof ventasSemanales.semanas) => {
    if (semanas.length < 8) return '→';

    const recent4 = semanas.slice(-4).reduce((sum, s) => sum + s.unidades, 0) / 4;
    const previous4 = semanas.slice(-8, -4).reduce((sum, s) => sum + s.unidades, 0) / 4;

    if (recent4 > previous4 * 1.1) return '↑';
    if (recent4 < previous4 * 0.9) return '↓';
    return '→';
  };

  if (!isOpen) return null;

  const insights = getInsights();
  const trend = ventasSemanales ? getTrend(ventasSemanales.semanas) : '→';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {detalle?.producto.codigo} - {detalle?.producto.descripcion}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {detalle?.producto.categoria} {detalle?.producto.marca && `• ${detalle.producto.marca}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Métricas Globales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium">Total Stock</div>
                <div className="text-2xl font-bold text-blue-900 mt-1">
                  {detalle?.metricas_globales.total_inventario.toFixed(0)}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium">Con Stock</div>
                <div className="text-2xl font-bold text-green-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_con_stock}/{detalle?.metricas_globales.total_ubicaciones}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">Sin Stock</div>
                <div className="text-2xl font-bold text-red-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_sin_stock}/{detalle?.metricas_globales.total_ubicaciones}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm text-purple-600 font-medium">Tendencia</div>
                <div className="text-4xl font-bold text-purple-900 mt-1 text-center">
                  {trend}
                </div>
              </div>
            </div>

            {/* Insights Panel */}
            {insights.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  💡 Insights y Recomendaciones
                </h3>
                <div className="space-y-3">
                  {insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg ${
                        insight.type === 'success' ? 'bg-green-50 border border-green-200' :
                        insight.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                        insight.type === 'error' ? 'bg-red-50 border border-red-200' :
                        'bg-blue-50 border border-blue-200'
                      }`}
                    >
                      <span className="text-lg">
                        {insight.type === 'success' ? '✅' :
                         insight.type === 'warning' ? '⚠️' :
                         insight.type === 'error' ? '🚨' :
                         'ℹ️'}
                      </span>
                      <p className={`text-sm flex-1 ${
                        insight.type === 'success' ? 'text-green-800' :
                        insight.type === 'warning' ? 'text-yellow-800' :
                        insight.type === 'error' ? 'text-red-800' :
                        'text-blue-800'
                      }`}>
                        {insight.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sales Chart */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Ventas Semanales - Últimas 52 Semanas
                </h3>
                {ventasSemanales && (
                  <p className="text-sm text-gray-500 mt-1">
                    Promedio semanal: {ventasSemanales.metricas.promedio_semanal.toFixed(0)} unidades
                    {ventasSemanales.metricas.coeficiente_variacion !== null && (
                      <> • CV: {ventasSemanales.metricas.coeficiente_variacion.toFixed(2)}</>
                    )}
                  </p>
                )}
              </div>
              <div className="p-6">
                {loadingVentas ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : ventasSemanales && ventasSemanales.semanas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={ventasSemanales.semanas}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="semana"
                        tick={{ fontSize: 11 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        label={{ value: 'Unidades', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
                                <p className="font-semibold text-gray-900">{data.semana}</p>
                                <p className="text-sm text-blue-600">Unidades: {data.unidades.toFixed(0)}</p>
                                <p className="text-sm text-green-600">Valor: {formatCurrency(data.valor)}</p>
                                <p className="text-sm text-gray-500">Promedio diario: {data.promedio_diario.toFixed(1)}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="unidades"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name="Unidades vendidas"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    No hay datos de ventas disponibles para este producto
                  </div>
                )}
              </div>
            </div>

            {/* Histórico de Clasificación */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Histórico de Clasificación ABC-XYZ
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Evolución de la clasificación del producto en los últimos meses
                </p>
              </div>
              <div className="p-6">
                {loadingHistorico ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : historico ? (
                  <ClasificacionHistoricoChart historico={historico} />
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    No hay datos históricos disponibles para este producto
                  </div>
                )}
              </div>
            </div>

            {/* Enriched Table with Demand Metrics */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Análisis por Tienda
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Clasificación ABC-XYZ, inventario y métricas de demanda por ubicación
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matriz</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ranking</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CV</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detalle?.inventarios.map((inv) => {
                      const clasif = detalle.clasificaciones.find((c) => c.ubicacion_id === inv.ubicacion_id);
                      const matriz = clasif?.matriz || (clasif ? `${clasif.clasificacion_abc}${clasif.clasificacion_xyz}` : '');

                      return (
                        <tr key={inv.ubicacion_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {inv.ubicacion_nombre}
                            <span className="ml-2 text-xs text-gray-500">
                              ({inv.tipo_ubicacion})
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {clasif && (
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getIconoMatriz(matriz)}</span>
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  clasif.clasificacion_abc === 'A' ? 'bg-red-100 text-red-800' :
                                  clasif.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {clasif.clasificacion_abc}
                                </span>
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  clasif.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800' :
                                  clasif.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {clasif.clasificacion_xyz}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`font-medium ${
                              inv.cantidad_actual === 0 ? 'text-red-600' :
                              inv.cantidad_actual < 10 ? 'text-yellow-600' :
                              'text-gray-900'
                            }`}>
                              {inv.cantidad_actual.toFixed(0)}
                            </span>
                            {inv.cantidad_actual === 0 && ' 🚨'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {clasif ? `#${clasif.ranking_valor}` : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {clasif?.coeficiente_variacion !== null && clasif?.coeficiente_variacion !== undefined ? (
                              <span className={`font-medium ${
                                clasif.coeficiente_variacion < 0.5 ? 'text-green-600' :
                                clasif.coeficiente_variacion < 1.0 ? 'text-blue-600' :
                                'text-red-600'
                              }`}>
                                {clasif.coeficiente_variacion.toFixed(2)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-500 max-w-xs">
                            {matriz && getDescripcionMatriz(matriz)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductoDetalleModal;
