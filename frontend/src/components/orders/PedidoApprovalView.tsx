/**
 * Vista de Aprobación de Pedido para Gerente
 *
 * El gerente puede:
 * - Ver todos los productos del pedido
 * - Aprobar/desaprobar productos individuales
 * - Agregar comentarios a productos específicos
 * - Aprobar o rechazar el pedido completo
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  obtenerPedido,
  aprobarPedido,
  rechazarPedido,
  agregarComentarioProducto,
  ESTADO_LABELS,
  ESTADO_COLORS
} from '../../services/pedidosService';
import { formatNumber } from '../../utils/formatNumber';

interface Producto {
  codigo_producto: string;
  descripcion_producto: string;
  cantidad_pedida_bultos: number;
  cantidad_sugerida_bultos: number;
  cantidad_bultos: number;
  prom_ventas_5dias_unid: number;
  stock_tienda: number;
  stock_cedi_origen: number;
  comentario_gerente?: string;
  aprobado_por_gerente?: boolean;
}

interface PedidoDetalle {
  id: string;
  numero_pedido: string;
  fecha_pedido: string;
  estado: string;
  cedi_origen_nombre: string;
  tienda_destino_nombre: string;
  total_productos: number;
  total_bultos: number;
  productos: Producto[];
  tiene_devoluciones?: boolean;
  total_productos_devolucion?: number;
}

export default function PedidoApprovalView() {
  const { pedidoId } = useParams<{ pedidoId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pedido, setPedido] = useState<PedidoDetalle | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [comentarioGeneral, setComentarioGeneral] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [showRechazarModal, setShowRechazarModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pedidoId) {
      cargarPedido();
    }
  }, [pedidoId]);

  const cargarPedido = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerPedido(pedidoId!);
      setPedido(data);

      // Inicializar comentarios si ya existen
      const comentariosIniciales: Record<string, string> = {};
      data.productos?.forEach((p: Producto) => {
        if (p.comentario_gerente) {
          comentariosIniciales[p.codigo_producto] = p.comentario_gerente;
        }
      });
      setComentarios(comentariosIniciales);
    } catch (err: any) {
      console.error('Error cargando pedido:', err);
      setError(err.response?.data?.detail || 'Error cargando el pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleComentarioChange = (codigoProducto: string, comentario: string) => {
    setComentarios(prev => ({
      ...prev,
      [codigoProducto]: comentario
    }));
  };

  const handleGuardarComentario = async (codigoProducto: string) => {
    const comentario = comentarios[codigoProducto];
    if (!comentario?.trim()) return;

    try {
      await agregarComentarioProducto(pedidoId!, codigoProducto, comentario);
      alert('Comentario guardado exitosamente');
    } catch (err: any) {
      console.error('Error guardando comentario:', err);
      alert(err.response?.data?.detail || 'Error guardando comentario');
    }
  };

  const handleAprobar = async () => {
    if (!confirm('¿Estás seguro de aprobar este pedido?')) return;

    try {
      setSubmitting(true);

      // Guardar todos los comentarios pendientes
      for (const [codigo, comentario] of Object.entries(comentarios)) {
        if (comentario?.trim()) {
          await agregarComentarioProducto(pedidoId!, codigo, comentario);
        }
      }

      // Aprobar el pedido
      const result = await aprobarPedido(pedidoId!, comentarioGeneral);

      alert(`✅ ${result.message}`);
      navigate('/pedidos-sugeridos');
    } catch (err: any) {
      console.error('Error aprobando pedido:', err);
      alert(err.response?.data?.detail || 'Error aprobando el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    if (!motivoRechazo.trim()) {
      alert('Debes proporcionar un motivo de rechazo');
      return;
    }

    try {
      setSubmitting(true);
      const result = await rechazarPedido(pedidoId!, motivoRechazo);

      alert(`❌ ${result.message}`);
      navigate('/pedidos-sugeridos');
    } catch (err: any) {
      console.error('Error rechazando pedido:', err);
      alert(err.response?.data?.detail || 'Error rechazando el pedido');
    } finally {
      setSubmitting(false);
      setShowRechazarModal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !pedido) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error</h3>
          <p className="text-red-600">{error || 'Pedido no encontrado'}</p>
          <button
            onClick={() => navigate('/pedidos-sugeridos')}
            className="mt-4 text-red-600 hover:text-red-800 font-medium"
          >
            ← Volver a Pedidos
          </button>
        </div>
      </div>
    );
  }

  const estadoColor = ESTADO_COLORS[pedido.estado] || 'bg-gray-100 text-gray-800';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/pedidos-sugeridos')}
          className="text-gray-600 hover:text-gray-900 mb-4 inline-flex items-center"
        >
          ← Volver a Pedidos
        </button>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Pedido {pedido.numero_pedido}
              </h1>
              <p className="text-gray-600 mt-1">
                {pedido.cedi_origen_nombre} → {pedido.tienda_destino_nombre}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Fecha: {new Date(pedido.fecha_pedido).toLocaleDateString()}
              </p>
            </div>

            <span className={`px-3 py-1 rounded-full text-sm font-medium ${estadoColor}`}>
              {ESTADO_LABELS[pedido.estado]}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-gray-600">Total Productos</p>
              <p className="text-2xl font-bold text-gray-900">{pedido.total_productos}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Bultos</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(pedido.total_bultos)}</p>
            </div>
            {pedido.tiene_devoluciones && (
              <div>
                <p className="text-sm text-gray-600">Productos a Devolver</p>
                <p className="text-2xl font-bold text-orange-600">{pedido.total_productos_devolucion || 0}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Productos a Recibir */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          📦 Productos a Recibir ({pedido.productos?.length || 0})
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Código
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Descripción
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Sugerido
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  A Pedir
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Prom 5D
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Stock
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Comentario (Opcional)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pedido.productos?.map((producto) => (
                <tr key={producto.codigo_producto} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm font-mono text-gray-900">
                    {producto.codigo_producto}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-900">
                    {producto.descripcion_producto}
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-gray-600">
                    {producto.cantidad_sugerida_bultos} bultos
                  </td>
                  <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">
                    {producto.cantidad_pedida_bultos} bultos
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-gray-600">
                    {formatNumber(producto.prom_ventas_5dias_unid)}
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-gray-600">
                    {formatNumber(producto.stock_tienda)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={comentarios[producto.codigo_producto] || ''}
                        onChange={(e) => handleComentarioChange(producto.codigo_producto, e.target.value)}
                        placeholder="Agregar comentario..."
                        className="flex-1 text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {comentarios[producto.codigo_producto] !== producto.comentario_gerente && (
                        <button
                          onClick={() => handleGuardarComentario(producto.codigo_producto)}
                          className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                        >
                          Guardar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comentario General */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          💬 Comentario General (Opcional)
        </h3>
        <textarea
          value={comentarioGeneral}
          onChange={(e) => setComentarioGeneral(e.target.value)}
          placeholder="Agrega observaciones generales sobre el pedido..."
          rows={3}
          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-4">
        <button
          onClick={() => setShowRechazarModal(true)}
          disabled={submitting}
          className="px-6 py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          ❌ Rechazar Pedido
        </button>
        <button
          onClick={handleAprobar}
          disabled={submitting}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Procesando...
            </>
          ) : (
            <>✅ Aprobar Pedido</>
          )}
        </button>
      </div>

      {/* Modal de Rechazo */}
      {showRechazarModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Rechazar Pedido
            </h3>
            <p className="text-gray-600 mb-4">
              Por favor indica el motivo del rechazo:
            </p>
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Motivo del rechazo..."
              rows={4}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRechazarModal(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleRechazar}
                disabled={submitting || !motivoRechazo.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
