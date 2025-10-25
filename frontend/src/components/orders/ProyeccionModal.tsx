import { X, TrendingUp, Calendar, BarChart3, Activity } from 'lucide-react';

interface ProyeccionModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
  };
  forecastDiarioBultos: number;
}

export default function ProyeccionModal({
  isOpen,
  onClose,
  producto,
  forecastDiarioBultos
}: ProyeccionModalProps) {
  if (!isOpen) return null;

  const promedio20D = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const diferenciaBultos = forecastDiarioBultos - promedio20D;
  const diferenciaPorcentaje = promedio20D > 0 ? (diferenciaBultos / promedio20D) * 100 : 0;

  const esCreciente = diferenciaBultos > 0;
  const esEstable = Math.abs(diferenciaPorcentaje) < 5; // ±5% se considera estable

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Proyección PMP: {forecastDiarioBultos.toFixed(1)} bultos/día
            </h2>
            <p className="text-indigo-100 text-sm mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-indigo-200 transition-colors ml-4"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Comparación con 20D */}
          <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              📊 Comparación con Promedio Histórico (20D)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-purple-100 rounded-lg p-3 text-center border border-purple-200">
                <div className="text-xs text-gray-600 mb-1">Promedio 20D</div>
                <div className="text-2xl font-bold text-purple-700">{promedio20D.toFixed(1)}</div>
                <div className="text-xs text-gray-500">bultos/día</div>
              </div>
              <div className="bg-indigo-100 rounded-lg p-3 text-center border border-indigo-200">
                <div className="text-xs text-gray-600 mb-1">Proyección PMP</div>
                <div className="text-2xl font-bold text-indigo-700">{forecastDiarioBultos.toFixed(1)}</div>
                <div className="text-xs text-gray-500">bultos/día</div>
              </div>
              <div className={`rounded-lg p-3 text-center border ${
                esCreciente ? 'bg-green-100 border-green-200' : 'bg-orange-100 border-orange-200'
              }`}>
                <div className="text-xs text-gray-600 mb-1">Tendencia</div>
                <div className={`text-2xl font-bold ${esCreciente ? 'text-green-700' : 'text-orange-700'}`}>
                  {diferenciaBultos > 0 ? '+' : ''}{diferenciaBultos.toFixed(1)}
                </div>
                <div className={`text-xs font-semibold ${esCreciente ? 'text-green-600' : 'text-orange-600'}`}>
                  ({diferenciaPorcentaje > 0 ? '+' : ''}{diferenciaPorcentaje.toFixed(1)}%)
                </div>
              </div>
            </div>

            {/* Interpretación */}
            <div className="mt-4 p-3 bg-white rounded-lg border border-indigo-100">
              <div className="text-sm">
                <span className="font-semibold text-indigo-900">Interpretación: </span>
                {esEstable ? (
                  <span className="text-gray-700">
                    La demanda proyectada es <strong>estable</strong> (cambio &lt;5%).
                    La tendencia reciente coincide con el promedio histórico.
                  </span>
                ) : esCreciente ? (
                  <span className="text-green-700">
                    La demanda proyectada está <strong>creciendo</strong> (+{diferenciaPorcentaje.toFixed(1)}%).
                    Considera <strong>aumentar el pedido sugerido</strong> para cubrir la mayor demanda.
                  </span>
                ) : (
                  <span className="text-orange-700">
                    La demanda proyectada está <strong>disminuyendo</strong> ({diferenciaPorcentaje.toFixed(1)}%).
                    Podrías <strong>reducir el pedido sugerido</strong> para evitar exceso de inventario.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ¿Qué es PMP? */}
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              ¿Qué es la Proyección PMP?
            </h3>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>PMP (Promedio Móvil Ponderado)</strong> es un método de pronóstico que proyecta
                las ventas futuras basándose en el desempeño reciente de las últimas 4 semanas.
              </p>
              <p>
                A diferencia del <strong>Promedio 20D</strong> (que usa los últimos 20 días con igual peso),
                el PMP da <strong>más peso a las semanas más recientes</strong>, capturando mejor las tendencias actuales.
              </p>
            </div>
          </div>

          {/* Cómo se Calcula */}
          <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              📐 Cómo se Calcula la Proyección
            </h3>

            <div className="space-y-3">
              {/* Paso 1 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Obtener ventas de las últimas 4 semanas</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Se agrupan las ventas por semana completa (7 días) de las últimas 4 semanas
                  </div>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Aplicar pesos a cada semana</div>
                  <div className="text-xs bg-white p-2 rounded mt-1 font-mono border border-indigo-100">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="font-bold text-indigo-700">Semana 1</div>
                        <div className="text-gray-600">(más reciente)</div>
                        <div className="font-bold text-green-600">40%</div>
                      </div>
                      <div>
                        <div className="font-bold text-indigo-700">Semana 2</div>
                        <div className="text-gray-600">&nbsp;</div>
                        <div className="font-bold text-blue-600">30%</div>
                      </div>
                      <div>
                        <div className="font-bold text-indigo-700">Semana 3</div>
                        <div className="text-gray-600">&nbsp;</div>
                        <div className="font-bold text-purple-600">20%</div>
                      </div>
                      <div>
                        <div className="font-bold text-indigo-700">Semana 4</div>
                        <div className="text-gray-600">(más antigua)</div>
                        <div className="font-bold text-gray-600">10%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Calcular promedio ponderado diario</div>
                  <div className="text-xs text-gray-600 mt-1 font-mono bg-white px-2 py-1 rounded border border-indigo-100">
                    Proyección = (S1 × 0.40) + (S2 × 0.30) + (S3 × 0.20) + (S4 × 0.10)
                  </div>
                </div>
              </div>

              {/* Paso 4 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  4
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Ajustes finales</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Se aplican factores de ajuste por estacionalidad (ej: temporada alta/baja) y tendencia
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Por qué es útil */}
          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <h3 className="text-sm font-semibold text-green-900 mb-3">
              ✅ ¿Por qué es útil la Proyección PMP?
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Detecta tendencias:</strong> Identifica si la demanda está creciendo o cayendo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Reacciona rápido:</strong> Da más peso a lo reciente (últimas semanas)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Complementa el 20D:</strong> El promedio 20D es histórico, PMP es predictivo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Ajusta pedidos:</strong> Te ayuda a aumentar o reducir cantidades según la tendencia</span>
              </li>
            </ul>
          </div>

          {/* Ejemplo práctico */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <h3 className="text-sm font-semibold text-amber-900 mb-2">💡 Ejemplo Práctico</h3>
            <div className="text-sm text-gray-700">
              Si el <strong>Promedio 20D = 28 bultos/día</strong> pero la <strong>Proyección PMP = 35 bultos/día</strong>:
              <ul className="mt-2 ml-4 space-y-1">
                <li>→ La demanda creció ~25% en las últimas semanas</li>
                <li>→ El pedido sugerido (basado en 20D) podría quedarse corto</li>
                <li>→ <strong className="text-amber-700">Acción recomendada:</strong> Aumentar el pedido en ~20-25%</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium text-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
