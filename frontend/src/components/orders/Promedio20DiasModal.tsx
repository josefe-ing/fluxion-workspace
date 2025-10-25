import { X, TrendingUp, Calendar, BarChart3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import http from '../../services/http';

interface Promedio20DiasModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
  };
  ubicacionId: number;
}

interface VentaDiaria {
  fecha: string;
  dia_semana: string;
  cantidad_vendida: number;
}

export default function Promedio20DiasModal({ isOpen, onClose, producto, ubicacionId }: Promedio20DiasModalProps) {
  const [ventasDetalle, setVentasDetalle] = useState<VentaDiaria[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      cargarVentasDetalle();
    }
  }, [isOpen]);

  const cargarVentasDetalle = async () => {
    try {
      setLoading(true);
      const response = await http.get(
        `/api/ventas/producto/${producto.codigo_producto}/ultimos-20-dias?ubicacion_id=${ubicacionId}`
      );
      if (response.data.ventas) {
        setVentasDetalle(response.data.ventas);
      }
    } catch (error) {
      console.error('Error cargando ventas detalle:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Calcular promedio en bultos
  const promedioBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;

  // Calcular total de unidades vendidas (si tenemos el detalle)
  const totalUnidades = ventasDetalle.reduce((sum, v) => sum + v.cantidad_vendida, 0);
  const diasConData = ventasDetalle.length;

  // Estadísticas
  const ventaMaxima = ventasDetalle.length > 0
    ? Math.max(...ventasDetalle.map(v => v.cantidad_vendida))
    : 0;
  const ventaMinima = ventasDetalle.length > 0
    ? Math.min(...ventasDetalle.map(v => v.cantidad_vendida))
    : 0;

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              Promedio 20 Días: {promedioBultos.toFixed(2)} bultos/día
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
            <p className="text-sm font-semibold text-purple-800 mb-2">Promedio de Ventas (Últimos 20 Días)</p>
            <p className="text-5xl font-bold text-purple-700">{promedioBultos.toFixed(2)}</p>
            <p className="text-xl text-purple-600 mt-1">bultos/día</p>
            <p className="text-sm text-gray-600 mt-3">
              ({producto.prom_ventas_20dias_unid.toFixed(2)} unidades/día)
            </p>
          </div>

          {/* Estadísticas Rápidas */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border-2 border-purple-200 text-center">
              <p className="text-xs text-gray-600 mb-1">Total Vendido</p>
              <p className="text-2xl font-bold text-purple-700">
                {loading ? '...' : totalUnidades}
              </p>
              <p className="text-xs text-gray-500 mt-1">unidades en {diasConData} días</p>
            </div>
            <div className="bg-white rounded-lg p-4 border-2 border-green-200 text-center">
              <p className="text-xs text-gray-600 mb-1">Día Máximo</p>
              <p className="text-2xl font-bold text-green-700">
                {loading ? '...' : (ventaMaxima / producto.cantidad_bultos).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 mt-1">bultos en un día</p>
            </div>
            <div className="bg-white rounded-lg p-4 border-2 border-orange-200 text-center">
              <p className="text-xs text-gray-600 mb-1">Día Mínimo</p>
              <p className="text-2xl font-bold text-orange-700">
                {loading ? '...' : (ventaMinima / producto.cantidad_bultos).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 mt-1">bultos en un día</p>
            </div>
          </div>

          {/* Cálculo Paso a Paso */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm border-b border-gray-300 pb-2 flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Cómo se Calcula el Promedio
            </h3>

            {/* Paso 1 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  1
                </span>
                Sumar todas las ventas de los últimos 20 días
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                {loading ? (
                  <p className="text-gray-400">Cargando datos...</p>
                ) : ventasDetalle.length > 0 ? (
                  <>
                    <p className="font-mono text-xs mb-2">
                      Total = {ventasDetalle.map((v, i) =>
                        `${v.cantidad_vendida}${i < ventasDetalle.length - 1 ? ' + ' : ''}`
                      ).join('')}
                    </p>
                    <p className="font-mono text-purple-700 font-semibold">
                      Total = {totalUnidades} unidades
                    </p>
                  </>
                ) : (
                  <p className="text-gray-400">No hay datos disponibles</p>
                )}
              </div>
            </div>

            {/* Paso 2 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  2
                </span>
                Dividir entre el número de días
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono">
                  Promedio = Total ÷ Días
                </p>
                {!loading && ventasDetalle.length > 0 && (
                  <p className="font-mono mt-1 text-purple-700 font-semibold">
                    Promedio = {totalUnidades} ÷ {diasConData} = {producto.prom_ventas_20dias_unid.toFixed(2)} unidades/día
                  </p>
                )}
              </div>
            </div>

            {/* Paso 3 */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold mr-2">
                  3
                </span>
                Convertir a bultos (dividir entre unidades por bulto)
              </p>
              <div className="ml-8 text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                <p className="font-mono">
                  Promedio en Bultos = {producto.prom_ventas_20dias_unid.toFixed(2)} ÷ {producto.cantidad_bultos}
                </p>
                <p className="font-mono mt-2 text-purple-700 font-semibold text-lg">
                  = {promedioBultos.toFixed(2)} bultos/día
                </p>
              </div>
            </div>
          </div>

          {/* Tabla de Ventas Diarias */}
          {!loading && ventasDetalle.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-3 border-b border-gray-300 pb-2 flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                Detalle de Ventas (Últimos {diasConData} Días)
              </h3>
              <div className="max-h-64 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-300 text-sm">
                  <thead className="bg-purple-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-900">Fecha</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-900">Día</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-900">Unidades</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-900">Bultos</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-900">Visual</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ventasDetalle.map((venta, index) => {
                      const bultos = venta.cantidad_vendida / producto.cantidad_bultos;
                      const porcentaje = ventaMaxima > 0 ? (venta.cantidad_vendida / ventaMaxima) * 100 : 0;
                      const esMayor = venta.cantidad_vendida === ventaMaxima;
                      const esMenor = venta.cantidad_vendida === ventaMinima;

                      return (
                        <tr key={index} className={`${esMayor ? 'bg-green-50' : esMenor ? 'bg-orange-50' : ''}`}>
                          <td className="px-3 py-2 text-gray-700 font-medium">{formatFecha(venta.fecha)}</td>
                          <td className="px-3 py-2 text-center text-gray-600 text-xs">{venta.dia_semana}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{venta.cantidad_vendida}</td>
                          <td className="px-3 py-2 text-right font-mono text-purple-700 font-semibold">
                            {bultos.toFixed(1)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${esMayor ? 'bg-green-500' : esMenor ? 'bg-orange-500' : 'bg-purple-500'}`}
                                style={{ width: `${porcentaje}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-purple-50">
                    <tr className="font-bold">
                      <td className="px-3 py-2" colSpan={2}>PROMEDIO</td>
                      <td className="px-3 py-2 text-right font-mono text-purple-800">
                        {producto.prom_ventas_20dias_unid.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-purple-800 text-lg">
                        {promedioBultos.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Nota Informativa */}
          <div className="bg-purple-50 border-l-4 border-purple-600 p-4 rounded">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-purple-800">Por qué 20 días:</span> Este promedio móvil de 20 días
              captura las tendencias recientes de venta sin ser demasiado sensible a fluctuaciones diarias. Es el dato
              base para calcular todos los parámetros de stock (Mínimo, Seguridad, Reorden, Máximo).
            </p>
          </div>

          {/* Aplicaciones */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 text-sm mb-2 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Este Dato se Usa Para:
            </h3>
            <ul className="text-sm text-gray-700 space-y-1 ml-4">
              <li>• <strong>Clasificación ABC:</strong> Determinar la importancia del producto</li>
              <li>• <strong>Stock Mínimo:</strong> Calcular el nivel mínimo de inventario</li>
              <li>• <strong>Stock de Seguridad:</strong> Buffer para variaciones de demanda</li>
              <li>• <strong>Punto de Reorden:</strong> Cuándo hacer el siguiente pedido</li>
              <li>• <strong>Stock Máximo:</strong> Límite superior de inventario</li>
              <li>• <strong>Pedido Sugerido:</strong> Cuántos bultos pedir</li>
            </ul>
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
