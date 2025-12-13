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

  // Valores base
  const demandaP75Unid = producto.demanda_regional_p75;
  const demandaP75Bultos = demandaP75Unid / unidadesPorBulto;
  const stockActualUnid = producto.stock_actual_cedi;
  const stockTransitoUnid = producto.stock_en_transito || 0;

  // Parámetros de configuración
  const leadTimeDias = config.lead_time_dias;
  const diasCoberturaABC = getDiasCoberturaPorABC(abc, config);

  // Cálculos paso a paso
  // Stock de Seguridad = Demanda_P75 × √Lead_Time × 1.28 (Z para 90%)
  const stockSeguridadUnid = producto.stock_seguridad_cedi;
  const stockSeguridadBultos = stockSeguridadUnid / unidadesPorBulto;

  // Stock Mínimo (ROP) = Demanda_P75 × Lead_Time + Stock_Seguridad
  const stockMinimoUnid = producto.stock_minimo_cedi;
  const stockMinimoBultos = stockMinimoUnid / unidadesPorBulto;

  // Stock Máximo = Stock_Mínimo + (Demanda_P75 × Días_Cobertura_ABC)
  const stockMaximoUnid = producto.stock_maximo_cedi;
  const stockMaximoBultos = stockMaximoUnid / unidadesPorBulto;

  // Stock Disponible = Stock_Actual + Stock_En_Tránsito
  const stockDisponibleUnid = stockActualUnid + stockTransitoUnid;
  const stockDisponibleBultos = stockDisponibleUnid / unidadesPorBulto;

  // Cantidad Sugerida = max(0, Stock_Máximo - Stock_Disponible)
  const cantidadSugeridaUnid = producto.cantidad_sugerida_unidades;
  const cantidadSugeridaBultos = producto.cantidad_sugerida_bultos;

  // Stock en CEDI Origen
  const stockOrigenUnid = producto.stock_cedi_origen;
  const stockOrigenBultos = stockOrigenUnid / unidadesPorBulto;
  const cediOrigenNombre = CEDI_ORIGEN_NOMBRES[producto.cedi_origen_id] || producto.cedi_origen_id;

  // Cantidad ideal (antes de limitar por stock origen)
  // Si el backend no envía cantidad_ideal, la calculamos como stock_maximo - stock_disponible
  const stockDisponibleParaCalculo = stockActualUnid + stockTransitoUnid;
  const cantidadIdealCalculada = Math.max(0, stockMaximoUnid - stockDisponibleParaCalculo);
  const cantidadIdealUnid = producto.cantidad_ideal_unidades ?? cantidadIdealCalculada;
  const cantidadIdealBultos = cantidadIdealUnid / unidadesPorBulto;

  // Verificar si hay stock suficiente en origen
  // Solo mostrar "limitado" si realmente falta stock (cantidad sugerida < ideal)
  const faltanteUnid = Math.max(0, cantidadIdealUnid - stockOrigenUnid);
  const faltanteBultos = faltanteUnid / unidadesPorBulto;
  const hayStockSuficiente = faltanteUnid <= 0;

  // Razón del pedido
  const razonPedido = producto.razon_pedido || 'sin_demanda';

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

                  {/* Fórmula principal */}
                  <div className="bg-gray-900 rounded-lg p-4 text-white font-mono text-sm">
                    <div className="text-emerald-400 mb-2">// Fórmula de cálculo</div>
                    <div className="space-y-1">
                      <div><span className="text-yellow-400">Cantidad_Sugerida</span> = max(0, Stock_Máximo - Stock_Disponible)</div>
                      <div className="text-gray-400 pl-4">
                        = max(0, {formatNumber(stockMaximoUnid, 0)} - {formatNumber(stockDisponibleUnid, 0)})
                      </div>
                      <div className="text-emerald-400 pl-4">
                        = <span className="font-bold">{formatNumber(cantidadSugeridaUnid, 0)} unidades</span>
                        <span className="text-gray-400"> ({formatNumber(cantidadSugeridaBultos, 1)} bultos)</span>
                      </div>
                    </div>
                  </div>

                  {/* Desglose paso a paso */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Desglose del Cálculo
                    </h3>

                    {/* Paso 1: Demanda */}
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded">1</span>
                        <span className="font-medium text-purple-900">Demanda Regional P75</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Por día:</span>
                          <span className="font-semibold ml-2">{formatNumber(demandaP75Unid, 1)} unid</span>
                          <span className="text-gray-400 ml-1">({formatNumber(demandaP75Bultos, 2)} b)</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Tiendas:</span>
                          <span className="font-semibold ml-2">{producto.num_tiendas_region}</span>
                        </div>
                      </div>
                    </div>

                    {/* Paso 2: Stock Seguridad */}
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded">2</span>
                        <span className="font-medium text-orange-900">Stock de Seguridad</span>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        SS = Demanda_P75 × √Lead_Time × Z<sub>90%</sub>
                      </div>
                      <div className="font-mono text-xs bg-white rounded p-2 text-gray-700">
                        = {formatNumber(demandaP75Unid, 1)} × √{leadTimeDias} × 1.28 = <strong>{formatNumber(stockSeguridadUnid, 0)}</strong> unid
                        <span className="text-gray-400"> ({formatNumber(stockSeguridadBultos, 1)} b)</span>
                      </div>
                    </div>

                    {/* Paso 3: Stock Mínimo (ROP) */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded">3</span>
                        <span className="font-medium text-amber-900">Stock Mínimo (Punto de Reorden)</span>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        ROP = Demanda_P75 × Lead_Time + Stock_Seguridad
                      </div>
                      <div className="font-mono text-xs bg-white rounded p-2 text-gray-700">
                        = {formatNumber(demandaP75Unid, 1)} × {leadTimeDias} + {formatNumber(stockSeguridadUnid, 0)} = <strong>{formatNumber(stockMinimoUnid, 0)}</strong> unid
                        <span className="text-gray-400"> ({formatNumber(stockMinimoBultos, 1)} b)</span>
                      </div>
                    </div>

                    {/* Paso 4: Stock Máximo */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">4</span>
                        <span className="font-medium text-green-900">Stock Máximo (Target)</span>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        Stock_Max = ROP + (Demanda_P75 × Días_Cobertura_Clase_{abc})
                      </div>
                      <div className="font-mono text-xs bg-white rounded p-2 text-gray-700">
                        = {formatNumber(stockMinimoUnid, 0)} + ({formatNumber(demandaP75Unid, 1)} × {diasCoberturaABC}) = <strong>{formatNumber(stockMaximoUnid, 0)}</strong> unid
                        <span className="text-gray-400"> ({formatNumber(stockMaximoBultos, 1)} b)</span>
                      </div>
                    </div>

                    {/* Paso 5: Stock Disponible */}
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-sky-600 text-white text-xs font-bold px-2 py-0.5 rounded">5</span>
                        <span className="font-medium text-sky-900">Stock Disponible (CEDI Destino)</span>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        Stock_Disponible = Stock_Actual + Stock_En_Tránsito
                      </div>
                      <div className="font-mono text-xs bg-white rounded p-2 text-gray-700">
                        = {formatNumber(stockActualUnid, 0)} + {formatNumber(stockTransitoUnid, 0)} = <strong>{formatNumber(stockDisponibleUnid, 0)}</strong> unid
                        <span className="text-gray-400"> ({formatNumber(stockDisponibleBultos, 1)} b)</span>
                      </div>
                    </div>
                  </div>

                  {/* Verificación de stock en origen */}
                  <div className={`rounded-lg p-4 ${hayStockSuficiente ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-700">Stock en {cediOrigenNombre}</div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatNumber(stockOrigenBultos, 0)} bultos
                          <span className="text-sm font-normal text-gray-500 ml-1">({formatNumber(stockOrigenUnid, 0)} u)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {hayStockSuficiente ? (
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
                              Ideal: {formatNumber(cantidadIdealBultos, 0)} b → Posible: {formatNumber(cantidadSugeridaBultos, 0)} b
                            </div>
                            <div className="text-xs text-amber-600">
                              Faltan: {formatNumber(faltanteBultos, 0)} b
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Razón del pedido */}
                  {razonPedido && razonPedido !== 'sin_demanda' && (
                    <div className="bg-gray-100 rounded-lg p-3 text-sm">
                      <span className="text-gray-600">Razón del pedido:</span>
                      <span className="font-medium ml-2 text-gray-900">
                        {razonPedido === 'bajo_minimo' && 'Stock bajo el mínimo (ROP)'}
                        {razonPedido === 'bajo_seguridad' && 'Stock bajo seguridad'}
                        {razonPedido === 'reposicion_normal' && 'Reposición normal'}
                        {razonPedido === 'sin_stock' && 'Sin stock'}
                      </span>
                    </div>
                  )}

                  {/* Parámetros de configuración */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-2">Parámetros de configuración</div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
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
                        <div className="text-gray-500">Días C/D</div>
                        <div className="font-semibold">{config.dias_cobertura_c}/{config.dias_cobertura_d}</div>
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
