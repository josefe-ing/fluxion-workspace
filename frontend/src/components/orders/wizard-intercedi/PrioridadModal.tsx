import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import type { ProductoInterCedi } from '../../../services/pedidosInterCediService';
import {
  ABC_COLORS,
  CEDI_ORIGEN_NOMBRES,
  formatNumber
} from '../../../services/pedidosInterCediService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: ProductoInterCedi;
}

// Calcular días de stock
const calcularDiasStock = (stock: number, demandaDiaria: number): number => {
  if (demandaDiaria <= 0) return 999;
  return stock / demandaDiaria;
};

// Matriz de prioridades: ABC × Días de stock
const MATRIZ_PRIORIDAD = [
  [1, 2, 4, 7],   // A: crítico=1, bajo=2, moderado=4, suficiente=7
  [3, 5, 6, 8],   // B: crítico=3, bajo=5, moderado=6, suficiente=8
  [5, 7, 8, 9],   // C: crítico=5, bajo=7, moderado=8, suficiente=9
  [6, 8, 9, 10],  // D: crítico=6, bajo=8, moderado=9, suficiente=10
];

// Calcular prioridad
const calcularPrioridad = (abc: string, diasStock: number): number => {
  const abcIndex = abc === 'A' ? 0 : abc === 'B' ? 1 : abc === 'C' ? 2 : 3;
  const diasIndex = diasStock <= 3 ? 0 : diasStock <= 7 ? 1 : diasStock <= 14 ? 2 : 3;
  return MATRIZ_PRIORIDAD[abcIndex][diasIndex];
};

// Estilo de prioridad
const getPrioridadStyle = (prioridad: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
  headerBg: string;
  headerText: string;
} => {
  if (prioridad <= 2) return {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    label: 'CRÍTICO',
    headerBg: 'bg-gradient-to-r from-red-600 to-red-500',
    headerText: 'text-white'
  };
  if (prioridad <= 4) return {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
    label: 'ALTO',
    headerBg: 'bg-gradient-to-r from-orange-500 to-orange-400',
    headerText: 'text-white'
  };
  if (prioridad <= 6) return {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    label: 'MEDIO',
    headerBg: 'bg-gradient-to-r from-yellow-500 to-yellow-400',
    headerText: 'text-gray-900'
  };
  if (prioridad <= 8) return {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    label: 'BAJO',
    headerBg: 'bg-gradient-to-r from-blue-500 to-blue-400',
    headerText: 'text-white'
  };
  return {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
    label: 'MÍNIMO',
    headerBg: 'bg-gradient-to-r from-gray-500 to-gray-400',
    headerText: 'text-white'
  };
};

// Estilo de días de stock
const getDiasStockStyle = (dias: number): { bg: string; text: string; label: string; index: number } => {
  if (dias <= 3) return { bg: 'bg-red-500', text: 'text-red-700', label: 'Crítico', index: 0 };
  if (dias <= 7) return { bg: 'bg-orange-500', text: 'text-orange-700', label: 'Bajo', index: 1 };
  if (dias <= 14) return { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'Moderado', index: 2 };
  return { bg: 'bg-green-500', text: 'text-green-700', label: 'Suficiente', index: 3 };
};

export default function PrioridadModal({
  isOpen,
  onClose,
  producto
}: Props) {
  const abc = producto.clasificacion_abc || 'D';
  const abcColor = ABC_COLORS[abc] || ABC_COLORS.D;
  const unidadesPorBulto = producto.unidades_por_bulto || 1;

  // Calcular días de stock
  const diasStock = calcularDiasStock(producto.stock_actual_cedi, producto.demanda_regional_p75);
  const diasStockStyle = getDiasStockStyle(diasStock);

  // Calcular prioridad
  const prioridad = calcularPrioridad(abc, diasStock);
  const prioridadStyle = getPrioridadStyle(prioridad);

  // Índices para la matriz
  const abcIndex = abc === 'A' ? 0 : abc === 'B' ? 1 : abc === 'C' ? 2 : 3;
  const diasIndex = diasStock <= 3 ? 0 : diasStock <= 7 ? 1 : diasStock <= 14 ? 2 : 3;

  // Calcular posición del indicador en la barra (0-100%)
  const calcularPosicionBarra = (): number => {
    if (diasStock >= 999) return 100;
    if (diasStock <= 0) return 0;
    // Escala: 0-3 = 0-25%, 3-7 = 25-50%, 7-14 = 50-75%, 14+ = 75-100%
    if (diasStock <= 3) return (diasStock / 3) * 25;
    if (diasStock <= 7) return 25 + ((diasStock - 3) / 4) * 25;
    if (diasStock <= 14) return 50 + ((diasStock - 7) / 7) * 25;
    return Math.min(75 + ((diasStock - 14) / 14) * 25, 100);
  };

  const posicionBarra = calcularPosicionBarra();

  // Stock origen
  const stockOrigenBultos = producto.stock_cedi_origen / unidadesPorBulto;
  const cediOrigenNombre = CEDI_ORIGEN_NOMBRES[producto.cedi_origen_id] || 'CEDI Origen';

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
                {/* Header con gradiente */}
                <div className={`${prioridadStyle.headerBg} px-6 py-4`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Indicador grande de prioridad */}
                      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40">
                        <span className={`text-2xl font-bold ${prioridadStyle.headerText}`}>
                          {prioridad}
                        </span>
                      </div>
                      <div>
                        <Dialog.Title className={`text-lg font-bold ${prioridadStyle.headerText}`}>
                          Prioridad: {prioridadStyle.label}
                        </Dialog.Title>
                        <p className={`text-sm ${prioridadStyle.headerText} opacity-90 mt-0.5`}>
                          {producto.codigo_producto} - {producto.descripcion_producto}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className={`${prioridadStyle.headerText} opacity-80 hover:opacity-100 transition-opacity`}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Barra visual de posición de stock */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Posición del Stock vs Rangos de Días
                    </div>

                    {/* Barra de rangos */}
                    <div className="relative h-8 rounded-full overflow-hidden flex">
                      <div className="w-1/4 bg-red-400 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-white">≤3d</span>
                      </div>
                      <div className="w-1/4 bg-orange-400 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-white">4-7d</span>
                      </div>
                      <div className="w-1/4 bg-yellow-400 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-gray-800">8-14d</span>
                      </div>
                      <div className="w-1/4 bg-green-400 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-white">&gt;14d</span>
                      </div>

                      {/* Indicador de posición */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg transition-all duration-300"
                        style={{ left: `${posicionBarra}%` }}
                      >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                          {diasStock >= 999 ? '∞' : formatNumber(diasStock, 1)}d
                        </div>
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                      </div>
                    </div>

                    {/* Etiquetas de rangos */}
                    <div className="flex mt-2">
                      <div className="w-1/4 text-center">
                        <span className="text-[10px] text-red-600 font-medium">CRÍTICO</span>
                      </div>
                      <div className="w-1/4 text-center">
                        <span className="text-[10px] text-orange-600 font-medium">BAJO</span>
                      </div>
                      <div className="w-1/4 text-center">
                        <span className="text-[10px] text-yellow-600 font-medium">MODERADO</span>
                      </div>
                      <div className="w-1/4 text-center">
                        <span className="text-[10px] text-green-600 font-medium">SUFICIENTE</span>
                      </div>
                    </div>
                  </div>

                  {/* Factores de cálculo */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Factor ABC */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-2">Factor 1: Clasificación</div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded text-lg font-bold ${abcColor}`}>
                          {abc}
                        </span>
                        <span className="text-sm text-gray-600">
                          {abc === 'A' ? 'Alto valor' :
                           abc === 'B' ? 'Valor medio' :
                           abc === 'C' ? 'Bajo valor' : 'Muy bajo'}
                        </span>
                      </div>
                    </div>

                    {/* Factor Días de Stock */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-2">Factor 2: Días Stock CCS</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${diasStockStyle.text}`}>
                          {diasStock >= 999 ? '∞' : formatNumber(diasStock, 1)}
                        </span>
                        <span className="text-sm text-gray-600">días</span>
                      </div>
                    </div>
                  </div>

                  {/* Matriz de referencia - más compacta */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-3">Matriz de Prioridad (ABC × Días)</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="px-2 py-1.5 text-left text-gray-500 font-medium"></th>
                            <th className="px-2 py-1.5 text-center text-red-600 font-medium">≤3d</th>
                            <th className="px-2 py-1.5 text-center text-orange-600 font-medium">4-7d</th>
                            <th className="px-2 py-1.5 text-center text-yellow-600 font-medium">8-14d</th>
                            <th className="px-2 py-1.5 text-center text-green-600 font-medium">&gt;14d</th>
                          </tr>
                        </thead>
                        <tbody>
                          {['A', 'B', 'C', 'D'].map((row, rowIdx) => (
                            <tr key={row}>
                              <td className={`px-2 py-1.5 font-bold ${ABC_COLORS[row]?.split(' ')[1] || 'text-gray-600'}`}>
                                {row}
                              </td>
                              {[0, 1, 2, 3].map((colIdx) => {
                                const cellValue = MATRIZ_PRIORIDAD[rowIdx][colIdx];
                                const isSelected = rowIdx === abcIndex && colIdx === diasIndex;
                                const cellStyle = getPrioridadStyle(cellValue);
                                return (
                                  <td
                                    key={colIdx}
                                    className={`px-2 py-1.5 text-center font-bold transition-all ${
                                      isSelected
                                        ? `${cellStyle.bg} ${cellStyle.text} ring-2 ring-gray-900 rounded`
                                        : 'text-gray-400'
                                    }`}
                                  >
                                    {cellValue}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Leyenda compacta */}
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {[
                      { range: '1-2', label: 'Crítico', style: getPrioridadStyle(1) },
                      { range: '3-4', label: 'Alto', style: getPrioridadStyle(3) },
                      { range: '5-6', label: 'Medio', style: getPrioridadStyle(5) },
                      { range: '7-8', label: 'Bajo', style: getPrioridadStyle(7) },
                      { range: '9-10', label: 'Mínimo', style: getPrioridadStyle(9) },
                    ].map((item) => (
                      <span
                        key={item.range}
                        className={`text-[10px] px-2 py-0.5 rounded ${item.style.bg} ${item.style.text}`}
                      >
                        {item.range}: {item.label}
                      </span>
                    ))}
                  </div>

                  {/* Info del producto - mejorada */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-200">
                    <div className="text-center bg-gray-50 rounded p-2">
                      <div className="text-[10px] text-gray-500">Stock CCS</div>
                      <div className="font-bold text-gray-900">
                        {formatNumber(producto.stock_actual_cedi / unidadesPorBulto, 0)} b
                      </div>
                    </div>
                    <div className="text-center bg-gray-50 rounded p-2">
                      <div className="text-[10px] text-gray-500">Demanda P75</div>
                      <div className="font-bold text-gray-900">
                        {formatNumber(producto.demanda_regional_p75 / unidadesPorBulto, 1)} b/d
                      </div>
                    </div>
                    <div className="text-center bg-gray-50 rounded p-2">
                      <div className="text-[10px] text-gray-500">{cediOrigenNombre.replace('CEDI ', '')}</div>
                      <div className="font-bold text-gray-900">
                        {formatNumber(stockOrigenBultos, 0)} b
                      </div>
                    </div>
                    <div className="text-center bg-violet-50 rounded p-2">
                      <div className="text-[10px] text-violet-600">Sugerido</div>
                      <div className="font-bold text-violet-700">
                        {formatNumber(producto.cantidad_sugerida_bultos, 0)} b
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
