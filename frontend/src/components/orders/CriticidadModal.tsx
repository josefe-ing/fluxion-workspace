import { X, AlertTriangle, Flame, TrendingUp, Info } from 'lucide-react';

interface CriticidadModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    prom_p75_unid?: number; // Percentil 75 de ventas diarias
    cantidad_bultos: number;
    stock_tienda: number;
    stock_en_transito: number;
    // Valores calculados del backend
    stock_seguridad?: number;
    punto_reorden?: number;
    stock_maximo?: number;
    clasificacion_abc?: string;
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
}: CriticidadModalProps) {
  if (!isOpen) return null;

  // Usar P75 para cálculos de días (más conservador, prepara para picos de demanda)
  const velocidadP75Unid = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
  const velocidadP75Bultos = velocidadP75Unid / producto.cantidad_bultos;

  // Promedio 20D se usa para clasificación ABC (velocidad/rotación)
  const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;

  // Usar clasificación ABC del backend si está disponible
  const clasificacion = producto.clasificacion_abc || (() => {
    // Fallback local
    if (ventaDiariaBultos >= 20) return 'A';
    if (ventaDiariaBultos >= 5) return 'AB';
    if (ventaDiariaBultos >= 0.45) return 'B';
    if (ventaDiariaBultos >= 0.20) return 'BC';
    if (ventaDiariaBultos >= 0.001) return 'C';
    return '-';
  })();

  // Usar valores del backend (en unidades)
  const stockSeguridadUnid = producto.stock_seguridad || 0;
  const puntoReordenUnid = producto.punto_reorden || 0;
  const stockMaximoUnid = producto.stock_maximo || 0;

  // Convertir a días usando P75
  const diasSS = velocidadP75Unid > 0 ? stockSeguridadUnid / velocidadP75Unid : 0;
  const diasROP = velocidadP75Unid > 0 ? puntoReordenUnid / velocidadP75Unid : 0;
  const diasMAX = velocidadP75Unid > 0 ? stockMaximoUnid / velocidadP75Unid : 0;

  // Stock actual
  const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
  const diasStockActual = velocidadP75Unid > 0 ? stockTotalUnidades / velocidadP75Unid : Infinity;

  // Convertir a bultos para mostrar
  const stockSeguridadBultos = stockSeguridadUnid / producto.cantidad_bultos;
  const puntoReordenBultos = puntoReordenUnid / producto.cantidad_bultos;
  const stockMaximoBultos = stockMaximoUnid / producto.cantidad_bultos;
  const stockActualBultos = stockTotalUnidades / producto.cantidad_bultos;

  // Determinar nivel de urgencia (4 niveles claros basados en SS, ROP, MAX)
  let nivelUrgenciaStock: number;
  let textoUrgencia: string;
  let colorUrgencia: string;
  let descripcionUrgencia: string;

  if (diasStockActual <= diasSS) {
    nivelUrgenciaStock = 1;
    textoUrgencia = 'CRÍTICO';
    colorUrgencia = 'bg-red-100 border-red-300 text-red-900';
    descripcionUrgencia = 'Stock por debajo del Stock de Seguridad. Riesgo alto de quiebre.';
  } else if (diasStockActual <= diasROP) {
    nivelUrgenciaStock = 2;
    textoUrgencia = 'URGENTE';
    colorUrgencia = 'bg-orange-100 border-orange-300 text-orange-900';
    descripcionUrgencia = 'Stock entre SS y ROP. Hay que pedir para evitar quiebre.';
  } else if (diasStockActual <= diasMAX) {
    nivelUrgenciaStock = 3;
    textoUrgencia = 'ÓPTIMO';
    colorUrgencia = 'bg-green-100 border-green-300 text-green-900';
    descripcionUrgencia = 'Stock en nivel ideal (entre ROP y MAX). No es necesario pedir.';
  } else {
    nivelUrgenciaStock = 4;
    textoUrgencia = 'EXCESO';
    colorUrgencia = 'bg-blue-100 border-blue-300 text-blue-900';
    descripcionUrgencia = 'Stock por encima del máximo. Posible sobreinventario.';
  }

  // Peso ABC (menor número = mayor prioridad)
  const pesoABC = {
    'A': 1, 'AB': 2, 'B': 3, 'BC': 4, 'C': 5, '-': 6
  }[clasificacion] || 6;

  // Calcular criticidad final
  const criticidad = (nivelUrgenciaStock * 10) + pesoABC;

  // Determinar emoji visual según nivel de urgencia
  let emojiVisual: string;
  if (nivelUrgenciaStock === 1) {
    emojiVisual = clasificacion === 'A' ? '🔴🔴' : '🔴';
  } else if (nivelUrgenciaStock === 2) {
    emojiVisual = clasificacion === 'A' ? '🟠🟠' : '🟠';
  } else if (nivelUrgenciaStock === 3) {
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
                <div className="text-xs mt-2 max-w-xs">{descripcionUrgencia}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Stock Actual</div>
                <div className="text-3xl font-bold">{diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días</div>
                <div className="text-sm text-gray-500">({stockActualBultos.toFixed(1)} bultos)</div>
                <div className="text-sm text-gray-600 mt-2">Clasificación: <span className="font-bold">{clasificacion}</span></div>
              </div>
            </div>
          </div>

          {/* Barra visual de umbrales */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📊 Posición del Stock vs Umbrales</h3>
            <div className="relative h-8 bg-gradient-to-r from-red-200 via-orange-200 via-green-200 to-blue-200 rounded-full overflow-hidden">
              {/* Marcadores de umbrales */}
              <div className="absolute top-0 bottom-0 flex items-center" style={{ left: `${Math.min((diasSS / diasMAX) * 80, 80)}%` }}>
                <div className="w-0.5 h-full bg-red-600"></div>
                <span className="absolute -bottom-5 text-[10px] text-red-700 font-semibold whitespace-nowrap">SS</span>
              </div>
              <div className="absolute top-0 bottom-0 flex items-center" style={{ left: `${Math.min((diasROP / diasMAX) * 80, 80)}%` }}>
                <div className="w-0.5 h-full bg-orange-600"></div>
                <span className="absolute -bottom-5 text-[10px] text-orange-700 font-semibold whitespace-nowrap">ROP</span>
              </div>
              <div className="absolute top-0 bottom-0 flex items-center" style={{ left: '80%' }}>
                <div className="w-0.5 h-full bg-blue-600"></div>
                <span className="absolute -bottom-5 text-[10px] text-blue-700 font-semibold whitespace-nowrap">MAX</span>
              </div>
              {/* Indicador de stock actual */}
              <div
                className="absolute top-1 bottom-1 w-3 h-3 rounded-full bg-gray-900 border-2 border-white shadow-lg"
                style={{ left: `${Math.min(Math.max((diasStockActual / diasMAX) * 80, 2), 98)}%`, transform: 'translateX(-50%)' }}
                title={`Stock: ${diasStockActual.toFixed(1)}d`}
              ></div>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-2 text-xs">
              <div className="text-center p-2 bg-red-100 rounded">
                <div className="font-bold text-red-700">CRÍTICO</div>
                <div className="text-gray-600">≤ SS</div>
              </div>
              <div className="text-center p-2 bg-orange-100 rounded">
                <div className="font-bold text-orange-700">URGENTE</div>
                <div className="text-gray-600">SS → ROP</div>
              </div>
              <div className="text-center p-2 bg-green-100 rounded">
                <div className="font-bold text-green-700">ÓPTIMO</div>
                <div className="text-gray-600">ROP → MAX</div>
              </div>
              <div className="text-center p-2 bg-blue-100 rounded">
                <div className="font-bold text-blue-700">EXCESO</div>
                <div className="text-gray-600">&gt; MAX</div>
              </div>
            </div>
          </div>

          {/* Tabla de umbrales con valores */}
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📐 Umbrales de Inventario</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Umbral</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Días</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Bultos</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-600">Unidades</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Significado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b ${diasStockActual <= diasSS ? 'bg-red-50' : ''}`}>
                    <td className="py-2 px-3 font-semibold text-red-700">SS (Stock Seguridad)</td>
                    <td className="py-2 px-3 text-right">{diasSS.toFixed(1)}d</td>
                    <td className="py-2 px-3 text-right">{stockSeguridadBultos.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">{stockSeguridadUnid.toFixed(0)}</td>
                    <td className="py-2 px-3 text-xs text-gray-600">Colchón para variabilidad de demanda</td>
                  </tr>
                  <tr className={`border-b ${diasStockActual > diasSS && diasStockActual <= diasROP ? 'bg-orange-50' : ''}`}>
                    <td className="py-2 px-3 font-semibold text-orange-700">ROP (Punto Reorden)</td>
                    <td className="py-2 px-3 text-right">{diasROP.toFixed(1)}d</td>
                    <td className="py-2 px-3 text-right">{puntoReordenBultos.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">{puntoReordenUnid.toFixed(0)}</td>
                    <td className="py-2 px-3 text-xs text-gray-600">Momento de hacer pedido</td>
                  </tr>
                  <tr className={`border-b ${diasStockActual > diasROP && diasStockActual <= diasMAX ? 'bg-green-50' : ''}`}>
                    <td className="py-2 px-3 font-semibold text-green-700">Stock Actual</td>
                    <td className="py-2 px-3 text-right font-bold">{diasStockActual.toFixed(1)}d</td>
                    <td className="py-2 px-3 text-right font-bold">{stockActualBultos.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right font-bold">{stockTotalUnidades.toFixed(0)}</td>
                    <td className="py-2 px-3 text-xs text-gray-600">Tu inventario hoy</td>
                  </tr>
                  <tr className={`${diasStockActual > diasMAX ? 'bg-blue-50' : ''}`}>
                    <td className="py-2 px-3 font-semibold text-blue-700">MAX (Stock Máximo)</td>
                    <td className="py-2 px-3 text-right">{diasMAX.toFixed(1)}d</td>
                    <td className="py-2 px-3 text-right">{stockMaximoBultos.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right">{stockMaximoUnid.toFixed(0)}</td>
                    <td className="py-2 px-3 text-xs text-gray-600">Límite superior para evitar sobreinventario</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Nota sobre P75 */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-800">
                <strong>Nota:</strong> Los días de stock se calculan usando <strong>P75</strong> (Percentil 75 de ventas diarias),
                no el promedio simple. Esto es más conservador y prepara el inventario para días de alta demanda.
                {producto.prom_p75_unid && producto.prom_p75_unid !== producto.prom_ventas_20dias_unid && (
                  <span className="block mt-1">
                    P75: <strong>{velocidadP75Bultos.toFixed(2)}</strong> bultos/día vs
                    Prom 20D: <strong>{ventaDiariaBultos.toFixed(2)}</strong> bultos/día
                  </span>
                )}
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
              La <strong>criticidad</strong> es un número que combina dos factores para decidir
              <strong> qué productos pedir primero</strong>:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-red-600 font-bold">1.</span>
                <span><strong>Nivel de Urgencia (1-4):</strong> Basado en dónde está el stock vs los umbrales SS, ROP, MAX</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 font-bold">2.</span>
                <span><strong>Clasificación ABC (1-6):</strong> Qué tan importante es el producto por su valor de ventas</span>
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
                  <div className="font-medium text-gray-800 text-sm mb-2">Determinar Nivel de Urgencia (1-4)</div>
                  <div className="bg-gray-50 rounded p-3 space-y-2 text-xs">
                    <div className={`flex justify-between items-center p-1 rounded ${nivelUrgenciaStock === 1 ? 'bg-red-200 font-bold' : ''}`}>
                      <span>Nivel 1 - CRÍTICO:</span>
                      <span className="text-red-700">Stock ≤ SS ({diasSS.toFixed(1)}d)</span>
                    </div>
                    <div className={`flex justify-between items-center p-1 rounded ${nivelUrgenciaStock === 2 ? 'bg-orange-200 font-bold' : ''}`}>
                      <span>Nivel 2 - URGENTE:</span>
                      <span className="text-orange-600">SS &lt; Stock ≤ ROP ({diasROP.toFixed(1)}d)</span>
                    </div>
                    <div className={`flex justify-between items-center p-1 rounded ${nivelUrgenciaStock === 3 ? 'bg-green-200 font-bold' : ''}`}>
                      <span>Nivel 3 - ÓPTIMO:</span>
                      <span className="text-green-600">ROP &lt; Stock ≤ MAX ({diasMAX.toFixed(1)}d)</span>
                    </div>
                    <div className={`flex justify-between items-center p-1 rounded ${nivelUrgenciaStock === 4 ? 'bg-blue-200 font-bold' : ''}`}>
                      <span>Nivel 4 - EXCESO:</span>
                      <span className="text-blue-600">Stock &gt; MAX</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <div className="flex justify-between font-bold">
                        <span>Este producto ({diasStockActual.toFixed(1)}d):</span>
                        <span className={
                          nivelUrgenciaStock === 1 ? 'text-red-700' :
                          nivelUrgenciaStock === 2 ? 'text-orange-600' :
                          nivelUrgenciaStock === 3 ? 'text-green-600' : 'text-blue-600'
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
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`flex justify-between p-1 rounded ${clasificacion === 'A' ? 'bg-red-200 font-bold' : ''}`}>
                        <span className="text-red-700">A:</span>
                        <span>Peso 1</span>
                      </div>
                      <div className={`flex justify-between p-1 rounded ${clasificacion === 'B' ? 'bg-yellow-200 font-bold' : ''}`}>
                        <span className="text-yellow-700">B:</span>
                        <span>Peso 3</span>
                      </div>
                      <div className={`flex justify-between p-1 rounded ${clasificacion === 'C' ? 'bg-gray-200 font-bold' : ''}`}>
                        <span className="text-gray-700">C:</span>
                        <span>Peso 5</span>
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
            </ul>
          </div>

          {/* Tabla de Interpretación */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📊 Interpretación de Valores</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-red-100 rounded">
                <span className="font-semibold">11-16 (Crítico):</span>
                <span className="text-red-700">🔴 MÁXIMA PRIORIDAD - Pedir inmediatamente</span>
              </div>
              <div className="flex justify-between p-2 bg-orange-100 rounded">
                <span className="font-semibold">21-26 (Urgente):</span>
                <span className="text-orange-700">🟠 Alta prioridad - Incluir en próximo pedido</span>
              </div>
              <div className="flex justify-between p-2 bg-green-100 rounded">
                <span className="font-semibold">31-36 (Óptimo):</span>
                <span className="text-green-700">✓ Stock saludable - No es necesario pedir</span>
              </div>
              <div className="flex justify-between p-2 bg-blue-100 rounded">
                <span className="font-semibold">41+ (Exceso):</span>
                <span className="text-blue-700">⚠️ Sobreinventario - Reducir próximos pedidos</span>
              </div>
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
