import { X, BarChart3, CheckCircle2, Info } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';

interface MetodosPromedioModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    prom_top3_unid: number;
    prom_p75_unid: number;
    cantidad_bultos: number;
  };
  ubicacionId?: string;
}

interface VentaDiaria {
  fecha: string;
  dia_semana: string;
  cantidad_vendida: number;
}

export default function MetodosPromedioModal({ isOpen, onClose, producto, ubicacionId }: MetodosPromedioModalProps) {
  const [ventas20Dias, setVentas20Dias] = useState<VentaDiaria[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVentas20Dias = useCallback(async () => {
    if (!ubicacionId) return;

    try {
      setLoading(true);
      const response = await http.get(
        `/api/ventas/producto/${producto.codigo_producto}/ultimos-20-dias?ubicacion_id=${ubicacionId}`
      );
      if (response.data.ventas) {
        setVentas20Dias(response.data.ventas);
      }
    } catch (error) {
      console.error('Error cargando datos de 20 días:', error);
    } finally {
      setLoading(false);
    }
  }, [ubicacionId, producto.codigo_producto]);

  useEffect(() => {
    if (isOpen && ubicacionId) {
      fetchVentas20Dias();
    }
  }, [isOpen, ubicacionId, producto.codigo_producto, fetchVentas20Dias]);

  if (!isOpen) return null;

  const p75Bultos = producto.prom_p75_unid / producto.cantidad_bultos;
  const p75Unidades = producto.prom_p75_unid;

  // Calcular P75 desde los datos reales
  const valoresOrdenados = [...ventas20Dias]
    .map(v => v.cantidad_vendida)
    .sort((a, b) => a - b);
  const n = valoresOrdenados.length;

  let p75Calculado = 0;
  let posicionP75 = 0;
  let indiceBajo = 0;
  let indiceAlto = 0;

  if (n > 0) {
    posicionP75 = (n - 1) * 0.75;
    indiceBajo = Math.floor(posicionP75);
    indiceAlto = Math.ceil(posicionP75);
    const fraccion = posicionP75 - indiceBajo;
    p75Calculado = indiceBajo === indiceAlto
      ? valoresOrdenados[indiceBajo]
      : valoresOrdenados[indiceBajo] * (1 - fraccion) + valoresOrdenados[indiceAlto] * fraccion;
  }

  // Calcular mediana (P50) para comparación
  let p50Calculado = 0;
  if (n > 0) {
    const posicionP50 = (n - 1) * 0.50;
    const indiceBajoP50 = Math.floor(posicionP50);
    const indiceAltoP50 = Math.ceil(posicionP50);
    const fraccionP50 = posicionP50 - indiceBajoP50;
    p50Calculado = indiceBajoP50 === indiceAltoP50
      ? valoresOrdenados[indiceBajoP50]
      : valoresOrdenados[indiceBajoP50] * (1 - fraccionP50) + valoresOrdenados[indiceAltoP50] * fraccionP50;
  }

  const promedio = n > 0 ? ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0) / n : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Cálculo del Percentil 75 (P75)
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Valor P75 destacado */}
          <div className="bg-purple-100 rounded-xl p-6 text-center border-2 border-purple-300">
            <div className="text-sm text-purple-600 uppercase tracking-wide font-semibold mb-1">
              Demanda Diaria P75
            </div>
            <div className="text-4xl font-bold text-purple-800">
              {p75Bultos.toFixed(1)} <span className="text-lg font-normal">bultos/día</span>
            </div>
            <div className="text-sm text-purple-600 mt-1">
              ({p75Unidades.toFixed(0)} unidades/día)
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : ventas20Dias.length > 0 ? (
            <>
              {/* Comparativa de métricas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">Promedio Simple</div>
                  <div className="text-xl font-bold text-gray-700">{(promedio / producto.cantidad_bultos).toFixed(1)}</div>
                  <div className="text-xs text-gray-400">bultos/día</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">Mediana (P50)</div>
                  <div className="text-xl font-bold text-gray-700">{(p50Calculado / producto.cantidad_bultos).toFixed(1)}</div>
                  <div className="text-xs text-gray-400">bultos/día</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center border-2 border-purple-300">
                  <div className="text-xs text-purple-600 font-semibold mb-1">P75 (Usado)</div>
                  <div className="text-xl font-bold text-purple-700">{(p75Calculado / producto.cantidad_bultos).toFixed(1)}</div>
                  <div className="text-xs text-purple-500">bultos/día</div>
                </div>
              </div>

              {/* Paso a paso del cálculo */}
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-600" />
                  Cálculo paso a paso para este producto
                </h4>

                <div className="space-y-4">
                  {/* Paso 1 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">1</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800 mb-1">Ordenar las ventas de menor a mayor</div>
                      <div className="bg-gray-50 rounded p-2 text-xs font-mono text-gray-600 overflow-x-auto">
                        [{valoresOrdenados.map(v => v.toFixed(0)).join(', ')}]
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{n} días de datos</div>
                    </div>
                  </div>

                  {/* Paso 2 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">2</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800 mb-1">Calcular la posición del percentil 75</div>
                      <div className="bg-gray-50 rounded p-2 text-sm">
                        <span className="font-mono text-gray-600">Posición = (n - 1) × 0.75</span>
                        <br />
                        <span className="font-mono text-gray-600">Posición = ({n} - 1) × 0.75 = </span>
                        <span className="font-bold text-purple-700">{posicionP75.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Paso 3 */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">3</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800 mb-1">Interpolar el valor en esa posición</div>
                      <div className="bg-gray-50 rounded p-2 text-sm">
                        {indiceBajo === indiceAlto ? (
                          <span className="text-gray-600">
                            Posición exacta: valor[{indiceBajo}] = <span className="font-bold text-purple-700">{valoresOrdenados[indiceBajo]?.toFixed(0)} unidades</span>
                          </span>
                        ) : (
                          <>
                            <span className="text-gray-600">Entre posición {indiceBajo} y {indiceAlto}:</span>
                            <br />
                            <span className="font-mono text-xs text-gray-500">
                              P75 = {valoresOrdenados[indiceBajo]?.toFixed(0)} + ({posicionP75.toFixed(2)} - {indiceBajo}) × ({valoresOrdenados[indiceAlto]?.toFixed(0)} - {valoresOrdenados[indiceBajo]?.toFixed(0)})
                            </span>
                            <br />
                            <span className="font-bold text-purple-700">P75 = {p75Calculado.toFixed(1)} unidades/día</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Resultado */}
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800 mb-1">Resultado final</div>
                      <div className="bg-purple-50 rounded p-3 border border-purple-200">
                        <div className="text-lg font-bold text-purple-800">
                          P75 = {p75Calculado.toFixed(1)} unidades = {(p75Calculado / producto.cantidad_bultos).toFixed(2)} bultos/día
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Por qué P75 */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
                <h4 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  ¿Por qué usamos P75?
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                  <div className="flex gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span><strong>75% de cobertura:</strong> Tendrás stock suficiente el 75% de los días</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span><strong>Robusto:</strong> Ignora días con ventas anormalmente bajas</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span><strong>Balance:</strong> Evita sobrestock sin arriesgar quiebres</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span><strong>Estándar:</strong> Método usado en gestión de inventarios</span>
                  </div>
                </div>
              </div>

              {/* Tabla de datos */}
              <details className="bg-white rounded-lg border border-gray-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg">
                  Ver detalle día por día ({ventas20Dias.length} días)
                </summary>
                <div className="p-4 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-purple-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left">Fecha</th>
                        <th className="px-2 py-2 text-left">Día</th>
                        <th className="px-2 py-2 text-right">Unidades</th>
                        <th className="px-2 py-2 text-right">Bultos</th>
                        <th className="px-2 py-2 text-center">vs P75</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas20Dias.map((venta, idx) => {
                        const sobreP75 = venta.cantidad_vendida >= p75Calculado;
                        const esMax = venta.cantidad_vendida === Math.max(...ventas20Dias.map(v => v.cantidad_vendida));
                        const esMin = venta.cantidad_vendida === Math.min(...ventas20Dias.map(v => v.cantidad_vendida));

                        return (
                          <tr key={idx} className={`border-b border-gray-100 ${esMax ? 'bg-green-50' : esMin ? 'bg-orange-50' : ''}`}>
                            <td className="px-2 py-1.5 font-mono">
                              {new Date(venta.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600">{venta.dia_semana}</td>
                            <td className="px-2 py-1.5 text-right font-medium">{venta.cantidad_vendida.toFixed(0)}</td>
                            <td className="px-2 py-1.5 text-right text-gray-600">{(venta.cantidad_vendida / producto.cantidad_bultos).toFixed(1)}</td>
                            <td className="px-2 py-1.5 text-center">
                              {sobreP75 ? (
                                <span className="text-green-600 font-semibold">≥P75</span>
                              ) : (
                                <span className="text-gray-400">&lt;P75</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-purple-100 sticky bottom-0">
                      <tr className="font-bold">
                        <td colSpan={2} className="px-2 py-2 text-left">P75</td>
                        <td className="px-2 py-2 text-right text-purple-700">{p75Calculado.toFixed(0)}</td>
                        <td className="px-2 py-2 text-right text-purple-700">{(p75Calculado / producto.cantidad_bultos).toFixed(1)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No hay datos de ventas disponibles para mostrar el cálculo detallado.</p>
              <p className="text-sm mt-2">El valor P75 mostrado proviene del cálculo del backend.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
