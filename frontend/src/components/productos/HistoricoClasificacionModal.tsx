/**
 * Modal para visualizar el histórico de clasificaciones ABC-XYZ de un producto
 *
 * Muestra:
 * - Clasificación actual
 * - Histórico de cambios
 * - Gráfico de evolución (opcional)
 */

import React, { useState, useEffect } from 'react';
import {
  getHistoricoABCXYZ,
  formatearCambio,
  type ClasificacionActual,
  type HistoricoClasificacion,
} from '../../services/alertasService';

interface Props {
  codigoProducto: string;
  ubicacionId?: string;
  onClose: () => void;
}

const HistoricoClasificacionModal: React.FC<Props> = ({
  codigoProducto,
  ubicacionId,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clasificacionActual, setClasificacionActual] = useState<ClasificacionActual[]>([]);
  const [historico, setHistorico] = useState<HistoricoClasificacion[]>([]);

  useEffect(() => {
    loadHistorico();
  }, [codigoProducto, ubicacionId]);

  const loadHistorico = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getHistoricoABCXYZ(codigoProducto, ubicacionId);
      setClasificacionActual(response.clasificacion_actual);
      setHistorico(response.historico);
    } catch (err) {
      console.error('Error cargando histórico:', err);
      setError('Error al cargar el histórico de clasificación');
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getColorClasificacion = (clasificacion: string): string => {
    if (clasificacion === 'A') return 'bg-green-100 text-green-800 border-green-300';
    if (clasificacion === 'B') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (clasificacion === 'C') return 'bg-red-100 text-red-800 border-red-300';
    if (clasificacion === 'X') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (clasificacion === 'Y') return 'bg-purple-100 text-purple-800 border-purple-300';
    if (clasificacion === 'Z') return 'bg-gray-100 text-gray-800 border-gray-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Histórico de Clasificación
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Producto: {codigoProducto}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Clasificación Actual */}
              {clasificacionActual.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Clasificación Actual</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {clasificacionActual.map((item, index) => (
                      <div key={index} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-600">
                            {item.ubicacion_id}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatearFecha(item.fecha_calculo)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">ABC</div>
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${getColorClasificacion(item.clasificacion_abc_valor)}`}>
                              {item.clasificacion_abc_valor}
                            </span>
                          </div>

                          <div>
                            <div className="text-xs text-gray-600 mb-1">XYZ</div>
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${getColorClasificacion(item.clasificacion_xyz)}`}>
                              {item.clasificacion_xyz}
                            </span>
                          </div>

                          <div>
                            <div className="text-xs text-gray-600 mb-1">Matriz</div>
                            <span className="text-lg font-bold text-gray-900">
                              {item.matriz_abc_xyz}
                            </span>
                          </div>

                          <div>
                            <div className="text-xs text-gray-600 mb-1">Ranking</div>
                            <span className="text-lg font-bold text-gray-900">
                              #{item.ranking_valor}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-600">Valor consumo:</span>
                            <div className="font-medium text-gray-900">
                              ${item.valor_consumo_total?.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-600">CV:</span>
                            <div className="font-medium text-gray-900">
                              {item.coeficiente_variacion?.toFixed(2) || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico */}
              {historico.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Histórico de Cambios ({historico.length} registros)
                  </h4>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Fecha
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Tienda
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ABC
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Ranking
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Valor Consumo
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              % Valor
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Período
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {historico.map((registro, index) => {
                            // Detectar cambio respecto al registro anterior
                            const registroAnterior = historico[index + 1];
                            const hubo_cambio = registroAnterior &&
                              registro.clasificacion_abc_valor !== registroAnterior.clasificacion_abc_valor;

                            return (
                              <tr
                                key={index}
                                className={`hover:bg-gray-50 ${hubo_cambio ? 'bg-yellow-50' : ''}`}
                              >
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatearFecha(registro.fecha_calculo)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {registro.ubicacion_id}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getColorClasificacion(registro.clasificacion_abc_valor)}`}>
                                    {registro.clasificacion_abc_valor}
                                  </span>
                                  {hubo_cambio && registroAnterior && (
                                    <span className="ml-2 text-xs text-gray-500">
                                      (era {registroAnterior.clasificacion_abc_valor})
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  #{registro.ranking_valor}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  ${registro.valor_consumo_total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {registro.porcentaje_valor.toFixed(2)}%
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                  {formatearFecha(registro.fecha_inicio)} - {formatearFecha(registro.fecha_fin)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Leyenda */}
                  <div className="mt-3 text-xs text-gray-500 flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <div className="w-4 h-4 bg-yellow-50 border border-yellow-200"></div>
                      <span>= Cambio de clasificación</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📊</div>
                  <div className="font-medium">No hay histórico disponible</div>
                  <div className="text-sm mt-1">
                    El histórico se generará en las próximas ejecuciones del cálculo ABC-XYZ
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoricoClasificacionModal;
