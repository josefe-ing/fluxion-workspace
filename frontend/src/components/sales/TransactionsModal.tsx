import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';

interface TransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  ubicacionId: string;
  ubicacionNombre?: string;
}

interface Transaccion {
  numero_factura: string;
  numero_factura_linea: string;
  fecha_venta: string;
  almacen: string;
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number;
  costo_unitario: number;
  venta_total: number;
  costo_total: number;
  utilidad: number;
  margen_pct: number;
}

interface PaginationMetadata {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
}

interface Totales {
  total_cantidad: number;
  total_venta: number;
  total_costo: number;
  total_utilidad: number;
  total_facturas: number;
}

interface TransaccionesResponse {
  transacciones: Transaccion[];
  pagination: PaginationMetadata;
  totales: Totales;
  filtros: {
    codigo_producto: string;
    ubicacion_id: string;
    fecha_inicio: string;
    fecha_fin: string;
  };
}

export default function TransactionsModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  ubicacionId,
  ubicacionNombre
}: TransactionsModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TransaccionesResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Inicializar fechas (últimos 30 días)
  useEffect(() => {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    setFechaFin(hoy.toISOString().split('T')[0]);
    setFechaInicio(hace30Dias.toISOString().split('T')[0]);
  }, []);

  const fetchTransacciones = useCallback(async () => {
    if (!fechaInicio || !fechaFin) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        ubicacion_id: ubicacionId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        page: currentPage.toString(),
        page_size: '50'
      });

      const response = await http.get(
        `/api/ventas/producto/${codigoProducto}/transacciones?${params.toString()}`
      );
      setData(response.data);
    } catch (error) {
      console.error('Error cargando transacciones:', error);
    } finally {
      setLoading(false);
    }
  }, [codigoProducto, ubicacionId, fechaInicio, fechaFin, currentPage]);

  useEffect(() => {
    if (isOpen && codigoProducto && ubicacionId && fechaInicio && fechaFin) {
      fetchTransacciones();
    }
  }, [isOpen, codigoProducto, ubicacionId, fechaInicio, fechaFin, currentPage, fetchTransacciones]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatFechaHora = (fechaStr: string) => {
    if (!fechaStr) return 'N/A';
    const fechaConHora = fechaStr.includes(' ') ? fechaStr.replace(' ', 'T') : fechaStr + 'T00:00:00';
    const fecha = new Date(fechaConHora);
    return fecha.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="w-full">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900" id="modal-title">
                    Transacciones de Producto
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-medium">{descripcionProducto}</span>
                    <span className="text-gray-400 ml-2">({codigoProducto})</span>
                  </p>
                  {ubicacionNombre && (
                    <p className="text-xs text-blue-600 mt-1">
                      Tienda: {ubicacionNombre}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-500 transition-colors"
                >
                  <span className="sr-only">Cerrar</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Filtros de fecha */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => {
                      setFechaInicio(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => {
                      setFechaFin(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={() => {
                    const hoy = new Date();
                    const hace7Dias = new Date();
                    hace7Dias.setDate(hace7Dias.getDate() - 7);
                    setFechaInicio(hace7Dias.toISOString().split('T')[0]);
                    setFechaFin(hoy.toISOString().split('T')[0]);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                >
                  Última Semana
                </button>
                <button
                  onClick={() => {
                    const hoy = new Date();
                    const hace30Dias = new Date();
                    hace30Dias.setDate(hace30Dias.getDate() - 30);
                    setFechaInicio(hace30Dias.toISOString().split('T')[0]);
                    setFechaFin(hoy.toISOString().split('T')[0]);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                >
                  Último Mes
                </button>
              </div>

              {/* Totales */}
              {data?.totales && (
                <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-600">Facturas</div>
                    <div className="text-xl font-bold text-blue-700">{data.totales.total_facturas}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-600">Cantidad Total</div>
                    <div className="text-xl font-bold text-green-700">{data.totales.total_cantidad.toFixed(0)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-600">Venta Total</div>
                    <div className="text-lg font-bold text-purple-700">{formatCurrency(data.totales.total_venta)}</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-600">Costo Total</div>
                    <div className="text-lg font-bold text-orange-700">{formatCurrency(data.totales.total_costo)}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-600">Utilidad Total</div>
                    <div className="text-lg font-bold text-emerald-700">{formatCurrency(data.totales.total_utilidad)}</div>
                  </div>
                </div>
              )}

              {/* Tabla de transacciones */}
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : data?.transacciones && data.transacciones.length > 0 ? (
                <>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Factura
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fecha/Hora
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Cantidad
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Precio Unit.
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Venta Total
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Costo
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Utilidad
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Margen %
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.transacciones.map((tx, index) => (
                          <tr key={`${tx.numero_factura_linea}-${index}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-blue-600">
                              {tx.numero_factura}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                              {formatFechaHora(tx.fecha_venta)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                              {tx.cantidad.toFixed(2)}
                              <span className="text-xs text-gray-400 ml-1">{tx.unidad_medida}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {formatCurrency(tx.precio_unitario)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-green-700">
                              {formatCurrency(tx.venta_total)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-orange-600">
                              {formatCurrency(tx.costo_total)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-emerald-600">
                              {formatCurrency(tx.utilidad)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                tx.margen_pct >= 20 ? 'bg-green-100 text-green-800' :
                                tx.margen_pct >= 10 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {tx.margen_pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  {data.pagination && data.pagination.total_pages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Mostrando{' '}
                        <span className="font-medium">
                          {((currentPage - 1) * data.pagination.page_size) + 1}
                        </span>
                        {' '}a{' '}
                        <span className="font-medium">
                          {Math.min(currentPage * data.pagination.page_size, data.pagination.total_items)}
                        </span>
                        {' '}de{' '}
                        <span className="font-medium">{data.pagination.total_items}</span>
                        {' '}transacciones
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={!data.pagination.has_previous}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Anterior
                        </button>
                        <span className="px-3 py-1 text-sm text-gray-700">
                          Página {currentPage} de {data.pagination.total_pages}
                        </span>
                        <button
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={!data.pagination.has_next}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No se encontraron transacciones para este producto en el período seleccionado
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
