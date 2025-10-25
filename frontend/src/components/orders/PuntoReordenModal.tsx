import { X } from 'lucide-react';

interface PuntoReordenModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
  };
  stockParams: {
    stock_min_mult_a: number;
    stock_min_mult_ab: number;
    stock_min_mult_b: number;
    stock_min_mult_bc: number;
    stock_min_mult_c: number;
    stock_seg_mult_a: number;
    stock_seg_mult_ab: number;
    stock_seg_mult_b: number;
    stock_seg_mult_bc: number;
    stock_seg_mult_c: number;
  };
}

// Umbrales ABC (debe coincidir con la lógica de clasificación)
const ABC_THRESHOLDS = {
  A: 20,
  AB: 5,
  B: 0.45,
  BC: 0.20,
  C: 0.001,
} as const;

// Constante de lead time
const LEAD_TIME_MULTIPLICADOR = 1.25;

export default function PuntoReordenModal({ isOpen, onClose, producto, stockParams }: PuntoReordenModalProps) {
  if (!isOpen) return null;

  // Cálculo base: Venta diaria en bultos usando promedio 20 días
  const promVentaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const ventaDiariaBultos = promVentaDiariaBultos;

  // Determinar clasificación ABC
  let clasificacion: string;
  let multiplicadorMin: number;
  let multiplicadorSeg: number;

  if (ventaDiariaBultos >= ABC_THRESHOLDS.A) {
    clasificacion = 'A';
    multiplicadorMin = stockParams.stock_min_mult_a;
    multiplicadorSeg = stockParams.stock_seg_mult_a;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.AB) {
    clasificacion = 'AB';
    multiplicadorMin = stockParams.stock_min_mult_ab;
    multiplicadorSeg = stockParams.stock_seg_mult_ab;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.B) {
    clasificacion = 'B';
    multiplicadorMin = stockParams.stock_min_mult_b;
    multiplicadorSeg = stockParams.stock_seg_mult_b;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.BC) {
    clasificacion = 'BC';
    multiplicadorMin = stockParams.stock_min_mult_bc;
    multiplicadorSeg = stockParams.stock_seg_mult_bc;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.C) {
    clasificacion = 'C';
    multiplicadorMin = stockParams.stock_min_mult_c;
    multiplicadorSeg = stockParams.stock_seg_mult_c;
  } else {
    clasificacion = '-';
    multiplicadorMin = 0;
    multiplicadorSeg = 0;
  }

  // Cálculos
  const stockMinimoBultos = ventaDiariaBultos * multiplicadorMin;
  const stockSeguridadBultos = ventaDiariaBultos * multiplicadorSeg;
  const leadTimeBultos = LEAD_TIME_MULTIPLICADOR * ventaDiariaBultos;
  const puntoReordenBultos = stockMinimoBultos + stockSeguridadBultos + leadTimeBultos;

  const diasMin = multiplicadorMin;
  const diasSeg = multiplicadorSeg;
  const diasLeadTime = LEAD_TIME_MULTIPLICADOR;
  const diasTotales = diasMin + diasSeg + diasLeadTime;

  const getColorClasificacion = (clase: string) => {
    if (clase === 'A') return 'text-red-700 bg-red-50 border-red-200';
    if (clase === 'AB') return 'text-orange-700 bg-orange-50 border-orange-200';
    if (clase === 'B') return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    if (clase === 'BC') return 'text-amber-700 bg-amber-50 border-amber-200';
    if (clase === 'C') return 'text-gray-700 bg-gray-50 border-gray-200';
    return 'text-gray-500 bg-gray-50 border-gray-200';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Punto de Reorden: {diasTotales.toFixed(2)} días ({puntoReordenBultos.toFixed(1)} bultos)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Producto Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Producto</p>
            <p className="font-mono text-sm font-bold text-gray-900">{producto.codigo_producto}</p>
            <p className="text-sm text-gray-700 mt-1">{producto.descripcion_producto}</p>
          </div>

          {/* Resultado Final */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3">Punto de Reorden Calculado</h3>
            <div className="text-center mb-4">
              <p className="text-xs text-gray-600 mb-2">Días de cobertura total</p>
              <p className="text-5xl font-bold text-indigo-700">{diasTotales.toFixed(2)} días</p>
              <p className="text-xl text-indigo-600 mt-2">({puntoReordenBultos.toFixed(2)} bultos)</p>
            </div>

            {/* Desglose visual */}
            <div className="mt-4 pt-4 border-t border-indigo-200">
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="bg-white rounded p-2 border border-orange-200">
                  <p className="text-xs text-gray-600">Stock Mínimo</p>
                  <p className="font-bold text-orange-700">{diasMin} días</p>
                  <p className="text-xs text-gray-500">({stockMinimoBultos.toFixed(1)} bultos)</p>
                </div>
                <div className="bg-white rounded p-2 border border-blue-200">
                  <p className="text-xs text-gray-600">Stock Seguridad</p>
                  <p className="font-bold text-blue-700">{diasSeg} días</p>
                  <p className="text-xs text-gray-500">({stockSeguridadBultos.toFixed(1)} bultos)</p>
                </div>
                <div className="bg-white rounded p-2 border border-green-200">
                  <p className="text-xs text-gray-600">Lead Time</p>
                  <p className="font-bold text-green-700">{diasLeadTime} días</p>
                  <p className="text-xs text-gray-500">({leadTimeBultos.toFixed(1)} bultos)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cálculo Paso a Paso */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Cálculo Paso a Paso</h3>

            {/* Paso 1: Venta Diaria */}
            <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-purple-500">
              <p className="text-sm font-semibold text-gray-900 mb-2">Paso 1: Calcular Venta Diaria en Bultos</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Promedio 20 días (unidades):</span>
                  <span className="font-mono font-bold text-purple-700">{producto.prom_ventas_20dias_unid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Unidades por bulto:</span>
                  <span className="font-mono font-bold text-blue-700">{producto.cantidad_bultos.toFixed(0)}</span>
                </div>
                <div className="border-t border-gray-300 pt-2">
                  <p className="text-xs text-gray-600 mb-1">Fórmula: prom_20d ÷ unid_por_bulto</p>
                  <p className="text-lg font-bold text-orange-600">
                    {ventaDiariaBultos.toFixed(3)} bultos/día
                  </p>
                </div>
              </div>
            </div>

            {/* Paso 2: Clasificación ABC */}
            <div className={`rounded-lg p-4 border-l-4 ${getColorClasificacion(clasificacion)}`}>
              <p className="text-sm font-semibold text-gray-900 mb-2">Paso 2: Determinar Clasificación ABC</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Con una venta de <span className="font-bold">{ventaDiariaBultos.toFixed(3)} bultos/día</span>,
                  el producto pertenece a la clase:
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold px-3 py-1 rounded ${getColorClasificacion(clasificacion)}`}>
                    {clasificacion}
                  </span>
                  <span className="text-sm text-gray-600">
                    ({ventaDiariaBultos >= ABC_THRESHOLDS.A ? '≥ 20' :
                      ventaDiariaBultos >= ABC_THRESHOLDS.AB ? '≥ 5' :
                      ventaDiariaBultos >= ABC_THRESHOLDS.B ? '≥ 0.45' :
                      ventaDiariaBultos >= ABC_THRESHOLDS.BC ? '≥ 0.20' :
                      '≥ 0.001'} bultos/día)
                  </span>
                </div>
              </div>
            </div>

            {/* Paso 3: Stock Mínimo */}
            <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
              <p className="text-sm font-semibold text-gray-900 mb-2">Paso 3: Calcular Stock Mínimo</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Para productos de clase <span className="font-bold">{clasificacion}</span>,
                  el multiplicador de stock mínimo es: <span className="font-bold">{multiplicadorMin}x</span>
                </p>
                <div className="bg-white rounded p-3 border border-orange-200 font-mono text-sm">
                  <p className="text-gray-700">Stock Mínimo = {ventaDiariaBultos.toFixed(3)} × {multiplicadorMin}</p>
                  <p className="text-lg font-bold text-orange-700 mt-2">
                    = {stockMinimoBultos.toFixed(2)} bultos ({diasMin} días)
                  </p>
                </div>
              </div>
            </div>

            {/* Paso 4: Stock Seguridad */}
            <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
              <p className="text-sm font-semibold text-gray-900 mb-2">Paso 4: Calcular Stock de Seguridad</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Para productos de clase <span className="font-bold">{clasificacion}</span>,
                  el multiplicador de stock seguridad es: <span className="font-bold">{multiplicadorSeg}x</span>
                </p>
                <div className="bg-white rounded p-3 border border-blue-200 font-mono text-sm">
                  <p className="text-gray-700">Stock Seguridad = {ventaDiariaBultos.toFixed(3)} × {multiplicadorSeg}</p>
                  <p className="text-lg font-bold text-blue-700 mt-2">
                    = {stockSeguridadBultos.toFixed(2)} bultos ({diasSeg} días)
                  </p>
                </div>
              </div>
            </div>

            {/* Paso 5: Lead Time */}
            <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
              <p className="text-sm font-semibold text-gray-900 mb-2">Paso 5: Agregar Lead Time (Tiempo de Reposición)</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Se agrega un buffer de <span className="font-bold">{LEAD_TIME_MULTIPLICADOR}x</span> la venta diaria
                  para cubrir el tiempo de reposición.
                </p>
                <div className="bg-white rounded p-3 border border-green-200 font-mono text-sm">
                  <p className="text-gray-700">Lead Time = {ventaDiariaBultos.toFixed(3)} × {LEAD_TIME_MULTIPLICADOR}</p>
                  <p className="text-lg font-bold text-green-700 mt-2">
                    = {leadTimeBultos.toFixed(2)} bultos ({diasLeadTime} días)
                  </p>
                </div>
              </div>
            </div>

            {/* Paso 6: Cálculo Final */}
            <div className="bg-indigo-50 rounded-lg p-4 border-l-4 border-indigo-500">
              <p className="text-sm font-semibold text-gray-900 mb-2">Paso 6: Calcular Punto de Reorden</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Fórmula:</p>
                <div className="bg-white rounded p-3 border border-indigo-200 font-mono text-sm">
                  <p className="text-gray-700">Punto Reorden = Stock Mínimo + Stock Seguridad + Lead Time</p>
                  <p className="text-gray-700 mt-2">
                    = {stockMinimoBultos.toFixed(2)} + {stockSeguridadBultos.toFixed(2)} + {leadTimeBultos.toFixed(2)}
                  </p>
                  <p className="text-lg font-bold text-indigo-700 mt-2 pt-2 border-t border-indigo-200">
                    = {puntoReordenBultos.toFixed(2)} bultos
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    = {diasTotales.toFixed(2)} días de cobertura total
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Multiplicadores */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Multiplicadores por Clasificación</h3>
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Clase</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Umbral</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Mult. Mín</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Mult. Seg</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">+ Lead Time</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Total Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className={clasificacion === 'A' ? 'bg-red-50 font-bold' : ''}>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded bg-red-100 text-red-700 font-bold text-xs">A</span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">≥ 20 bultos/día</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-orange-700">{stockParams.stock_min_mult_a}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">{stockParams.stock_seg_mult_a}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-green-700">{LEAD_TIME_MULTIPLICADOR}x</td>
                    <td className="px-4 py-2 text-center font-bold text-indigo-700">{(stockParams.stock_min_mult_a + stockParams.stock_seg_mult_a + LEAD_TIME_MULTIPLICADOR).toFixed(2)}</td>
                  </tr>
                  <tr className={clasificacion === 'AB' ? 'bg-orange-50 font-bold' : ''}>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded bg-orange-100 text-orange-700 font-bold text-xs">AB</span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">≥ 5 bultos/día</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-orange-700">{stockParams.stock_min_mult_ab}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">{stockParams.stock_seg_mult_ab}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-green-700">{LEAD_TIME_MULTIPLICADOR}x</td>
                    <td className="px-4 py-2 text-center font-bold text-indigo-700">{(stockParams.stock_min_mult_ab + stockParams.stock_seg_mult_ab + LEAD_TIME_MULTIPLICADOR).toFixed(2)}</td>
                  </tr>
                  <tr className={clasificacion === 'B' ? 'bg-yellow-50 font-bold' : ''}>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-bold text-xs">B</span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">≥ 0.45 bultos/día</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-orange-700">{stockParams.stock_min_mult_b}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">{stockParams.stock_seg_mult_b}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-green-700">{LEAD_TIME_MULTIPLICADOR}x</td>
                    <td className="px-4 py-2 text-center font-bold text-indigo-700">{(stockParams.stock_min_mult_b + stockParams.stock_seg_mult_b + LEAD_TIME_MULTIPLICADOR).toFixed(2)}</td>
                  </tr>
                  <tr className={clasificacion === 'BC' ? 'bg-amber-50 font-bold' : ''}>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded bg-amber-100 text-amber-700 font-bold text-xs">BC</span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">≥ 0.20 bultos/día</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-orange-700">{stockParams.stock_min_mult_bc}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">{stockParams.stock_seg_mult_bc}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-green-700">{LEAD_TIME_MULTIPLICADOR}x</td>
                    <td className="px-4 py-2 text-center font-bold text-indigo-700">{(stockParams.stock_min_mult_bc + stockParams.stock_seg_mult_bc + LEAD_TIME_MULTIPLICADOR).toFixed(2)}</td>
                  </tr>
                  <tr className={clasificacion === 'C' ? 'bg-gray-50 font-bold' : ''}>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded bg-gray-100 text-gray-700 font-bold text-xs">C</span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">≥ 0.001 bultos/día</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-orange-700">{stockParams.stock_min_mult_c}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">{stockParams.stock_seg_mult_c}x</td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-green-700">{LEAD_TIME_MULTIPLICADOR}x</td>
                    <td className="px-4 py-2 text-center font-bold text-indigo-700">{(stockParams.stock_min_mult_c + stockParams.stock_seg_mult_c + LEAD_TIME_MULTIPLICADOR).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Explicación */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              ¿Qué es el Punto de Reorden?
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              El <strong>Punto de Reorden</strong> es el nivel de inventario en el cual se debe generar
              una orden de compra para reabastecer el producto. Se calcula sumando tres componentes:
              <strong> Stock Mínimo</strong> (nivel base de operación),
              <strong> Stock de Seguridad</strong> (buffer contra variabilidad), y
              <strong> Lead Time</strong> (cobertura durante el tiempo de reposición de {LEAD_TIME_MULTIPLICADOR} días).
              Cuando el stock llega a este punto, es momento de ordenar.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
