/**
 * Modal comparativo para mostrar ABC v1 (Velocidad) vs ABC v2 (Valor)
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  getClasificacionProducto,
  ClasificacionABCv2,
  getIconoDiscrepancia,
  getDescripcionXYZ,
  getEstrategiaMatriz,
} from '../../services/abcV2Service';

interface ABCComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    abc?: string; // ABC v1 (velocidad)
    velocidad_bultos_dia?: number;
  };
  ubicacionId?: string; // Para obtener clasificación local de la tienda
}

export default function ABCComparisonModal({
  isOpen,
  onClose,
  producto,
  ubicacionId,
}: ABCComparisonModalProps) {
  const [clasificacionV2, setClasificacionV2] = useState<ClasificacionABCv2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && producto.codigo_producto) {
      cargarClasificacionV2();
    }
  }, [isOpen, producto.codigo_producto, ubicacionId]);

  const cargarClasificacionV2 = async () => {
    setLoading(true);
    setError(null);

    try {
      const clasificacion = await getClasificacionProducto(producto.codigo_producto, ubicacionId);
      setClasificacionV2(clasificacion);
    } catch (err) {
      console.error('Error cargando ABC v2:', err);
      setError('No se pudo cargar la clasificación ABC v2. Es posible que aún no se haya calculado.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Clasificación ABC - Comparación
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-amber-800">
              <p className="font-medium">⚠️ {error}</p>
              <p className="text-sm mt-2">
                Ejecuta el cálculo ABC v2 con: <code className="bg-amber-100 px-2 py-1 rounded">python3 database/calcular_abc_v2_adaptado.py</code>
              </p>
            </div>
          ) : (
            <>
              {/* Comparación lado a lado */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* ABC v1 (Velocidad) */}
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <h3 className="text-lg font-bold text-gray-900">ABC v1 - Velocidad</h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Clasificación</p>
                      <p className="text-4xl font-bold text-orange-700 mt-1">
                        {producto.abc || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 uppercase">Métrica</p>
                      <p className="text-sm text-gray-900 font-medium">
                        {producto.velocidad_bultos_dia
                          ? `${producto.velocidad_bultos_dia.toFixed(2)} bultos/día`
                          : 'N/A'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-orange-200">
                      <p className="text-xs text-gray-600 mb-2">¿Qué mide?</p>
                      <p className="text-sm text-gray-700">
                        <strong>Velocidad de rotación:</strong> Qué tan rápido se vende el producto
                        (bultos por día).
                      </p>
                    </div>

                    <div className="bg-orange-100 rounded p-3">
                      <p className="text-xs font-semibold text-orange-900 mb-1">Interpretación:</p>
                      <ul className="text-xs text-orange-800 space-y-1">
                        {producto.abc === 'A' && (
                          <>
                            <li>• Alta velocidad de venta</li>
                            <li>• Rotación frecuente</li>
                            <li>• Requiere reabastecimiento continuo</li>
                          </>
                        )}
                        {producto.abc === 'B' && (
                          <>
                            <li>• Velocidad moderada</li>
                            <li>• Rotación estándar</li>
                            <li>• Reabastecimiento regular</li>
                          </>
                        )}
                        {producto.abc === 'C' && (
                          <>
                            <li>• Baja velocidad de venta</li>
                            <li>• Rotación lenta</li>
                            <li>• Reabastecimiento esporádico</li>
                          </>
                        )}
                        {!producto.abc && <li>• Sin clasificación disponible</li>}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* ABC v2 (Valor) */}
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                    <h3 className="text-lg font-bold text-gray-900">ABC v2 - Valor 💰</h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Clasificación</p>
                      <p className="text-4xl font-bold text-emerald-700 mt-1">
                        {clasificacionV2?.clasificacion_abc_valor || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 uppercase">Ranking</p>
                      <p className="text-sm text-gray-900 font-medium">
                        #{clasificacionV2?.ranking_valor || 'N/A'} de {clasificacionV2 ? '3,134' : 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 uppercase">% del Valor Total</p>
                      <p className="text-sm text-gray-900 font-medium">
                        {clasificacionV2?.porcentaje_valor.toFixed(4)}%
                      </p>
                    </div>

                    <div className="pt-3 border-t border-emerald-200">
                      <p className="text-xs text-gray-600 mb-2">¿Qué mide?</p>
                      <p className="text-sm text-gray-700">
                        <strong>Impacto económico:</strong> Cuánto valor genera el producto en ventas
                        (unidades × costo promedio).
                      </p>
                    </div>

                    <div className="bg-emerald-100 rounded p-3">
                      <p className="text-xs font-semibold text-emerald-900 mb-1">Interpretación:</p>
                      <ul className="text-xs text-emerald-800 space-y-1">
                        {clasificacionV2?.clasificacion_abc_valor === 'A' && (
                          <>
                            <li>• Alto impacto económico (top 80%)</li>
                            <li>• Genera la mayor parte del valor</li>
                            <li>• <strong>Crítico:</strong> Nunca debe faltar</li>
                          </>
                        )}
                        {clasificacionV2?.clasificacion_abc_valor === 'B' && (
                          <>
                            <li>• Impacto económico moderado (80-95%)</li>
                            <li>• Contribuye significativamente</li>
                            <li>• Importante mantener disponibilidad</li>
                          </>
                        )}
                        {clasificacionV2?.clasificacion_abc_valor === 'C' && (
                          <>
                            <li>• Bajo impacto económico (95-100%)</li>
                            <li>• Contribución menor al valor</li>
                            <li>• Optimizar inversión en inventario</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección XYZ - Variabilidad de Demanda */}
              {clasificacionV2 && clasificacionV2.clasificacion_xyz && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <h3 className="text-lg font-bold text-gray-900">XYZ - Variabilidad 📊</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Clasificación XYZ */}
                    <div>
                      <p className="text-xs text-gray-600 uppercase mb-2">Clasificación</p>
                      <div className="flex items-center gap-3">
                        <p className={`text-4xl font-bold ${
                          clasificacionV2.clasificacion_xyz === 'X' ? 'text-green-700' :
                          clasificacionV2.clasificacion_xyz === 'Y' ? 'text-yellow-700' :
                          'text-red-700'
                        }`}>
                          {clasificacionV2.clasificacion_xyz}
                        </p>
                        {clasificacionV2.es_extremadamente_volatil && (
                          <span className="text-2xl" title="Extremadamente volátil">⚡</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        {getDescripcionXYZ(clasificacionV2.clasificacion_xyz)}
                      </p>
                    </div>

                    {/* Matriz ABC-XYZ */}
                    <div>
                      <p className="text-xs text-gray-600 uppercase mb-2">Matriz Combinada</p>
                      <p className={`text-4xl font-bold ${
                        clasificacionV2.matriz_abc_xyz === 'AZ' ? 'text-red-900' :
                        clasificacionV2.matriz_abc_xyz === 'AX' ? 'text-green-800' :
                        clasificacionV2.matriz_abc_xyz?.startsWith('A') ? 'text-red-700' :
                        clasificacionV2.matriz_abc_xyz?.startsWith('B') ? 'text-yellow-700' :
                        'text-gray-700'
                      }`}>
                        {clasificacionV2.matriz_abc_xyz || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-600 mt-2">
                        {clasificacionV2.matriz_abc_xyz && getEstrategiaMatriz(clasificacionV2.matriz_abc_xyz)}
                      </p>
                    </div>
                  </div>

                  {/* Métricas de Variabilidad */}
                  <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-blue-200">
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Coef. Variación</p>
                      <p className="text-lg font-bold text-gray-900">
                        {clasificacionV2.coeficiente_variacion?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Demanda/Semana</p>
                      <p className="text-lg font-bold text-gray-900">
                        {clasificacionV2.demanda_promedio_semanal?.toFixed(1) || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Confiabilidad</p>
                      <p className="text-lg font-bold text-gray-900">
                        {clasificacionV2.confiabilidad_calculo || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Interpretación especial para productos críticos (AZ) */}
                  {clasificacionV2.matriz_abc_xyz === 'AZ' && (
                    <div className="mt-4 bg-red-100 rounded-lg p-4 border border-red-300">
                      <p className="text-sm font-bold text-red-900 mb-2">
                        🔥 PRODUCTO CRÍTICO - ALTO VALOR + DEMANDA ERRÁTICA
                      </p>
                      <ul className="text-sm text-red-800 space-y-1">
                        <li>• Genera mucho valor pero su demanda es impredecible</li>
                        <li>• Requiere monitoreo constante para evitar quiebres</li>
                        <li>• Considerar aumentar stock de seguridad</li>
                        <li>• Revisar factores que afectan la variabilidad</li>
                      </ul>
                    </div>
                  )}

                  {/* Interpretación para productos ideales (AX) */}
                  {clasificacionV2.matriz_abc_xyz === 'AX' && (
                    <div className="mt-4 bg-green-100 rounded-lg p-4 border border-green-300">
                      <p className="text-sm font-bold text-green-900 mb-2">
                        ✓ PRODUCTO IDEAL - ALTO VALOR + DEMANDA ESTABLE
                      </p>
                      <ul className="text-sm text-green-800 space-y-1">
                        <li>• Fácil de planificar gracias a su demanda predecible</li>
                        <li>• Candidato para reposición automática</li>
                        <li>• Mantener stock alto para aprovechar su rotación</li>
                        <li>• Bajo riesgo de obsolescencia</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Análisis de Discrepancia */}
              {clasificacionV2 && clasificacionV2.tiene_discrepancia && (
                <div
                  className={`rounded-lg p-6 border-2 ${
                    clasificacionV2.tipo_discrepancia?.includes('alto valor')
                      ? 'bg-red-50 border-red-300'
                      : 'bg-amber-50 border-amber-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">
                      {getIconoDiscrepancia(clasificacionV2)}
                    </span>
                    <div className="flex-1">
                      <h4
                        className={`text-lg font-bold mb-2 ${
                          clasificacionV2.tipo_discrepancia?.includes('alto valor')
                            ? 'text-red-900'
                            : 'text-amber-900'
                        }`}
                      >
                        {clasificacionV2.tipo_discrepancia?.includes('alto valor')
                          ? '🔥 DISCREPANCIA CRÍTICA'
                          : '⚠️ DISCREPANCIA DETECTADA'}
                      </h4>

                      <p
                        className={`text-sm mb-4 ${
                          clasificacionV2.tipo_discrepancia?.includes('alto valor')
                            ? 'text-red-800'
                            : 'text-amber-800'
                        }`}
                      >
                        {clasificacionV2.tipo_discrepancia}
                      </p>

                      {clasificacionV2.tipo_discrepancia?.includes('alto valor') ? (
                        // Baja velocidad, alto valor (CRÍTICO)
                        <div className="bg-white rounded-lg p-4 border border-red-200">
                          <p className="text-sm font-semibold text-red-900 mb-2">
                            🚨 Acción Prioritaria:
                          </p>
                          <ul className="text-sm text-red-800 space-y-2">
                            <li>
                              • <strong>Revisar stock:</strong> Aunque vende poco, genera mucho valor.
                              Nunca debe faltar.
                            </li>
                            <li>
                              • <strong>Aumentar visibilidad:</strong> Producto de alto valor pero baja
                              rotación. Posible oportunidad de mejora.
                            </li>
                            <li>
                              • <strong>Monitoreo especial:</strong> Seguimiento diario de disponibilidad.
                            </li>
                            <li>
                              • <strong>Estrategia:</strong> Considerar promociones o mejor ubicación en
                              tienda.
                            </li>
                          </ul>
                        </div>
                      ) : (
                        // Alta velocidad, bajo valor (Advertencia)
                        <div className="bg-white rounded-lg p-4 border border-amber-200">
                          <p className="text-sm font-semibold text-amber-900 mb-2">
                            💡 Recomendación:
                          </p>
                          <ul className="text-sm text-amber-800 space-y-2">
                            <li>
                              • <strong>Optimizar márgenes:</strong> Producto de alta rotación pero bajo
                              valor. Revisar márgenes.
                            </li>
                            <li>
                              • <strong>Evaluar inversión:</strong> No sobre-invertir en stock dado el
                              bajo impacto económico.
                            </li>
                            <li>
                              • <strong>Cross-selling:</strong> Aprovechar alta rotación para vender
                              productos complementarios de mayor valor.
                            </li>
                            <li>
                              • <strong>Análisis de precios:</strong> Considerar ajuste de precios para
                              mejorar rentabilidad.
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sin discrepancia - Coherente */}
              {clasificacionV2 && !clasificacionV2.tiene_discrepancia && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">✓</span>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-green-900 mb-2">
                        Clasificación Coherente
                      </h4>
                      <p className="text-sm text-green-800 mb-3">
                        La velocidad de venta y el valor económico están alineados. El producto se
                        comporta de forma esperada.
                      </p>
                      <div className="bg-white rounded-lg p-4 border border-green-200">
                        <p className="text-sm text-green-900">
                          <strong>Estrategia sugerida:</strong> Mantener política actual de
                          reabastecimiento. El producto está bien gestionado.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Detalles técnicos (colapsable) */}
              {clasificacionV2 && (
                <details className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
                    📊 Detalles Técnicos
                  </summary>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Unidades Vendidas (3 meses)</p>
                      <p className="text-gray-900 font-medium">
                        {clasificacionV2.unidades_vendidas_total.toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Ubicaciones con Venta</p>
                      <p className="text-gray-900 font-medium">
                        {clasificacionV2.numero_ubicaciones} tiendas
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase">% Acumulado</p>
                      <p className="text-gray-900 font-medium">
                        {clasificacionV2.porcentaje_acumulado.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 uppercase">Periodo de Análisis</p>
                      <p className="text-gray-900 font-medium">Últimos 3 meses</p>
                    </div>
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
