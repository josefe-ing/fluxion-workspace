import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import type { ProductoInterCedi } from '../../../services/pedidosInterCediService';
import {
  ABC_COLORS,
  formatNumber
} from '../../../services/pedidosInterCediService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: ProductoInterCedi;
}

// Colores para tiendas
const TIENDA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'tienda_17': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'tienda_18': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const getTiendaColor = (tiendaId: string) => {
  return TIENDA_COLORS[tiendaId] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
};

export default function StockTiendasModal({
  isOpen,
  onClose,
  producto
}: Props) {
  const unidadesPorBulto = producto.unidades_por_bulto || 1;
  const abc = producto.clasificacion_abc || 'D';
  const abcColor = ABC_COLORS[abc] || ABC_COLORS.D;

  // Stock total en tiendas
  const stockTotalUnid = producto.stock_tiendas_total || 0;
  const stockTotalBultos = stockTotalUnid / unidadesPorBulto;

  // Stock por tienda
  const stockPorTienda = producto.stock_por_tienda || [];

  // Demanda P75 regional
  const demandaP75Unid = producto.demanda_regional_p75;

  // Días de stock en tiendas
  const diasStockTiendas = demandaP75Unid > 0 ? stockTotalUnid / demandaP75Unid : 999;

  // P75 por tienda (para comparar con stock)
  const p75PorTienda = producto.p75_por_tienda || [];

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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                {/* Header */}
                <div className="bg-indigo-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-white">
                        Stock en Tiendas
                      </Dialog.Title>
                      <p className="text-sm text-indigo-200 mt-1">
                        {producto.codigo_producto} - {producto.descripcion_producto}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-indigo-200 hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Stock total */}
                  <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-indigo-700 font-medium">Stock Total en Tiendas</div>
                        <div className="text-3xl font-bold text-indigo-900">
                          {formatNumber(stockTotalBultos, 0)} <span className="text-lg font-medium">bultos</span>
                        </div>
                        <div className="text-xs text-indigo-600 mt-1">
                          {formatNumber(stockTotalUnid, 0)} unidades
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Cobertura</div>
                        <div className={`text-2xl font-bold ${diasStockTiendas <= 3 ? 'text-red-600' : diasStockTiendas <= 7 ? 'text-orange-500' : 'text-green-600'}`}>
                          {diasStockTiendas >= 999 ? '∞' : formatNumber(diasStockTiendas, 1)}
                        </div>
                        <div className="text-xs text-gray-500">días</div>
                      </div>
                    </div>
                  </div>

                  {/* Desglose por tienda */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Detalle por Tienda
                    </h3>

                    {stockPorTienda.length > 0 ? (
                      <div className="space-y-3">
                        {stockPorTienda.map((tienda) => {
                          const colors = getTiendaColor(tienda.tienda_id);
                          const stockUnid = tienda.stock_unidades || 0;
                          const stockBultos = stockUnid / unidadesPorBulto;

                          // Buscar P75 de esta tienda
                          const p75Tienda = p75PorTienda.find(p => p.tienda_id === tienda.tienda_id);
                          const p75Unid = p75Tienda?.p75_unidades || 0;
                          const diasStock = p75Unid > 0 ? stockUnid / p75Unid : 999;

                          return (
                            <div
                              key={tienda.tienda_id}
                              className={`${colors.bg} ${colors.border} border rounded-lg p-4`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className={`font-semibold ${colors.text}`}>
                                    {tienda.tienda_nombre}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    P75: {formatNumber(p75Unid, 1)} unid/día
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(stockBultos, 0)} <span className="text-sm font-medium">b</span>
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {formatNumber(stockUnid, 0)} unid
                                  </div>
                                  <div className={`text-xs font-medium mt-1 ${diasStock <= 3 ? 'text-red-600' : diasStock <= 7 ? 'text-orange-500' : 'text-green-600'}`}>
                                    {diasStock >= 999 ? '∞' : formatNumber(diasStock, 0)} días
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">
                        <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        Sin stock en tiendas
                      </div>
                    )}
                  </div>

                  {/* Info del producto */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">Clasificación</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold ${abcColor}`}>
                        Clase {abc}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">Unid/Bulto</div>
                      <div className="font-semibold text-gray-900">{unidadesPorBulto}</div>
                    </div>
                  </div>

                  {/* Fórmula */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <div className="font-mono text-xs text-gray-700">
                      <span className="text-indigo-700">Días_Stock_Tiendas</span> = Stock_Total_Tiendas / Demanda_P75
                      <span className="text-gray-500 ml-2">
                        = {formatNumber(stockTotalUnid, 0)} / {formatNumber(demandaP75Unid, 1)}
                        = <strong>{diasStockTiendas >= 999 ? '∞' : formatNumber(diasStockTiendas, 1)}</strong> días
                      </span>
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
