import { X, Calendar, CheckCircle2, XCircle, AlertTriangle, Package, Truck, ShoppingCart } from 'lucide-react';

interface CoberturaRealModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    cantidad_sugerida_bultos: number;  // V1 (P75)
    stock_tienda: number;
    cantidad_bultos: number;
    prom_p75_unid?: number;
    v2_prom_dow?: number[];
    v2_demanda_periodo?: number;
    v2_cantidad_sugerida_unid?: number;
    v2_cantidad_sugerida_bultos?: number;
    v2_diferencia_bultos?: number;
    v2_cobertura_dias?: {
      dia: string;
      dow: number;
      demanda_unid: number;
      demanda_bultos: number;
      stock_antes: number;
      stock_despues: number;
      cobertura_pct: number;
      estado: 'ok' | 'riesgo' | 'quiebre';
    }[];
    v2_dias_cobertura_real?: number;
    v2_primer_dia_riesgo?: string | null;
    v2_dia_pedido?: string;
    v2_dia_llegada?: string;
  };
}

export default function CoberturaRealModal({ isOpen, onClose, producto }: CoberturaRealModalProps) {
  if (!isOpen) return null;

  const coberturaDias = producto.v2_cobertura_dias || [];
  const demandaPeriodo = producto.v2_demanda_periodo || 0;
  const promDow = producto.v2_prom_dow || [];
  const unidadesPorBulto = producto.cantidad_bultos || 1;

  const sugeridoV1 = producto.cantidad_sugerida_bultos;
  const sugeridoV2 = producto.v2_cantidad_sugerida_bultos || 0;
  const diferencia = producto.v2_diferencia_bultos || 0;
  const stockActual = producto.stock_tienda;

  // Calcular demanda promedio P75 en bultos
  const p75Bultos = (producto.prom_p75_unid || 0) / unidadesPorBulto;

  // Nombres de días
  const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Encontrar día más alto y más bajo del período
  const demandaMaxDia = coberturaDias.length > 0
    ? coberturaDias.reduce((max, d) => d.demanda_bultos > max.demanda_bultos ? d : max, coberturaDias[0])
    : null;
  const demandaMinDia = coberturaDias.length > 0
    ? coberturaDias.reduce((min, d) => d.demanda_bultos < min.demanda_bultos ? d : min, coberturaDias[0])
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header con producto */}
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-5 rounded-t-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-cyan-100 text-sm font-medium">{producto.codigo_producto}</div>
              <h2 className="text-xl font-bold mt-1">{producto.descripcion_producto}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-cyan-100">
                <span>1 bulto = {unidadesPorBulto} unid</span>
                <span>•</span>
                <span>Stock actual: {(stockActual / unidadesPorBulto).toFixed(1)} bultos</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* SECCIÓN 1: El problema que resuelve V2 */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              ¿Por qué V2?
            </h3>
            <p className="text-sm text-amber-900">
              <strong>V1 (P75)</strong> asume que todos los días se vende igual ({p75Bultos.toFixed(1)} bultos/día).
              Pero en realidad, <strong>{demandaMaxDia?.dia || 'Sábado'}</strong> vende más
              ({demandaMaxDia?.demanda_bultos.toFixed(1) || '?'} bultos) y <strong>{demandaMinDia?.dia || 'Lunes'}</strong> vende menos
              ({demandaMinDia?.demanda_bultos.toFixed(1) || '?'} bultos).
            </p>
          </div>

          {/* SECCIÓN 2: Timeline del pedido */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Timeline del Pedido
            </h3>
            <div className="flex items-center justify-between text-center">
              <div className="flex-1">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <ShoppingCart className="w-6 h-6 text-white" />
                </div>
                <div className="text-xs text-gray-500">HOY</div>
                <div className="font-bold text-blue-800">{producto.v2_dia_pedido}</div>
                <div className="text-xs text-gray-600">Haces el pedido</div>
              </div>
              <div className="flex-shrink-0 w-16 border-t-2 border-dashed border-blue-300" />
              <div className="flex-1">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div className="text-xs text-gray-500">MAÑANA</div>
                <div className="font-bold text-blue-800">{producto.v2_dia_llegada}</div>
                <div className="text-xs text-gray-600">Llega el pedido</div>
              </div>
              <div className="flex-shrink-0 w-16 border-t-2 border-dashed border-blue-300" />
              <div className="flex-1">
                <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div className="text-xs text-gray-500">COBERTURA</div>
                <div className="font-bold text-cyan-700">{coberturaDias.length} días</div>
                <div className="text-xs text-gray-600">{coberturaDias.map(d => d.dia).join(' → ')}</div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Comparación V1 vs V2 */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              ¿Cuánto pedir?
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {/* V1 */}
              <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Método Actual (V1)</div>
                <div className="text-4xl font-bold text-gray-700">{sugeridoV1}</div>
                <div className="text-sm text-gray-500 mb-3">bultos</div>
                <div className="text-xs text-gray-600 bg-white rounded p-2">
                  <div className="font-medium mb-1">Cálculo:</div>
                  P75 ({p75Bultos.toFixed(1)} blt/día) × {coberturaDias.length} días
                </div>
              </div>
              {/* V2 */}
              <div className={`rounded-lg p-4 border-2 ${
                diferencia > 0 ? 'bg-orange-50 border-orange-300' :
                diferencia < 0 ? 'bg-green-50 border-green-300' :
                'bg-cyan-50 border-cyan-300'
              }`}>
                <div className={`text-xs uppercase font-semibold mb-2 ${
                  diferencia > 0 ? 'text-orange-600' : diferencia < 0 ? 'text-green-600' : 'text-cyan-600'
                }`}>
                  Sugerido V2 {diferencia > 0 ? '(+' + diferencia.toFixed(0) + ')' : diferencia < 0 ? '(' + diferencia.toFixed(0) + ')' : ''}
                </div>
                <div className={`text-4xl font-bold ${
                  diferencia > 0 ? 'text-orange-700' : diferencia < 0 ? 'text-green-700' : 'text-cyan-700'
                }`}>{sugeridoV2.toFixed(0)}</div>
                <div className={`text-sm mb-3 ${
                  diferencia > 0 ? 'text-orange-500' : diferencia < 0 ? 'text-green-500' : 'text-cyan-500'
                }`}>bultos</div>
                <div className={`text-xs rounded p-2 ${
                  diferencia > 0 ? 'bg-orange-100' : diferencia < 0 ? 'bg-green-100' : 'bg-cyan-100'
                }`}>
                  <div className="font-medium mb-1">Cálculo:</div>
                  Suma de demanda real por día
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: Demanda día a día */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3">
              Demanda Proyectada por Día
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="space-y-2">
                {coberturaDias.map((dia, index) => {
                  const porcentajeMax = demandaMaxDia ? (dia.demanda_bultos / demandaMaxDia.demanda_bultos) * 100 : 100;
                  const esAlto = demandaMaxDia && dia.demanda_bultos === demandaMaxDia.demanda_bultos;
                  const esBajo = demandaMinDia && dia.demanda_bultos === demandaMinDia.demanda_bultos;

                  return (
                    <div key={index} className="flex items-center gap-3">
                      <div className={`w-12 text-sm font-bold ${
                        esAlto ? 'text-orange-600' : esBajo ? 'text-green-600' : 'text-gray-700'
                      }`}>
                        {dia.dia}
                      </div>
                      <div className="flex-1 h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            esAlto ? 'bg-orange-500' : esBajo ? 'bg-green-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${porcentajeMax}%` }}
                        />
                      </div>
                      <div className={`w-20 text-right font-mono text-sm ${
                        esAlto ? 'text-orange-600 font-bold' : esBajo ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {dia.demanda_bultos.toFixed(1)} blt
                        {esAlto && <span className="ml-1 text-xs">↑</span>}
                        {esBajo && <span className="ml-1 text-xs">↓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-300 flex justify-between items-center">
                <span className="font-bold text-gray-700">TOTAL PERÍODO:</span>
                <span className="font-bold text-cyan-700 text-lg">
                  {(demandaPeriodo / unidadesPorBulto).toFixed(1)} bultos
                </span>
              </div>
            </div>
          </div>

          {/* SECCIÓN 5: Simulación de stock */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3">
              Simulación de Stock (con V2: {sugeridoV2.toFixed(0)} bultos)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 text-left font-semibold border-b">Día</th>
                    <th className="px-3 py-2 text-right font-semibold border-b">Stock Inicio</th>
                    <th className="px-3 py-2 text-right font-semibold border-b">Venta</th>
                    <th className="px-3 py-2 text-right font-semibold border-b">Stock Final</th>
                    <th className="px-3 py-2 text-center font-semibold border-b">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {coberturaDias.map((dia, index) => (
                    <tr key={index} className={
                      dia.estado === 'quiebre' ? 'bg-red-50' :
                      dia.estado === 'riesgo' ? 'bg-amber-50' :
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }>
                      <td className="px-3 py-2 font-medium border-b">{dia.dia}</td>
                      <td className="px-3 py-2 text-right font-mono border-b">
                        {(dia.stock_antes / unidadesPorBulto).toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-red-600 border-b">
                        -{dia.demanda_bultos.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold border-b">
                        {(dia.stock_despues / unidadesPorBulto).toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center border-b">
                        {dia.estado === 'ok' && <CheckCircle2 className="w-5 h-5 text-green-500 inline" />}
                        {dia.estado === 'riesgo' && <AlertTriangle className="w-5 h-5 text-amber-500 inline" />}
                        {dia.estado === 'quiebre' && <XCircle className="w-5 h-5 text-red-500 inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECCIÓN 6: Resumen final */}
          {diferencia !== 0 && (
            <div className={`rounded-lg p-4 ${
              diferencia > 0 ? 'bg-orange-100 border-l-4 border-orange-500' : 'bg-green-100 border-l-4 border-green-500'
            }`}>
              <p className={`font-medium ${diferencia > 0 ? 'text-orange-800' : 'text-green-800'}`}>
                {diferencia > 0
                  ? `Este período incluye días de alta demanda. V2 recomienda pedir ${diferencia.toFixed(0)} bultos más para evitar quiebre.`
                  : `Este período tiene días de baja demanda. V2 recomienda pedir ${Math.abs(diferencia).toFixed(0)} bultos menos para evitar sobrestock.`
                }
              </p>
            </div>
          )}

          {/* Promedios históricos por día */}
          {promDow.length > 0 && promDow.some(v => v > 0) && (
            <details className="bg-gray-50 rounded-lg border border-gray-200">
              <summary className="p-3 cursor-pointer font-medium text-gray-700 hover:bg-gray-100">
                Ver histórico de ventas por día de semana
              </summary>
              <div className="p-4 pt-0">
                <div className="grid grid-cols-7 gap-2 text-center">
                  {promDow.map((prom, dow) => (
                    <div key={dow} className={`p-2 rounded ${
                      coberturaDias.some(d => d.dow === dow) ? 'bg-cyan-100' : 'bg-white'
                    }`}>
                      <div className="text-xs text-gray-500">{NOMBRES_DIA[dow]}</div>
                      <div className={`text-sm font-bold ${prom > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                        {prom > 0 ? (prom / unidadesPorBulto).toFixed(1) : '-'}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Los días resaltados en azul son los que cubre este pedido.
                </p>
              </div>
            </details>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-5 py-4 border-t flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
