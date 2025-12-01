import React, { useState, useEffect } from 'react';
import { getProductoDetalleTiendas, ProductoDetalleTiendas } from '../../services/productosService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  codigo: string;
}

const DetalleTiendasModal: React.FC<Props> = ({ isOpen, onClose, codigo }) => {
  const [data, setData] = useState<ProductoDetalleTiendas | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && codigo) {
      setLoading(true);
      getProductoDetalleTiendas(codigo)
        .then(setData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, codigo]);

  if (!isOpen) return null;

  const formatNumber = (n: number) => {
    return n.toLocaleString('es-VE', { maximumFractionDigits: 0 });
  };

  const formatCurrency = (n: number) => {
    return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Separar tiendas y CEDIs
  const tiendas = data?.tiendas.filter(t => t.tipo === 'TIENDA') || [];
  const cedis = data?.tiendas.filter(t => t.tipo === 'CEDI') || [];

  // Totales
  const totalStockTiendas = tiendas.reduce((acc, t) => acc + t.stock, 0);
  const totalVentasTiendas = tiendas.reduce((acc, t) => acc + t.ventas_2m, 0);
  const totalStockCedis = cedis.reduce((acc, t) => acc + t.stock, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Detalle por Tienda
                </h3>
                {data?.producto && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-mono font-medium">{data.producto.codigo}</span>
                    {' - '}
                    {data.producto.descripcion}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Tiendas */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏪</span> Tiendas
                    <span className="text-xs text-gray-500 font-normal">
                      (Stock: {formatNumber(totalStockTiendas)} | Ventas: {formatNumber(totalVentasTiendas)})
                    </span>
                  </h4>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ventas 2M</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Última Vta</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tiendas.map((tienda) => (
                          <tr key={tienda.ubicacion_id} className={tienda.stock === 0 && tienda.ventas_2m === 0 ? 'bg-gray-50' : ''}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {tienda.ubicacion_nombre}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-mono">
                              <span className={tienda.stock > 0 ? 'text-green-600' : tienda.stock < 0 ? 'text-red-600' : 'text-gray-400'}>
                                {formatNumber(tienda.stock)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-mono">
                              <span className={tienda.ventas_2m > 0 ? 'text-blue-600' : 'text-gray-400'}>
                                {formatNumber(tienda.ventas_2m)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-mono text-gray-600">
                              {formatCurrency(tienda.valor_2m)}
                            </td>
                            <td className="px-4 py-2 text-sm text-center">
                              {tienda.ultima_venta ? (
                                <span className="text-gray-600">{tienda.ultima_venta}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CEDIs */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏭</span> Centros de Distribución
                    <span className="text-xs text-gray-500 font-normal">
                      (Stock Total: {formatNumber(totalStockCedis)})
                    </span>
                  </h4>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CEDI</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {cedis.map((cedi) => (
                          <tr key={cedi.ubicacion_id}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {cedi.ubicacion_nombre}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-mono">
                              <span className={cedi.stock > 0 ? 'text-green-600 font-semibold' : cedi.stock < 0 ? 'text-red-600' : 'text-gray-400'}>
                                {formatNumber(cedi.stock)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Insights */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">Análisis Rápido</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {totalStockCedis > 0 && totalStockTiendas === 0 && (
                      <li>⚠️ Stock disponible en CEDI pero no en tiendas - considerar distribución</li>
                    )}
                    {totalVentasTiendas > 0 && totalStockTiendas === 0 && (
                      <li>🔴 Producto con ventas pero sin stock - posible agotado</li>
                    )}
                    {totalVentasTiendas === 0 && totalStockTiendas > 0 && (
                      <li>😴 Stock sin movimiento - evaluar demanda o promoción</li>
                    )}
                    {totalVentasTiendas === 0 && totalStockTiendas === 0 && totalStockCedis === 0 && (
                      <li>👻 Producto fantasma - candidato a eliminación</li>
                    )}
                    {tiendas.filter(t => t.ventas_2m > 0).length === 1 && (
                      <li>📍 Ventas concentradas en una sola tienda</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetalleTiendasModal;
