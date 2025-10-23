import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listarPedidos,
  PedidoSugerido,
  ESTADO_LABELS,
  ESTADO_COLORS
} from '../../services/pedidosService';
import { formatNumber } from '../../utils/formatNumber';

export default function SuggestedOrder() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoSugerido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('');

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
        <button
          onClick={handleCrearPedido}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Crear Pedido Sugerido
        </button>
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

          <button
            onClick={cargarPedidos}
            className="ml-auto text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            🔄 Refrescar
          </button>
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
                          <div className="text-sm font-medium text-gray-900">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      Hace {pedido.dias_desde_creacion}d
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleVerPedido(pedido.id, pedido.estado)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {pedido.estado === 'pendiente_aprobacion_gerente' ? 'Aprobar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
