interface AnalisisXYZ {
  clasificacion_abc: string;
  clasificacion_xyz: string;
  clasificacion_combinada: string;

  metricas: {
    venta_diaria_5d: number;
    venta_diaria_20d: number;
    desviacion_estandar: number;
    coeficiente_variacion: number;
    tendencia: {
      tipo: string;
      porcentaje: number;
      confianza: number;
    };
    estacionalidad: {
      factor_actual: number;
      patron_detectado: string;
    };
  };

  stock_calculado: {
    abc: {
      minimo: number;
      seguridad: number;
      maximo: number;
      punto_reorden: number;
      sugerido: number;
    };
    xyz: {
      minimo: number;
      seguridad: number;
      maximo: number;
      punto_reorden: number;
      sugerido: number;
    };
  };

  explicacion: {
    diferencia_bultos: number;
    razones: string[];
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    cantidad_bultos: number;
  };
  analisisXYZ: AnalisisXYZ;
  onUsarABC: () => void;
  onUsarXYZ: () => void;
}

export default function ModalAnalisisComparativo({
  isOpen,
  onClose,
  producto,
  analisisXYZ,
  onUsarABC,
  onUsarXYZ
}: Props) {
  if (!isOpen) return null;

  const { metricas, stock_calculado, explicacion } = analisisXYZ;

  // Badge para clasificación XYZ
  const getXYZBadge = (clase: string) => {
    if (clase === 'X') return { text: '⭐ X - Predecible', color: 'bg-green-100 text-green-800 border-green-300' };
    if (clase === 'Y') return { text: '⚡ Y - Variable', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    return { text: '🌀 Z - Errático', color: 'bg-red-100 text-red-800 border-red-300' };
  };

  const xyzBadge = getXYZBadge(analisisXYZ.clasificacion_xyz);

  // Badge para clasificación ABC
  const getABCColor = (clase: string) => {
    if (clase === 'A') return 'bg-red-100 text-red-800 border-red-300';
    if (clase === 'AB') return 'bg-orange-100 text-orange-800 border-orange-300';
    if (clase === 'B') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  // Icono de tendencia
  const getTendenciaIcon = (tipo: string) => {
    if (tipo === 'creciente') return '📈';
    if (tipo === 'decreciente') return '📉';
    return '➡️';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🔬</span>
              <h2 className="text-xl font-bold">Análisis Comparativo</h2>
            </div>
            <div className="text-sm opacity-90">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Sección: Clasificación */}
          <div>
            <div className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span>📊</span>
              CLASIFICACIÓN
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* ABC */}
              <div className={`rounded-lg border-2 p-4 ${getABCColor(analisisXYZ.clasificacion_abc)}`}>
                <div className="text-sm font-semibold mb-2">ABC Actual (Rotación)</div>
                <div className="text-3xl font-bold mb-2">{analisisXYZ.clasificacion_abc}</div>
                <div className="text-xs">
                  {metricas.venta_diaria_20d >= 20 && '≥20 bultos/día (Alta Rotación)'}
                  {metricas.venta_diaria_20d >= 5 && metricas.venta_diaria_20d < 20 && '5-20 bultos/día'}
                  {metricas.venta_diaria_20d < 5 && '<5 bultos/día'}
                </div>
              </div>

              {/* XYZ */}
              <div className={`rounded-lg border-2 p-4 ${xyzBadge.color}`}>
                <div className="text-sm font-semibold mb-2">XYZ Mejorado (Variabilidad)</div>
                <div className="text-3xl font-bold mb-2">{analisisXYZ.clasificacion_combinada}</div>
                <div className="text-xs">
                  {xyzBadge.text}
                  <div className="mt-1">CV: {metricas.coeficiente_variacion.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Métricas de Demanda */}
          <div>
            <div className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span>📈</span>
              MÉTRICAS DE DEMANDA
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Método ABC */}
              <div className="bg-gray-50 rounded-lg border border-gray-300 p-4">
                <div className="text-sm font-bold text-gray-900 mb-3">Método ABC</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Promedio 5 días:</span>
                    <span className="font-semibold">{metricas.venta_diaria_5d.toFixed(1)} bl/d</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Promedio 20 días:</span>
                    <span className="font-semibold">{metricas.venta_diaria_20d.toFixed(1)} bl/d</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Base de cálculo:</span>
                    <span className="font-semibold">BULTOS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Variabilidad:</span>
                    <span className="font-semibold text-orange-600">N/A</span>
                  </div>
                </div>
              </div>

              {/* Método XYZ */}
              <div className="bg-indigo-50 rounded-lg border border-indigo-300 p-4">
                <div className="text-sm font-bold text-indigo-900 mb-3">Método XYZ ✨</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Promedio 20 días:</span>
                    <span className="font-semibold">{metricas.venta_diaria_20d.toFixed(1)} bl/d</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Base de cálculo:</span>
                    <span className="font-semibold">UNIDADES</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">CV (Variabilidad):</span>
                    <span className="font-semibold text-purple-700">{metricas.coeficiente_variacion.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tendencia:</span>
                    <span className="font-semibold text-blue-700 flex items-center gap-1">
                      {getTendenciaIcon(metricas.tendencia.tipo)}
                      {metricas.tendencia.tipo} {metricas.tendencia.porcentaje > 0 ? '+' : ''}{metricas.tendencia.porcentaje.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estacionalidad:</span>
                    <span className="font-semibold text-orange-700">
                      {metricas.estacionalidad.patron_detectado} {metricas.estacionalidad.factor_actual > 1 ? `+${((metricas.estacionalidad.factor_actual - 1) * 100).toFixed(0)}%` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Cálculo de Stock */}
          <div>
            <div className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span>🎯</span>
              CÁLCULO DE STOCK (en bultos)
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* ABC */}
              <div className="bg-gray-50 rounded-lg border border-gray-300 p-4">
                <div className="text-sm font-bold text-gray-900 mb-3">Método ABC</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock Mínimo:</span>
                    <span className="font-semibold">{stock_calculado.abc.minimo.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock Seguridad:</span>
                    <span className="font-semibold">{stock_calculado.abc.seguridad.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock Máximo:</span>
                    <span className="font-semibold">{stock_calculado.abc.maximo.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Punto Reorden:</span>
                    <span className="font-semibold">{stock_calculado.abc.punto_reorden.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="text-gray-900 font-bold">SUGERIDO:</span>
                    <span className="font-bold text-orange-700 text-lg">{stock_calculado.abc.sugerido} bl</span>
                  </div>
                </div>
              </div>

              {/* XYZ */}
              <div className="bg-indigo-50 rounded-lg border border-indigo-300 p-4">
                <div className="text-sm font-bold text-indigo-900 mb-3">Método XYZ ✨</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock Mínimo:</span>
                    <span className="font-semibold text-indigo-900">{stock_calculado.xyz.minimo.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock Seguridad:</span>
                    <span className="font-semibold text-indigo-900">{stock_calculado.xyz.seguridad.toFixed(1)} bl (Científico*)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stock Máximo:</span>
                    <span className="font-semibold text-indigo-900">{stock_calculado.xyz.maximo.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Punto Reorden:</span>
                    <span className="font-semibold text-indigo-900">{stock_calculado.xyz.punto_reorden.toFixed(1)} bl</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-indigo-300">
                    <span className="text-indigo-900 font-bold">SUGERIDO:</span>
                    <span className="font-bold text-purple-700 text-lg">{stock_calculado.xyz.sugerido} bl</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sección: ¿Por qué la diferencia? */}
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg border-2 border-orange-300 p-5">
            <div className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span>💡</span>
              ¿POR QUÉ LA DIFERENCIA?
            </div>

            <div className="bg-white rounded-lg p-4 mb-3 border border-orange-200">
              <div className="text-sm font-bold text-orange-900 mb-2">
                XYZ detectó los siguientes factores:
              </div>
              <div className="space-y-3">
                {explicacion.razones.map((razon, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-orange-600 font-bold">{index + 1}.</span>
                    <span>{razon}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg p-4 text-center">
              <div className="text-lg font-bold mb-1">
                🎯 Resultado Final
              </div>
              <div className="text-3xl font-bold mb-2">
                {explicacion.diferencia_bultos > 0 ? '+' : ''}{explicacion.diferencia_bultos} bultos
              </div>
              <div className="text-sm opacity-90">
                {explicacion.diferencia_bultos > 0
                  ? 'XYZ sugiere AUMENTAR pedido para evitar stockout'
                  : explicacion.diferencia_bultos < 0
                  ? 'XYZ sugiere REDUCIR pedido (producto predecible)'
                  : 'ABC y XYZ coinciden en la sugerencia'
                }
              </div>
            </div>
          </div>
        </div>

        {/* Footer con botones */}
        <div className="sticky bottom-0 bg-gray-100 px-6 py-4 flex items-center justify-between border-t border-gray-300 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onUsarABC}
              className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-400 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <span>📊</span>
              Usar ABC: {stock_calculado.abc.sugerido} bl
            </button>
            <button
              onClick={onUsarXYZ}
              className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors flex items-center gap-2 shadow-lg"
            >
              <span>✨</span>
              Usar XYZ: {stock_calculado.xyz.sugerido} bl
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
