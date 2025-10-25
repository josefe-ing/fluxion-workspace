import { X, TrendingUp, Calendar, AlertCircle, PackageCheck } from 'lucide-react';

interface PedidoSugeridoModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
    stock_tienda: number;
    stock_en_transito: number;
    stock_cedi_origen: number;
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

export default function PedidoSugeridoModal({ isOpen, onClose, producto, stockParams }: PedidoSugeridoModalProps) {
  if (!isOpen) return null;

  // Calcular clasificación ABC
  const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  let clasificacion = '-';
  let multMin = 0;
  let multSeg = 0;
  let multMax = 0;

  if (ventaDiariaBultos >= ABC_THRESHOLDS.A) {
    clasificacion = 'A';
    multMin = stockParams.stock_min_mult_a;
    multSeg = stockParams.stock_seg_mult_a;
    multMax = stockParams.stock_max_mult_a;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.AB) {
    clasificacion = 'AB';
    multMin = stockParams.stock_min_mult_ab;
    multSeg = stockParams.stock_seg_mult_ab;
    multMax = stockParams.stock_max_mult_ab;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.B) {
    clasificacion = 'B';
    multMin = stockParams.stock_min_mult_b;
    multSeg = stockParams.stock_seg_mult_b;
    multMax = stockParams.stock_max_mult_b;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.BC) {
    clasificacion = 'BC';
    multMin = stockParams.stock_min_mult_bc;
    multSeg = stockParams.stock_seg_mult_bc;
    multMax = stockParams.stock_max_mult_bc;
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.C) {
    clasificacion = 'C';
    multMin = stockParams.stock_min_mult_c;
    multSeg = stockParams.stock_seg_mult_c;
    multMax = stockParams.stock_max_mult_c;
  }

  // Stock actual
  const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
  const stockTotalBultos = stockTotalUnidades / producto.cantidad_bultos;
  const diasStockActual = producto.prom_ventas_20dias_unid > 0
    ? stockTotalUnidades / producto.prom_ventas_20dias_unid
    : Infinity;

  // Puntos de control
  const stockMinimoBultos = ventaDiariaBultos * multMin;
  const diasMinimo = multMin;

  const stockSeguridadBultos = ventaDiariaBultos * multSeg;
  const puntoReordenBultos = stockMinimoBultos + stockSeguridadBultos + (1.25 * ventaDiariaBultos);
  const diasReorden = ventaDiariaBultos > 0 ? puntoReordenBultos / ventaDiariaBultos : 0;

  const stockMaximoBultos = ventaDiariaBultos * multMax;
  const diasMaximo = multMax;

  // Determinar si debemos pedir
  const debePedir = diasStockActual <= diasReorden;

  // Calcular pedido sugerido
  const sugeridoSinLimite = stockMaximoBultos - stockTotalBultos;
  const stockCediBultos = producto.stock_cedi_origen / producto.cantidad_bultos;
  const pedidoSugerido = debePedir ? Math.max(0, Math.round(Math.min(sugeridoSinLimite, stockCediBultos))) : 0;
  const limitadoPorCedi = debePedir && sugeridoSinLimite > stockCediBultos;

  // Stock resultante después del pedido
  const stockResultanteBultos = stockTotalBultos + pedidoSugerido;
  const stockResultanteUnidades = stockResultanteBultos * producto.cantidad_bultos;
  const diasStockResultante = producto.prom_ventas_20dias_unid > 0
    ? stockResultanteUnidades / producto.prom_ventas_20dias_unid
    : Infinity;

  // Proyecciones de fechas
  const hoy = new Date();

  // Fecha cuando llegará al punto de reorden (si hay pedido)
  const diasHastaReorden = pedidoSugerido > 0 ? diasStockResultante - diasReorden : 0;
  const fechaLlegadaReorden = new Date(hoy);
  if (diasHastaReorden > 0) {
    fechaLlegadaReorden.setDate(hoy.getDate() + Math.floor(diasHastaReorden));
  }

  // Fecha cuando se agotará (si no hay pedido y está bajo)
  const diasHastaAgotar = diasStockActual;
  const fechaAgotamiento = new Date(hoy);
  if (diasHastaAgotar < Infinity) {
    fechaAgotamiento.setDate(hoy.getDate() + Math.floor(diasHastaAgotar));
  }

  const formatFecha = (fecha: Date) => {
    return fecha.toLocaleDateString('es-VE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              Pedido Sugerido: {pedidoSugerido} bultos
            </h2>
            <p className="text-sm text-blue-100 mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-white hover:text-blue-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Decisión Principal */}
          {debePedir ? (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-300">
              <div className="flex items-center justify-center mb-3">
                <TrendingUp className="h-12 w-12 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-700 text-center mb-2">
                SÍ PEDIR
              </p>
              <p className="text-6xl font-bold text-blue-800 text-center">
                {pedidoSugerido} bultos
              </p>
              {limitadoPorCedi && (
                <div className="mt-4 bg-orange-100 border-l-4 border-orange-500 p-3 rounded">
                  <p className="text-sm text-orange-800">
                    <AlertCircle className="inline h-4 w-4 mr-1" />
                    <strong>Limitado por stock en CEDI:</strong> Se sugería pedir {Math.round(sugeridoSinLimite)} bultos,
                    pero solo hay {Math.round(stockCediBultos)} bultos disponibles en CEDI.
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-700 mt-4 text-center">
                El stock actual ({diasStockActual.toFixed(1)} días) está por debajo del punto de reorden ({diasReorden.toFixed(1)} días).
              </p>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border-2 border-green-300">
              <div className="flex items-center justify-center mb-3">
                <PackageCheck className="h-12 w-12 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-700 text-center mb-2">
                NO PEDIR
              </p>
              <p className="text-6xl font-bold text-green-800 text-center">
                0 bultos
              </p>
              <p className="text-sm text-gray-700 mt-4 text-center">
                El stock actual ({diasStockActual.toFixed(1)} días) está por encima del punto de reorden ({diasReorden.toFixed(1)} días).
                No es necesario hacer pedido en este momento.
              </p>
            </div>
          )}

          {/* Situación Actual */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3 border-b border-gray-300 pb-2 flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              Situación Actual
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded p-3 border border-gray-200">
                <p className="text-xs text-gray-600">Clasificación ABC</p>
                <p className={`text-2xl font-bold ${
                  clasificacion === 'A' ? 'text-red-700' :
                  clasificacion === 'AB' ? 'text-orange-700' :
                  clasificacion === 'B' ? 'text-yellow-700' :
                  'text-gray-700'
                }`}>{clasificacion}</p>
              </div>
              <div className="bg-white rounded p-3 border border-gray-200">
                <p className="text-xs text-gray-600">Venta Diaria</p>
                <p className="text-lg font-bold text-gray-800">{ventaDiariaBultos.toFixed(2)} bultos/día</p>
                <p className="text-xs text-gray-500">({producto.prom_ventas_20dias_unid.toFixed(0)} unid/día)</p>
              </div>
              <div className="bg-white rounded p-3 border border-gray-200">
                <p className="text-xs text-gray-600">Stock Actual</p>
                <p className="text-lg font-bold text-blue-700">{diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días</p>
                <p className="text-xs text-gray-500">({stockTotalBultos.toFixed(1)} bultos = {stockTotalUnidades} unid)</p>
              </div>
              <div className="bg-white rounded p-3 border border-gray-200">
                <p className="text-xs text-gray-600">Stock en CEDI</p>
                <p className="text-lg font-bold text-green-700">{stockCediBultos.toFixed(1)} bultos</p>
                <p className="text-xs text-gray-500">({producto.stock_cedi_origen} unidades)</p>
              </div>
            </div>
          </div>

          {/* Cálculo del Pedido */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm border-b border-gray-300 pb-2">
              Cálculo del Pedido Sugerido
            </h3>

            {/* Paso 1 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mr-2">
                  1
                </span>
                Verificar si necesitamos pedir
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono">
                  Stock Actual = {diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(2)} días
                </p>
                <p className="font-mono mt-1">
                  Punto de Reorden = {diasReorden.toFixed(2)} días
                </p>
                <p className={`font-mono mt-2 font-semibold ${debePedir ? 'text-orange-700' : 'text-green-700'}`}>
                  {diasStockActual === Infinity ? (
                    '∞ > Reorden → NO PEDIR'
                  ) : diasStockActual <= diasReorden ? (
                    `${diasStockActual.toFixed(2)} ≤ ${diasReorden.toFixed(2)} → SÍ PEDIR ✓`
                  ) : (
                    `${diasStockActual.toFixed(2)} > ${diasReorden.toFixed(2)} → NO PEDIR`
                  )}
                </p>
              </div>
            </div>

            {debePedir && (
              <>
                {/* Paso 2 */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mr-2">
                      2
                    </span>
                    Calcular objetivo: Llevar al Stock Máximo
                  </p>
                  <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                    <p className="font-mono">
                      Stock Máximo (Clasificación {clasificacion}) = {multMax}x = {diasMaximo.toFixed(2)} días
                    </p>
                    <p className="font-mono mt-1">
                      Stock Máximo = {stockMaximoBultos.toFixed(2)} bultos
                    </p>
                  </div>
                </div>

                {/* Paso 3 */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mr-2">
                      3
                    </span>
                    Calcular cuánto falta para llegar al máximo
                  </p>
                  <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                    <p className="font-mono">
                      Pedido Inicial = Stock Máximo - Stock Actual
                    </p>
                    <p className="font-mono mt-1">
                      Pedido Inicial = {stockMaximoBultos.toFixed(2)} - {stockTotalBultos.toFixed(2)} = {sugeridoSinLimite.toFixed(2)} bultos
                    </p>
                  </div>
                </div>

                {/* Paso 4 */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mr-2">
                      4
                    </span>
                    Limitar al stock disponible en CEDI
                  </p>
                  <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                    <p className="font-mono">
                      Stock CEDI = {stockCediBultos.toFixed(2)} bultos
                    </p>
                    <p className="font-mono mt-1">
                      Pedido Inicial = {sugeridoSinLimite.toFixed(2)} bultos
                    </p>
                    <p className={`font-mono mt-2 font-semibold ${limitadoPorCedi ? 'text-orange-700' : 'text-green-700'}`}>
                      Pedido Final = min({sugeridoSinLimite.toFixed(2)}, {stockCediBultos.toFixed(2)}) = {pedidoSugerido} bultos
                      {limitadoPorCedi && ' ⚠️ Limitado por CEDI'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Proyección después del pedido */}
          {pedidoSugerido > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4">
              <h3 className="font-semibold text-indigo-800 text-sm mb-3 border-b border-indigo-300 pb-2 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Proyección con el Pedido
              </h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded p-3 border-2 border-indigo-200">
                  <p className="text-xs text-gray-600">Stock Resultante</p>
                  <p className="text-2xl font-bold text-indigo-700">{diasStockResultante.toFixed(1)} días</p>
                  <p className="text-xs text-gray-500 mt-1">({stockResultanteBultos.toFixed(1)} bultos)</p>
                </div>
                <div className="bg-white rounded p-3 border-2 border-indigo-200">
                  <p className="text-xs text-gray-600">Duración Estimada</p>
                  <p className="text-2xl font-bold text-indigo-700">{diasStockResultante.toFixed(0)} días</p>
                  <p className="text-xs text-gray-500 mt-1">Hasta agotar stock</p>
                </div>
              </div>

              <div className="bg-white rounded p-4 border-2 border-indigo-200">
                <p className="text-xs text-gray-600 mb-2">📅 Próxima Fecha Sugerida para Pedir</p>
                <p className="text-xl font-bold text-indigo-800">
                  {formatFecha(fechaLlegadaReorden)}
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  (Aprox. {Math.floor(diasHastaReorden)} días, cuando llegue al punto de reorden nuevamente)
                </p>
              </div>
            </div>
          )}

          {/* Advertencia si no hay pedido pero stock bajo */}
          {!debePedir && diasStockActual < diasMaximo * 0.9 && diasStockActual !== Infinity && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
              <p className="text-sm text-yellow-800">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                <strong>Nota:</strong> Aunque no es urgente, el stock ({diasStockActual.toFixed(1)} días)
                podría beneficiarse de reposición preventiva para alcanzar el nivel óptimo ({diasMaximo.toFixed(1)} días).
              </p>
            </div>
          )}

          {/* Advertencia si stock muy bajo y sin pedido */}
          {!debePedir && diasStockActual < diasMinimo && diasStockActual !== Infinity && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <p className="text-sm text-red-800">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                <strong>⚠️ CRÍTICO:</strong> El stock está por debajo del mínimo. Se agotará aproximadamente el {formatFecha(fechaAgotamiento)}.
              </p>
            </div>
          )}

          {/* Nota Informativa */}
          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-800">Estrategia:</span> El sistema sugiere llevar el stock hasta el <strong>nivel máximo</strong>
              cada vez que se alcanza el <strong>punto de reorden</strong>. Esto optimiza la frecuencia de pedidos y asegura disponibilidad continua.
              Los cálculos se basan en el promedio de ventas de los últimos <strong>20 días</strong>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
