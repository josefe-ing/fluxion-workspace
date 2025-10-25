import { X, AlertTriangle, Flame, TrendingUp } from 'lucide-react';

interface CriticidadModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
    stock_tienda: number;
    stock_en_transito: number;
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

export default function CriticidadModal({
  isOpen,
  onClose,
  producto,
  stockParams
}: CriticidadModalProps) {
  if (!isOpen) return null;

  const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;

  // Calcular clasificación ABC
  const getClasificacionABC = (): string => {
    if (ventaDiariaBultos >= 20) return 'A';
    if (ventaDiariaBultos >= 5) return 'AB';
    if (ventaDiariaBultos >= 0.45) return 'B';
    if (ventaDiariaBultos >= 0.20) return 'BC';
    if (ventaDiariaBultos >= 0.001) return 'C';
    return '-';
  };

  const clasificacion = getClasificacionABC();

  // Calcular stock mínimo
  const calcularStockMinimo = (): number => {
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_min_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_min_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_min_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_min_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_min_mult_c;
    return ventaDiariaBultos * multiplicador;
  };

  const calcularStockSeguridad = (): number => {
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_seg_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_seg_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_seg_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_seg_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_seg_mult_c;
    return ventaDiariaBultos * multiplicador;
  };

  const calcularPuntoReorden = (): number => {
    const stockMin = calcularStockMinimo();
    const stockSeg = calcularStockSeguridad();
    return stockMin + stockSeg + (1.25 * ventaDiariaBultos);
  };

  const calcularStockMaximo = (): number => {
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_max_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_max_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_max_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_max_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_max_mult_c;
    return ventaDiariaBultos * multiplicador;
  };

  const stockMinimoBultos = calcularStockMinimo();
  const puntoReordenBultos = calcularPuntoReorden();
  const stockMaximoBultos = calcularStockMaximo();

  const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
  const diasStockActual = producto.prom_ventas_20dias_unid > 0
    ? stockTotalUnidades / producto.prom_ventas_20dias_unid
    : Infinity;

  const diasMinimo = ventaDiariaBultos > 0 ? stockMinimoBultos / ventaDiariaBultos : 0;
  const diasReorden = ventaDiariaBultos > 0 ? puntoReordenBultos / ventaDiariaBultos : 0;
  const diasMaximo = ventaDiariaBultos > 0 ? stockMaximoBultos / ventaDiariaBultos : 0;

  const puntoMedio = diasMinimo + ((diasReorden - diasMinimo) * 0.5);

  // Determinar nivel de urgencia de stock
  let nivelUrgenciaStock: number;
  let textoUrgencia: string;
  let colorUrgencia: string;

  if (diasStockActual <= diasMinimo) {
    nivelUrgenciaStock = 1;
    textoUrgencia = 'CRÍTICO';
    colorUrgencia = 'bg-red-100 border-red-300 text-red-900';
  } else if (diasStockActual <= puntoMedio) {
    nivelUrgenciaStock = 2;
    textoUrgencia = 'MUY URGENTE';
    colorUrgencia = 'bg-red-50 border-red-200 text-red-800';
  } else if (diasStockActual <= diasReorden) {
    nivelUrgenciaStock = 3;
    textoUrgencia = 'URGENTE';
    colorUrgencia = 'bg-orange-50 border-orange-200 text-orange-800';
  } else if (diasStockActual <= diasMaximo * 0.8) {
    nivelUrgenciaStock = 4;
    textoUrgencia = 'PREVENTIVO';
    colorUrgencia = 'bg-green-50 border-green-200 text-green-800';
  } else {
    nivelUrgenciaStock = 5;
    textoUrgencia = 'ÓPTIMO/EXCESO';
    colorUrgencia = 'bg-blue-50 border-blue-200 text-blue-800';
  }

  // Peso ABC (menor número = mayor prioridad)
  const pesoABC = {
    'A': 1, 'AB': 2, 'B': 3, 'BC': 4, 'C': 5, '-': 6
  }[clasificacion] || 6;

  // Calcular criticidad final
  const criticidad = (nivelUrgenciaStock * 10) + pesoABC;

  // Determinar emoji visual según clasificación y urgencia
  let emojiVisual: string;
  if (nivelUrgenciaStock === 1) {
    emojiVisual = clasificacion === 'A' ? '🔴🔴🔴' : clasificacion === 'AB' ? '🔴🔴' : '🔴';
  } else if (nivelUrgenciaStock === 2) {
    emojiVisual = (clasificacion === 'A' || clasificacion === 'AB') ? '🔴🟠' : '🔴';
  } else if (nivelUrgenciaStock === 3) {
    emojiVisual = clasificacion === 'A' ? '🟠🟠' : '🟠';
  } else if (nivelUrgenciaStock === 4) {
    emojiVisual = '✓';
  } else {
    emojiVisual = '⚠️';
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-600 to-orange-600 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Flame className="h-6 w-6" />
              Criticidad/Prioridad: {criticidad}
            </h2>
            <p className="text-red-100 text-sm mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-red-100 transition-colors ml-4"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Indicador Visual Principal */}
          <div className={`rounded-lg p-6 mb-6 border-2 ${colorUrgencia}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-6xl mb-2">{emojiVisual}</div>
                <div className="text-2xl font-bold">{textoUrgencia}</div>
                <div className="text-sm mt-1">Criticidad: {criticidad}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Stock Actual</div>
                <div className="text-3xl font-bold">{diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días</div>
                <div className="text-sm text-gray-600 mt-1">Clasificación: <span className="font-bold">{clasificacion}</span></div>
              </div>
            </div>
          </div>

          {/* ¿Qué es la Criticidad? */}
          <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200">
            <h3 className="text-sm font-semibold text-red-900 mb-3 flex items-center gap-2">
              <Flame className="h-5 w-5" />
              ¿Qué es la Criticidad?
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              La <strong>criticidad</strong> es un número que combina dos factores críticos para decidir
              <strong> qué productos pedir primero</strong>:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">1.</span>
                <span><strong>Urgencia de stock:</strong> Qué tan crítico está el nivel de inventario actual</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 font-bold">2.</span>
                <span><strong>Clasificación ABC:</strong> Qué tan importante es el producto por su rotación</span>
              </li>
            </ul>
          </div>

          {/* Fórmula de Cálculo */}
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-red-600" />
              📐 Cómo se Calcula
            </h3>

            <div className="space-y-4">
              {/* Paso 1: Nivel de Urgencia */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm mb-2">Determinar Nivel de Urgencia de Stock (1-5)</div>
                  <div className="bg-gray-50 rounded p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Nivel 1 - CRÍTICO:</span>
                      <span className="text-red-700">Stock ≤ Mínimo ({diasMinimo.toFixed(1)}d)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Nivel 2 - MUY URGENTE:</span>
                      <span className="text-red-600">Mínimo a 50% hacia Reorden</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Nivel 3 - URGENTE:</span>
                      <span className="text-orange-600">50% hasta Reorden ({diasReorden.toFixed(1)}d)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Nivel 4 - PREVENTIVO:</span>
                      <span className="text-green-600">Reorden hasta 80% Máximo</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Nivel 5 - ÓPTIMO/EXCESO:</span>
                      <span className="text-blue-600">&gt; 80% Máximo ({(diasMaximo * 0.8).toFixed(1)}d)</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <div className="flex justify-between font-bold">
                        <span>Este producto:</span>
                        <span className={
                          nivelUrgenciaStock === 1 ? 'text-red-700' :
                          nivelUrgenciaStock === 2 ? 'text-red-600' :
                          nivelUrgenciaStock === 3 ? 'text-orange-600' :
                          nivelUrgenciaStock === 4 ? 'text-green-600' : 'text-blue-600'
                        }>
                          Nivel {nivelUrgenciaStock} - {textoUrgencia}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 2: Peso ABC */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm mb-2">Asignar Peso por Clasificación ABC</div>
                  <div className="bg-gray-50 rounded p-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex justify-between">
                        <span className="font-semibold text-red-700">A:</span>
                        <span>Peso 1 (máxima prioridad)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-orange-700">AB:</span>
                        <span>Peso 2</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-yellow-700">B:</span>
                        <span>Peso 3</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-amber-700">BC:</span>
                        <span>Peso 4</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-700">C:</span>
                        <span>Peso 5</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-500">-:</span>
                        <span>Peso 6 (mínima prioridad)</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <div className="flex justify-between font-bold">
                        <span>Este producto (clase {clasificacion}):</span>
                        <span className="text-orange-600">Peso {pesoABC}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 3: Fórmula Final */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm mb-2">Calcular Criticidad Final</div>
                  <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded p-4 border border-red-200">
                    <div className="text-center space-y-2">
                      <div className="text-xs text-gray-600">Fórmula</div>
                      <div className="font-mono text-sm font-bold text-gray-900">
                        Criticidad = (Nivel Urgencia × 10) + Peso ABC
                      </div>
                      <div className="text-xs text-gray-600 mt-3">Cálculo para este producto</div>
                      <div className="font-mono text-base font-bold text-red-700">
                        Criticidad = ({nivelUrgenciaStock} × 10) + {pesoABC} = {criticidad}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Por qué es Importante */}
          <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              ✅ ¿Por qué es Importante la Criticidad?
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Prioriza lo urgente:</strong> Productos con stock crítico se atienden primero</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Considera importancia:</strong> Un producto A con bajo stock es MÁS crítico que un C con bajo stock</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Evita quiebres:</strong> Los productos de alta rotación con stock bajo pueden causar pérdidas de venta</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">•</span>
                <span><strong>Optimiza recursos:</strong> Permite enfocar esfuerzos en lo que realmente importa</span>
              </li>
            </ul>
          </div>

          {/* Tabla de Interpretación */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📊 Interpretación de Valores</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-red-100 rounded">
                <span className="font-semibold">11-16 (Crítico A/AB):</span>
                <span className="text-red-700">🔴🔴🔴 MÁXIMA PRIORIDAD - Pedir YA</span>
              </div>
              <div className="flex justify-between p-2 bg-orange-100 rounded">
                <span className="font-semibold">17-35 (Urgente):</span>
                <span className="text-orange-700">🟠 Alta prioridad - Incluir en pedido</span>
              </div>
              <div className="flex justify-between p-2 bg-green-100 rounded">
                <span className="font-semibold">41-45 (Preventivo):</span>
                <span className="text-green-700">✓ Prioridad media - Evaluar</span>
              </div>
              <div className="flex justify-between p-2 bg-blue-100 rounded">
                <span className="font-semibold">51+ (Óptimo/Exceso):</span>
                <span className="text-blue-700">⚠️ Baja prioridad - No pedir</span>
              </div>
            </div>
          </div>

          {/* Ejemplo Práctico */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <h3 className="text-sm font-semibold text-amber-900 mb-2">💡 Ejemplo Práctico</h3>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>Escenario:</strong> Tienes 2 productos con stock bajo:</p>
              <ul className="ml-4 space-y-1">
                <li>→ Producto A (clase A) con stock crítico: Criticidad = <strong className="text-red-700">11</strong></li>
                <li>→ Producto X (clase C) con stock crítico: Criticidad = <strong className="text-orange-600">15</strong></li>
              </ul>
              <p className="mt-2">
                <strong className="text-amber-700">Decisión:</strong> Aunque ambos tienen stock crítico,
                el Producto A es más urgente (criticidad 11 vs 15) porque tiene mayor rotación y genera más ventas.
                Si solo puedes pedir uno, prioriza el A.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium text-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
