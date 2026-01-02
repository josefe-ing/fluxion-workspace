import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listarPedidos,
  eliminarPedido,
  PedidoSugerido,
  ESTADO_LABELS,
  ESTADO_COLORS,
  ESTADOS_PEDIDO
} from '../../services/pedidosService';
import { formatNumber } from '../../utils/formatNumber';
import PedidoSugeridoV2Wizard from './PedidoSugeridoV2Wizard';

export default function SuggestedOrder() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoSugerido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [mostrarWizardV2, setMostrarWizardV2] = useState(false);
  const [pedidoAEliminar, setPedidoAEliminar] = useState<PedidoSugerido | null>(null);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    cargarPedidos();
  }, [filtroEstado]);

  const cargarPedidos = async () => {
    try {
      setLoading(true);
      const data = await listarPedidos(filtroEstado ? { estado: filtroEstado } : undefined);
      setPedidos(data);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCrearPedido = () => {
    navigate('/pedidos-sugeridos/nuevo');
  };

  const handlePedidoV2Creado = (pedidoId: string) => {
    setMostrarWizardV2(false);
    cargarPedidos(); // Refresh the list
    // Navigate to the new order
    navigate(`/pedidos-sugeridos/${pedidoId}/aprobar`);
  };

  const handleVerPedido = (pedidoId: string, estado: string) => {
    // Si está pendiente de aprobación, ir a vista de aprobación
    if (estado === 'pendiente_aprobacion_gerente') {
      navigate(`/pedidos-sugeridos/${pedidoId}/aprobar`);
    } else {
      // Para otros estados, ir a vista de detalle (TODO: crear vista de detalle)
      navigate(`/pedidos-sugeridos/${pedidoId}/aprobar`);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const color = ESTADO_COLORS[estado] || 'bg-gray-100 text-gray-800';
    const label = ESTADO_LABELS[estado] || estado;

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        {label}
      </span>
    );
  };

  const handleEliminarPedido = async () => {
    if (!pedidoAEliminar) return;

    try {
      setEliminando(true);
      await eliminarPedido(pedidoAEliminar.id);
      setPedidoAEliminar(null);
      cargarPedidos();
    } catch (error: any) {
      console.error('Error eliminando pedido:', error);
      alert(error.response?.data?.detail || 'Error al eliminar el pedido');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Título y Acción */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos Sugeridos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona y crea pedidos sugeridos para reabastecer inventario
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/pedidos-inter-cedi/nuevo')}
            className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Inter-CEDI
          </button>
          <button
            onClick={handleCrearPedido}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Crear Pedido
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">
            Filtrar por estado:
          </label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="pendiente_aprobacion_gerente">Pendiente de Aprobación</option>
            <option value="aprobado_gerente">Aprobado</option>
            <option value="rechazado_gerente">Rechazado</option>
            <option value="finalizado">Finalizado</option>
          </select>

        </div>
      </div>

      {/* Lista de Pedidos */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Pedidos Creados ({pedidos.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-500">Cargando pedidos...</p>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No hay pedidos {filtroEstado ? 'con este filtro' : 'sugeridos'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {filtroEstado
                ? 'Prueba cambiando el filtro o crea un nuevo pedido.'
                : 'Comienza creando un nuevo pedido sugerido haciendo clic en el botón de arriba.'}
            </p>
            {!filtroEstado && (
              <div className="mt-6">
                <button
                  onClick={handleCrearPedido}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Crear Primer Pedido
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pedido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Origen → Destino
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Productos
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bultos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Creado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pedidos.map((pedido) => (
                  <tr key={pedido.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-base font-semibold text-gray-900">
                            {pedido.numero_pedido}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(pedido.fecha_pedido).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {pedido.cedi_origen_nombre}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        {pedido.tienda_destino_nombre}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getEstadoBadge(pedido.estado)}
                      {pedido.tiene_comentarios_gerente && (
                        <span className="ml-2 text-xs text-orange-600">💬</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {pedido.total_productos}
                      {pedido.tiene_devoluciones && (
                        <div className="text-xs text-orange-600">
                          +{pedido.total_productos_devolucion} dev.
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatNumber(pedido.total_bultos)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(pedido.fecha_creacion).toLocaleDateString('es-VE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-sm text-gray-600">
                        {new Date(pedido.fecha_creacion).toLocaleTimeString('es-VE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleVerPedido(pedido.id, pedido.estado)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          {pedido.estado === 'pendiente_aprobacion_gerente' ? 'Aprobar' : 'Ver'}
                        </button>
                        {pedido.estado === ESTADOS_PEDIDO.BORRADOR && (
                          <button
                            onClick={() => setPedidoAEliminar(pedido)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar pedido"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wizard v2.0 Modal */}
      <PedidoSugeridoV2Wizard
        isOpen={mostrarWizardV2}
        onClose={() => setMostrarWizardV2(false)}
        onPedidoCreado={handlePedidoV2Creado}
      />

      {/* Modal de confirmación para eliminar */}
      {pedidoAEliminar && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setPedidoAEliminar(null)} />
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">
                      Eliminar Pedido
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        ¿Estás seguro de eliminar el pedido <strong>{pedidoAEliminar.numero_pedido}</strong> para <strong>{pedidoAEliminar.tienda_destino_nombre}</strong>? Esta acción no se puede deshacer.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  disabled={eliminando}
                  onClick={handleEliminarPedido}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:opacity-50"
                >
                  {eliminando ? 'Eliminando...' : 'Eliminar'}
                </button>
                <button
                  type="button"
                  disabled={eliminando}
                  onClick={() => setPedidoAEliminar(null)}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
