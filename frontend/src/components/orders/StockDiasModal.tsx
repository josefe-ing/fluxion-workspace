import { X, AlertTriangle, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';

interface StockDiasModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    prom_p75_unid: number;
    cantidad_bultos: number;
    stock_tienda: number;
    stock_en_transito: number;
    // Valores reales del backend
    stock_seguridad: number;
    rop: number;
    stock_maximo: number;
    clasificacion_abc: string;
    dias_stock: number;
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

export default function StockDiasModal({ isOpen, onClose, producto }: StockDiasModalProps) {
  if (!isOpen) return null;

  // Usar valores reales del backend
  const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
  const ventaDiariaBase = producto.prom_p75_unid > 0 ? producto.prom_p75_unid : producto.prom_ventas_20dias_unid;

  // Días de stock actual (del backend o calculado)
  const diasStockActual = producto.dias_stock > 0
    ? producto.dias_stock
    : (ventaDiariaBase > 0 ? stockTotalUnidades / ventaDiariaBase : Infinity);

  // Convertir SS, ROP, MAX de unidades a días
  const diasSS = ventaDiariaBase > 0 ? producto.stock_seguridad / ventaDiariaBase : 0;
  const diasROP = ventaDiariaBase > 0 ? producto.rop / ventaDiariaBase : 0;
  const diasMaximo = ventaDiariaBase > 0 ? producto.stock_maximo / ventaDiariaBase : 0;

  // Usar clasificación del backend
  const clasificacion = producto.clasificacion_abc || '-';

  // Determinar estado y urgencia
  let estado: 'critico' | 'bajo' | 'normal' | 'alto' | 'exceso';
  let urgencia: string;
  let icon: React.ReactElement;
  let colorBg: string;
  let colorText: string;
  let recomendacion: string;

  if (diasStockActual <= diasSS) {
    estado = 'critico';
    urgencia = 'CRÍTICO - Pedir Urgente';
    icon = <AlertTriangle className="h-12 w-12 text-red-600" />;
    colorBg = 'bg-red-50';
    colorText = 'text-red-700';
    recomendacion = 'El stock está por debajo del Stock de Seguridad. Es urgente realizar un pedido para evitar quiebres de inventario.';
  } else if (diasStockActual <= diasROP) {
    estado = 'bajo';
    urgencia = 'BAJO - Pedir Ahora';
    icon = <AlertCircle className="h-12 w-12 text-orange-600" />;
    colorBg = 'bg-orange-50';
    colorText = 'text-orange-700';
    recomendacion = 'El stock alcanzó el Punto de Reorden (ROP). Se recomienda hacer un pedido para reponer hasta el stock máximo.';
  } else if (diasStockActual <= diasMaximo) {
    estado = 'normal';
    urgencia = 'NORMAL - No Pedir';
    icon = <CheckCircle className="h-12 w-12 text-green-600" />;
    colorBg = 'bg-green-50';
    colorText = 'text-green-700';
    recomendacion = 'El stock está en niveles óptimos. No es necesario realizar pedidos en este momento.';
  } else {
    estado = 'exceso';
    urgencia = 'EXCESO - No Pedir';
    icon = <AlertCircle className="h-12 w-12 text-blue-600" />;
    colorBg = 'bg-blue-50';
    colorText = 'text-blue-700';
    recomendacion = 'El stock supera el máximo recomendado. No realizar pedidos hasta que baje a niveles normales.';
  }

  // Calcular porcentajes para la barra visual
  const maxDiasParaBarra = Math.max(diasMaximo * 1.2, diasStockActual);
  const porcentajeSS = (diasSS / maxDiasParaBarra) * 100;
  const porcentajeROP = (diasROP / maxDiasParaBarra) * 100;
  const porcentajeMax = (diasMaximo / maxDiasParaBarra) * 100;
  const porcentajeActual = Math.min((diasStockActual / maxDiasParaBarra) * 100, 100);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              Stock Actual: {diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días
            </h2>
            <p className="text-sm text-green-100 mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-white hover:text-green-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Estado y Urgencia */}
          <div className={`${colorBg} rounded-lg p-6 text-center border-2 ${colorBg === 'bg-red-50' ? 'border-red-300' : colorBg === 'bg-orange-50' ? 'border-orange-300' : colorBg === 'bg-green-50' ? 'border-green-300' : 'border-blue-300'}`}>
            <div className="flex items-center justify-center mb-3">
              {icon}
            </div>
            <p className={`text-3xl font-bold ${colorText} mb-2`}>{urgencia}</p>
            <p className={`text-5xl font-bold ${colorText}`}>
              {diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días
            </p>
            <p className="text-sm text-gray-600 mt-3">{recomendacion}</p>
          </div>

          {/* Barra Visual de Stock */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-4 border-b border-gray-300 pb-2">
              Visualización de Niveles de Stock
            </h3>

            {/* Barra de progreso */}
            <div className="relative h-20 bg-gray-200 rounded-lg overflow-visible mb-8 mt-10">
              {/* Zona Crítica (0 - SS) */}
              <div
                className="absolute left-0 top-0 h-full bg-red-300 opacity-50 rounded-l-lg"
                style={{ width: `${porcentajeSS}%` }}
              />

              {/* Zona Bajo (SS - ROP) */}
              <div
                className="absolute top-0 h-full bg-orange-300 opacity-50"
                style={{ left: `${porcentajeSS}%`, width: `${porcentajeROP - porcentajeSS}%` }}
              />

              {/* Zona Normal (ROP - Máximo) */}
              <div
                className="absolute top-0 h-full bg-green-300 opacity-50"
                style={{ left: `${porcentajeROP}%`, width: `${porcentajeMax - porcentajeROP}%` }}
              />

              {/* Zona Exceso (> Máximo) */}
              <div
                className="absolute top-0 h-full bg-blue-300 opacity-50 rounded-r-lg"
                style={{ left: `${porcentajeMax}%`, width: `${100 - porcentajeMax}%` }}
              />

              {/* Marcadores de líneas con etiquetas */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-600"
                style={{ left: `${porcentajeSS}%` }}
              >
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-red-700 whitespace-nowrap">
                  SS: {diasSS.toFixed(1)}d
                </div>
              </div>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-indigo-600"
                style={{ left: `${porcentajeROP}%` }}
              >
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-indigo-700 whitespace-nowrap">
                  ROP: {diasROP.toFixed(1)}d
                </div>
              </div>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-purple-600"
                style={{ left: `${porcentajeMax}%` }}
              >
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-purple-700 whitespace-nowrap">
                  MAX: {diasMaximo.toFixed(1)}d
                </div>
              </div>

              {/* Indicador de stock actual - MÁS VISIBLE */}
              {diasStockActual !== Infinity && (
                <div
                  className="absolute top-0 bottom-0 flex flex-col items-center"
                  style={{ left: `${porcentajeActual}%`, transform: 'translateX(-50%)' }}
                >
                  {/* Etiqueta superior */}
                  <div className="absolute -top-9 bg-black text-white px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap shadow-lg z-10">
                    {diasStockActual.toFixed(1)} días
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-black"></div>
                  </div>
                  {/* Línea vertical gruesa */}
                  <div className="w-1 h-full bg-black shadow-md"></div>
                  {/* Triángulo inferior */}
                  <div className="absolute bottom-0 translate-y-1/2">
                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-black"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Leyenda */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="h-3 bg-red-300 rounded mb-1"></div>
                <p className="font-semibold text-red-800">Crítico</p>
                <p className="text-gray-600">0 - {diasSS.toFixed(1)}d</p>
              </div>
              <div className="text-center">
                <div className="h-3 bg-orange-300 rounded mb-1"></div>
                <p className="font-semibold text-orange-800">Bajo</p>
                <p className="text-gray-600">{diasSS.toFixed(1)} - {diasROP.toFixed(1)}d</p>
              </div>
              <div className="text-center">
                <div className="h-3 bg-green-300 rounded mb-1"></div>
                <p className="font-semibold text-green-800">Normal</p>
                <p className="text-gray-600">{diasROP.toFixed(1)} - {diasMaximo.toFixed(1)}d</p>
              </div>
              <div className="text-center">
                <div className="h-3 bg-blue-300 rounded mb-1"></div>
                <p className="font-semibold text-blue-800">Exceso</p>
                <p className="text-gray-600">&gt; {diasMaximo.toFixed(1)}d</p>
              </div>
            </div>
          </div>

          {/* Desglose de Cálculo */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm border-b border-gray-300 pb-2">
              Cálculo Detallado
            </h3>

            {/* Paso 1 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold mr-2">
                  1
                </span>
                Stock Total (Tienda + Tránsito)
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono">
                  Stock Tienda = {producto.stock_tienda} unidades
                </p>
                <p className="font-mono mt-1">
                  Stock en Tránsito = {producto.stock_en_transito} unidades
                </p>
                <p className="font-mono mt-2 text-green-700 font-semibold">
                  Stock Total = {producto.stock_tienda} + {producto.stock_en_transito} = {stockTotalUnidades} unidades
                </p>
              </div>
            </div>

            {/* Paso 2 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold mr-2">
                  2
                </span>
                Venta Diaria Base (P75 - Percentil 75)
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono text-purple-700 font-semibold">
                  Venta Diaria P75 = {producto.prom_p75_unid.toFixed(2)} unidades/día
                </p>
                <p className="font-mono text-gray-500 text-xs mt-1">
                  (Promedio simple 20D: {producto.prom_ventas_20dias_unid.toFixed(2)} unidades/día)
                </p>
              </div>
            </div>

            {/* Paso 3 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold mr-2">
                  3
                </span>
                Días de Stock = Stock Total ÷ Venta Diaria P75
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                {ventaDiariaBase > 0 ? (
                  <p className="font-mono text-green-700 font-semibold">
                    Días de Stock = {stockTotalUnidades} ÷ {ventaDiariaBase.toFixed(2)} = {diasStockActual.toFixed(2)} días
                  </p>
                ) : (
                  <p className="font-mono text-green-700 font-semibold">
                    Días de Stock = ∞ (sin ventas en los últimos 20 días)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Comparación con Puntos de Control */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3 border-b border-gray-300 pb-2">
              Comparación con Puntos de Control (Clasificación {clasificacion})
            </h3>
            <div className="overflow-hidden rounded-lg border border-gray-300">
              <table className="min-w-full divide-y divide-gray-300 text-sm">
                <thead className="bg-green-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-900">Punto de Control</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-900">Días</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-900">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr className={diasStockActual <= diasSS ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-red-800">Stock Seguridad (SS)</td>
                    <td className="px-3 py-2 text-center text-gray-700">{diasSS.toFixed(1)} días</td>
                    <td className="px-3 py-2 text-center">
                      {diasStockActual <= diasSS ? (
                        <span className="text-red-700 font-bold">⚠️ Por debajo</span>
                      ) : (
                        <span className="text-green-700">✓ Arriba</span>
                      )}
                    </td>
                  </tr>
                  <tr className={diasStockActual <= diasROP && diasStockActual > diasSS ? 'bg-orange-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-indigo-800">Punto de Reorden (ROP)</td>
                    <td className="px-3 py-2 text-center text-gray-700">{diasROP.toFixed(1)} días</td>
                    <td className="px-3 py-2 text-center">
                      {diasStockActual <= diasROP ? (
                        <span className="text-orange-700 font-bold">⚠️ Por debajo - Pedir</span>
                      ) : (
                        <span className="text-green-700">✓ Arriba</span>
                      )}
                    </td>
                  </tr>
                  <tr className={diasStockActual <= diasMaximo && diasStockActual > diasROP ? 'bg-green-50' : ''}>
                    <td className="px-3 py-2 font-semibold text-purple-800">Stock Máximo</td>
                    <td className="px-3 py-2 text-center text-gray-700">{diasMaximo.toFixed(1)} días</td>
                    <td className="px-3 py-2 text-center">
                      {diasStockActual <= diasMaximo ? (
                        <span className="text-green-700">✓ Dentro del rango</span>
                      ) : (
                        <span className="text-blue-700 font-bold">⚠️ Excedido</span>
                      )}
                    </td>
                  </tr>
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-3 py-2 text-gray-900">Stock Actual</td>
                    <td className="px-3 py-2 text-center text-green-700 text-lg">
                      {diasStockActual === Infinity ? '∞' : diasStockActual.toFixed(1)} días
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded font-bold ${
                        estado === 'critico' ? 'bg-red-100 text-red-800' :
                        estado === 'bajo' ? 'bg-orange-100 text-orange-800' :
                        estado === 'normal' ? 'bg-green-100 text-green-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {urgencia.split(' - ')[0]}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Explicación P75 */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
            <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              ¿Por qué usamos P75 (Percentil 75)?
            </h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">1</span>
                <div><strong>Más conservador:</strong> Al usar P75 como base, estamos diciendo que el 75% de los días tendremos stock suficiente para cubrir la demanda.</div>
              </div>
              <div className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">2</span>
                <div><strong>Resistente a outliers:</strong> Días con ventas anormalmente altas o bajas no distorsionan el cálculo como ocurre con el promedio simple.</div>
              </div>
              <div className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center text-xs font-bold">3</span>
                <div><strong>Menos días = más urgente:</strong> Al dividir por un valor más alto (P75 &gt; promedio), los días de cobertura son menores, activando alertas de reposición antes.</div>
              </div>
            </div>
          </div>

          {/* Nota Informativa */}
          <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-green-800">Nota:</span> Los días de stock se calculan usando el <strong>Percentil 75 (P75)</strong> de las ventas de los últimos 20 días.
              Este indicador te ayuda a decidir si es necesario realizar un pedido comparando tu stock actual con los puntos de control (Mínimo, Reorden, Máximo).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
