import { useState } from 'react';
import { X, Calendar, CheckCircle2, XCircle, AlertTriangle, Package, Truck, ShoppingCart, ChevronDown, ChevronUp, Info } from 'lucide-react';

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
    clasificacion_abc?: string;
    v2_prom_dow?: number[];
    v2_demanda_periodo?: number;
    v2_cantidad_sugerida_unid?: number;
    v2_cantidad_sugerida_bultos?: number;
    v2_diferencia_bultos?: number;
    v2_cobertura_dias?: {
      dia: string;
      fecha: string;
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
    v2_fecha_pedido?: string;
    v2_fecha_llegada?: string;
    v2_dias_cobertura_config?: number;
    v2_lead_time_config?: number;
    v2_historico_dow?: {
      dow: number;
      nombre: string;
      promedio: number;
      dias_con_data: number;
      detalle: { fecha: string; venta: number }[];
    }[];
  };
}

export default function CoberturaRealModal({ isOpen, onClose, producto }: CoberturaRealModalProps) {
  const [historicoExpandido, setHistoricoExpandido] = useState<number | null>(null);

  if (!isOpen) return null;

  const coberturaDias = producto.v2_cobertura_dias || [];
  const demandaPeriodo = producto.v2_demanda_periodo || 0;
  const historicoDow = producto.v2_historico_dow || [];
  const unidadesPorBulto = producto.cantidad_bultos || 1;

  const sugeridoV1 = producto.cantidad_sugerida_bultos;
  const sugeridoV2 = producto.v2_cantidad_sugerida_bultos || 0;
  const diferencia = producto.v2_diferencia_bultos || 0;
  const stockActual = producto.stock_tienda;
  const diasCoberturaConfig = producto.v2_dias_cobertura_config || coberturaDias.length;
  const leadTimeConfig = producto.v2_lead_time_config || 1;

  // Calcular demanda promedio P75 en bultos
  const p75Bultos = (producto.prom_p75_unid || 0) / unidadesPorBulto;

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
                {producto.clasificacion_abc && (
                  <>
                    <span>•</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded">Clase {producto.clasificacion_abc}</span>
                  </>
                )}
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

          {/* SECCIÓN 2: Timeline del pedido con fechas exactas */}
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
                <div className="text-xs text-blue-600 font-medium">{producto.v2_fecha_pedido}</div>
                <div className="text-xs text-gray-600">Haces el pedido</div>
              </div>
              <div className="flex-shrink-0 w-12 border-t-2 border-dashed border-blue-300 relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs text-blue-500 bg-blue-50 px-1">
                  {leadTimeConfig}d
                </span>
              </div>
              <div className="flex-1">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div className="text-xs text-gray-500">LLEGADA</div>
                <div className="font-bold text-blue-800">{producto.v2_dia_llegada}</div>
                <div className="text-xs text-blue-600 font-medium">{producto.v2_fecha_llegada}</div>
                <div className="text-xs text-gray-600">Llega el pedido</div>
              </div>
              <div className="flex-shrink-0 w-12 border-t-2 border-dashed border-cyan-300" />
              <div className="flex-1">
                <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div className="text-xs text-gray-500">COBERTURA</div>
                <div className="font-bold text-cyan-700">{diasCoberturaConfig} días</div>
                <div className="text-xs text-cyan-600 font-medium">
                  {coberturaDias.length > 0 && `${coberturaDias[0].fecha} - ${coberturaDias[coberturaDias.length - 1]?.fecha}`}
                </div>
                <div className="text-xs text-gray-600">Clase {producto.clasificacion_abc || 'A'}</div>
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
                  P75 ({p75Bultos.toFixed(1)} blt/día) × {diasCoberturaConfig} días
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

          {/* SECCIÓN 4: Demanda día a día con fechas exactas */}
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
                      <div className={`w-20 text-sm ${
                        esAlto ? 'text-orange-600 font-bold' : esBajo ? 'text-green-600' : 'text-gray-700'
                      }`}>
                        <span className="font-bold">{dia.dia}</span>
                        <span className="text-xs text-gray-500 ml-1">{dia.fecha}</span>
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
                    <th className="px-3 py-2 text-left font-semibold border-b">Fecha</th>
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
                      <td className="px-3 py-2 text-gray-600 border-b">{dia.fecha}</td>
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

          {/* SECCIÓN 7: Histórico detallado por día de semana */}
          {historicoDow.length > 0 && historicoDow.some(h => h.dias_con_data > 0) && (
            <div className="bg-gray-50 rounded-lg border border-gray-200">
              <div className="p-3 border-b border-gray-200">
                <h4 className="font-medium text-gray-700 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Histórico de ventas por día de semana (últimos 30 días)
                </h4>
              </div>
              <div className="p-4 space-y-2">
                {historicoDow.map((dowData) => {
                  const esDiaEnPeriodo = coberturaDias.some(d => d.dow === dowData.dow);
                  const isExpanded = historicoExpandido === dowData.dow;

                  return (
                    <div key={dowData.dow} className={`rounded-lg border ${esDiaEnPeriodo ? 'border-cyan-300 bg-cyan-50' : 'border-gray-200 bg-white'}`}>
                      <button
                        onClick={() => setHistoricoExpandido(isExpanded ? null : dowData.dow)}
                        className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-bold w-10 ${esDiaEnPeriodo ? 'text-cyan-700' : 'text-gray-700'}`}>
                            {dowData.nombre}
                          </span>
                          <span className="font-mono text-lg font-bold text-gray-800">
                            {(dowData.promedio / unidadesPorBulto).toFixed(1)} blt
                          </span>
                          <span className="text-xs text-gray-500">
                            promedio de {dowData.dias_con_data} {dowData.dias_con_data === 1 ? 'día' : 'días'}
                          </span>
                          {esDiaEnPeriodo && (
                            <span className="text-xs bg-cyan-200 text-cyan-800 px-2 py-0.5 rounded">
                              En período
                            </span>
                          )}
                        </div>
                        {dowData.dias_con_data > 0 && (
                          isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />
                        )}
                      </button>

                      {isExpanded && dowData.detalle && dowData.detalle.length > 0 && (
                        <div className="px-3 pb-3 border-t border-gray-100">
                          <table className="w-full text-sm mt-2">
                            <thead>
                              <tr className="text-gray-500 text-xs">
                                <th className="text-left py-1">Fecha</th>
                                <th className="text-right py-1">Venta (unid)</th>
                                <th className="text-right py-1">Venta (blt)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dowData.detalle.map((d, idx) => (
                                <tr key={idx} className="border-t border-gray-100">
                                  <td className="py-1 text-gray-700">{d.fecha}</td>
                                  <td className="py-1 text-right font-mono text-gray-600">{d.venta.toFixed(0)}</td>
                                  <td className="py-1 text-right font-mono font-medium text-gray-800">
                                    {(d.venta / unidadesPorBulto).toFixed(1)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-300 font-bold">
                                <td className="py-1 text-gray-700">Promedio</td>
                                <td className="py-1 text-right font-mono text-gray-600">{dowData.promedio.toFixed(0)}</td>
                                <td className="py-1 text-right font-mono text-cyan-700">
                                  {(dowData.promedio / unidadesPorBulto).toFixed(1)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
