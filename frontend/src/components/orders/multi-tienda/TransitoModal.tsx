/**
 * Modal para mostrar el desglose de productos en tránsito.
 *
 * Muestra los pedidos pendientes que contribuyen al valor de tránsito
 * de un producto para una tienda específica.
 */

import { TransitoDesglose } from '../../../types/multitienda';

// Formatear número con locale
const formatNumber = (num: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
};

interface TransitoModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  tiendaNombre: string;
  transitoBultos: number;
  desglose: TransitoDesglose[];
  unidadesPorBulto: number;
}

// Colores por estado del pedido
const ESTADO_COLORS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-700',
  solicitado: 'bg-blue-100 text-blue-700',
  pendiente_aprobacion_gerente: 'bg-yellow-100 text-yellow-700',
  aprobado_gerente: 'bg-green-100 text-green-700',
  aprobado: 'bg-green-100 text-green-700',
  en_preparacion: 'bg-purple-100 text-purple-700',
  en_transito: 'bg-orange-100 text-orange-700',
  recibido: 'bg-green-200 text-green-800',
};

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  solicitado: 'Solicitado',
  pendiente_aprobacion_gerente: 'Pend. Aprob.',
  aprobado_gerente: 'Aprobado Gte.',
  aprobado: 'Aprobado',
  en_preparacion: 'En Preparación',
  en_transito: 'En Tránsito',
  recibido: 'Recibido',
};

export function TransitoModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  tiendaNombre,
  transitoBultos,
  desglose,
  unidadesPorBulto,
}: TransitoModalProps) {
  if (!isOpen) return null;

  const totalPedido = desglose.reduce((sum, d) => sum + d.pedido_bultos, 0);
  const totalLlegadas = desglose.reduce((sum, d) => sum + d.llegadas_bultos, 0);
  const totalPendiente = desglose.reduce((sum, d) => sum + d.pendiente_bultos, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Productos en Tránsito
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {codigoProducto} - {descripcionProducto}
              </p>
              <p className="text-xs text-gray-500">
                Destino: <span className="font-medium">{tiendaNombre}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
          {desglose.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay pedidos pendientes para este producto
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 px-2 text-left font-medium text-gray-600">Pedido</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600">Fecha</th>
                  <th className="py-2 px-2 text-left font-medium text-gray-600">Estado</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-600">Pedido</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-600">Llegó</th>
                  <th className="py-2 px-2 text-right font-medium text-gray-600 text-orange-600">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {desglose.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2">
                      <span className="font-mono text-blue-600">{item.numero_pedido}</span>
                    </td>
                    <td className="py-2 px-2 text-gray-600">
                      {new Date(item.fecha_pedido).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[item.estado] || 'bg-gray-100 text-gray-600'}`}>
                        {ESTADO_LABELS[item.estado] || item.estado}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-medium">
                      {formatNumber(item.pedido_bultos, 1)}
                    </td>
                    <td className="py-2 px-2 text-right text-green-600">
                      {formatNumber(item.llegadas_bultos, 1)}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-orange-600">
                      {formatNumber(item.pendiente_bultos, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td colSpan={3} className="py-2 px-2 text-right text-gray-600">
                    Total:
                  </td>
                  <td className="py-2 px-2 text-right">
                    {formatNumber(totalPedido, 1)}
                  </td>
                  <td className="py-2 px-2 text-right text-green-600">
                    {formatNumber(totalLlegadas, 1)}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-orange-600">
                    {formatNumber(totalPendiente, 1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer summary */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-orange-50 to-white">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-orange-600">{formatNumber(transitoBultos, 1)} bultos</span>
              {' '}en tránsito
              {unidadesPorBulto > 1 && (
                <span className="text-gray-500">
                  {' '}({formatNumber(transitoBultos * unidadesPorBulto, 0)} unid)
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
