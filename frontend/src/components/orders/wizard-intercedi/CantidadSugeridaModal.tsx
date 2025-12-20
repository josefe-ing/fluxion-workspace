import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import type { ProductoInterCedi, ConfiguracionDiasCobertura } from '../../../services/pedidosInterCediService';
import {
  CEDI_ORIGEN_NOMBRES,
  ABC_COLORS,
  formatNumber
} from '../../../services/pedidosInterCediService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: ProductoInterCedi;
  config: ConfiguracionDiasCobertura & { lead_time_dias: number };
}

// Obtener días de cobertura según clasificación ABC
const getDiasCoberturaPorABC = (abc: string, config: ConfiguracionDiasCobertura): number => {
  switch (abc) {
    case 'A': return config.dias_cobertura_a;
    case 'B': return config.dias_cobertura_b;
    case 'C': return config.dias_cobertura_c;
    default: return config.dias_cobertura_d;
  }
};

export default function CantidadSugeridaModal({
  isOpen,
  onClose,
  producto,
  config
}: Props) {
  const unidadesPorBulto = producto.unidades_por_bulto || 1;
  const abc = producto.clasificacion_abc || 'D';
  const abcColor = ABC_COLORS[abc] || ABC_COLORS.D;

  // Valores del backend (ya calculados correctamente)
  const demandaP75Unid = producto.demanda_regional_p75;
  const demandaP75Bultos = demandaP75Unid / unidadesPorBulto;
  const stockActualUnid = producto.stock_actual_cedi;
  const stockActualBultos = stockActualUnid / unidadesPorBulto;

  // Parámetros de configuración
  const leadTimeDias = config.lead_time_dias;
  const diasCoberturaABC = getDiasCoberturaPorABC(abc, config);

  // Valores calculados por el backend
  const stockSeguridadUnid = producto.stock_seguridad_cedi;
  const stockSeguridadBultos = stockSeguridadUnid / unidadesPorBulto;

  const stockMinimoUnid = producto.stock_minimo_cedi; // ROP
  const stockMinimoBultos = stockMinimoUnid / unidadesPorBulto;

  const stockMaximoUnid = producto.stock_maximo_cedi;
  const stockMaximoBultos = stockMaximoUnid / unidadesPorBulto;

  const cantidadSugeridaUnid = producto.cantidad_sugerida_unidades;
  const cantidadSugeridaBultos = producto.cantidad_sugerida_bultos;

  // Stock en CEDI Origen
  const stockOrigenUnid = producto.stock_cedi_origen;
  const stockOrigenBultos = stockOrigenUnid / unidadesPorBulto;
  const cediOrigenNombre = CEDI_ORIGEN_NOMBRES[producto.cedi_origen_id] || producto.cedi_origen_id;

  // Cantidad ideal (antes de limitar por stock origen)
  const cantidadIdealUnid = producto.cantidad_ideal_unidades ?? Math.max(0, stockMaximoUnid - stockActualUnid);
  const cantidadIdealBultos = cantidadIdealUnid / unidadesPorBulto;

  // Verificar condición de pedido
  const stockBajoROP = stockActualUnid <= stockMinimoUnid;
  const hayStockSuficienteOrigen = stockOrigenUnid >= cantidadIdealUnid;

  // Días de stock actual
  const diasStockActual = demandaP75Unid > 0 ? stockActualUnid / demandaP75Unid : 999;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                {/* Header */}
                <div className="bg-emerald-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-white">
                        Cálculo de Cantidad Sugerida
                      </Dialog.Title>
                      <p className="text-sm text-emerald-200 mt-1">
                        {producto.codigo_producto} - {producto.descripcion_producto}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-emerald-200 hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Resultado principal */}
                  <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-emerald-700 font-medium">Cantidad Sugerida</div>
                        <div className="text-3xl font-bold text-emerald-800">
                          {formatNumber(cantidadSugeridaBultos, 0)} <span className="text-lg font-medium">bultos</span>
                        </div>
                        <div className="text-xs text-emerald-600 mt-1">
                          {formatNumber(cantidadSugeridaUnid, 0)} unidades
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-semibold ${abcColor}`}>
                          Clase {abc}
                        </span>
                        <div className="text-xs text-gray-500 mt-2">
                          {diasCoberturaABC} días cobertura
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Condición de pedido - IMPORTANTE */}
                  <div className={`rounded-lg p-4 border-2 ${stockBajoROP ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                    <div className="flex items-center gap-3">
                      {stockBajoROP ? (
                        <>
                          <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-semibold text-red-800">Stock bajo el Punto de Reorden</div>
                            <div className="text-sm text-red-700">
                              Stock actual ({formatNumber(stockActualBultos, 1)}b) ≤ ROP ({formatNumber(stockMinimoBultos, 1)}b) → <strong>Se genera pedido</strong>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-semibold text-green-800">Stock sobre el Punto de Reorden</div>
                            <div className="text-sm text-green-700">
                              Stock actual ({formatNumber(stockActualBultos, 1)}b) &gt; ROP ({formatNumber(stockMinimoBultos, 1)}b) → <strong>No se genera pedido</strong>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Fórmula principal */}
                  <div className="bg-gray-900 rounded-lg p-4 text-white font-mono text-sm">
                    <div className="text-emerald-400 mb-2">// Lógica de cálculo</div>
                    <div className="space-y-1">
                      <div className="text-gray-400">
                        <span className="text-blue-400">if</span> (Stock_Actual ≤ ROP) {'{'}
                      </div>
                      <div className="pl-4">
                        <span className="text-yellow-400">Cantidad_Ideal</span> = Stock_Máximo - Stock_Actual
                      </div>
                      <div className="pl-4 text-gray-500">
                        = {formatNumber(stockMaximoUnid, 0)} - {formatNumber(stockActualUnid, 0)} = {formatNumber(cantidadIdealUnid, 0)} unid
                      </div>
                      <div className="text-gray-400">{'}'} <span className="text-blue-400">else</span> {'{'}</div>
                      <div className="pl-4 text-gray-500">Cantidad_Ideal = 0  <span className="text-gray-600">// No se necesita pedir</span></div>
                      <div className="text-gray-400">{'}'}</div>
                      <div className="mt-2 border-t border-gray-700 pt-2">
                        <span className="text-yellow-400">Cantidad_Sugerida</span> = min(Cantidad_Ideal, Stock_Origen)
                      </div>
                      <div className="text-gray-500 pl-4">
                        = min({formatNumber(cantidadIdealUnid, 0)}, {formatNumber(stockOrigenUnid, 0)}) = <span className="text-emerald-400 font-bold">{formatNumber(cantidadSugeridaUnid, 0)} unid</span>
                      </div>
                    </div>
                  </div>

                  {/* Umbrales de inventario */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Umbrales de Inventario CEDI Caracas
                    </h3>

                    {/* Barra visual de umbrales */}
                    <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden mb-4">
                      {/* Zona SS */}
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-red-400"
                        style={{ width: `${Math.min((stockSeguridadUnid / stockMaximoUnid) * 100, 100)}%` }}
                      />
                      {/* Zona ROP */}
                      <div
                        className="absolute top-0 bottom-0 bg-orange-400"
                        style={{
                          left: `${(stockSeguridadUnid / stockMaximoUnid) * 100}%`,
                          width: `${((stockMinimoUnid - stockSeguridadUnid) / stockMaximoUnid) * 100}%`
                        }}
                      />
                      {/* Zona Óptima */}
                      <div
                        className="absolute top-0 bottom-0 bg-green-400"
                        style={{
                          left: `${(stockMinimoUnid / stockMaximoUnid) * 100}%`,
                          width: `${((stockMaximoUnid - stockMinimoUnid) / stockMaximoUnid) * 100}%`
                        }}
                      />

                      {/* Indicador de stock actual */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-gray-900 z-10"
                        style={{ left: `${Math.min((stockActualUnid / stockMaximoUnid) * 100, 100)}%` }}
                      >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                          Actual: {formatNumber(stockActualBultos, 0)}b
                        </div>
                      </div>
                    </div>

                    {/* Tabla de umbrales */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs">
                          <th className="text-left py-1">Umbral</th>
                          <th className="text-right py-1">Días</th>
                          <th className="text-right py-1">Bultos</th>
                          <th className="text-right py-1">Unidades</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <tr className="text-red-700">
                          <td className="py-2 font-medium">SS (Stock Seguridad)</td>
                          <td className="text-right">{formatNumber(stockSeguridadUnid / demandaP75Unid, 1)}d</td>
                          <td className="text-right">{formatNumber(stockSeguridadBultos, 1)}</td>
                          <td className="text-right">{formatNumber(stockSeguridadUnid, 0)}</td>
                        </tr>
                        <tr className="text-orange-700">
                          <td className="py-2 font-medium">ROP (Punto Reorden)</td>
                          <td className="text-right">{formatNumber(stockMinimoUnid / demandaP75Unid, 1)}d</td>
                          <td className="text-right">{formatNumber(stockMinimoBultos, 1)}</td>
                          <td className="text-right">{formatNumber(stockMinimoUnid, 0)}</td>
                        </tr>
                        <tr className={stockBajoROP ? 'text-red-600 font-semibold bg-red-50' : 'text-gray-900'}>
                          <td className="py-2 font-medium">Stock Actual</td>
                          <td className="text-right">{formatNumber(diasStockActual, 1)}d</td>
                          <td className="text-right">{formatNumber(stockActualBultos, 1)}</td>
                          <td className="text-right">{formatNumber(stockActualUnid, 0)}</td>
                        </tr>
                        <tr className="text-green-700">
                          <td className="py-2 font-medium">MAX (Stock Máximo)</td>
                          <td className="text-right">{formatNumber(stockMaximoUnid / demandaP75Unid, 1)}d</td>
                          <td className="text-right">{formatNumber(stockMaximoBultos, 1)}</td>
                          <td className="text-right">{formatNumber(stockMaximoUnid, 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Fórmulas de cálculo */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-3">Fórmulas Utilizadas</h3>
                    <div className="space-y-2 text-sm font-mono">
                      <div className="bg-white rounded p-2 border">
                        <span className="text-orange-600">SS</span> = Z<sub>{abc}</sub> × σ<sub>regional</sub> × √Lead_Time
                        <span className="text-gray-400 ml-2 text-xs">(σ = desviación estándar de demanda)</span>
                      </div>
                      <div className="bg-white rounded p-2 border">
                        <span className="text-orange-600">ROP</span> = (Demanda_P75 × Lead_Time) + SS
                        <span className="text-gray-400 ml-2 text-xs">= ({formatNumber(demandaP75Unid, 1)} × {leadTimeDias}) + {formatNumber(stockSeguridadUnid, 0)}</span>
                      </div>
                      <div className="bg-white rounded p-2 border">
                        <span className="text-green-600">MAX</span> = ROP + (Demanda_P75 × Días_Cobertura_{abc})
                        <span className="text-gray-400 ml-2 text-xs">= {formatNumber(stockMinimoUnid, 0)} + ({formatNumber(demandaP75Unid, 1)} × {diasCoberturaABC})</span>
                      </div>
                    </div>
                  </div>

                  {/* Stock en origen */}
                  <div className={`rounded-lg p-4 ${hayStockSuficienteOrigen ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-700">Stock Disponible en {cediOrigenNombre}</div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatNumber(stockOrigenBultos, 0)} bultos
                          <span className="text-sm font-normal text-gray-500 ml-1">({formatNumber(stockOrigenUnid, 0)} u)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {hayStockSuficienteOrigen ? (
                          <div className="flex items-center gap-2 text-green-700">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium">Stock suficiente</span>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 text-amber-700">
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <span className="font-medium">Stock limitado</span>
                            </div>
                            <div className="text-xs text-amber-700 mt-1">
                              Ideal: {formatNumber(cantidadIdealBultos, 0)}b → Posible: {formatNumber(cantidadSugeridaBultos, 0)}b
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Parámetros de configuración */}
                  <div className="bg-gray-100 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-2">Parámetros de configuración</div>
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <div className="text-center">
                        <div className="text-gray-500">Lead Time</div>
                        <div className="font-semibold">{leadTimeDias} días</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Días A</div>
                        <div className="font-semibold">{config.dias_cobertura_a}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Días B</div>
                        <div className="font-semibold">{config.dias_cobertura_b}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Días C</div>
                        <div className="font-semibold">{config.dias_cobertura_c}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Días D</div>
                        <div className="font-semibold">{config.dias_cobertura_d}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
