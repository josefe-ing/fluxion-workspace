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
const getPrioridadStyle = (prioridad: number): { bg: string; text: string; border: string; label: string } => {
  if (prioridad <= 2) return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'CRÍTICO' };
  if (prioridad <= 4) return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', label: 'ALTO' };
  if (prioridad <= 6) return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', label: 'MEDIO' };
  if (prioridad <= 8) return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', label: 'BAJO' };
  return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', label: 'MÍNIMO' };
};

// Estilo de días de stock
const getDiasStockStyle = (dias: number): { bg: string; text: string; label: string } => {
  if (dias <= 3) return { bg: 'bg-red-100', text: 'text-red-700', label: 'Crítico (≤3 días)' };
  if (dias <= 7) return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Bajo (4-7 días)' };
  if (dias <= 14) return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Moderado (8-14 días)' };
  return { bg: 'bg-green-100', text: 'text-green-700', label: 'Suficiente (>14 días)' };
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
                <div className={`${prioridadStyle.bg} px-6 py-4 border-b-2 ${prioridadStyle.border}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className={`text-lg font-semibold ${prioridadStyle.text}`}>
                        Prioridad de Reposición
                      </Dialog.Title>
                      <p className="text-sm text-gray-600 mt-1">
                        {producto.codigo_producto} - {producto.descripcion_producto}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Prioridad resultado */}
                  <div className={`${prioridadStyle.bg} border-2 ${prioridadStyle.border} rounded-lg p-4 text-center`}>
                    <div className="text-sm text-gray-600 mb-2">Prioridad Calculada</div>
                    <div className="flex items-center justify-center gap-3">
                      <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-2xl font-bold border-2 ${prioridadStyle.bg} ${prioridadStyle.text} ${prioridadStyle.border}`}>
                        {prioridad}
                      </span>
                      <div className="text-left">
                        <div className={`text-xl font-bold ${prioridadStyle.text}`}>
                          {prioridadStyle.label}
                        </div>
                        <div className="text-xs text-gray-500">de 10 niveles</div>
                      </div>
                    </div>
                  </div>

                  {/* Factores */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Factor ABC */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-2">Factor 1: Clasificación ABC</div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded text-lg font-bold ${abcColor}`}>
                          Clase {abc}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {abc === 'A' ? 'Alto valor - Máxima prioridad' :
                         abc === 'B' ? 'Valor medio - Prioridad alta' :
                         abc === 'C' ? 'Bajo valor - Prioridad media' :
                         'Muy bajo valor - Prioridad baja'}
                      </div>
                    </div>

                    {/* Factor Días de Stock */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-2">Factor 2: Días de Stock</div>
                      <div className={`text-2xl font-bold ${diasStockStyle.text}`}>
                        {diasStock >= 999 ? '∞' : formatNumber(diasStock, 1)} días
                      </div>
                      <div className={`text-xs mt-2 px-2 py-1 rounded inline-block ${diasStockStyle.bg} ${diasStockStyle.text}`}>
                        {diasStockStyle.label}
                      </div>
                    </div>
                  </div>

                  {/* Matriz de referencia */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-3">Matriz de Prioridad</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="px-2 py-1 text-left text-gray-500">ABC \ Días</th>
                            <th className="px-2 py-1 text-center text-red-600">≤3</th>
                            <th className="px-2 py-1 text-center text-orange-600">4-7</th>
                            <th className="px-2 py-1 text-center text-yellow-600">8-14</th>
                            <th className="px-2 py-1 text-center text-green-600">&gt;14</th>
                          </tr>
                        </thead>
                        <tbody>
                          {['A', 'B', 'C', 'D'].map((row, rowIdx) => (
                            <tr key={row}>
                              <td className={`px-2 py-1 font-semibold ${ABC_COLORS[row]?.split(' ')[1] || 'text-gray-600'}`}>
                                Clase {row}
                              </td>
                              {[0, 1, 2, 3].map((colIdx) => {
                                const cellValue = MATRIZ_PRIORIDAD[rowIdx][colIdx];
                                const isSelected = rowIdx === abcIndex && colIdx === diasIndex;
                                const cellStyle = getPrioridadStyle(cellValue);
                                return (
                                  <td
                                    key={colIdx}
                                    className={`px-2 py-1 text-center font-bold ${
                                      isSelected
                                        ? `${cellStyle.bg} ${cellStyle.text} ring-2 ring-offset-1 ring-gray-900 rounded`
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
                    <div className="mt-3 text-xs text-gray-500 text-center">
                      La celda resaltada muestra la prioridad de este producto
                    </div>
                  </div>

                  {/* Leyenda de colores */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      { label: '1-2 Crítico', style: getPrioridadStyle(1) },
                      { label: '3-4 Alto', style: getPrioridadStyle(3) },
                      { label: '5-6 Medio', style: getPrioridadStyle(5) },
                      { label: '7-8 Bajo', style: getPrioridadStyle(7) },
                      { label: '9-10 Mínimo', style: getPrioridadStyle(9) },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className={`text-[10px] px-2 py-0.5 rounded border ${item.style.bg} ${item.style.text} ${item.style.border}`}
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>

                  {/* Info adicional del producto */}
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Stock CCS</div>
                      <div className="font-semibold text-gray-900">
                        {formatNumber(producto.stock_actual_cedi / unidadesPorBulto, 0)} b
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Demanda P75</div>
                      <div className="font-semibold text-gray-900">
                        {formatNumber(producto.demanda_regional_p75 / unidadesPorBulto, 2)} b/día
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Sugerido</div>
                      <div className="font-semibold text-gray-900">
                        {formatNumber(producto.cantidad_sugerida_bultos, 0)} b
                      </div>
                    </div>
                  </div>

                  {/* Fórmula */}
                  <div className={`${prioridadStyle.bg} border ${prioridadStyle.border} rounded-lg p-3`}>
                    <div className="font-mono text-xs text-gray-700">
                      <span className={prioridadStyle.text}>Prioridad</span> = Matriz[ABC={abc}, Días={diasStock >= 999 ? '∞' : formatNumber(diasStock, 0)}]
                      <span className="text-gray-500 ml-2">
                        = Matriz[{abcIndex},{diasIndex}] = <strong>{prioridad}</strong> ({prioridadStyle.label})
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
