import { useState, useEffect } from 'react';
import { Search, Filter, Eye, CheckSquare, Square } from 'lucide-react';
import MatrizABCXYZBadge from '../../shared/MatrizABCXYZBadge';
import NivelObjetivoDetalleModal from '../NivelObjetivoDetalleModal';
import {
  obtenerNivelesTienda,
  formatearNumero,
  calcularDiasStock,
  obtenerClaseEstadoStock,
  tieneDeficit
} from '../../../services/nivelObjetivoService';
import type { ProductoNivelObjetivo } from '../../../services/nivelObjetivoService';
import type { DatosOrigenDestino, ProductoSeleccionado } from '../PedidoSugeridoV2Wizard';

interface PasoSeleccionProductosProps {
  datosOrigenDestino: DatosOrigenDestino;
  onSiguiente: (productos: ProductoSeleccionado[]) => void;
  onAnterior: () => void;
}

export default function PasoSeleccionProductos({
  datosOrigenDestino,
  onSiguiente,
  onAnterior
}: PasoSeleccionProductosProps) {
  const [productos, setProductos] = useState<ProductoNivelObjetivo[]>([]);
  const [productosFiltrados, setProductosFiltrados] = useState<ProductoNivelObjetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [soloDeficit, setSoloDeficit] = useState(true);
  const [filtroABC, setFiltroABC] = useState<string>('');
  const [filtroXYZ, setFiltroXYZ] = useState<string>('');
  const [filtroMatriz, setFiltroMatriz] = useState<string>('');

  // Selección
  const [productosSeleccionados, setProductosSeleccionados] = useState<Set<string>>(new Set());
  const [cantidadesAjustadas, setCantidadesAjustadas] = useState<Map<string, number>>(new Map());

  // Modal
  const [productoDetalleModal, setProductoDetalleModal] = useState<ProductoNivelObjetivo | null>(null);

  useEffect(() => {
    cargarProductos();
  }, [datosOrigenDestino.tiendaDestinoId]);

  useEffect(() => {
    aplicarFiltros();
  }, [productos, busqueda, soloDeficit, filtroABC, filtroXYZ, filtroMatriz]);

  const cargarProductos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await obtenerNivelesTienda(
        datosOrigenDestino.tiendaDestinoId,
        {
          limite: 1000,
          soloConDeficit: false // Traemos todos inicialmente
        }
      );

      setProductos(response.productos);

      // Auto-seleccionar productos con déficit
      const productosConDeficit = response.productos
        .filter(p => tieneDeficit(p.cantidad_sugerida))
        .map(p => p.producto_id);

      setProductosSeleccionados(new Set(productosConDeficit));
    } catch (err) {
      console.error('Error cargando productos:', err);
      setError('Error al cargar los productos. Por favor intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltros = () => {
    let filtrados = [...productos];

    // Filtro de búsqueda
    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase();
      filtrados = filtrados.filter(p =>
        p.producto_id.toLowerCase().includes(termino) ||
        p.nombre_producto.toLowerCase().includes(termino)
      );
    }

    // Filtro solo con déficit
    if (soloDeficit) {
      filtrados = filtrados.filter(p => tieneDeficit(p.cantidad_sugerida));
    }

    // Filtro ABC
    if (filtroABC) {
      filtrados = filtrados.filter(p => p.matriz_abc_xyz.startsWith(filtroABC));
    }

    // Filtro XYZ
    if (filtroXYZ) {
      filtrados = filtrados.filter(p => p.matriz_abc_xyz.endsWith(filtroXYZ));
    }

    // Filtro Matriz específica
    if (filtroMatriz) {
      filtrados = filtrados.filter(p => p.matriz_abc_xyz === filtroMatriz);
    }

    setProductosFiltrados(filtrados);
  };

  const toggleSeleccion = (productoId: string) => {
    const nuevaSeleccion = new Set(productosSeleccionados);
    if (nuevaSeleccion.has(productoId)) {
      nuevaSeleccion.delete(productoId);
    } else {
      nuevaSeleccion.add(productoId);
    }
    setProductosSeleccionados(nuevaSeleccion);
  };

  const seleccionarTodos = () => {
    const todosIds = productosFiltrados.map(p => p.producto_id);
    setProductosSeleccionados(new Set(todosIds));
  };

  const deseleccionarTodos = () => {
    setProductosSeleccionados(new Set());
  };

  const ajustarCantidad = (productoId: string, nuevaCantidad: number) => {
    const nuevasCantidades = new Map(cantidadesAjustadas);
    nuevasCantidades.set(productoId, Math.max(0, nuevaCantidad));
    setCantidadesAjustadas(nuevasCantidades);
  };

  const handleSiguiente = () => {
    const productosParaPedido: ProductoSeleccionado[] = Array.from(productosSeleccionados)
      .map(prodId => {
        const producto = productos.find(p => p.producto_id === prodId);
        if (!producto) return null;

        const cantidadAjustada = cantidadesAjustadas.get(prodId);

        return {
          producto_id: producto.producto_id,
          nombre_producto: producto.nombre_producto,
          matriz_abc_xyz: producto.matriz_abc_xyz,
          cantidad_sugerida: producto.cantidad_sugerida,
          cantidad_pedida: cantidadAjustada !== undefined ? cantidadAjustada : producto.cantidad_sugerida,
          nivel_objetivo: producto.nivel_objetivo,
          stock_actual: producto.stock_actual,
          inventario_en_transito: producto.inventario_en_transito,
          stock_seguridad: producto.stock_seguridad,
          demanda_ciclo: producto.demanda_ciclo,
          prioridad: producto.prioridad,
          demanda_promedio_diaria: producto.demanda_promedio_diaria
        };
      })
      .filter((p): p is ProductoSeleccionado => p !== null);

    if (productosParaPedido.length === 0) {
      alert('Debes seleccionar al menos un producto');
      return;
    }

    onSiguiente(productosParaPedido);
  };

  const totalSeleccionados = productosSeleccionados.size;
  const totalUnidades = Array.from(productosSeleccionados).reduce((sum, prodId) => {
    const producto = productos.find(p => p.producto_id === prodId);
    if (!producto) return sum;
    const cantidad = cantidadesAjustadas.get(prodId) ?? producto.cantidad_sugerida;
    return sum + cantidad;
  }, 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Calculando niveles objetivo...</p>
          <p className="mt-2 text-sm text-gray-500">
            Esto puede tardar unos segundos para {datosOrigenDestino.tiendaDestinoNombre}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border-2 border-red-200 rounded-lg p-6">
          <p className="text-red-800 font-medium">{error}</p>
          <button
            onClick={cargarProductos}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filtros y Búsqueda */}
      <div className="bg-gray-50 border-b px-6 py-4 space-y-4">
        {/* Fila 1: Búsqueda y Solo Déficit */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={soloDeficit}
              onChange={(e) => setSoloDeficit(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">Solo con Déficit</span>
          </label>
        </div>

        {/* Fila 2: Filtros por Clasificación */}
        <div className="flex gap-4 items-center">
          <Filter className="h-5 w-5 text-gray-500" />

          <select
            value={filtroABC}
            onChange={(e) => setFiltroABC(e.target.value)}
            className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las clases ABC</option>
            <option value="A">Clase A (Alto valor)</option>
            <option value="B">Clase B (Medio valor)</option>
            <option value="C">Clase C (Bajo valor)</option>
          </select>

          <select
            value={filtroXYZ}
            onChange={(e) => setFiltroXYZ(e.target.value)}
            className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las variabilidades</option>
            <option value="X">X (Estable)</option>
            <option value="Y">Y (Variable)</option>
            <option value="Z">Z (Errática)</option>
          </select>

          <select
            value={filtroMatriz}
            onChange={(e) => setFiltroMatriz(e.target.value)}
            className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las matrices</option>
            <option value="AX">AX</option>
            <option value="AY">AY</option>
            <option value="AZ">AZ</option>
            <option value="BX">BX</option>
            <option value="BY">BY</option>
            <option value="BZ">BZ</option>
            <option value="CX">CX</option>
            <option value="CY">CY</option>
            <option value="CZ">CZ</option>
          </select>

          <div className="flex-1"></div>

          <button
            onClick={seleccionarTodos}
            className="px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Seleccionar Todos
          </button>
          <button
            onClick={deseleccionarTodos}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-700 font-medium"
          >
            Deseleccionar Todos
          </button>
        </div>

        {/* Resultados */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            Mostrando <strong>{productosFiltrados.length}</strong> de <strong>{productos.length}</strong> productos
          </span>
          <span className="text-gray-400">•</span>
          <span>
            <strong>{totalSeleccionados}</strong> seleccionados
          </span>
          <span className="text-gray-400">•</span>
          <span>
            <strong>{formatearNumero(totalUnidades)}</strong> unidades totales
          </span>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                <CheckSquare className="h-4 w-4" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Producto
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Matriz
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tránsito
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nivel Obj.
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sugerido
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Días Stock
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prior.
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productosFiltrados.map((producto) => {
              const seleccionado = productosSeleccionados.has(producto.producto_id);
              const cantidadAjustada = cantidadesAjustadas.get(producto.producto_id);
              const cantidadMostrar = cantidadAjustada !== undefined ? cantidadAjustada : producto.cantidad_sugerida;
              const diasStock = calcularDiasStock(
                producto.stock_actual,
                producto.inventario_en_transito,
                producto.demanda_promedio_diaria
              );
              const claseEstado = obtenerClaseEstadoStock(diasStock, producto.matriz_abc_xyz);

              return (
                <tr
                  key={producto.producto_id}
                  className={`hover:bg-gray-50 transition-colors ${seleccionado ? 'bg-indigo-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleSeleccion(producto.producto_id)}
                      className="text-gray-500 hover:text-indigo-600"
                    >
                      {seleccionado ? (
                        <CheckSquare className="h-5 w-5 text-indigo-600" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">
                    {producto.producto_id}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {producto.nombre_producto}
                  </td>
                  <td className="px-4 py-3">
                    <MatrizABCXYZBadge
                      matriz={producto.matriz_abc_xyz}
                      size="sm"
                      mostrarPrioridad={false}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">
                    {formatearNumero(producto.stock_actual)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">
                    {formatearNumero(producto.inventario_en_transito)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-indigo-700">
                    {formatearNumero(producto.nivel_objetivo)}
                  </td>
                  <td className="px-4 py-3">
                    {seleccionado ? (
                      <input
                        type="number"
                        value={cantidadMostrar}
                        onChange={(e) => ajustarCantidad(producto.producto_id, parseInt(e.target.value) || 0)}
                        className="w-24 px-2 py-1 text-sm text-right border-2 border-indigo-300 rounded focus:ring-2 focus:ring-indigo-500"
                        min="0"
                      />
                    ) : (
                      <span className={`text-sm text-right font-semibold ${
                        tieneDeficit(producto.cantidad_sugerida) ? 'text-green-700' : 'text-gray-500'
                      }`}>
                        {formatearNumero(producto.cantidad_sugerida)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className={`h-2 w-2 rounded-full ${claseEstado}`}></div>
                      <span className="text-gray-700">
                        {diasStock === Infinity ? '∞' : diasStock.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
                      {producto.prioridad}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setProductoDetalleModal(producto)}
                      className="text-indigo-600 hover:text-indigo-700 transition-colors"
                      title="Ver detalles del cálculo"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {productosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No se encontraron productos con los filtros seleccionados</p>
          </div>
        )}
      </div>

      {/* Resumen Flotante */}
      {totalSeleccionados > 0 && (
        <div className="bg-indigo-100 border-t-2 border-indigo-300 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-sm text-indigo-700">Productos Seleccionados</p>
                <p className="text-2xl font-bold text-indigo-900">{totalSeleccionados}</p>
              </div>
              <div>
                <p className="text-sm text-indigo-700">Total Unidades</p>
                <p className="text-2xl font-bold text-indigo-900">{formatearNumero(totalUnidades)}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onAnterior}
                className="px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Anterior
              </button>
              <button
                onClick={handleSiguiente}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Siguiente →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalles */}
      {productoDetalleModal && (
        <NivelObjetivoDetalleModal
          isOpen={true}
          onClose={() => setProductoDetalleModal(null)}
          producto={{
            codigo_producto: productoDetalleModal.producto_id,
            descripcion_producto: productoDetalleModal.nombre_producto
          }}
          datos={{
            producto_id: productoDetalleModal.producto_id,
            tienda_id: datosOrigenDestino.tiendaDestinoId,
            matriz_abc_xyz: productoDetalleModal.matriz_abc_xyz,
            demanda_promedio_diaria: productoDetalleModal.demanda_promedio_diaria,
            desviacion_estandar_diaria: 0, // TODO: agregar al API
            demanda_ciclo: productoDetalleModal.demanda_ciclo,
            stock_seguridad: productoDetalleModal.stock_seguridad,
            nivel_objetivo: productoDetalleModal.nivel_objetivo,
            stock_actual: productoDetalleModal.stock_actual,
            inventario_en_transito: productoDetalleModal.inventario_en_transito,
            cantidad_sugerida: productoDetalleModal.cantidad_sugerida,
            metodo_calculo: 'NIVEL_OBJETIVO_V2',
            datos_calculo: {
              demanda_promedio_diaria: productoDetalleModal.demanda_promedio_diaria,
              desviacion_estandar_diaria: 0,
              periodo_reposicion_dias: 2.5,
              nivel_servicio_z: 1.96, // TODO: obtener del backend
              multiplicador_demanda: 1.0,
              multiplicador_ss: 1.0,
              timestamp: new Date().toISOString()
            }
          }}
        />
      )}
    </div>
  );
}
