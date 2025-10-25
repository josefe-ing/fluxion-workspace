import { X } from 'lucide-react';

interface StockMaximoModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
  };
  stockParams: {
    stock_max_mult_a: number;
    stock_max_mult_ab: number;
    stock_max_mult_b: number;
    stock_max_mult_bc: number;
    stock_max_mult_c: number;
  };
}

const ABC_THRESHOLDS = {
  A: 20,
  AB: 5,
  B: 0.45,
  BC: 0.20,
  C: 0.001,
};

export default function StockMaximoModal({ isOpen, onClose, producto, stockParams }: StockMaximoModalProps) {
  if (!isOpen) return null;

  // Paso 1: Calcular venta diaria en bultos (usando promedio 20 días)
  const promVentaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const ventaDiariaBultos = promVentaDiariaBultos;

  // Paso 2: Determinar clasificación ABC
  let clasificacion = '-';
  let multiplicador = 0;

  if (ventaDiariaBultos >= ABC_THRESHOLDS.A) {
    clasificacion = 'A';
    multiplicador = stockParams.stock_max_mult_a;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.AB) {
    clasificacion = 'AB';
    multiplicador = stockParams.stock_max_mult_ab;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.B) {
    clasificacion = 'B';
    multiplicador = stockParams.stock_max_mult_b;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.BC) {
    clasificacion = 'BC';
    multiplicador = stockParams.stock_max_mult_bc;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.C) {
    clasificacion = 'C';
    multiplicador = stockParams.stock_max_mult_c;
  }

  // Paso 3: Calcular stock máximo en bultos
  const stockMaximoBultos = ventaDiariaBultos * multiplicador;

  // Paso 4: Convertir a días de cobertura
  const diasCobertura = multiplicador.toFixed(0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              Stock Máximo: {diasCobertura} días ({stockMaximoBultos.toFixed(1)} bultos)
            </h2>
            <p className="text-sm text-purple-100 mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-white hover:text-purple-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Resultado Principal */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 text-center border-2 border-purple-300">
            <p className="text-sm font-semibold text-purple-800 mb-2">Stock Máximo Calculado</p>
            <p className="text-5xl font-bold text-purple-700">{diasCobertura} días</p>
            <p className="text-xl text-purple-600 mt-2">({stockMaximoBultos.toFixed(2)} bultos)</p>
          </div>

          {/* Cálculo Paso a Paso */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm border-b border-gray-300 pb-2">
              Cálculo Paso a Paso
            </h3>

            {/* Paso 1 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  1
                </span>
                Calcular venta diaria en bultos (Promedio 20 días)
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono">
                  Promedio 20 días = {producto.prom_ventas_20dias_unid.toFixed(2)} unidades/día
                </p>
                <p className="font-mono mt-1">
                  Tamaño bulto = {producto.cantidad_bultos} unidades
                </p>
                <p className="font-mono mt-2 text-purple-700 font-semibold">
                  Venta diaria = {producto.prom_ventas_20dias_unid.toFixed(2)} ÷ {producto.cantidad_bultos} = {ventaDiariaBultos.toFixed(4)} bultos/día
                </p>
              </div>
            </div>

            {/* Paso 2 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  2
                </span>
                Determinar clasificación ABC
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p>
                  Con venta de <span className="font-semibold text-purple-700">{ventaDiariaBultos.toFixed(4)} bultos/día</span>,
                  el producto está en clasificación{' '}
                  <span className={`font-bold px-2 py-0.5 rounded ${
                    clasificacion === 'A' ? 'bg-red-100 text-red-800' :
                    clasificacion === 'AB' ? 'bg-orange-100 text-orange-800' :
                    clasificacion === 'B' ? 'bg-yellow-100 text-yellow-800' :
                    clasificacion === 'BC' ? 'bg-lime-100 text-lime-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {clasificacion}
                  </span>
                </p>
              </div>
            </div>

            {/* Paso 3 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  3
                </span>
                Aplicar multiplicador según clasificación
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p>
                  Para clasificación <span className="font-bold">{clasificacion}</span>, el multiplicador de stock máximo es{' '}
                  <span className="font-semibold text-purple-700">{multiplicador}x</span>
                </p>
                <p className="font-mono mt-2 text-purple-700 font-semibold">
                  Stock Máximo = {ventaDiariaBultos.toFixed(4)} bultos/día × {multiplicador} = {stockMaximoBultos.toFixed(2)} bultos
                </p>
              </div>
            </div>

            {/* Paso 4 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  4
                </span>
                Expresar en días de cobertura
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p>
                  El multiplicador de {multiplicador}x representa directamente los días de cobertura máxima deseados
                </p>
                <p className="font-mono mt-2 text-purple-700 font-semibold">
                  = {diasCobertura} días de cobertura
                </p>
              </div>
            </div>
          </div>

          {/* Tabla de Multiplicadores */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3 border-b border-gray-300 pb-2">
              Multiplicadores de Stock Máximo por Clasificación
            </h3>
            <div className="overflow-hidden rounded-lg border border-gray-300">
              <table className="min-w-full divide-y divide-gray-300 text-sm">
                <thead className="bg-purple-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Clasificación</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-900">Umbral (bultos/día)</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-900">Multiplicador</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-900">Días de Cobertura</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr className={clasificacion === 'A' ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-red-800">A</td>
                    <td className="px-3 py-2 text-center text-gray-700">≥ {ABC_THRESHOLDS.A}</td>
                    <td className="px-3 py-2 text-center font-semibold text-purple-700">{stockParams.stock_max_mult_a}x</td>
                    <td className="px-3 py-2 text-center text-gray-700">{stockParams.stock_max_mult_a} días</td>
                  </tr>
                  <tr className={clasificacion === 'AB' ? 'bg-orange-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-orange-800">AB</td>
                    <td className="px-3 py-2 text-center text-gray-700">≥ {ABC_THRESHOLDS.AB}</td>
                    <td className="px-3 py-2 text-center font-semibold text-purple-700">{stockParams.stock_max_mult_ab}x</td>
                    <td className="px-3 py-2 text-center text-gray-700">{stockParams.stock_max_mult_ab} días</td>
                  </tr>
                  <tr className={clasificacion === 'B' ? 'bg-yellow-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-yellow-800">B</td>
                    <td className="px-3 py-2 text-center text-gray-700">≥ {ABC_THRESHOLDS.B}</td>
                    <td className="px-3 py-2 text-center font-semibold text-purple-700">{stockParams.stock_max_mult_b}x</td>
                    <td className="px-3 py-2 text-center text-gray-700">{stockParams.stock_max_mult_b} días</td>
                  </tr>
                  <tr className={clasificacion === 'BC' ? 'bg-lime-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-lime-800">BC</td>
                    <td className="px-3 py-2 text-center text-gray-700">≥ {ABC_THRESHOLDS.BC}</td>
                    <td className="px-3 py-2 text-center font-semibold text-purple-700">{stockParams.stock_max_mult_bc}x</td>
                    <td className="px-3 py-2 text-center text-gray-700">{stockParams.stock_max_mult_bc} días</td>
                  </tr>
                  <tr className={clasificacion === 'C' ? 'bg-gray-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-gray-800">C</td>
                    <td className="px-3 py-2 text-center text-gray-700">≥ {ABC_THRESHOLDS.C}</td>
                    <td className="px-3 py-2 text-center font-semibold text-purple-700">{stockParams.stock_max_mult_c}x</td>
                    <td className="px-3 py-2 text-center text-gray-700">{stockParams.stock_max_mult_c} días</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Nota Informativa */}
          <div className="bg-purple-50 border-l-4 border-purple-600 p-4 rounded">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-purple-800">Nota:</span> El stock máximo representa el nivel máximo de inventario que debemos mantener.
              Este límite ayuda a evitar sobrestock y optimizar el capital de trabajo, especialmente para productos de baja rotación.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
