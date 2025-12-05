import { X, AlertTriangle, Zap, TrendingUp, Info } from 'lucide-react';

interface StockMinimoModalProps {
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
    stock_minimo: number;
    stock_seguridad: number;
    punto_reorden: number;
    metodo_calculo: string;
  };
  // Props opcionales para datos adicionales del backend
  demandaMaxima?: number; // Demanda máxima en un día
}

// Constantes del sistema (deben coincidir con backend)
const LEAD_TIME = 1.5; // días
const PARAMS_ABC = {
  'A': { z: 2.33, diasCobertura: 7, nivelServicio: '99%', metodo: 'estadistico' },
  'B': { z: 1.88, diasCobertura: 14, nivelServicio: '97%', metodo: 'estadistico' },
  'C': { z: 0, diasCobertura: 30, nivelServicio: 'N/A', metodo: 'padre_prudente' },
};

export default function StockMinimoModal({ isOpen, onClose, producto, demandaMaxima }: StockMinimoModalProps) {
  if (!isOpen) return null;

  const claseEfectiva = producto.clase_efectiva || producto.clasificacion_abc || 'C';
  const params = PARAMS_ABC[claseEfectiva as keyof typeof PARAMS_ABC] || PARAMS_ABC['C'];
  const esMetodoEstadistico = params.metodo === 'estadistico';

  // Valores calculados
  const demandaP75 = producto.prom_p75_unid;
  const demandaP75Bultos = demandaP75 / producto.cantidad_bultos;
  const unidadesPorBulto = producto.cantidad_bultos;

  // Stock mínimo viene del backend (en unidades)
  const stockMinimoUnid = producto.stock_minimo;
  const stockMinimoBultos = stockMinimoUnid / unidadesPorBulto;
  const diasMinimo = demandaP75Bultos > 0 ? stockMinimoBultos / demandaP75Bultos : 0;

  // Stock de seguridad viene del backend
  const stockSeguridadUnid = producto.stock_seguridad;

  // Para explicar la fórmula Padre Prudente (estimación si no viene del backend)
  const dMaxEstimada = demandaMaxima || (demandaP75 * 2);

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
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Punto de Reorden (ROP)
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

          {/* Aclaración de Conceptos */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              Conceptos Clave (son DIFERENTES)
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-24 flex-shrink-0">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">SEGURIDAD</span>
                </div>
                <div>
                  <p className="text-gray-700">
                    <strong>Stock de Seguridad (SS)</strong> = Colchón extra para absorber variabilidad.
                    Es un <em>componente</em> del punto de reorden.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-24 flex-shrink-0">
                  <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-bold">ROP</span>
                </div>
                <div>
                  <p className="text-gray-700">
                    <strong>Punto de Reorden (ROP)</strong> = Nivel que dispara una nueva orden.
                    <span className="font-semibold"> Incluye</span> el stock de seguridad.
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-200 bg-white rounded p-3">
                <p className="font-mono text-center text-blue-800">
                  <span className="text-orange-700 font-bold">ROP</span> =
                  <span className="text-gray-600"> Demanda durante Lead Time</span> +
                  <span className="text-green-700 font-bold"> Stock Seguridad</span>
                </p>
              </div>
            </div>
          </div>

          {/* Resultado Final */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-orange-900 mb-3">Resultado del Cálculo</h3>

            {/* Visualización de la relación */}
            <div className="mb-4 bg-white rounded-lg p-4 border border-orange-200">
              <div className="flex items-center justify-center gap-2 text-sm">
                <div className="text-center px-3 py-2 bg-gray-100 rounded border">
                  <p className="text-xs text-gray-500">Demanda Ciclo</p>
                  <p className="font-mono font-bold text-gray-700">{demandaCiclo.toFixed(0)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">+</span>
                <div className="text-center px-3 py-2 bg-green-100 rounded border border-green-300">
                  <p className="text-xs text-green-600">Stock Seguridad</p>
                  <p className="font-mono font-bold text-green-700">{stockSeguridadUnid.toFixed(0)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">=</span>
                <div className="text-center px-3 py-2 bg-orange-100 rounded border-2 border-orange-400">
                  <p className="text-xs text-orange-600">ROP</p>
                  <p className="font-mono font-bold text-orange-700 text-lg">{stockMinimoUnid.toFixed(0)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-white rounded-lg border border-orange-200">
                <p className="text-xs text-gray-600 mb-1">Punto de Reorden (ROP)</p>
                <p className="text-2xl font-bold text-orange-700">{stockMinimoUnid.toFixed(0)}</p>
                <p className="text-sm text-orange-600">unidades</p>
                <p className="text-xs text-gray-500 mt-1">({stockMinimoBultos.toFixed(1)} bultos)</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Días Cobertura</p>
                <p className="text-2xl font-bold text-blue-700">{diasMinimo.toFixed(1)}</p>
                <p className="text-sm text-blue-600">días</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-green-200">
                <p className="text-xs text-gray-600 mb-1">Stock Seguridad (SS)</p>
                <p className="text-2xl font-bold text-green-700">{stockSeguridadUnid.toFixed(0)}</p>
                <p className="text-sm text-green-600">unidades</p>
                <p className="text-xs text-gray-500 mt-1">(componente del mínimo)</p>
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
              Los <strong>días de cobertura</strong> indican cuántos días de demanda cubre el ROP,
              usando la velocidad de venta P75 (percentil 75):
            </p>
            <div className="bg-white rounded-lg p-4 border border-cyan-300">
              <p className="text-center font-mono text-cyan-800 mb-3">
                <span className="font-bold">Días ROP</span> = ROP (bultos) ÷ Velocidad P75 (bultos/día)
              </p>
              <div className="flex items-center justify-center gap-2 text-sm bg-cyan-50 rounded p-3">
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">ROP (bultos)</p>
                  <p className="font-mono font-bold text-orange-700">{stockMinimoBultos.toFixed(2)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">÷</span>
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">Velocidad P75</p>
                  <p className="font-mono font-bold text-blue-700">{demandaP75Bultos.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">bultos/día</p>
                </div>
                <span className="text-xl font-bold text-gray-400">=</span>
                <div className="text-center px-3 py-2 bg-cyan-100 rounded border-2 border-cyan-400">
                  <p className="text-xs text-cyan-600">Días ROP</p>
                  <p className="font-mono font-bold text-cyan-700 text-lg">{diasMinimo.toFixed(1)}</p>
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
                  <TrendingUp className="text-blue-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-900">Fórmula Estadística (Clase {claseEfectiva})</h3>
                </div>

                {/* Fórmula Principal */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-indigo-900 mb-3">Fórmula del Stock Mínimo (Punto de Reorden):</p>
                  <div className="bg-white rounded-lg p-4 border border-indigo-300 text-center">
                    <p className="text-2xl font-mono font-bold text-indigo-800">
                      ROP = (D × L) + SS
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Punto de Reorden = Demanda durante Lead Time + Stock de Seguridad
                    </p>
                  </div>
                </div>

                {/* Fórmula Stock de Seguridad */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-900 mb-3">Fórmula del Stock de Seguridad:</p>
                  <div className="bg-white rounded-lg p-4 border border-green-300 text-center">
                    <p className="text-2xl font-mono font-bold text-green-800">
                      SS = Z × σ<sub>D</sub> × √L
                    </p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="font-mono font-bold text-green-700 w-12">Z</span>
                      <span className="text-gray-700">
                        = <strong>{params.z}</strong> → Factor de nivel de servicio ({params.nivelServicio})
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono font-bold text-green-700 w-12">σ<sub>D</sub></span>
                      <span className="text-gray-700">
                        = Desviación estándar de la demanda diaria (últimos 30 días)
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono font-bold text-green-700 w-12">√L</span>
                      <span className="text-gray-700">
                        = √{LEAD_TIME} = <strong>{sqrtL.toFixed(3)}</strong> → Raíz del Lead Time
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cálculo Paso a Paso */}
                <div className="space-y-3">
                  <h4 className="text-md font-semibold text-gray-900">Cálculo Paso a Paso:</h4>

                  {/* Paso 1: Demanda P75 */}
                  <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 1: Demanda Diaria (P75)</p>
                    <p className="text-sm text-gray-600 mb-2">
                      Usamos el <strong>Percentil 75</strong> de ventas: captura días de alta demanda sin ser afectado por outliers extremos.
                    </p>
                    <div className="bg-white rounded p-3 border border-purple-200">
                      <div className="flex justify-between">
                        <span>D (P75):</span>
                        <span className="font-mono font-bold text-purple-700">{demandaP75.toFixed(1)} unidades/día</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500 mt-1">
                        <span>En bultos:</span>
                        <span className="font-mono">{demandaP75Bultos.toFixed(2)} bultos/día</span>
                      </div>
                    </div>
                  </div>

                  {/* Paso 2: Lead Time */}
                  <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 2: Lead Time (Tiempo de Reposición)</p>
                    <p className="text-sm text-gray-600 mb-2">
                      Tiempo desde que se hace el pedido hasta que llega a la tienda.
                    </p>
                    <div className="bg-white rounded p-3 border border-blue-200">
                      <div className="flex justify-between">
                        <span>L (Lead Time):</span>
                        <span className="font-mono font-bold text-blue-700">{LEAD_TIME} días</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500 mt-1">
                        <span>√L:</span>
                        <span className="font-mono">{sqrtL.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Paso 3: Demanda durante Lead Time */}
                  <div className="bg-amber-50 rounded-lg p-4 border-l-4 border-amber-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 3: Demanda Durante Lead Time</p>
                    <div className="bg-white rounded p-3 border border-amber-200 font-mono text-sm">
                      <p>Demanda Ciclo = D × L</p>
                      <p className="mt-1">= {demandaP75.toFixed(1)} × {LEAD_TIME}</p>
                      <p className="font-bold text-amber-700 mt-1">= {demandaCiclo.toFixed(1)} unidades</p>
                    </div>
                  </div>

                  {/* Paso 4: Stock de Seguridad */}
                  <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 4: Stock de Seguridad</p>
                    <p className="text-sm text-gray-600 mb-2">
                      Colchón extra para absorber variabilidad en la demanda durante el lead time.
                    </p>
                    <div className="bg-white rounded p-3 border border-green-200 font-mono text-sm">
                      <p>SS = Z × σ<sub>D</sub> × √L</p>
                      <p className="mt-1">= {params.z} × σ<sub>D</sub> × {sqrtL.toFixed(3)}</p>
                      <p className="font-bold text-green-700 mt-2 pt-2 border-t border-green-200">
                        ≈ {stockSeguridadUnid.toFixed(0)} unidades
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 italic">
                      * σ<sub>D</sub> se calcula sobre los últimos 30 días de ventas diarias
                    </p>
                  </div>

                  {/* Paso 5: Resultado Final */}
                  <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Paso 5: Punto de Reorden (Stock Mínimo)</p>
                    <div className="bg-white rounded p-3 border border-orange-200 font-mono text-sm">
                      <p>ROP = Demanda Ciclo + Stock Seguridad</p>
                      <p className="mt-1">= {demandaCiclo.toFixed(1)} + {stockSeguridadUnid.toFixed(0)}</p>
                      <p className="text-xl font-bold text-orange-700 mt-2 pt-2 border-t border-orange-200">
                        = {stockMinimoUnid.toFixed(0)} unidades
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        = {stockMinimoBultos.toFixed(1)} bultos = {diasMinimo.toFixed(1)} días de cobertura
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tabla Z-Score */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">
                    <Info className="inline w-4 h-4 mr-1" />
                    ¿Por qué Z = {params.z}? (Nivel de Servicio {params.nivelServicio})
                  </p>
                  <p className="text-sm text-gray-600 mb-3">
                    El valor Z determina qué tan "seguro" queremos estar. Un Z más alto significa menos probabilidad de quedarnos sin stock:
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
                          <td className="px-3 py-2 text-gray-600">Solo 1% probabilidad de stockout</td>
                        </tr>
                        <tr className={claseEfectiva === 'B' ? 'bg-yellow-50 font-semibold' : ''}>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">B</span></td>
                          <td className="px-3 py-2 text-center">97%</td>
                          <td className="px-3 py-2 text-center font-mono font-bold">1.88</td>
                          <td className="px-3 py-2 text-gray-600">3% probabilidad de stockout</td>
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
                    Para productos de <strong>Clase C</strong> (bajo valor), usamos un enfoque conservador llamado
                    <strong> "Padre Prudente"</strong>: prepararse para el peor escenario.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-amber-300 text-center">
                    <p className="text-2xl font-mono font-bold text-amber-800">
                      ROP = D<sub>max</sub> × L
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Stock Mínimo = Demanda Máxima × Lead Time
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-gray-400">
                  <p className="text-sm font-semibold text-gray-900 mb-2">¿Por qué este método para Clase C?</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Productos de bajo valor: el costo de tener stock extra es bajo</li>
                    <li>• Demanda errática: la fórmula estadística no funciona bien</li>
                    <li>• Simplicidad: menos cálculos, menos mantenimiento</li>
                    <li>• Seguridad: si vendimos D<sub>max</sub> una vez, puede pasar de nuevo</li>
                  </ul>
                </div>

                <div className="bg-amber-50 rounded-lg p-4 border-l-4 border-amber-500">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Cálculo:</p>
                  <div className="bg-white rounded p-3 border border-amber-200 font-mono text-sm">
                    <p>ROP = D<sub>max</sub> × L</p>
                    <p className="mt-1">= {dMaxEstimada.toFixed(0)} × {LEAD_TIME}</p>
                    <p className="text-xl font-bold text-amber-700 mt-2 pt-2 border-t border-amber-200">
                      ≈ {stockMinimoUnid.toFixed(0)} unidades
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
                independientemente de su clasificación ABC real, para garantizar disponibilidad (99% nivel de servicio).
              </p>
            </div>
          )}

          {/* Parámetros del Sistema */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Parámetros del Sistema</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Lead Time:</span>
                <span className="ml-2 font-mono font-bold">{LEAD_TIME} días</span>
              </div>
              <div>
                <span className="text-gray-600">Días Cobertura Objetivo:</span>
                <span className="ml-2 font-mono font-bold">{params.diasCobertura} días</span>
              </div>
              <div>
                <span className="text-gray-600">Nivel de Servicio:</span>
                <span className="ml-2 font-mono font-bold">{params.nivelServicio}</span>
              </div>
              <div>
                <span className="text-gray-600">Factor Z:</span>
                <span className="ml-2 font-mono font-bold">{params.z || 'N/A'}</span>
              </div>
            </div>
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
