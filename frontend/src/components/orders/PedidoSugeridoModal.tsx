import { X, TrendingUp, AlertCircle, PackageCheck, Info, Zap, ShoppingCart, FlaskConical } from 'lucide-react';

interface PedidoSugeridoModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_p75_unid: number;
    cantidad_bultos: number;
    stock_tienda: number;
    stock_en_transito: number;
    stock_cedi_origen: number;
    clasificacion_abc: string | null;
    clase_efectiva: string | null;
    es_generador_trafico: boolean;
    stock_seguridad: number;
    stock_minimo: number;  // ROP
    stock_maximo: number;
    metodo_calculo: string;
    razon_pedido?: string;
    warnings_calculo?: string[];
  };
}

export default function PedidoSugeridoModal({ isOpen, onClose, producto }: PedidoSugeridoModalProps) {
  if (!isOpen) return null;

  const claseEfectiva = producto.clase_efectiva || producto.clasificacion_abc || 'C';
  const unidadesPorBulto = producto.cantidad_bultos;

  // Valores del backend (ya calculados con fórmulas ABC) - en UNIDADES
  const ropUnid = producto.stock_minimo;
  const stockMaximoUnid = producto.stock_maximo;

  // Convertir a BULTOS (unidad de pedido)
  const ropBultos = ropUnid / unidadesPorBulto;
  const stockMaximoBultos = stockMaximoUnid / unidadesPorBulto;

  // Stock actual
  const stockActualUnid = producto.stock_tienda + producto.stock_en_transito;
  const stockActualBultos = stockActualUnid / unidadesPorBulto;

  // Velocidad P75 para cálculos de días
  const demandaP75 = producto.prom_p75_unid;
  const demandaP75Bultos = demandaP75 / unidadesPorBulto;

  // Días de stock actual
  const diasStockActual = demandaP75 > 0 ? stockActualUnid / demandaP75 : Infinity;
  const diasROP = demandaP75 > 0 ? ropUnid / demandaP75 : 0;
  const diasMaximo = demandaP75 > 0 ? stockMaximoUnid / demandaP75 : 0;

  // Stock CEDI
  const stockCediUnid = producto.stock_cedi_origen;
  const stockCediBultos = stockCediUnid / unidadesPorBulto;

  // LÓGICA DEL PEDIDO SUGERIDO
  // 1. ¿Debemos pedir? → Cuando stock actual <= ROP
  const debePedir = stockActualUnid <= ropUnid;

  // 2. Cantidad sugerida = Stock Máximo - Stock Actual (limitado por CEDI)
  const deficitBultos = Math.max(0, stockMaximoBultos - stockActualBultos);

  // 3. Limitar por stock disponible en CEDI
  const sugeridoSinLimiteBultos = deficitBultos;
  const pedidoSugeridoBultos = debePedir ? Math.max(0, Math.ceil(Math.min(deficitBultos, stockCediBultos))) : 0;
  const pedidoSugeridoUnid = pedidoSugeridoBultos * unidadesPorBulto;
  const limitadoPorCedi = debePedir && deficitBultos > stockCediBultos;

  // Stock resultante después del pedido
  const stockResultanteUnid = stockActualUnid + pedidoSugeridoUnid;
  const stockResultanteBultos = stockResultanteUnid / unidadesPorBulto;
  const diasStockResultante = demandaP75 > 0 ? stockResultanteUnid / demandaP75 : Infinity;

  // Proyección: días hasta próximo pedido
  const diasHastaProximoPedido = diasStockResultante - diasROP;

  const getColorClase = (clase: string) => {
    if (clase === 'A') return 'bg-red-100 text-red-800 border-red-300';
    if (clase === 'B') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="text-blue-600" size={28} />
              Pedido Sugerido
            </h2>
            <p className="text-base text-gray-600 mt-2">
              Clase: <span className={`px-2 py-1 rounded text-sm font-bold ${getColorClase(claseEfectiva)}`}>{claseEfectiva}</span>
              {' • '}Método: <span className="font-semibold">
                {producto.metodo_calculo === 'referencia_regional'
                  ? 'Referencia Regional (Envío Prueba)'
                  : producto.metodo_calculo === 'padre_prudente'
                    ? 'Padre Prudente'
                    : 'Estadístico'}
              </span>
              {producto.metodo_calculo === 'referencia_regional' && (
                <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-800 rounded text-sm font-bold">
                  <FlaskConical className="inline w-4 h-4 mr-1" />
                  Envío Prueba
                </span>
              )}
              {producto.es_generador_trafico && (
                <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-bold">
                  <Zap className="inline w-4 h-4 mr-1" />
                  Generador Tráfico
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={28} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Producto Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <p className="text-base text-gray-600 mb-1">Producto</p>
            <p className="font-mono text-lg font-bold text-gray-900">{producto.codigo_producto}</p>
            <p className="text-base text-gray-700 mt-1">{producto.descripcion_producto}</p>
          </div>

          {/* Decisión Principal */}
          {debePedir ? (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-8 border-2 border-blue-300">
              <div className="flex items-center justify-center mb-4">
                <TrendingUp className="h-14 w-14 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-700 text-center mb-3">
                SÍ PEDIR
              </p>
              <p className="text-6xl font-bold text-blue-800 text-center">
                {pedidoSugeridoBultos} bultos
              </p>
              <p className="text-xl text-blue-600 text-center mt-2">
                ({pedidoSugeridoUnid.toLocaleString()} unidades)
              </p>
              {limitadoPorCedi && (
                <div className="mt-5 bg-orange-100 border-l-4 border-orange-500 p-4 rounded">
                  <p className="text-base text-orange-800">
                    <AlertCircle className="inline h-5 w-5 mr-2" />
                    <strong>Limitado por stock en CEDI:</strong> Se necesitan {Math.ceil(sugeridoSinLimiteBultos)} bultos,
                    pero solo hay {Math.floor(stockCediBultos)} disponibles.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-8 border-2 border-green-300">
              <div className="flex items-center justify-center mb-4">
                <PackageCheck className="h-14 w-14 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-700 text-center mb-3">
                NO PEDIR
              </p>
              <p className="text-6xl font-bold text-green-800 text-center">
                0 bultos
              </p>
              <p className="text-base text-gray-700 mt-5 text-center">
                El stock actual ({diasStockActual.toFixed(1)} días) está por encima del ROP ({diasROP.toFixed(1)} días).
              </p>
            </div>
          )}

          {/* Fórmula Principal */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              Fórmula del Pedido Sugerido
            </h3>
            <div className="bg-white rounded-lg p-4 border border-indigo-300 text-center">
              <p className="text-xl font-mono font-bold text-indigo-800">
                Sugerido = Stock Máximo - Stock Actual
              </p>
              <p className="text-sm text-gray-600 mt-2">
                (en bultos, limitado por disponibilidad en CEDI)
              </p>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <div className="text-center px-3 py-2 bg-purple-100 rounded border border-purple-300">
                <p className="text-xs text-purple-600">Stock Máximo</p>
                <p className="font-mono font-bold text-purple-700">{stockMaximoBultos.toFixed(1)}</p>
                <p className="text-[10px] text-purple-500">bultos</p>
              </div>
              <span className="text-xl font-bold text-gray-400">-</span>
              <div className="text-center px-3 py-2 bg-blue-100 rounded border border-blue-300">
                <p className="text-xs text-blue-600">Stock Actual</p>
                <p className="font-mono font-bold text-blue-700">{stockActualBultos.toFixed(1)}</p>
                <p className="text-[10px] text-blue-500">bultos</p>
              </div>
              <span className="text-xl font-bold text-gray-400">=</span>
              <div className="text-center px-3 py-2 bg-indigo-100 rounded border-2 border-indigo-400">
                <p className="text-xs text-indigo-600">Sugerido</p>
                <p className="font-mono font-bold text-indigo-700 text-lg">{pedidoSugeridoBultos}</p>
                <p className="text-[10px] text-indigo-500">bultos</p>
              </div>
            </div>
          </div>

          {/* Situación Actual */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3 border-b border-gray-300 pb-2">
              Situación Actual
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded p-3 border border-gray-200 text-center">
                <p className="text-xs text-gray-600 mb-1">Stock Actual</p>
                <p className="text-xl font-bold text-blue-700">{stockActualBultos.toFixed(1)}</p>
                <p className="text-xs text-blue-600">bultos</p>
                <p className="text-xs text-gray-500 mt-1">({diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días)</p>
              </div>
              <div className="bg-white rounded p-3 border border-orange-200 text-center">
                <p className="text-xs text-gray-600 mb-1">ROP</p>
                <p className="text-xl font-bold text-orange-700">{ropBultos.toFixed(1)}</p>
                <p className="text-xs text-orange-600">bultos</p>
                <p className="text-xs text-gray-500 mt-1">({diasROP.toFixed(1)} días)</p>
              </div>
              <div className="bg-white rounded p-3 border border-purple-200 text-center">
                <p className="text-xs text-gray-600 mb-1">Stock Máximo</p>
                <p className="text-xl font-bold text-purple-700">{stockMaximoBultos.toFixed(1)}</p>
                <p className="text-xs text-purple-600">bultos</p>
                <p className="text-xs text-gray-500 mt-1">({diasMaximo.toFixed(1)} días)</p>
              </div>
              <div className="bg-white rounded p-3 border border-green-200 text-center">
                <p className="text-xs text-gray-600 mb-1">Stock CEDI</p>
                <p className="text-xl font-bold text-green-700">{stockCediBultos.toFixed(0)}</p>
                <p className="text-xs text-green-600">bultos</p>
                <p className="text-xs text-gray-500 mt-1">(disponible)</p>
              </div>
            </div>
          </div>

          {/* Cálculo Paso a Paso */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm border-b border-gray-300 pb-2">
              Cálculo Paso a Paso (en bultos)
            </h3>

            {/* Paso 1 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mr-2">
                  1
                </span>
                ¿Necesitamos pedir? (Stock Actual ≤ ROP)
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono">
                  Stock Actual = {stockActualBultos.toFixed(1)} bultos ({diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días)
                </p>
                <p className="font-mono mt-1">
                  ROP = {ropBultos.toFixed(1)} bultos ({diasROP.toFixed(1)} días)
                </p>
                <p className={`font-mono mt-2 font-semibold ${debePedir ? 'text-orange-700' : 'text-green-700'}`}>
                  {stockActualBultos.toFixed(1)} {debePedir ? '≤' : '>'} {ropBultos.toFixed(1)} → {debePedir ? 'SÍ PEDIR ✓' : 'NO PEDIR'}
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
                    Calcular déficit (llevar al Stock Máximo)
                  </p>
                  <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                    <p className="font-mono">
                      Déficit = Stock Máximo - Stock Actual
                    </p>
                    <p className="font-mono mt-1">
                      Déficit = {stockMaximoBultos.toFixed(1)} - {stockActualBultos.toFixed(1)} = {sugeridoSinLimiteBultos.toFixed(1)} bultos
                    </p>
                    <p className="font-mono text-purple-700 font-semibold mt-1">
                      → {Math.ceil(sugeridoSinLimiteBultos)} bultos (redondeado hacia arriba)
                    </p>
                  </div>
                </div>

                {/* Paso 3 */}
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mr-2">
                      3
                    </span>
                    Limitar por disponibilidad en CEDI
                  </p>
                  <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                    <p className="font-mono">
                      Stock CEDI = {stockCediBultos.toFixed(0)} bultos
                    </p>
                    <p className="font-mono mt-1">
                      Déficit = {Math.ceil(sugeridoSinLimiteBultos)} bultos
                    </p>
                    <p className={`font-mono mt-2 font-semibold ${limitadoPorCedi ? 'text-orange-700' : 'text-green-700'}`}>
                      Pedido Final = min({Math.ceil(sugeridoSinLimiteBultos)}, {Math.floor(stockCediBultos)}) = {pedidoSugeridoBultos} bultos
                      {limitadoPorCedi && ' ⚠️ Limitado'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Conversión a Días */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-cyan-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              ¿Cómo se convierte a Días?
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Todos los valores en días se calculan dividiendo por la <strong>Velocidad P75</strong> (bultos/día):
            </p>
            <div className="bg-white rounded-lg p-4 border border-cyan-300">
              <p className="text-center font-mono text-cyan-800 mb-3">
                <span className="font-bold">Días</span> = Stock (bultos) ÷ Velocidad P75 (bultos/día)
              </p>
              <div className="flex items-center justify-center gap-2 text-sm bg-cyan-50 rounded p-3">
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">Velocidad P75</p>
                  <p className="font-mono font-bold text-blue-700">{demandaP75Bultos.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">bultos/día</p>
                </div>
              </div>
            </div>
          </div>

          {/* Proyección después del pedido */}
          {pedidoSugeridoBultos > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
              <h3 className="font-semibold text-indigo-800 text-sm mb-3 border-b border-indigo-300 pb-2">
                📊 Proyección con el Pedido
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded p-3 border-2 border-indigo-200 text-center">
                  <p className="text-xs text-gray-600 mb-1">Stock Resultante</p>
                  <p className="text-2xl font-bold text-indigo-700">{stockResultanteBultos.toFixed(0)} bultos</p>
                  <p className="text-xs text-gray-500 mt-1">(~{diasStockResultante.toFixed(0)} días)</p>
                </div>
                <div className="bg-white rounded p-3 border-2 border-green-200 text-center">
                  <p className="text-xs text-gray-600 mb-1">Te alcanza para</p>
                  <p className="text-2xl font-bold text-green-700">~{Math.max(0, Math.floor(diasHastaProximoPedido))} días</p>
                  <p className="text-xs text-gray-500 mt-1">(antes del próximo pedido)</p>
                </div>
              </div>
            </div>
          )}

          {/* Envío de Prueba - Referencia Regional */}
          {producto.metodo_calculo === 'referencia_regional' && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="text-amber-600" size={20} />
                <h4 className="font-semibold text-amber-900">Envío de Prueba</h4>
              </div>
              <p className="text-sm text-gray-700 mb-2">
                Este producto <strong>no tiene historial de ventas</strong> en esta tienda, pero <strong>sí se vende en otras tiendas de la misma región</strong>.
              </p>
              <p className="text-sm text-gray-700 mb-2">
                El P75 mostrado está basado en el comportamiento de ventas de tiendas similares (referencia regional).
                Se sugiere un <strong>envío de prueba conservador</strong> para evaluar la demanda real.
              </p>
              {producto.warnings_calculo && producto.warnings_calculo.length > 0 && (
                <div className="mt-2 text-xs text-amber-700 bg-amber-100 rounded p-2">
                  {producto.warnings_calculo.map((w, i) => (
                    <p key={i}>ℹ️ {w}</p>
                  ))}
                </div>
              )}
              {producto.razon_pedido && (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  📝 {producto.razon_pedido}
                </p>
              )}
            </div>
          )}

          {/* Generador de Tráfico */}
          {producto.es_generador_trafico && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="text-purple-600" size={20} />
                <h4 className="font-semibold text-purple-900">Producto Generador de Tráfico</h4>
              </div>
              <p className="text-sm text-gray-700">
                Este producto fue identificado como <strong>Generador de Tráfico</strong> (alto GAP entre rank de venta y penetración).
                Se trata como <strong>Clase A</strong> para asegurar disponibilidad constante.
              </p>
            </div>
          )}

          {/* Nota Estrategia */}
          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-800">Estrategia:</span> El sistema sugiere llevar el stock hasta el <strong>nivel máximo</strong>
              {' '}cada vez que se alcanza el <strong>punto de reorden (ROP)</strong>. Esto optimiza la frecuencia de pedidos y asegura disponibilidad continua.
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
