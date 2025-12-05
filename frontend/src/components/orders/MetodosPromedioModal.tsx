import { X, TrendingUp, BarChart3, CheckCircle2, AlertTriangle } from 'lucide-react';

interface MetodosPromedioModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    prom_top3_unid: number;
    prom_p75_unid: number;
    cantidad_bultos: number;
  };
}

export default function MetodosPromedioModal({ isOpen, onClose, producto }: MetodosPromedioModalProps) {
  if (!isOpen) return null;

  const prom20d = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const top3 = producto.prom_top3_unid / producto.cantidad_bultos;
  const p75 = producto.prom_p75_unid / producto.cantidad_bultos;

  // Calcular porcentaje sobre el promedio simple
  const pctTop3 = prom20d > 0 ? ((top3 / prom20d) - 1) * 100 : 0;
  const pctP75 = prom20d > 0 ? ((p75 / prom20d) - 1) * 100 : 0;

  // Determinar cuál es más conservador
  const diferencia = Math.abs(top3 - p75);
  const diferenciaPorc = prom20d > 0 ? (diferencia / prom20d) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Comparativa: TOP3 vs P75
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Resumen de valores */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Promedio 20D</div>
              <div className="text-2xl font-bold text-gray-700 mt-1">{prom20d.toFixed(1)}</div>
              <div className="text-xs text-gray-400">bultos/día (base)</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center border border-amber-200">
              <div className="text-xs text-amber-600 uppercase tracking-wide">TOP3</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">{top3.toFixed(1)}</div>
              <div className="text-xs text-amber-500">+{pctTop3.toFixed(0)}% vs base</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-200">
              <div className="text-xs text-purple-600 uppercase tracking-wide flex items-center justify-center gap-1">
                P75 <CheckCircle2 className="w-3 h-3" />
              </div>
              <div className="text-2xl font-bold text-purple-700 mt-1">{p75.toFixed(1)}</div>
              <div className="text-xs text-purple-500">+{pctP75.toFixed(0)}% vs base</div>
            </div>
          </div>

          {/* Diferencia entre métodos */}
          <div className={`rounded-lg p-3 ${diferenciaPorc > 15 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center gap-2">
              {diferenciaPorc > 15 ? (
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              <span className={`text-sm font-medium ${diferenciaPorc > 15 ? 'text-yellow-700' : 'text-green-700'}`}>
                Diferencia entre métodos: {diferencia.toFixed(1)} bultos ({diferenciaPorc.toFixed(0)}%)
              </span>
            </div>
            {diferenciaPorc > 15 && (
              <p className="text-xs text-yellow-600 mt-1 ml-6">
                Una diferencia grande puede indicar ventas muy volátiles o días atípicos significativos.
              </p>
            )}
          </div>

          {/* Explicación de cada método */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* TOP3 */}
            <div className="border border-amber-200 rounded-lg overflow-hidden">
              <div className="bg-amber-100 px-4 py-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-700" />
                <h3 className="font-semibold text-amber-800">TOP3: Promedio de los 3 mejores días</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-sm text-gray-700">
                  <strong>Cálculo:</strong> Ordena los 20 días de mayor a menor venta y promedia solo los 3 días con más ventas.
                </div>
                <div className="bg-amber-50 rounded p-3 text-xs">
                  <div className="font-medium text-amber-800 mb-1">Ejemplo con 20 días de datos:</div>
                  <div className="text-amber-700">
                    Días ordenados: 85, 72, 68, 55, 52, 48, 45, 42, ...
                    <br />
                    TOP3 = (85 + 72 + 68) / 3 = <strong>75 unidades</strong>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="text-gray-600">Captura el potencial máximo de ventas</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="text-gray-600">Útil para productos de temporada alta</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">-</span>
                    <span className="text-gray-600">Muy sensible a outliers (días excepcionales)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">-</span>
                    <span className="text-gray-600">Puede sobreestimar la demanda real</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">-</span>
                    <span className="text-gray-600">Solo usa 3 de 20 datos (15% de la muestra)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* P75 */}
            <div className="border border-purple-200 rounded-lg overflow-hidden">
              <div className="bg-purple-100 px-4 py-2 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-700" />
                <h3 className="font-semibold text-purple-800">P75: Percentil 75</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-sm text-gray-700">
                  <strong>Cálculo:</strong> El valor donde el 75% de los días tienen ventas menores o iguales, y el 25% tienen ventas mayores.
                </div>
                <div className="bg-purple-50 rounded p-3 text-xs">
                  <div className="font-medium text-purple-800 mb-1">Ejemplo con 20 días de datos:</div>
                  <div className="text-purple-700">
                    Días ordenados: 85, 72, 68, 55, 52, 48, <strong className="bg-purple-200 px-1 rounded">45</strong>, 42, ...
                    <br />
                    P75 = valor en posición 15 de 20 = <strong>45 unidades</strong>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="text-gray-600"><strong>Estadísticamente robusto</strong> (usa toda la distribución)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="text-gray-600">Resistente a outliers extremos</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="text-gray-600">Cubre el 75% de los escenarios de demanda</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="text-gray-600">Balance óptimo entre servicio y sobrestock</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-600 mt-0.5">~</span>
                    <span className="text-gray-600">Puede no capturar picos excepcionales</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Por qué P75 tiene más sentido estadístico */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
            <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              ¿Por qué P75 tiene más sentido estadístico?
            </h3>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">1</span>
                <div>
                  <strong>Usa toda la distribución:</strong> Mientras TOP3 solo usa 3 datos de 20 (15%), P75 considera todos los puntos para calcular su posición en la distribución.
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">2</span>
                <div>
                  <strong>Robustez ante outliers:</strong> Un día de venta excepcional (ej: promoción especial) infla mucho TOP3 pero apenas afecta P75.
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">3</span>
                <div>
                  <strong>Interpretación clara:</strong> P75 significa "el 75% de los días tendrás suficiente stock" - un nivel de servicio objetivo medible.
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">4</span>
                <div>
                  <strong>Estándar en la industria:</strong> Los percentiles son la base de metodologías como Safety Stock, Service Level y EOQ en gestión de inventarios.
                </div>
              </div>
            </div>
          </div>

          {/* Cuándo usar cada uno */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-3">Cuándo considerar cada método</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-amber-700 mb-1">Usar TOP3 cuando:</div>
                <ul className="list-disc list-inside text-gray-600 space-y-1 text-xs">
                  <li>Producto con ventas muy estables (baja variabilidad)</li>
                  <li>Temporada alta esperada (Navidad, regreso a clases)</li>
                  <li>Producto crítico donde el quiebre es muy costoso</li>
                  <li>Se prefiere sobrestock a perder ventas</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-purple-700 mb-1">Usar P75 cuando:</div>
                <ul className="list-disc list-inside text-gray-600 space-y-1 text-xs">
                  <li>Producto con ventas variables (alta variabilidad)</li>
                  <li>Períodos normales de operación</li>
                  <li>El costo de sobrestock es significativo</li>
                  <li>Se busca optimizar el capital de trabajo</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Recomendación para este producto */}
          <div className={`rounded-lg p-4 border-2 ${p75 <= top3 ? 'border-purple-400 bg-purple-50' : 'border-amber-400 bg-amber-50'}`}>
            <h3 className={`font-semibold mb-2 ${p75 <= top3 ? 'text-purple-800' : 'text-amber-800'}`}>
              Recomendación para este producto
            </h3>
            <p className="text-sm text-gray-700">
              Para <strong>{producto.descripcion_producto}</strong>, el método <strong>{p75 <= top3 ? 'P75' : 'TOP3'}</strong> sugiere
              una demanda diaria de <strong>{(p75 <= top3 ? p75 : top3).toFixed(1)} bultos</strong>.
              {p75 <= top3 ? (
                <span> Esto representa un incremento del <strong>{pctP75.toFixed(0)}%</strong> sobre el promedio simple, proporcionando un buffer razonable contra la variabilidad sin sobreestimar la demanda.</span>
              ) : (
                <span> Aunque TOP3 muestra un valor mayor ({top3.toFixed(1)}), P75 ({p75.toFixed(1)}) sigue siendo el más recomendable estadísticamente al usar toda la distribución.</span>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
