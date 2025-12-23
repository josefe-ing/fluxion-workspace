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
  verificarLlegada,
  registrarLlegada,
  ESTADO_LABELS,
  ESTADO_COLORS,
  ESTADO_LLEGADA_COLORS,
  ESTADO_LLEGADA_LABELS,
  VerificarLlegadaResponse,
  ProductoLlegadaVerificacion
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

  // Estado para verificación de llegada
  const [verificacionData, setVerificacionData] = useState<VerificarLlegadaResponse | null>(null);
  const [loadingVerificacion, setLoadingVerificacion] = useState(false);
  const [showVerificacion, setShowVerificacion] = useState(false);
  const [guardandoLlegada, setGuardandoLlegada] = useState(false);
  const [filtroEstadoLlegada, setFiltroEstadoLlegada] = useState<string>('todos');

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

  // =====================================================================================
  // VERIFICAR LLEGADA
  // =====================================================================================

  const handleVerificarLlegada = async () => {
    try {
      setLoadingVerificacion(true);
      const data = await verificarLlegada(pedidoId!);
      setVerificacionData(data);
      setShowVerificacion(true);
    } catch (err: any) {
      console.error('Error verificando llegada:', err);
      alert(err.response?.data?.detail || 'Error verificando llegada');
    } finally {
      setLoadingVerificacion(false);
    }
  };

  const handleGuardarLlegada = async () => {
    if (!verificacionData) return;

    // Filtrar solo productos con nuevo incremento > 0
    const productosConIncremento = verificacionData.productos
      .filter(p => p.nuevo_incremento > 0)
      .map(p => ({
        codigo_producto: p.codigo_producto,
        cantidad_llegada: p.nuevo_incremento
      }));

    if (productosConIncremento.length === 0) {
      alert('No hay nuevos incrementos para guardar');
      return;
    }

    try {
      setGuardandoLlegada(true);
      const result = await registrarLlegada(pedidoId!, productosConIncremento);
      alert(`✅ ${result.mensaje}`);

      // Recargar verificación para actualizar cantidades
      await handleVerificarLlegada();
    } catch (err: any) {
      console.error('Error guardando llegada:', err);
      alert(err.response?.data?.detail || 'Error guardando llegada');
    } finally {
      setGuardandoLlegada(false);
    }
  };

  // Helper para obtener datos de verificación de un producto
  const getVerificacionProducto = (codigoProducto: string): ProductoLlegadaVerificacion | undefined => {
    return verificacionData?.productos.find(p => p.codigo_producto === codigoProducto);
  };

  // Filtrar productos por estado de llegada
  const getProductosFiltrados = () => {
    if (!pedido?.productos) return [];
    if (!showVerificacion || filtroEstadoLlegada === 'todos') {
      return pedido.productos;
    }
    return pedido.productos.filter(p => {
      const verif = getVerificacionProducto(p.codigo_producto);
      return verif?.estado_llegada === filtroEstadoLlegada;
    });
  };

  // Exportar a Excel
  const handleExportarExcel = () => {
    if (!verificacionData) return;

    // Crear contenido CSV
    const headers = ['Código', 'Descripción', 'ABC', 'Und/Bulto', 'Pedido', 'Unidad', 'Llegada', 'Estado'];
    const rows = verificacionData.productos.map(p => [
      p.codigo_producto,
      p.descripcion_producto,
      p.clasificacion_abc,
      p.unidades_x_bulto,
      p.cantidad_pedida_bultos,
      p.unidad,
      p.total_llegadas_detectadas,
      ESTADO_LLEGADA_LABELS[p.estado_llegada] || p.estado_llegada
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Descargar archivo
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `verificacion_${pedido?.numero_pedido || 'pedido'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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

            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${estadoColor}`}>
                {ESTADO_LABELS[pedido.estado]}
              </span>
              <button
                onClick={handleVerificarLlegada}
                disabled={loadingVerificacion}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingVerificacion ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Verificando...
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    Verificar Llegada
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Resumen de verificación */}
          {showVerificacion && verificacionData && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-blue-900">Verificación de Llegada</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Cumplimiento global: <span className="font-bold">{Number(verificacionData.porcentaje_cumplimiento_global).toFixed(0)}%</span>
                    {' | '}
                    <span className="text-green-700">{verificacionData.productos_completos} completos</span>
                    {' | '}
                    <span className="text-yellow-700">{verificacionData.productos_parciales} parciales</span>
                    {' | '}
                    <span className="text-red-700">{verificacionData.productos_no_llegaron} no llegaron</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {verificacionData.hay_nuevos_incrementos && (
                    <button
                      onClick={handleGuardarLlegada}
                      disabled={guardandoLlegada}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {guardandoLlegada ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Guardando...
                        </>
                      ) : (
                        <>
                          <span>💾</span>
                          Guardar Llegada
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleExportarExcel}
                    className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 flex items-center gap-2"
                  >
                    <span>📥</span>
                    Exportar Excel
                  </button>
                </div>
              </div>
              {/* Filtro por estado */}
              <div className="flex items-center gap-2 pt-3 border-t border-blue-200">
                <span className="text-sm text-blue-800">Filtrar:</span>
                <button
                  onClick={() => setFiltroEstadoLlegada('todos')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroEstadoLlegada === 'todos' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroEstadoLlegada('completo')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroEstadoLlegada === 'completo' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                >
                  Completo ({verificacionData.productos_completos})
                </button>
                <button
                  onClick={() => setFiltroEstadoLlegada('parcial')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroEstadoLlegada === 'parcial' ? 'bg-yellow-600 text-white' : 'bg-white text-yellow-700 border border-yellow-300'}`}
                >
                  Parcial ({verificacionData.productos_parciales})
                </button>
                <button
                  onClick={() => setFiltroEstadoLlegada('no_llego')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroEstadoLlegada === 'no_llego' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-300'}`}
                >
                  No llegó ({verificacionData.productos_no_llegaron})
                </button>
              </div>
            </div>
          )}

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
                {showVerificacion && (
                  <>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      ABC
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Und/Bulto
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Llegada
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                  </>
                )}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Comentario (Opcional)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {getProductosFiltrados().map((producto) => (
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
                  {showVerificacion && (
                    <>
                      {/* Columna ABC */}
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const verif = getVerificacionProducto(producto.codigo_producto);
                          if (!verif) return '-';
                          const abcColors: Record<string, string> = {
                            'A': 'bg-green-100 text-green-800',
                            'B': 'bg-blue-100 text-blue-800',
                            'C': 'bg-yellow-100 text-yellow-800',
                            'D': 'bg-gray-100 text-gray-600'
                          };
                          return (
                            <span className={`px-2 py-1 text-xs font-bold rounded ${abcColors[verif.clasificacion_abc] || 'bg-gray-100'}`}>
                              {verif.clasificacion_abc}
                            </span>
                          );
                        })()}
                      </td>
                      {/* Columna Und/Bulto */}
                      <td className="px-3 py-3 text-sm text-right text-gray-600">
                        {(() => {
                          const verif = getVerificacionProducto(producto.codigo_producto);
                          return verif ? verif.unidades_x_bulto : '-';
                        })()}
                      </td>
                      {/* Columna Llegada */}
                      <td className="px-3 py-3 text-sm text-right">
                        {(() => {
                          const verif = getVerificacionProducto(producto.codigo_producto);
                          if (!verif) return '-';
                          return (
                            <div>
                              {Number(verif.nuevo_incremento) > 0 && (
                                <span className="text-green-600 font-semibold">
                                  +{formatNumber(verif.nuevo_incremento)} {verif.unidad}
                                </span>
                              )}
                              {Number(verif.cantidad_ya_guardada) > 0 && (
                                <span className="text-gray-500 text-xs block">
                                  (Total: {formatNumber(verif.total_llegadas_detectadas)} {verif.unidad})
                                </span>
                              )}
                              {Number(verif.nuevo_incremento) === 0 && Number(verif.cantidad_ya_guardada) === 0 && (
                                <span className="text-gray-400">0 {verif.unidad}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {/* Columna Estado */}
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const verif = getVerificacionProducto(producto.codigo_producto);
                          if (!verif) return '-';
                          const colorClass = ESTADO_LLEGADA_COLORS[verif.estado_llegada] || 'bg-gray-100 text-gray-600';
                          const label = ESTADO_LLEGADA_LABELS[verif.estado_llegada] || verif.estado_llegada;
                          return (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                    </>
                  )}
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
