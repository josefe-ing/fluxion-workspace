import { X, AlertTriangle, Zap, TrendingUp, Info, Shield } from 'lucide-react';

interface StockSeguridadModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    prom_p75_unid: number;
    cantidad_bultos: number;
    clasificacion_abc: string | null;
    clase_efectiva: string | null;
    es_generador_trafico: boolean;
    stock_seguridad: number;
    metodo_calculo: string;
  };
}

// Constantes del sistema (deben coincidir con backend)
const LEAD_TIME = 1.5; // días
const PARAMS_ABC = {
  'A': { z: 2.33, nivelServicio: '99%', metodo: 'estadistico' },
  'B': { z: 1.88, nivelServicio: '97%', metodo: 'estadistico' },
  'C': { z: 0, nivelServicio: 'N/A', metodo: 'padre_prudente' },
};

export default function StockSeguridadModal({ isOpen, onClose, producto }: StockSeguridadModalProps) {
  if (!isOpen) return null;

  const claseEfectiva = producto.clase_efectiva || producto.clasificacion_abc || 'C';
  const params = PARAMS_ABC[claseEfectiva as keyof typeof PARAMS_ABC] || PARAMS_ABC['C'];
  const esMetodoEstadistico = params.metodo === 'estadistico';

  // Valores calculados
  const demandaP75 = producto.prom_p75_unid;
  const demandaP75Bultos = demandaP75 / producto.cantidad_bultos;
  const unidadesPorBulto = producto.cantidad_bultos;

  // Stock de seguridad viene del backend (en unidades)
  const stockSeguridadUnid = producto.stock_seguridad;
  const stockSeguridadBultos = stockSeguridadUnid / unidadesPorBulto;
  const diasSeguridad = demandaP75Bultos > 0 ? stockSeguridadBultos / demandaP75Bultos : 0;

  // Cálculos paso a paso para mostrar
  const sqrtL = Math.sqrt(LEAD_TIME);
  const demandaCiclo = demandaP75 * LEAD_TIME;

  const getColorClase = (clase: string) => {
    if (clase === 'A') return 'bg-red-100 text-red-800 border-red-300';
    if (clase === 'B') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="text-green-600" size={24} />
              Stock de Seguridad (SS)
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Método: <span className="font-semibold">{esMetodoEstadistico ? 'Estadístico' : 'Padre Prudente'}</span>
              {' • '}Clase: <span className={`px-2 py-0.5 rounded text-xs font-bold ${getColorClase(claseEfectiva)}`}>{claseEfectiva}</span>
              {producto.es_generador_trafico && (
                <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-bold">
                  <Zap className="inline w-3 h-3 mr-1" />
                  Generador Tráfico
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
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

          {/* Concepto Principal */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              ¿Qué es el Stock de Seguridad?
            </h3>
            <p className="text-sm text-gray-700">
              El <strong>Stock de Seguridad (SS)</strong> es un colchón de inventario extra que protege contra:
            </p>
            <ul className="mt-2 text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>Variabilidad en la demanda (días de venta más alta de lo normal)</li>
              <li>Incertidumbre en el tiempo de reposición</li>
            </ul>
            <p className="mt-3 text-sm text-gray-700">
              <strong>Importante:</strong> El SS es un <em>componente</em> del Punto de Reorden (ROP), no un valor adicional separado.
            </p>
          </div>

          {/* Resultado Final */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-green-900 mb-3">Resultado del Cálculo</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-white rounded-lg border border-green-200">
                <p className="text-xs text-gray-600 mb-1">Stock de Seguridad</p>
                <p className="text-2xl font-bold text-green-700">{stockSeguridadUnid.toFixed(0)}</p>
                <p className="text-sm text-green-600">unidades</p>
                <p className="text-xs text-gray-500 mt-1">({stockSeguridadBultos.toFixed(1)} bultos)</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Días Cobertura</p>
                <p className="text-2xl font-bold text-blue-700">{diasSeguridad.toFixed(1)}</p>
                <p className="text-sm text-blue-600">días</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-purple-200">
                <p className="text-xs text-gray-600 mb-1">Nivel de Servicio</p>
                <p className="text-2xl font-bold text-purple-700">{params.nivelServicio}</p>
                <p className="text-sm text-purple-600">objetivo</p>
              </div>
            </div>
          </div>

          {/* Conversión a Días */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-cyan-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              ¿Cómo se convierte a Días?
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Los <strong>días de cobertura</strong> indican cuántos días de demanda cubre el stock de seguridad,
              usando la velocidad de venta P75 (percentil 75):
            </p>
            <div className="bg-white rounded-lg p-4 border border-cyan-300">
              <p className="text-center font-mono text-cyan-800 mb-3">
                <span className="font-bold">Días SS</span> = Stock Seguridad (bultos) ÷ Velocidad P75 (bultos/día)
              </p>
              <div className="flex items-center justify-center gap-2 text-sm bg-cyan-50 rounded p-3">
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">SS (bultos)</p>
                  <p className="font-mono font-bold text-green-700">{stockSeguridadBultos.toFixed(2)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">÷</span>
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">Velocidad P75</p>
                  <p className="font-mono font-bold text-blue-700">{demandaP75Bultos.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">bultos/día</p>
                </div>
                <span className="text-xl font-bold text-gray-400">=</span>
                <div className="text-center px-3 py-2 bg-cyan-100 rounded border-2 border-cyan-400">
                  <p className="text-xs text-cyan-600">Días SS</p>
                  <p className="font-mono font-bold text-cyan-700 text-lg">{diasSeguridad.toFixed(1)}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 italic">
              * Velocidad P75 = Demanda diaria en percentil 75 (días de venta alta).
              Usando P75 obtenemos una medida conservadora de cobertura.
            </p>
          </div>

          {/* Explicación de la Fórmula */}
          {esMetodoEstadistico ? (
            <>
              {/* MÉTODO ESTADÍSTICO (Clase A y B) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-green-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-900">Fórmula Estadística (Clase {claseEfectiva})</h3>
                </div>

                {/* Fórmula Principal */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-900 mb-3">Fórmula del Stock de Seguridad:</p>
                  <div className="bg-white rounded-lg p-4 border border-green-300 text-center">
                    <p className="text-2xl font-mono font-bold text-green-800">
                      SS = Z × σ<sub>D</sub> × √L
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Stock Seguridad = Factor Z × Desviación Estándar × Raíz del Lead Time
                    </p>
                  </div>
                </div>

                {/* Cálculo Paso a Paso */}
                <div className="space-y-3">
                  <h4 className="text-md font-semibold text-gray-900">Cálculo Paso a Paso:</h4>

                  {/* Paso 1: Factor Z */}
                  <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 1: Factor Z (Nivel de Servicio)</p>
                    <p className="text-sm text-gray-600 mb-2">
                      El factor Z determina qué tan protegidos queremos estar contra variaciones de demanda.
                    </p>
                    <div className="bg-white rounded p-3 border border-purple-200">
                      <div className="flex justify-between">
                        <span>Z para Clase {claseEfectiva}:</span>
                        <span className="font-mono font-bold text-purple-700">{params.z}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500 mt-1">
                        <span>Nivel de servicio:</span>
                        <span className="font-mono">{params.nivelServicio}</span>
                      </div>
                    </div>
                  </div>

                  {/* Paso 2: Desviación Estándar */}
                  <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 2: Desviación Estándar (σ<sub>D</sub>)</p>
                    <p className="text-sm text-gray-600 mb-2">
                      σ<sub>D</sub> mide qué tan variable es la demanda diaria. Se calcula sobre los últimos 30 días de ventas.
                    </p>
                    <div className="bg-white rounded p-3 border border-blue-200">
                      <p className="text-sm text-gray-600">
                        Este valor viene calculado del backend basado en el historial de ventas diarias.
                      </p>
                    </div>
                  </div>

                  {/* Paso 3: Lead Time */}
                  <div className="bg-amber-50 rounded-lg p-4 border-l-4 border-amber-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 3: Lead Time (L)</p>
                    <p className="text-sm text-gray-600 mb-2">
                      Tiempo desde que se hace el pedido hasta que llega a la tienda.
                    </p>
                    <div className="bg-white rounded p-3 border border-amber-200">
                      <div className="flex justify-between">
                        <span>L (Lead Time):</span>
                        <span className="font-mono font-bold text-amber-700">{LEAD_TIME} días</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500 mt-1">
                        <span>√L:</span>
                        <span className="font-mono">{sqrtL.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Paso 4: Resultado */}
                  <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 4: Cálculo Final</p>
                    <div className="bg-white rounded p-3 border border-green-200 font-mono text-sm">
                      <p>SS = Z × σ<sub>D</sub> × √L</p>
                      <p className="mt-1">= {params.z} × σ<sub>D</sub> × {sqrtL.toFixed(3)}</p>
                      <p className="text-xl font-bold text-green-700 mt-2 pt-2 border-t border-green-200">
                        ≈ {stockSeguridadUnid.toFixed(0)} unidades
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        = {stockSeguridadBultos.toFixed(1)} bultos = {diasSeguridad.toFixed(1)} días de cobertura
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 italic">
                      * σ<sub>D</sub> se calcula sobre los últimos 30 días de ventas diarias
                    </p>
                  </div>
                </div>

                {/* Tabla Z-Score */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">
                    <Info className="inline w-4 h-4 mr-1" />
                    Tabla de Factores Z por Clase
                  </p>
                  <div className="overflow-hidden border border-gray-200 rounded-lg bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Clase</th>
                          <th className="px-3 py-2 text-center">Nivel Servicio</th>
                          <th className="px-3 py-2 text-center">Z</th>
                          <th className="px-3 py-2 text-left">Significado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <tr className={claseEfectiva === 'A' ? 'bg-red-50 font-semibold' : ''}>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold">A</span></td>
                          <td className="px-3 py-2 text-center">99%</td>
                          <td className="px-3 py-2 text-center font-mono font-bold">2.33</td>
                          <td className="px-3 py-2 text-gray-600">SS cubre 99% de variaciones</td>
                        </tr>
                        <tr className={claseEfectiva === 'B' ? 'bg-yellow-50 font-semibold' : ''}>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">B</span></td>
                          <td className="px-3 py-2 text-center">97%</td>
                          <td className="px-3 py-2 text-center font-mono font-bold">1.88</td>
                          <td className="px-3 py-2 text-gray-600">SS cubre 97% de variaciones</td>
                        </tr>
                        <tr className={claseEfectiva === 'C' ? 'bg-gray-100 font-semibold' : ''}>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-xs font-bold">C</span></td>
                          <td className="px-3 py-2 text-center">—</td>
                          <td className="px-3 py-2 text-center font-mono">—</td>
                          <td className="px-3 py-2 text-gray-600">Usa método Padre Prudente</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* MÉTODO PADRE PRUDENTE (Clase C) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-900">Método "Padre Prudente" (Clase C)</h3>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-3">
                    Para productos de <strong>Clase C</strong> (bajo valor), el Stock de Seguridad es <strong>implícito</strong>
                    en la fórmula del Punto de Reorden.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-amber-300 text-center">
                    <p className="text-lg font-mono font-bold text-amber-800">
                      ROP = D<sub>max</sub> × L
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      El SS implícito = (D<sub>max</sub> - D<sub>P75</sub>) × L
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-gray-400">
                  <p className="text-sm font-semibold text-gray-900 mb-2">¿Por qué este método para Clase C?</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• La demanda es muy variable (CV alto) - la fórmula estadística no funciona bien</li>
                    <li>• El costo de tener stock extra es bajo (productos de bajo valor)</li>
                    <li>• Es más simple: usar el peor escenario (D<sub>max</sub>) en lugar de estadísticas</li>
                  </ul>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Stock de Seguridad Implícito:</p>
                  <div className="bg-white rounded p-3 border border-green-200 font-mono text-sm">
                    <p>SS implícito = (D<sub>max</sub> - D<sub>P75</sub>) × L</p>
                    <p className="text-xl font-bold text-green-700 mt-2 pt-2 border-t border-green-200">
                      ≈ {stockSeguridadUnid.toFixed(0)} unidades
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      = {diasSeguridad.toFixed(1)} días de cobertura extra
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Generador de Tráfico */}
          {producto.es_generador_trafico && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="text-purple-600" size={20} />
                <h4 className="font-semibold text-purple-900">Producto Generador de Tráfico</h4>
              </div>
              <p className="text-sm text-gray-700">
                Este producto fue identificado como <strong>Generador de Tráfico</strong>:
                vende poco en $ pero aparece en muchos tickets. Por esto, <strong>se trata como Clase A</strong>
                con Z = 2.33 (99% nivel de servicio), garantizando un Stock de Seguridad más robusto.
              </p>
            </div>
          )}

          {/* Relación con ROP */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              <Info className="inline w-4 h-4 mr-1" />
              Relación con el Punto de Reorden (ROP)
            </h4>
            <p className="text-sm text-gray-700">
              El Stock de Seguridad es un <strong>componente</strong> del Punto de Reorden:
            </p>
            <div className="mt-3 bg-white rounded p-3 border border-blue-200">
              <p className="font-mono text-center text-blue-800">
                <span className="text-orange-700 font-bold">ROP</span> =
                <span className="text-gray-600"> (D × L)</span> +
                <span className="text-green-700 font-bold"> SS</span>
              </p>
              <p className="text-center text-sm text-gray-500 mt-2">
                = {demandaCiclo.toFixed(0)} + {stockSeguridadUnid.toFixed(0)} unidades
              </p>
            </div>
          </div>

          {/* Parámetros del Sistema */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Parámetros del Sistema</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Lead Time:</span>
                <span className="ml-2 font-mono font-bold">{LEAD_TIME} días</span>
              </div>
              <div>
                <span className="text-gray-600">√L:</span>
                <span className="ml-2 font-mono font-bold">{sqrtL.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-gray-600">Nivel de Servicio:</span>
                <span className="ml-2 font-mono font-bold">{params.nivelServicio}</span>
              </div>
              <div>
                <span className="text-gray-600">Factor Z:</span>
                <span className="ml-2 font-mono font-bold">{params.z || 'N/A (heurístico)'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
