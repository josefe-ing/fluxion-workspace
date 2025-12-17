import { X, TrendingUp, Info, CheckCircle2, Calculator } from 'lucide-react';

interface BlendSugeridoModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_p75_unid: number;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
    cantidad_sugerida_bultos: number;
    cantidad_sugerida_v2_bultos?: number;
    demanda_v2_blend_unid?: number;
    v2_componente_p75?: number;
    v2_componente_prom20d?: number;
    v2_diferencia_bultos?: number;
  };
}

export default function BlendSugeridoModal({ isOpen, onClose, producto }: BlendSugeridoModalProps) {
  if (!isOpen) return null;

  const p75 = producto.prom_p75_unid;
  const prom20d = producto.prom_ventas_20dias_unid;
  const blendUnid = producto.demanda_v2_blend_unid || (p75 * 0.60 + prom20d * 0.40);
  const componenteP75 = producto.v2_componente_p75 || p75 * 0.60;
  const componenteProm20d = producto.v2_componente_prom20d || prom20d * 0.40;
  const sugeridoActual = producto.cantidad_sugerida_bultos;
  const sugeridoV2 = producto.cantidad_sugerida_v2_bultos || 0;
  const diferencia = producto.v2_diferencia_bultos || (sugeridoV2 - sugeridoActual);
  const unidadesPorBulto = producto.cantidad_bultos || 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-cyan-600 to-blue-600">
          <div className="text-white">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Sugerido V2 (Blend 60/40)
            </h2>
            <p className="text-sm text-cyan-100 mt-0.5">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Valor V2 destacado */}
          <div className="bg-cyan-50 rounded-xl p-6 text-center border-2 border-cyan-300">
            <div className="text-sm text-cyan-600 uppercase tracking-wide font-semibold mb-1">
              Sugerido V2
            </div>
            <div className="text-5xl font-bold text-cyan-700">
              {sugeridoV2.toFixed(0)} <span className="text-lg font-normal">bultos</span>
            </div>
            <div className="text-sm text-cyan-600 mt-2">
              Demanda Blend: {blendUnid.toFixed(1)} unidades/día
            </div>
          </div>

          {/* Comparación: Actual vs V2 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-100 rounded-lg p-4 text-center border border-gray-200">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Actual (P75)</div>
              <div className="text-2xl font-bold text-gray-700">{sugeridoActual}</div>
              <div className="text-xs text-gray-500">bultos</div>
            </div>
            <div className="bg-cyan-100 rounded-lg p-4 text-center border-2 border-cyan-300">
              <div className="text-xs text-cyan-600 uppercase font-semibold mb-1">V2 (Blend)</div>
              <div className="text-2xl font-bold text-cyan-700">{sugeridoV2.toFixed(0)}</div>
              <div className="text-xs text-cyan-500">bultos</div>
            </div>
            <div className={`rounded-lg p-4 text-center border-2 ${
              diferencia > 0
                ? 'bg-green-50 border-green-300'
                : diferencia < 0
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-gray-50 border-gray-300'
            }`}>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Diferencia</div>
              <div className={`text-2xl font-bold ${
                diferencia > 0 ? 'text-green-600' : diferencia < 0 ? 'text-orange-600' : 'text-gray-600'
              }`}>
                {diferencia > 0 ? '+' : ''}{diferencia.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">bultos</div>
            </div>
          </div>

          {/* ¿Qué es Blend 60/40? */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-3">
              <Info className="w-4 h-4" />
              ¿Qué es el Blend 60/40?
            </h3>
            <p className="text-sm text-blue-900 leading-relaxed">
              Es un método de proyección que combina dos métricas para estimar la demanda diaria:
            </p>
            <div className="mt-3 p-3 bg-white rounded-lg border border-blue-100">
              <div className="font-mono text-center text-blue-800 font-semibold">
                Demanda Blend = (P75 × 60%) + (Prom20D × 40%)
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              Pondera más el P75 (demanda alta) para evitar quiebres, pero incluye el promedio para no ignorar tendencias recientes.
            </p>
          </div>

          {/* Cómo se Calcula */}
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg p-4 border border-cyan-200">
            <h3 className="text-sm font-bold text-cyan-800 flex items-center gap-2 mb-4">
              <Calculator className="w-4 h-4" />
              Cálculo Paso a Paso
            </h3>
            <div className="space-y-3">
              {/* Paso 1 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Percentil 75 (P75)</div>
                  <div className="text-xs text-gray-600">Últimos 20 días de ventas</div>
                  <div className="mt-1 font-mono text-cyan-700 bg-white px-2 py-1 rounded text-sm inline-block">
                    {p75.toFixed(1)} unid/día
                  </div>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Promedio 20 Días</div>
                  <div className="text-xs text-gray-600">Media aritmética de ventas</div>
                  <div className="mt-1 font-mono text-cyan-700 bg-white px-2 py-1 rounded text-sm inline-block">
                    {prom20d.toFixed(1)} unid/día
                  </div>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Aplicar Ponderación</div>
                  <div className="mt-2 bg-white rounded-lg p-3 border border-cyan-100 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">P75 × 60%:</span>
                      <span className="font-mono text-cyan-700">{p75.toFixed(1)} × 0.60 = {componenteP75.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Prom20D × 40%:</span>
                      <span className="font-mono text-cyan-700">{prom20d.toFixed(1)} × 0.40 = {componenteProm20d.toFixed(1)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-1 mt-1">
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-gray-700">Demanda Blend:</span>
                        <span className="text-cyan-700">{blendUnid.toFixed(1)} unid/día</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 4 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center text-xs font-bold">
                  4
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm">Calcular Cantidad Sugerida</div>
                  <div className="text-xs text-gray-600">
                    Se aplica la fórmula de inventario ABC usando la demanda blend
                  </div>
                  <div className="mt-1 font-mono text-cyan-700 bg-white px-2 py-1 rounded text-sm inline-block">
                    Resultado: {sugeridoV2.toFixed(0)} bultos ({(sugeridoV2 * unidadesPorBulto).toFixed(0)} unidades)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ¿Por qué Blend? */}
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="text-sm font-bold text-green-800 flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4" />
              ¿Por qué usar Blend 60/40?
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Captura tendencias:</strong> El 40% de promedio detecta si la demanda está subiendo o bajando</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Evita quiebres:</strong> El 60% de P75 asegura cobertura para días de alta demanda</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Suaviza outliers:</strong> Combinar ambas métricas reduce el impacto de días atípicos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Industria estándar:</strong> SAP, Oracle y sistemas de retail usan métodos similares</span>
              </li>
            </ul>
          </div>

          {/* Nota informativa */}
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>Modo Prueba:</strong> Este cálculo V2 se muestra junto al actual para comparar.
              El pedido seguirá usando el método actual (P75) hasta que validemos cuál es más preciso.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-5 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium text-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
