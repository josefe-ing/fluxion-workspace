/**
 * Componente de Administración de Generadores de Tráfico
 *
 * Permite:
 * - Ver productos sugeridos como generadores de tráfico
 * - Aprobar/rechazar sugerencias
 * - Ver productos activos marcados
 * - Administrar todos los productos clase C
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getResumen,
  getProductos,
  marcarProducto,
  calcularSugerencias,
  getHistorial,
  formatMonto,
  getColorEstado,
  getColorGap,
  getIconoEstado,
  type GeneradorTrafico,
  type ResumenGeneradoresTrafico,
  type HistorialGeneradorTrafico,
  type TabType,
} from '../../services/generadoresTraficoService';

// =====================================================================================
// COMPONENTE PRINCIPAL
// =====================================================================================

const GeneradoresTrafico: React.FC = () => {
  const [productos, setProductos] = useState<GeneradorTrafico[]>([]);
  const [resumen, setResumen] = useState<ResumenGeneradoresTrafico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('sugeridos');
  const [total, setTotal] = useState(0);

  // Modal de detalle
  const [productoSeleccionado, setProductoSeleccionado] = useState<GeneradorTrafico | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [historial, setHistorial] = useState<HistorialGeneradorTrafico[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Estado de acciones
  const [procesando, setProcesando] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [comentario, setComentario] = useState('');

  // =====================================================================================
  // FUNCIONES
  // =====================================================================================

  const loadResumen = useCallback(async () => {
    try {
      const data = await getResumen();
      setResumen(data);
    } catch (err) {
      console.error('Error cargando resumen:', err);
    }
  }, []);

  const loadProductos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Sugeridos, activos e ignorados son pocos, traer todos. Clase C puede ser grande.
      const limite = activeTab === 'todos_c' ? 100 : 500;
      const data = await getProductos(activeTab, limite, 0);
      setProductos(data.productos);
      setTotal(data.total);
    } catch (err) {
      console.error('Error cargando productos:', err);
      setError('Error al cargar productos. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const handleMarcar = async (productoId: string, accion: 'aprobar' | 'rechazar' | 'remover' | 'ignorar') => {
    try {
      setProcesando(productoId);
      await marcarProducto(productoId, accion, comentario || undefined, 'admin');
      setComentario('');
      await Promise.all([loadProductos(), loadResumen()]);
    } catch (err) {
      console.error('Error marcando producto:', err);
      setError('Error al procesar la acción.');
    } finally {
      setProcesando(null);
    }
  };

  const handleCalcularSugerencias = async () => {
    try {
      setCalculando(true);
      const result = await calcularSugerencias();
      alert(`${result.message}\nNuevos sugeridos: ${result.nuevos_sugeridos}\nActualizados: ${result.actualizados}`);
      await Promise.all([loadProductos(), loadResumen()]);
    } catch (err) {
      console.error('Error calculando sugerencias:', err);
      setError('Error al calcular sugerencias.');
    } finally {
      setCalculando(false);
    }
  };

  const handleVerDetalle = async (producto: GeneradorTrafico) => {
    setProductoSeleccionado(producto);
    setShowDetalle(true);
    setLoadingHistorial(true);
    try {
      const hist = await getHistorial(producto.producto_id);
      setHistorial(hist);
    } catch (err) {
      console.error('Error cargando historial:', err);
    } finally {
      setLoadingHistorial(false);
    }
  };

  // =====================================================================================
  // EFECTOS
  // =====================================================================================

  useEffect(() => {
    loadResumen();
  }, [loadResumen]);

  useEffect(() => {
    loadProductos();
  }, [loadProductos]);

  // =====================================================================================
  // RENDER
  // =====================================================================================

  if (loading && !productos.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  const tabs = [
    { id: 'sugeridos' as TabType, label: 'Sugeridos por revisar', count: resumen?.total_sugeridos || 0, color: 'yellow' },
    { id: 'activos' as TabType, label: 'Marcados activos', count: resumen?.total_activos || 0, color: 'green' },
    { id: 'todos_c' as TabType, label: 'Todos los productos', count: resumen?.productos_clase_c || 0, color: 'gray' },
    { id: 'ignorados' as TabType, label: 'Ignorados', count: resumen?.total_ignorados || 0, color: 'gray' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Generadores de Trafico</h1>
          <p className="text-sm text-gray-600 mt-1">
            Productos que venden poco en $ pero aparecen en muchos tickets. Criticos para la experiencia del cliente.
          </p>
        </div>
        <button
          onClick={handleCalcularSugerencias}
          disabled={calculando}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            calculando
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {calculando ? 'Calculando...' : 'Recalcular Sugerencias'}
        </button>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-sm text-gray-600">Activos</div>
          <div className="text-2xl font-bold text-green-600">{resumen?.total_activos || 0}</div>
          <div className="text-xs text-gray-500 mt-1">+50% stock seguridad</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="text-sm text-gray-600">Sugeridos</div>
          <div className="text-2xl font-bold text-yellow-600">{resumen?.total_sugeridos || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Pendientes de revision</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="text-sm text-gray-600">Candidatos GAP Alto</div>
          <div className="text-2xl font-bold text-blue-600">{resumen?.productos_clase_c || 0}</div>
          <div className="text-xs text-gray-500 mt-1">GAP &gt; 200</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <div className="text-sm text-gray-600">GAP Minimo Config</div>
          <div className="text-2xl font-bold text-purple-600">{resumen?.gap_minimo_config || 400}</div>
          <div className="text-xs text-gray-500 mt-1">Para sugerencia automatica</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline">
            Cerrar
          </button>
        </div>
      )}

      {/* Explicacion del tab */}
      {activeTab === 'sugeridos' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">💡</span>
            <div>
              <h3 className="font-semibold text-yellow-800">Productos sugeridos automaticamente</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Estos productos son <strong>clase C</strong> (solo aportan el 5% de las ventas) pero aparecen
                en <strong>muchos mas tickets de lo esperado</strong>. El sistema los detecta porque su
                posicion en el ranking de frecuencia de compra es mucho mejor que su posicion en el
                ranking de ventas.
              </p>
              <p className="text-sm text-yellow-700 mt-2">
                <strong>Ejemplo:</strong> Un producto esta en el puesto #1500 por ventas en $, pero
                en el puesto #700 por cantidad de tickets donde aparece. Eso da un GAP de +800, lo que
                significa que los clientes lo buscan mucho aunque genera poco ingreso.
              </p>
              <p className="text-sm text-yellow-700 mt-2">
                <strong>Por que GAP {'>'} {resumen?.gap_minimo_config || 400}?</strong> Un GAP de 400+ indica una
                diferencia significativa: el producto aparece en al menos 400 posiciones mas arriba en
                frecuencia que en ventas. Son productos que los clientes esperan encontrar.
                <strong> Si faltan, pueden abandonar toda la compra.</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activos' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">✅</span>
            <div>
              <h3 className="font-semibold text-green-800">Generadores de trafico confirmados</h3>
              <p className="text-sm text-green-700 mt-1">
                Estos productos reciben +50% de stock de seguridad adicional,
                tienen badge visible en pedidos y no se sugieren para eliminacion.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de productos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">
            Productos ({total})
          </h2>
        </div>

        {productos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-6xl mb-4">
              {activeTab === 'sugeridos' ? '✅' : activeTab === 'activos' ? '📦' : '📋'}
            </div>
            <div className="text-xl font-medium">
              {activeTab === 'sugeridos'
                ? 'No hay sugerencias pendientes'
                : activeTab === 'activos'
                ? 'No hay generadores activos'
                : 'No hay productos'}
            </div>
            <div className="text-sm mt-2">
              {activeTab === 'sugeridos' && 'Ejecuta "Recalcular Sugerencias" para detectar nuevos candidatos'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Venta 30d
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tickets
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Penetracion %
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GAP Score
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productos.map((producto) => (
                  <tr
                    key={producto.producto_id}
                    className={`hover:bg-gray-50 transition-colors ${
                      producto.estado === 'sugerido' ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        <div>
                          <div className="font-medium text-gray-900">
                            {producto.descripcion}
                          </div>
                          <div className="text-sm text-gray-500">
                            {producto.codigo} | Clase {producto.clase_abc}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-gray-900">
                      {formatMonto(producto.venta_30d)}
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-gray-900">
                      {producto.tickets_30d.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-gray-900">
                      {producto.penetracion_pct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-mono ${getColorGap(producto.gap)}`}>
                        {producto.gap > 0 ? '+' : ''}{producto.gap}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getColorEstado(producto.estado)}`}>
                        {getIconoEstado(producto.estado)} {producto.estado}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {producto.estado === 'sugerido' && (
                          <>
                            <button
                              onClick={() => handleMarcar(producto.producto_id, 'aprobar')}
                              disabled={procesando === producto.producto_id}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                              title="Aprobar como generador de trafico"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => handleMarcar(producto.producto_id, 'ignorar')}
                              disabled={procesando === producto.producto_id}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                              title="Ignorar - no volver a sugerir"
                            >
                              Ignorar
                            </button>
                          </>
                        )}
                        {producto.estado === 'activo' && (
                          <button
                            onClick={() => handleMarcar(producto.producto_id, 'remover')}
                            disabled={procesando === producto.producto_id}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                            title="Quitar marca de generador de trafico"
                          >
                            Remover
                          </button>
                        )}
                        {producto.estado === 'ninguno' && (
                          <button
                            onClick={() => handleMarcar(producto.producto_id, 'aprobar')}
                            disabled={procesando === producto.producto_id}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                            title="Marcar manualmente como generador de trafico"
                          >
                            Marcar
                          </button>
                        )}
                        {producto.estado === 'ignorado' && (
                          <button
                            onClick={() => handleMarcar(producto.producto_id, 'aprobar')}
                            disabled={procesando === producto.producto_id}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                            title="Reactivar como generador de trafico"
                          >
                            Reactivar
                          </button>
                        )}
                        <button
                          onClick={() => handleVerDetalle(producto)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          title="Ver detalle e historial"
                        >
                          Detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      {showDetalle && productoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Detalle del Producto
              </h3>
              <button
                onClick={() => setShowDetalle(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info del producto */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">
                  {productoSeleccionado.descripcion}
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Codigo:</span>
                    <span className="ml-2 font-medium">{productoSeleccionado.codigo}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Clase ABC:</span>
                    <span className="ml-2 font-medium">{productoSeleccionado.clase_abc}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Venta 30d:</span>
                    <span className="ml-2 font-medium">{formatMonto(productoSeleccionado.venta_30d)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Tickets 30d:</span>
                    <span className="ml-2 font-medium">{productoSeleccionado.tickets_30d.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Penetracion:</span>
                    <span className="ml-2 font-medium">{productoSeleccionado.penetracion_pct.toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500">GAP Score:</span>
                    <span className={`ml-2 font-medium ${getColorGap(productoSeleccionado.gap)}`}>
                      {productoSeleccionado.gap > 0 ? '+' : ''}{productoSeleccionado.gap}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Rank Venta:</span>
                    <span className="ml-2 font-medium">#{productoSeleccionado.rank_venta}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Rank Penetracion:</span>
                    <span className="ml-2 font-medium">#{productoSeleccionado.rank_penetracion}</span>
                  </div>
                </div>
              </div>

              {/* Explicacion GAP */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Que significa el GAP de este producto?</h4>
                <p className="text-sm text-blue-700">
                  Este producto esta en el puesto <strong>#{productoSeleccionado.rank_venta}</strong> por ventas en $,
                  pero en el puesto <strong>#{productoSeleccionado.rank_penetracion}</strong> por frecuencia
                  (cantidad de tickets donde aparece).
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  <strong>GAP = {productoSeleccionado.rank_venta} - {productoSeleccionado.rank_penetracion} = {productoSeleccionado.gap > 0 ? '+' : ''}{productoSeleccionado.gap}</strong>
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  {productoSeleccionado.gap > 0
                    ? `Este producto aparece ${productoSeleccionado.gap} posiciones mas arriba en frecuencia que en ventas. Los clientes lo compran frecuentemente aunque genera poco ingreso.`
                    : `Este producto vende mas de lo que su frecuencia sugiere (no es un generador de trafico tipico).`
                  }
                </p>
              </div>

              {/* Historial */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Historial de acciones</h4>
                {loadingHistorial ? (
                  <div className="text-center text-gray-500 py-4">Cargando historial...</div>
                ) : historial.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">No hay historial de acciones</div>
                ) : (
                  <div className="space-y-2">
                    {historial.map((h) => (
                      <div key={h.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{h.accion}</span>
                          <span className="text-gray-500">{new Date(h.fecha).toLocaleDateString()}</span>
                        </div>
                        {h.comentario && (
                          <div className="text-gray-600 mt-1">{h.comentario}</div>
                        )}
                        <div className="text-gray-500 text-xs mt-1">
                          Por: {h.usuario} | GAP: {h.gap_score}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Campo de comentario para acciones */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comentario (opcional)
                </label>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Agregar comentario a la accion..."
                />
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                {productoSeleccionado.estado === 'sugerido' && (
                  <>
                    <button
                      onClick={() => {
                        handleMarcar(productoSeleccionado.producto_id, 'aprobar');
                        setShowDetalle(false);
                      }}
                      disabled={procesando === productoSeleccionado.producto_id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => {
                        handleMarcar(productoSeleccionado.producto_id, 'ignorar');
                        setShowDetalle(false);
                      }}
                      disabled={procesando === productoSeleccionado.producto_id}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                    >
                      Ignorar
                    </button>
                  </>
                )}
                {productoSeleccionado.estado === 'activo' && (
                  <button
                    onClick={() => {
                      handleMarcar(productoSeleccionado.producto_id, 'remover');
                      setShowDetalle(false);
                    }}
                    disabled={procesando === productoSeleccionado.producto_id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
                {(productoSeleccionado.estado === 'ninguno' || productoSeleccionado.estado === 'ignorado') && (
                  <button
                    onClick={() => {
                      handleMarcar(productoSeleccionado.producto_id, 'aprobar');
                      setShowDetalle(false);
                    }}
                    disabled={procesando === productoSeleccionado.producto_id}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Marcar como Generador
                  </button>
                )}
                <button
                  onClick={() => setShowDetalle(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneradoresTrafico;
