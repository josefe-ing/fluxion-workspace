import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getClasificacionProducto, ClasificacionABCv2, getIconoDiscrepancia } from '../../services/abcV2Service';

interface ABCComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
  };
}

export default function ABCComparisonModal({ isOpen, onClose, producto }: ABCComparisonModalProps) {
  const [clasificacionV2, setClasificacionV2] = useState<ClasificacionABCv2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && producto) {
      cargarClasificacionV2();
    }
  }, [isOpen, producto]);

  const cargarClasificacionV2 = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getClasificacionProducto(producto.codigo_producto);
      setClasificacionV2(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cargar clasificación ABC v2');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Calcular ABC v1 (velocidad)
  const promVentaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  let clasificacionVelocidad: string;

  if (promVentaDiariaBultos >= 20) {
    clasificacionVelocidad = 'A';
  } else if (promVentaDiariaBultos >= 5) {
    clasificacionVelocidad = 'AB';
  } else if (promVentaDiariaBultos >= 0.45) {
    clasificacionVelocidad = 'B';
  } else if (promVentaDiariaBultos >= 0.20) {
    clasificacionVelocidad = 'BC';
  } else if (promVentaDiariaBultos >= 0.001) {
    clasificacionVelocidad = 'C';
  } else {
    clasificacionVelocidad = '-';
  }

  const getColorClasificacion = (clase: string) => {
    if (clase === 'A') return 'text-red-700 bg-red-50 border-red-300';
    if (clase === 'AB') return 'text-orange-700 bg-orange-50 border-orange-300';
    if (clase === 'B') return 'text-yellow-700 bg-yellow-50 border-yellow-300';
    if (clase === 'BC') return 'text-amber-700 bg-amber-50 border-amber-300';
    if (clase === 'C') return 'text-gray-700 bg-gray-50 border-gray-300';
    return 'text-gray-500 bg-gray-50 border-gray-300';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Comparación ABC: Velocidad vs Valor
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Dos perspectivas complementarias de clasificación
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
        <div className="p-6 space-y-6">
          {/* Producto Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Producto</p>
            <p className="font-mono text-sm font-bold text-gray-900">{producto.codigo_producto}</p>
            <p className="text-sm text-gray-700 mt-1">{producto.descripcion_producto}</p>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="mt-4 text-sm text-gray-500">Cargando clasificación ABC v2...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
              <p className="text-xs text-red-600 mt-2">
                El cálculo ABC v2 podría no estar disponible. Ejecutar: python3 calcular_abc_v2_adaptado.py
              </p>
            </div>
          ) : (
            <>
              {/* Comparación lado a lado */}
              <div className="grid grid-cols-2 gap-4">
                {/* ABC v1 (Velocidad) */}
                <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50">
                  <h3 className="text-lg font-semibold text-purple-900 mb-3">
                    📊 ABC v1 (Velocidad)
                  </h3>

                  <div className="space-y-3">
                    <div className={`p-3 rounded-lg border-2 ${getColorClasificacion(clasificacionVelocidad)}`}>
                      <p className="text-sm text-gray-600 mb-1">Clasificación</p>
                      <p className="text-3xl font-bold">{clasificacionVelocidad}</p>
                    </div>

                    <div className="text-sm space-y-2">
                      <div>
                        <p className="text-gray-600">Métrica base</p>
                        <p className="font-bold text-purple-900">
                          {promVentaDiariaBultos.toFixed(3)} bultos/día
                        </p>
                      </div>

                      <div>
                        <p className="text-gray-600">Promedio 20 días</p>
                        <p className="font-mono text-sm">
                          {producto.prom_ventas_20dias_unid.toFixed(2)} unid
                        </p>
                      </div>

                      <div>
                        <p className="text-gray-600">Unidades/Bulto</p>
                        <p className="font-mono text-sm">{producto.cantidad_bultos.toFixed(0)}</p>
                      </div>
                    </div>

                    <div className="bg-white bg-opacity-70 rounded p-2 text-xs text-gray-700">
                      <strong>Basado en:</strong> Velocidad de rotación (volumen)
                    </div>
                  </div>
                </div>

                {/* ABC v2 (Valor) */}
                <div className="border-2 border-emerald-300 rounded-lg p-4 bg-emerald-50">
                  <h3 className="text-lg font-semibold text-emerald-900 mb-3">
                    💰 ABC v2 (Valor)
                  </h3>

                  {clasificacionV2 ? (
                    <div className="space-y-3">
                      <div className={`p-3 rounded-lg border-2 ${getColorClasificacion(clasificacionV2.clasificacion_abc_valor)}`}>
                        <p className="text-sm text-gray-600 mb-1">Clasificación</p>
                        <p className="text-3xl font-bold">{clasificacionV2.clasificacion_abc_valor}</p>
                      </div>

                      <div className="text-sm space-y-2">
                        <div>
                          <p className="text-gray-600">Ranking</p>
                          <p className="font-bold text-emerald-900">
                            #{clasificacionV2.ranking_valor}
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-600">Valor de consumo</p>
                          <p className="font-bold text-emerald-900">
                            ${clasificacionV2.valor_consumo_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-600">% del valor total</p>
                          <p className="font-mono text-sm">{clasificacionV2.porcentaje_valor.toFixed(4)}%</p>
                        </div>

                        <div>
                          <p className="text-gray-600">% acumulado</p>
                          <p className="font-mono text-sm">{clasificacionV2.porcentaje_acumulado.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="bg-white bg-opacity-70 rounded p-2 text-xs text-gray-700">
                        <strong>Basado en:</strong> Valor económico (Pareto 80/20)
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No disponible</p>
                  )}
                </div>
              </div>

              {/* Análisis de Discrepancia */}
              {clasificacionV2 && clasificacionV2.tiene_discrepancia && (
                <div className={`border-2 rounded-lg p-4 ${
                  clasificacionV2.tipo_discrepancia?.includes('alto valor')
                    ? 'bg-red-50 border-red-300'
                    : 'bg-amber-50 border-amber-300'
                }`}>
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{getIconoDiscrepancia(clasificacionV2)}</span>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {clasificacionV2.tipo_discrepancia}
                      </h3>

                      {clasificacionV2.tipo_discrepancia?.includes('bajo valor') && (
                        <div className="text-sm text-gray-700 space-y-2">
                          <p>
                            <strong>Situación:</strong> Este producto tiene alta rotación (clase {clasificacionVelocidad}) pero genera poco valor económico (clase {clasificacionV2.clasificacion_abc_valor}).
                          </p>
                          <p>
                            <strong>Posibles causas:</strong> Producto de bajo precio unitario, márgenes estrechos, o commodity básico.
                          </p>
                          <p>
                            <strong>Estrategia:</strong> Mantener disponibilidad por volumen, pero no sobre-invertir en stock. Considerar revisar precios/márgenes.
                          </p>
                        </div>
                      )}

                      {clasificacionV2.tipo_discrepancia?.includes('alto valor') && (
                        <div className="text-sm text-gray-700 space-y-2">
                          <p>
                            <strong>Situación:</strong> Este producto tiene baja rotación (clase {clasificacionVelocidad}) pero genera alto valor económico (clase {clasificacionV2.clasificacion_abc_valor}). ¡CRÍTICO!
                          </p>
                          <p>
                            <strong>Posibles causas:</strong> Producto premium, alto precio unitario, o margen muy alto.
                          </p>
                          <p>
                            <strong>Estrategia:</strong> <span className="font-bold text-red-700">Prioridad máxima.</span> Evitar quiebres de stock. Asegurar disponibilidad constante aunque la rotación sea baja.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Coherencia */}
              {clasificacionV2 && !clasificacionV2.tiene_discrepancia && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">✓</span>
                    <div>
                      <h3 className="text-lg font-semibold text-green-900 mb-2">
                        Clasificación Coherente
                      </h3>
                      <p className="text-sm text-gray-700">
                        Las clasificaciones por velocidad ({clasificacionVelocidad}) y por valor ({clasificacionV2.clasificacion_abc_valor}) son consistentes. Este producto se comporta de manera esperada.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Explicación de los dos métodos */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  ¿Por qué dos clasificaciones?
                </h3>
                <div className="text-sm text-gray-700 space-y-2">
                  <p>
                    <strong>ABC v1 (Velocidad):</strong> Clasifica según rotación física (bultos/día). Útil para operaciones logísticas y espacios de almacenamiento.
                  </p>
                  <p>
                    <strong>ABC v2 (Valor):</strong> Clasifica según valor económico generado (Principio de Pareto 80/20). Identifica qué productos realmente importan para el negocio.
                  </p>
                  <p className="text-amber-700 font-medium">
                    💡 Ambas perspectivas son importantes: ABC v1 para operaciones, ABC v2 para decisiones estratégicas.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
