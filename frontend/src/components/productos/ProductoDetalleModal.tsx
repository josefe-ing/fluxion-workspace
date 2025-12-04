import React, { useState, useEffect } from 'react';
import {
  getProductoDetalleCompleto,
  getVentasPorTienda,
  ProductoDetalleCompleto,
  VentasPorTiendaResponse,
  formatNumber
} from '../../services/productosService';

interface ProductoDetalleModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigo: string;
}

const ProductoDetalleModal: React.FC<ProductoDetalleModalProps> = ({ isOpen, onClose, codigo }) => {
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<ProductoDetalleCompleto | null>(null);
  const [ventasPorTienda, setVentasPorTienda] = useState<VentasPorTiendaResponse | null>(null);
  const [loadingVentasPorTienda, setLoadingVentasPorTienda] = useState(true);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState("2m");

  useEffect(() => {
    if (isOpen && codigo) {
      loadData();
    }
  }, [isOpen, codigo]);

  useEffect(() => {
    if (isOpen && codigo) {
      loadVentasPorTienda();
    }
  }, [isOpen, codigo, periodoSeleccionado]);

  const loadData = async () => {
    setLoading(true);
    try {
      const detalleData = await getProductoDetalleCompleto(codigo);
      setDetalle(detalleData);
    } catch (error) {
      console.error('Error loading producto detalle:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVentasPorTienda = async () => {
    setLoadingVentasPorTienda(true);
    try {
      const data = await getVentasPorTienda(codigo, periodoSeleccionado);
      setVentasPorTienda(data);
    } catch (error) {
      console.error('Error loading ventas por tienda:', error);
    } finally {
      setLoadingVentasPorTienda(false);
    }
  };

  if (!isOpen) return null;

  // Obtener clasificación global del producto
  const clasificacionGlobal = detalle?.clasificacion_global;
  const claseABC = clasificacionGlobal?.clasificacion_abc || 'SIN_VENTAS';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {detalle?.producto.codigo} - {detalle?.producto.descripcion}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {detalle?.producto.categoria} {detalle?.producto.marca && `• ${detalle.producto.marca}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Clasificación ABC Explícita */}
            {clasificacionGlobal && (
              <div className={`rounded-lg p-6 border-2 ${
                claseABC === 'A' ? 'bg-red-50 border-red-300' :
                claseABC === 'B' ? 'bg-yellow-50 border-yellow-300' :
                claseABC === 'C' ? 'bg-gray-50 border-gray-300' :
                'bg-blue-50 border-blue-300'
              }`}>
                <div className="flex items-start gap-6">
                  {/* Badge Grande */}
                  <div className={`flex-shrink-0 w-24 h-24 rounded-xl flex items-center justify-center text-5xl font-black ${
                    claseABC === 'A' ? 'bg-red-600 text-white' :
                    claseABC === 'B' ? 'bg-yellow-500 text-white' :
                    claseABC === 'C' ? 'bg-gray-500 text-white' :
                    'bg-blue-500 text-white'
                  }`}>
                    {claseABC}
                  </div>

                  {/* Explicación */}
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold mb-2 ${
                      claseABC === 'A' ? 'text-red-800' :
                      claseABC === 'B' ? 'text-yellow-800' :
                      claseABC === 'C' ? 'text-gray-800' :
                      'text-blue-800'
                    }`}>
                      {claseABC === 'A' && 'Producto Clase A - Alto Valor'}
                      {claseABC === 'B' && 'Producto Clase B - Valor Medio'}
                      {claseABC === 'C' && 'Producto Clase C - Bajo Valor'}
                      {claseABC === 'SIN_VENTAS' && 'Sin Ventas Recientes'}
                    </h3>

                    <p className="text-gray-700 mb-4">
                      {claseABC === 'A' && 'Este producto forma parte del 80% del valor total de ventas. Son los productos que generan la mayor parte de los ingresos y requieren atención prioritaria en inventario.'}
                      {claseABC === 'B' && 'Este producto forma parte del siguiente 15% del valor de ventas (entre 80% y 95% acumulado). Tienen importancia moderada y requieren revisión periódica.'}
                      {claseABC === 'C' && 'Este producto representa solo el 5% restante del valor de ventas. Son productos de baja rotación económica.'}
                      {claseABC === 'SIN_VENTAS' && 'Este producto no ha registrado ventas en los últimos 30 días.'}
                    </p>

                    {/* Métricas Clave */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Ranking por Venta</div>
                        <div className="text-xl font-bold text-gray-900">
                          #{clasificacionGlobal.ranking_valor || '-'}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Venta 30 días</div>
                        <div className="text-xl font-bold text-gray-900">
                          ${formatNumber(clasificacionGlobal.venta_30d || 0)}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Penetración</div>
                        <div className="text-xl font-bold text-gray-900">
                          {clasificacionGlobal.penetracion_pct?.toFixed(1) || 0}%
                        </div>
                        <div className="text-xs text-gray-400">de los tickets</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Stock Total</div>
                        <div className="text-xl font-bold text-gray-900">
                          {detalle?.metricas_globales.total_inventario.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resumen de Ubicaciones */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-green-600 font-medium">Tiendas con Stock</div>
                <div className="text-3xl font-bold text-green-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_con_stock}
                  <span className="text-lg font-normal text-green-600">/{detalle?.metricas_globales.total_ubicaciones}</span>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-sm text-red-600 font-medium">Tiendas sin Stock</div>
                <div className="text-3xl font-bold text-red-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_sin_stock}
                  <span className="text-lg font-normal text-red-600">/{detalle?.metricas_globales.total_ubicaciones}</span>
                </div>
              </div>
            </div>

            {/* Stock por Tienda */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Stock por Tienda
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detalle?.inventarios.map((inv) => (
                      <tr key={inv.ubicacion_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {inv.ubicacion_nombre}
                          <span className="ml-2 text-xs text-gray-500">
                            ({inv.tipo_ubicacion})
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            inv.cantidad_actual === 0 ? 'text-red-600' :
                            inv.cantidad_actual < 10 ? 'text-yellow-600' :
                            'text-gray-900'
                          }`}>
                            {inv.cantidad_actual.toFixed(0)}
                          </span>
                          {inv.cantidad_actual === 0 && ' 🚨'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ventas por Tienda */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Ventas por Tienda
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Total de unidades vendidas y transacciones por ubicación
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 font-medium">Período:</label>
                    <select
                      value={periodoSeleccionado}
                      onChange={(e) => setPeriodoSeleccionado(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="1w">Última semana</option>
                      <option value="2w">2 semanas</option>
                      <option value="1m">1 mes</option>
                      <option value="2m">2 meses</option>
                      <option value="3m">3 meses</option>
                      <option value="4m">4 meses</option>
                      <option value="5m">5 meses</option>
                      <option value="6m">6 meses</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6">
                {loadingVentasPorTienda ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : ventasPorTienda ? (
                  <>
                    {/* Resumen */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="text-sm text-blue-600 font-medium">Total Unidades</div>
                        <div className="text-2xl font-bold text-blue-900 mt-1">
                          {formatNumber(ventasPorTienda.totales.total_unidades)}
                        </div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4">
                        <div className="text-sm text-green-600 font-medium">Total Transacciones</div>
                        <div className="text-2xl font-bold text-green-900 mt-1">
                          {formatNumber(ventasPorTienda.totales.total_transacciones)}
                        </div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4">
                        <div className="text-sm text-purple-600 font-medium">Tiendas con Ventas</div>
                        <div className="text-2xl font-bold text-purple-900 mt-1">
                          {ventasPorTienda.totales.tiendas_con_ventas}
                        </div>
                      </div>
                    </div>

                    {/* Tabla de ventas */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidades</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transacciones</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Última Venta</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {ventasPorTienda.ventas.map((venta) => (
                            <tr key={venta.ubicacion_id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {venta.ubicacion_nombre}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`font-medium ${
                                  venta.total_unidades === 0 ? 'text-gray-400' :
                                  venta.total_unidades > 100 ? 'text-green-600' :
                                  'text-gray-900'
                                }`}>
                                  {formatNumber(venta.total_unidades)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatNumber(venta.total_transacciones)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {venta.ultima_venta ? new Date(venta.ultima_venta).toLocaleDateString('es-VE') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    No hay datos de ventas disponibles para este período
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductoDetalleModal;
