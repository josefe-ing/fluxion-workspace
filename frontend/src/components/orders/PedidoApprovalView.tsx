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
import ProductHistoryModal from '../dashboard/ProductHistoryModal';

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
  fecha_creacion: string;
  estado: string;
  cedi_origen_nombre: string;
  tienda_destino_nombre: string;
  tienda_destino_id: string;
  total_productos: number;
  total_bultos: number;
  productos: Producto[];
  tiene_devoluciones?: boolean;
  total_productos_devolucion?: number;
}

// Interfaz para el modal de historial
interface HistoryModalState {
  isOpen: boolean;
  codigoProducto: string;
  descripcionProducto: string;
  ubicacionId: string;
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
  const [filtroABC, setFiltroABC] = useState<string>('todos');
  const [filtroCediCCS, setFiltroCediCCS] = useState<string>('todos'); // todos, hay, no_hay, menor_igual_pedido
  const [filtroCediVLC, setFiltroCediVLC] = useState<string>('todos'); // todos, hay, no_hay

  // Estado para modal de historial de inventario
  const [historyModal, setHistoryModal] = useState<HistoryModalState>({
    isOpen: false,
    codigoProducto: '',
    descripcionProducto: '',
    ubicacionId: ''
  });

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

      alert(`${result.message}`);
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

      alert(`${result.message}`);
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
      alert(`${result.mensaje}`);

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

  // Filtrar productos por estado de llegada, ABC y stock CEDIs
  const getProductosFiltrados = () => {
    if (!pedido?.productos) return [];
    if (!showVerificacion) return pedido.productos;

    return pedido.productos.filter(p => {
      const verif = getVerificacionProducto(p.codigo_producto);
      if (!verif) return true; // Mostrar productos sin verificación

      // Filtro por estado de llegada
      const pasaFiltroEstado = filtroEstadoLlegada === 'todos' || verif.estado_llegada === filtroEstadoLlegada;

      // Filtro por ABC
      const pasaFiltroABC = filtroABC === 'todos' || verif.clasificacion_abc === filtroABC;

      // Filtro por stock CEDI CCS
      let pasaFiltroCediCCS = true;
      if (filtroCediCCS === 'hay') {
        pasaFiltroCediCCS = verif.stock_cedi_caracas > 0;
      } else if (filtroCediCCS === 'no_hay') {
        pasaFiltroCediCCS = verif.stock_cedi_caracas <= 0;
      } else if (filtroCediCCS === 'menor_igual_pedido') {
        const unidadesPorBulto = verif.unidades_x_bulto || 1;
        const pedidoUnidades = verif.cantidad_pedida_bultos * unidadesPorBulto;
        pasaFiltroCediCCS = verif.stock_cedi_caracas <= pedidoUnidades;
      }

      // Filtro por stock CEDI VLC
      let pasaFiltroCediVLC = true;
      if (filtroCediVLC === 'hay') {
        pasaFiltroCediVLC = verif.stock_cedi_verde > 0;
      } else if (filtroCediVLC === 'no_hay') {
        pasaFiltroCediVLC = verif.stock_cedi_verde <= 0;
      }

      return pasaFiltroEstado && pasaFiltroABC && pasaFiltroCediCCS && pasaFiltroCediVLC;
    });
  };

  // Calcular conteo de productos por ABC
  const getConteoABC = () => {
    if (!verificacionData?.productos) return { A: 0, B: 0, C: 0, D: 0 };
    return verificacionData.productos.reduce((acc, p) => {
      const abc = p.clasificacion_abc as 'A' | 'B' | 'C' | 'D';
      acc[abc] = (acc[abc] || 0) + 1;
      return acc;
    }, { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>);
  };

  // Calcular conteos para filtros CEDI
  const getConteoCediCCS = () => {
    if (!verificacionData?.productos) return { hay: 0, no_hay: 0, menor_igual: 0 };
    return verificacionData.productos.reduce((acc, p) => {
      const unidadesPorBulto = p.unidades_x_bulto || 1;
      const pedidoUnidades = p.cantidad_pedida_bultos * unidadesPorBulto;
      if (p.stock_cedi_caracas > 0) acc.hay++;
      if (p.stock_cedi_caracas <= 0) acc.no_hay++;
      if (p.stock_cedi_caracas <= pedidoUnidades) acc.menor_igual++;
      return acc;
    }, { hay: 0, no_hay: 0, menor_igual: 0 });
  };

  const getConteoCediVLC = () => {
    if (!verificacionData?.productos) return { hay: 0, no_hay: 0 };
    return verificacionData.productos.reduce((acc, p) => {
      if (p.stock_cedi_verde > 0) acc.hay++;
      if (p.stock_cedi_verde <= 0) acc.no_hay++;
      return acc;
    }, { hay: 0, no_hay: 0 });
  };

  // Abrir modal de historial de inventario
  const openHistoryModal = (codigoProducto: string, descripcion: string, ubicacionId: string) => {
    setHistoryModal({
      isOpen: true,
      codigoProducto,
      descripcionProducto: descripcion,
      ubicacionId
    });
  };

  // Exportar a Excel
  const handleExportarExcel = () => {
    if (!verificacionData) return;

    // Crear contenido CSV
    const headers = ['Código', 'Descripción', 'ABC', 'Und/Bulto', 'Pedido', 'Stock Tienda', 'Stock CEDI CCS', 'Stock CEDI VLC', 'Llegada', 'Diferencia', 'Estado'];
    const rows = verificacionData.productos.map(p => {
      const diferencia = Number(p.cantidad_pedida_bultos) - Number(p.total_llegadas_detectadas);
      return [
        p.codigo_producto,
        p.descripcion_producto,
        p.clasificacion_abc,
        p.unidades_x_bulto,
        p.cantidad_pedida_bultos,
        p.stock_tienda,
        p.stock_cedi_caracas,
        p.stock_cedi_verde,
        p.total_llegadas_detectadas,
        diferencia,
        ESTADO_LLEGADA_LABELS[p.estado_llegada] || p.estado_llegada
      ];
    });

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

  // Helper para formatear cantidad con bultos y unidades
  const formatCantidadBultos = (bultos: number, unidadesPorBulto: number) => {
    const unidades = bultos * unidadesPorBulto;
    return (
      <div className="text-right">
        <span className="font-semibold">{formatNumber(bultos)}</span>
        <span className="text-xs text-gray-500 block">{formatNumber(unidades)}u</span>
      </div>
    );
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
            Volver a Pedidos
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
          Volver a Pedidos
        </button>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Pedido {pedido.numero_pedido}
              </h1>
              <p className="text-gray-600 mt-1">
                {pedido.cedi_origen_nombre} - {pedido.tienda_destino_nombre}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Creado: {new Date(pedido.fecha_creacion).toLocaleDateString('es-VE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  timeZone: 'America/Caracas'
                })} {new Date(pedido.fecha_creacion).toLocaleTimeString('es-VE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'America/Caracas'
                })}
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
                          Guardar Llegada
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleExportarExcel}
                    className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 flex items-center gap-2"
                  >
                    Exportar Excel
                  </button>
                </div>
              </div>
              {/* Filtro por estado */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-blue-200">
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

                {/* Separador */}
                <span className="text-gray-300 mx-2">|</span>

                {/* Filtro por ABC */}
                <span className="text-sm text-blue-800">ABC:</span>
                <button
                  onClick={() => setFiltroABC('todos')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroABC === 'todos' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroABC('A')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroABC === 'A' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                >
                  A ({getConteoABC().A})
                </button>
                <button
                  onClick={() => setFiltroABC('B')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroABC === 'B' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300'}`}
                >
                  B ({getConteoABC().B})
                </button>
                <button
                  onClick={() => setFiltroABC('C')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroABC === 'C' ? 'bg-yellow-600 text-white' : 'bg-white text-yellow-700 border border-yellow-300'}`}
                >
                  C ({getConteoABC().C})
                </button>
                <button
                  onClick={() => setFiltroABC('D')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroABC === 'D' ? 'bg-gray-600 text-white' : 'bg-white text-gray-600 border border-gray-300'}`}
                >
                  D ({getConteoABC().D})
                </button>
              </div>

              {/* Fila 2: Filtros de stock CEDI */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {/* Filtro por stock CEDI CCS */}
                <span className="text-sm text-blue-800">CEDI CCS:</span>
                <button
                  onClick={() => setFiltroCediCCS('todos')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediCCS === 'todos' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroCediCCS('hay')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediCCS === 'hay' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                >
                  Hay ({getConteoCediCCS().hay})
                </button>
                <button
                  onClick={() => setFiltroCediCCS('no_hay')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediCCS === 'no_hay' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-300'}`}
                >
                  No hay ({getConteoCediCCS().no_hay})
                </button>
                <button
                  onClick={() => setFiltroCediCCS('menor_igual_pedido')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediCCS === 'menor_igual_pedido' ? 'bg-orange-600 text-white' : 'bg-white text-orange-700 border border-orange-300'}`}
                >
                  Stock &le; Pedido ({getConteoCediCCS().menor_igual})
                </button>

                {/* Separador */}
                <span className="text-gray-300 mx-2">|</span>

                {/* Filtro por stock CEDI VLC */}
                <span className="text-sm text-blue-800">CEDI VLC:</span>
                <button
                  onClick={() => setFiltroCediVLC('todos')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediVLC === 'todos' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroCediVLC('hay')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediVLC === 'hay' ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                >
                  Hay ({getConteoCediVLC().hay})
                </button>
                <button
                  onClick={() => setFiltroCediVLC('no_hay')}
                  className={`px-3 py-1 text-xs rounded-full ${filtroCediVLC === 'no_hay' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-300'}`}
                >
                  No hay ({getConteoCediVLC().no_hay})
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
          Productos a Recibir ({pedido.productos?.length || 0})
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase w-10">
                  #
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Código
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Descripción
                </th>
                {showVerificacion && (
                  <>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      ABC
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      U/B
                    </th>
                  </>
                )}
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Sugerido
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  A Pedir
                </th>
                {showVerificacion && (
                  <>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Stock Tienda
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      CEDI CCS
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      CEDI VLC
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Llegada
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Diferencia
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                  </>
                )}
                {!showVerificacion && (
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Stock
                  </th>
                )}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Comentario
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {getProductosFiltrados().map((producto, index) => {
                const verif = getVerificacionProducto(producto.codigo_producto);
                const unidadesPorBulto = verif?.unidades_x_bulto || producto.cantidad_bultos || 1;

                return (
                  <tr key={producto.codigo_producto} className="hover:bg-gray-50">
                    <td className="px-2 py-3 text-sm text-center text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-3 py-3 text-sm font-mono text-gray-900">
                      {producto.codigo_producto}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 max-w-xs truncate">
                      {producto.descripcion_producto}
                    </td>
                    {showVerificacion && (
                      <>
                        {/* Columna ABC */}
                        <td className="px-3 py-3 text-center">
                          {verif ? (
                            <span className={`px-2 py-1 text-xs font-bold rounded ${
                              verif.clasificacion_abc === 'A' ? 'bg-green-100 text-green-800' :
                              verif.clasificacion_abc === 'B' ? 'bg-blue-100 text-blue-800' :
                              verif.clasificacion_abc === 'C' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {verif.clasificacion_abc}
                            </span>
                          ) : '-'}
                        </td>
                        {/* Columna Und/Bulto */}
                        <td className="px-3 py-3 text-sm text-center text-gray-600">
                          {unidadesPorBulto}
                        </td>
                      </>
                    )}
                    {/* Columna Sugerido */}
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {formatCantidadBultos(producto.cantidad_sugerida_bultos, unidadesPorBulto)}
                    </td>
                    {/* Columna A Pedir */}
                    <td className="px-3 py-3 text-sm">
                      <div className="text-right">
                        <span className="font-bold text-gray-900">{formatNumber(producto.cantidad_pedida_bultos)}</span>
                        <span className="text-xs text-gray-500 block">{formatNumber(producto.cantidad_pedida_bultos * unidadesPorBulto)}u</span>
                      </div>
                    </td>
                    {showVerificacion && verif ? (
                      <>
                        {/* Stock Tienda - clickeable */}
                        <td className="px-3 py-3 text-sm text-right">
                          <button
                            onClick={() => openHistoryModal(producto.codigo_producto, producto.descripcion_producto, verificacionData?.tienda_destino_id || '')}
                            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            title="Ver historial de inventario"
                          >
                            <div>
                              <span className="font-semibold">{formatNumber(verif.stock_tienda / unidadesPorBulto)}</span>
                              <span className="text-xs text-gray-500 block">{formatNumber(verif.stock_tienda)}u</span>
                            </div>
                          </button>
                        </td>
                        {/* Stock CEDI Caracas - clickeable */}
                        <td className="px-3 py-3 text-sm text-right">
                          <button
                            onClick={() => openHistoryModal(producto.codigo_producto, producto.descripcion_producto, 'cedi_caracas')}
                            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            title="Ver historial CEDI Caracas"
                          >
                            <div>
                              <span className="font-semibold">{formatNumber(verif.stock_cedi_caracas / unidadesPorBulto)}</span>
                              <span className="text-xs text-gray-500 block">{formatNumber(verif.stock_cedi_caracas)}u</span>
                            </div>
                          </button>
                        </td>
                        {/* Stock CEDI Verde - clickeable */}
                        <td className="px-3 py-3 text-sm text-right">
                          <button
                            onClick={() => openHistoryModal(producto.codigo_producto, producto.descripcion_producto, 'cedi_verde')}
                            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            title="Ver historial CEDI Valencia"
                          >
                            <div>
                              <span className="font-semibold">{formatNumber(verif.stock_cedi_verde / unidadesPorBulto)}</span>
                              <span className="text-xs text-gray-500 block">{formatNumber(verif.stock_cedi_verde)}u</span>
                            </div>
                          </button>
                        </td>
                        {/* Columna Llegada */}
                        <td className="px-3 py-3 text-sm text-right">
                          <div>
                            {Number(verif.nuevo_incremento) > 0 && (
                              <span className="text-green-600 font-semibold">
                                +{formatNumber(verif.nuevo_incremento)}
                              </span>
                            )}
                            {Number(verif.cantidad_ya_guardada) > 0 && (
                              <span className="text-gray-500 text-xs block">
                                (Total: {formatNumber(verif.total_llegadas_detectadas)})
                              </span>
                            )}
                            {Number(verif.nuevo_incremento) === 0 && Number(verif.cantidad_ya_guardada) === 0 && (
                              <span className="text-gray-400">{formatNumber(verif.total_llegadas_detectadas)}</span>
                            )}
                            <span className="text-xs text-gray-500 block">{formatNumber(verif.total_llegadas_detectadas * unidadesPorBulto)}u</span>
                          </div>
                        </td>
                        {/* Columna Diferencia (Pedido - Llegada) - Si no llegó, mostrar 0 */}
                        <td className="px-3 py-3 text-sm text-right">
                          {(() => {
                            // Si no llegó nada, la diferencia no aplica - mostrar 0
                            if (verif.estado_llegada === 'no_llego') {
                              return <span className="text-gray-400">-</span>;
                            }
                            const diferencia = Number(verif.cantidad_pedida_bultos) - Number(verif.total_llegadas_detectadas);
                            if (Math.abs(diferencia) < 0.01) {
                              return <span className="text-green-600 font-semibold">0</span>;
                            } else if (diferencia > 0) {
                              // Faltante (pedido más de lo que llegó)
                              return <span className="text-red-600 font-semibold">-{formatNumber(diferencia)}</span>;
                            } else {
                              // Llegó más de lo pedido
                              return <span className="text-blue-600 font-semibold">+{formatNumber(Math.abs(diferencia))}</span>;
                            }
                          })()}
                        </td>
                        {/* Columna Estado */}
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${ESTADO_LLEGADA_COLORS[verif.estado_llegada] || 'bg-gray-100 text-gray-600'}`}>
                            {ESTADO_LLEGADA_LABELS[verif.estado_llegada] || verif.estado_llegada}
                          </span>
                        </td>
                      </>
                    ) : (
                      !showVerificacion && (
                        <td className="px-3 py-3 text-sm text-right text-gray-600">
                          {formatNumber(producto.stock_tienda)}
                        </td>
                      )
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comentario General */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Comentario General (Opcional)
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
          Rechazar Pedido
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
            <>Aprobar Pedido</>
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

      {/* Modal de Historial de Inventario */}
      <ProductHistoryModal
        isOpen={historyModal.isOpen}
        onClose={() => setHistoryModal({ ...historyModal, isOpen: false })}
        codigoProducto={historyModal.codigoProducto}
        descripcionProducto={historyModal.descripcionProducto}
        ubicacionId={historyModal.ubicacionId}
      />
    </div>
  );
}
