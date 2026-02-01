import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Eye } from 'lucide-react';
import MatrizABCXYZBadge from '../../shared/MatrizABCXYZBadge';
import NivelObjetivoDetalleModal from '../NivelObjetivoDetalleModal';
import MatrizABCXYZExplicacionModal from './MatrizABCXYZExplicacionModal';
import { useABCModel } from '../../../services/abcModelService';
import {
  obtenerNivelesTienda,
  obtenerClasificacionProducto,
  formatearNumero,
  tieneDeficit
} from '../../../services/nivelObjetivoService';
import type { ProductoNivelObjetivo, ClasificacionABCXYZData } from '../../../services/nivelObjetivoService';
import type { DatosOrigenDestino, ProductoSeleccionado } from '../PedidoSugeridoV2Wizard';
import { isXYZEnabled } from '../../../config/featureFlags';

interface PasoSeleccionProductosProps {
  datosOrigenDestino: DatosOrigenDestino;
  onSiguiente: (productos: ProductoSeleccionado[]) => void;
  onAnterior: () => void;
}

export default function PasoSeleccionProductosV2Extended({
  datosOrigenDestino,
  onSiguiente,
  onAnterior
}: PasoSeleccionProductosProps) {
  const { getCorta } = useABCModel();
  const [productos, setProductos] = useState<ProductoNivelObjetivo[]>([]);
  const [productosFiltrados, setProductosFiltrados] = useState<ProductoNivelObjetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [soloDeficit, setSoloDeficit] = useState(true);
  const [filtroABC, setFiltroABC] = useState<string>('');
  const [filtroXYZ, setFiltroXYZ] = useState<string>('');
  const [filtroCuadrante, setFiltroCuadrante] = useState<string>('');

  // Selección y edición
  const [productosSeleccionados, setProductosSeleccionados] = useState<Set<string>>(new Set());
  const [cantidadesPedir, setCantidadesPedir] = useState<Map<string, number>>(new Map());
  const [notas, setNotas] = useState<Map<string, string>>(new Map());

  // Modales
  const [productoDetalleModal, setProductoDetalleModal] = useState<ProductoNivelObjetivo | null>(null);
  const [modalClasificacion, setModalClasificacion] = useState<{
    isOpen: boolean;
    producto: ProductoNivelObjetivo | null;
    datosClasificacion: ClasificacionABCXYZData | null;
    loading: boolean;
  }>({
    isOpen: false,
    producto: null,
    datosClasificacion: null,
    loading: false
  });

  useEffect(() => {
    cargarProductos();
  }, [datosOrigenDestino.tiendaDestinoId]);

  useEffect(() => {
    aplicarFiltros();
  }, [productos, busqueda, soloDeficit, filtroABC, filtroXYZ, filtroCuadrante]);

  const cargarProductos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await obtenerNivelesTienda(
        datosOrigenDestino.tiendaDestinoId,
        { limite: 1000, soloConDeficit: false }
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

  // Calcular Top50: los primeros 50 productos de clase A ordenados por demanda
  const top50Ids = useMemo(() => {
    const productosClaseA = productos
      .filter(p => p.matriz_abc_xyz.startsWith('A'))
      .sort((a, b) => b.demanda_promedio_diaria - a.demanda_promedio_diaria)
      .slice(0, 50);
    return new Set(productosClaseA.map(p => p.producto_id));
  }, [productos]);

  const esTop50 = (productoId: string) => top50Ids.has(productoId);

  const aplicarFiltros = () => {
    let filtrados = [...productos];

    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase();
      filtrados = filtrados.filter(p =>
        p.producto_id.toLowerCase().includes(termino) ||
        p.nombre_producto.toLowerCase().includes(termino)
      );
    }

    if (soloDeficit) {
      filtrados = filtrados.filter(p => tieneDeficit(p.cantidad_sugerida));
    }

    // Filtro por cuadrante numérico específico (I, II, III, etc.)
    if (filtroCuadrante) {
      filtrados = filtrados.filter(p => p.cuadrante === filtroCuadrante);
    }

    // Filtros ABC y XYZ independientes
    if (filtroABC) {
      if (filtroABC === 'Top50') {
        // Filtrar solo Top50
        filtrados = filtrados.filter(p => top50Ids.has(p.producto_id));
      } else {
        filtrados = filtrados.filter(p => p.matriz_abc_xyz.startsWith(filtroABC));
      }
    }

    if (filtroXYZ) {
      filtrados = filtrados.filter(p => p.matriz_abc_xyz.endsWith(filtroXYZ));
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

  const actualizarCantidadPedir = (productoId: string, cantidad: number) => {
    const nuevasCantidades = new Map(cantidadesPedir);
    nuevasCantidades.set(productoId, Math.max(0, cantidad));
    setCantidadesPedir(nuevasCantidades);
  };

  const actualizarNotas = (productoId: string, texto: string) => {
    const nuevasNotas = new Map(notas);
    nuevasNotas.set(productoId, texto);
    setNotas(nuevasNotas);
  };

  const handleClickMatriz = async (producto: ProductoNivelObjetivo) => {
    try {
      // Abrir modal en estado de carga
      setModalClasificacion({
        isOpen: true,
        producto,
        datosClasificacion: null,
        loading: true
      });

      // Obtener datos de clasificación desde el backend
      const response = await obtenerClasificacionProducto(
        datosOrigenDestino.tiendaDestinoId,
        producto.producto_id
      );

      // Actualizar modal con los datos
      setModalClasificacion({
        isOpen: true,
        producto,
        datosClasificacion: response.clasificacion_data,
        loading: false
      });
    } catch (error) {
      console.error('Error al cargar clasificación:', error);
      // Cerrar modal en caso de error
      setModalClasificacion({
        isOpen: false,
        producto: null,
        datosClasificacion: null,
        loading: false
      });
      alert('Error al cargar los datos de clasificación. Por favor intenta nuevamente.');
    }
  };

  const handleCloseModalClasificacion = () => {
    setModalClasificacion({
      isOpen: false,
      producto: null,
      datosClasificacion: null,
      loading: false
    });
  };

  const handleSiguiente = () => {
    // Solo enviar productos que están seleccionados Y visibles en los filtros actuales
    const productosParaPedido = productosFiltrados
      .filter(producto => productosSeleccionados.has(producto.producto_id))
      .map(producto => {
        const cantidadPedida = cantidadesPedir.get(producto.producto_id) ?? producto.cantidad_sugerida;
        const notasProducto = notas.get(producto.producto_id);

        const productoSeleccionado: ProductoSeleccionado = {
          producto_id: producto.producto_id,
          nombre_producto: producto.nombre_producto,
          matriz_abc_xyz: producto.matriz_abc_xyz,
          cuadrante: producto.cuadrante,
          cantidad_sugerida: producto.cantidad_sugerida,
          cantidad_pedida: cantidadPedida,
          demanda_promedio_diaria: producto.demanda_promedio_diaria,
          demanda_5_dias: producto.demanda_5_dias,
          demanda_20_dias: producto.demanda_20_dias,
          demanda_mismo_dia: producto.demanda_mismo_dia,
          demanda_proyeccion: producto.demanda_proyeccion,
          stock_actual: producto.stock_actual,
          stock_cedi: producto.stock_cedi,
          inventario_en_transito: producto.inventario_en_transito,
          stock_total: producto.stock_total,
          dias_stock_actual: producto.dias_stock_actual,
          stock_minimo: producto.stock_minimo,
          stock_seguridad: producto.stock_seguridad,
          punto_reorden: producto.punto_reorden,
          stock_maximo: producto.stock_maximo,
          demanda_ciclo: producto.demanda_ciclo,
          nivel_objetivo: producto.nivel_objetivo,
          prioridad: producto.prioridad,
          peso_kg: producto.peso_kg,
          unidad_medida: producto.unidad_medida,
          ...(notasProducto && { notas: notasProducto })
        };
        return productoSeleccionado;
      });

    if (productosParaPedido.length === 0) {
      alert('Debes seleccionar al menos un producto');
      return;
    }

    onSiguiente(productosParaPedido);
  };

  // Solo contar productos que están seleccionados Y visibles en los filtros actuales
  const productosSeleccionadosYFiltrados = productosFiltrados.filter(p =>
    productosSeleccionados.has(p.producto_id)
  );

  const totalSeleccionados = productosSeleccionadosYFiltrados.length;
  const totalUnidades = productosSeleccionadosYFiltrados.reduce((sum, producto) => {
    const cantidad = cantidadesPedir.get(producto.producto_id) ?? producto.cantidad_sugerida;
    return sum + cantidad;
  }, 0);

  const totalPeso = productosSeleccionadosYFiltrados.reduce((sum, producto) => {
    const cantidad = cantidadesPedir.get(producto.producto_id) ?? producto.cantidad_sugerida;
    return sum + (cantidad * producto.peso_kg);
  }, 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Calculando niveles objetivo...</p>
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
      {/* Filtros */}
      <div className="bg-gray-50 border-b px-6 py-4 space-y-3">
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

        <div className="flex gap-4 items-center text-sm">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={filtroABC}
            onChange={(e) => setFiltroABC(e.target.value)}
            className="px-3 py-1.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">ABC</option>
            <option value="Top50">🏆 {getCorta('A')}</option>
            <option value="A">A - {getCorta('A')}</option>
            <option value="B">B - {getCorta('B')}</option>
            <option value="C">C - {getCorta('C')}</option>
            <option value="D">D - {getCorta('D')}</option>
          </select>
          {isXYZEnabled() && (
            <select
              value={filtroXYZ}
              onChange={(e) => setFiltroXYZ(e.target.value)}
              className="px-3 py-1.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todas XYZ</option>
              <option value="X">X (Estable)</option>
              <option value="Y">Y (Variable)</option>
              <option value="Z">Z (Errática)</option>
            </select>
          )}

          {/* Filtro por Cuadrante numérico */}
          <div className="border-l-2 border-gray-300 pl-4">
            <select
              value={filtroCuadrante}
              onChange={(e) => setFiltroCuadrante(e.target.value)}
              className="px-3 py-1.5 border-2 border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-indigo-50"
            >
              <option value="">Todos ({productos.length})</option>
              {(() => {
                // Contar productos por cuadrante
                const cuadranteCounts = productos.reduce((acc, p) => {
                  acc[p.cuadrante] = (acc[p.cuadrante] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                // Ordenar cuadrantes
                const cuadrantes = [
                  'CUADRANTE I', 'CUADRANTE II', 'CUADRANTE III', 'CUADRANTE IV',
                  'CUADRANTE V', 'CUADRANTE VI', 'CUADRANTE VII', 'CUADRANTE VIII',
                  'CUADRANTE IX', 'CUADRANTE X', 'CUADRANTE XI', 'CUADRANTE XII',
                  'NO ESPECIFICADO'
                ];

                return cuadrantes
                  .filter(cuad => cuadranteCounts[cuad] > 0)
                  .map(cuad => (
                    <option key={cuad} value={cuad}>
                      {cuad} ({cuadranteCounts[cuad]})
                    </option>
                  ));
              })()}
            </select>
          </div>

          <span className="text-gray-600">
            <strong>{productosFiltrados.length}</strong> de <strong>{productos.length}</strong> productos
          </span>
        </div>
      </div>

      {/* Tabla Extendida Mejorada */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {/* Selección */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>

              {/* Identificación */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[250px]">Producto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matriz</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cuad</th>

              {/* Promedios de Demanda */}
              <th colSpan={4} className="px-4 py-2 text-center text-xs font-semibold text-yellow-700 bg-yellow-50 uppercase tracking-wider border-l-2 border-yellow-200">
                Promedios Demanda (Bultos)
              </th>
              <th className="border-r-2 border-yellow-200 bg-yellow-50"></th>

              {/* Stocks */}
              <th colSpan={5} className="px-4 py-2 text-center text-xs font-semibold text-green-700 bg-green-50 uppercase tracking-wider border-l-2 border-green-200">
                Stock Detallado
              </th>
              <th className="border-r-2 border-green-200 bg-green-50"></th>

              {/* Parámetros de Reorden */}
              <th colSpan={4} className="px-4 py-2 text-center text-xs font-semibold text-purple-700 bg-purple-50 uppercase tracking-wider border-l-2 border-purple-200">
                Parámetros Reorden
              </th>
              <th className="border-r-2 border-purple-200 bg-purple-50"></th>

              {/* Sugerido y Pedir */}
              <th className="px-4 py-2 text-center text-xs font-semibold text-indigo-700 bg-indigo-50 uppercase tracking-wider border-l-2 border-indigo-200">Sugerido</th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-orange-700 bg-orange-50 uppercase tracking-wider">Pedir</th>
              <th className="border-r-2 border-orange-200 bg-orange-50"></th>

              {/* Peso y Notas */}
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l-2 border-gray-200">Peso</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[180px]">Notas</th>

              {/* Acciones */}
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
            <tr className="bg-gray-50">
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>

              {/* Subheaders Demanda */}
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-yellow-50">5D</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-yellow-50">20D</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-yellow-50">Mismo Día</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-yellow-50">Proyecc.</th>
              <th className="bg-yellow-50"></th>

              {/* Subheaders Stock */}
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-green-50">Stock</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-green-50">Tránsito</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-green-50">Total</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-green-50">Días</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-green-50">CEDI</th>
              <th className="bg-green-50"></th>

              {/* Subheaders Parámetros */}
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-purple-50">Min</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-purple-50">Seg.</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-purple-50">Reorden</th>
              <th className="px-2 py-2 text-right text-xs text-gray-600 bg-purple-50">Max</th>
              <th className="bg-purple-50"></th>

              <th className="bg-indigo-50"></th>
              <th className="bg-orange-50"></th>
              <th className="bg-orange-50"></th>

              <th className="px-2 py-2 text-xs text-gray-600">(KG)</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productosFiltrados.map((producto) => {
              const seleccionado = productosSeleccionados.has(producto.producto_id);
              const cantidadPedir = cantidadesPedir.get(producto.producto_id) ?? producto.cantidad_sugerida;
              const notasProducto = notas.get(producto.producto_id) || '';

              return (
                <tr
                  key={producto.producto_id}
                  className={`hover:bg-gray-50 transition-colors ${seleccionado ? 'bg-indigo-50' : ''}`}
                >
                  {/* Selección */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleSeleccion(producto.producto_id)}
                      className="text-gray-500 hover:text-indigo-600"
                    >
                      {seleccionado ? (
                        <svg className="h-5 w-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2"/>
                        </svg>
                      )}
                    </button>
                  </td>

                  {/* Identificación */}
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{producto.producto_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{producto.nombre_producto}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {esTop50(producto.producto_id) && (
                        <span className="text-amber-500" title="Top 50">🏆</span>
                      )}
                      <button
                        onClick={() => handleClickMatriz(producto)}
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                        title="Click para ver detalles de clasificación ABC-XYZ"
                      >
                        <MatrizABCXYZBadge matriz={producto.matriz_abc_xyz} size="sm" mostrarPrioridad={false} />
                      </button>
                    </div>
                  </td>

                  {/* Cuadrante */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded"
                      title={`Cuadrante: ${producto.cuadrante || 'NO ESPECIFICADO'}`}
                    >
                      {producto.cuadrante ? producto.cuadrante.replace('CUADRANTE ', '') : 'N/E'}
                    </span>
                  </td>

                  {/* Promedios de Demanda - con fondo amarillo */}
                  <td className="px-4 py-3 text-sm text-right text-gray-900 bg-yellow-50">{formatearNumero(producto.demanda_5_dias)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 bg-yellow-50">{formatearNumero(producto.demanda_20_dias)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 bg-yellow-50">{formatearNumero(producto.demanda_mismo_dia)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 bg-yellow-50">{formatearNumero(producto.demanda_proyeccion)}</td>
                  <td className="bg-yellow-50 border-r-2 border-yellow-200"></td>

                  {/* Stocks - con fondo verde */}
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 bg-green-50">{formatearNumero(producto.stock_actual)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 bg-green-50">{formatearNumero(producto.inventario_en_transito)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 bg-green-50">{formatearNumero(producto.stock_total)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-green-50">
                    {producto.dias_stock_actual === Infinity ? '∞' : producto.dias_stock_actual.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 bg-green-50">{formatearNumero(producto.stock_cedi)}</td>
                  <td className="bg-green-50 border-r-2 border-green-200"></td>

                  {/* Parámetros de Reorden - con fondo morado */}
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-purple-50">{formatearNumero(producto.stock_minimo)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 bg-purple-50">{formatearNumero(producto.stock_seguridad)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-purple-50">{formatearNumero(producto.punto_reorden)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-purple-50">{formatearNumero(producto.stock_maximo)}</td>
                  <td className="bg-purple-50 border-r-2 border-purple-200"></td>

                  {/* Sugerido - fondo índigo */}
                  <td className="px-4 py-3 text-sm text-right font-bold text-green-700 bg-indigo-50">
                    {formatearNumero(producto.cantidad_sugerida)}
                  </td>

                  {/* Campo Editable PEDIR - fondo naranja */}
                  <td className="px-4 py-3 bg-orange-50">
                    {seleccionado ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={cantidadPedir}
                          onChange={(e) => actualizarCantidadPedir(producto.producto_id, parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-sm text-right border-2 border-orange-300 rounded focus:ring-2 focus:ring-orange-500 font-bold text-orange-700"
                          min="0"
                        />
                        <span className="text-xs text-orange-600 font-medium whitespace-nowrap">
                          {producto.unidad_pedido || 'Bulto'}
                        </span>
                      </div>
                    ) : (
                      <span className="block text-center text-gray-400">-</span>
                    )}
                  </td>
                  <td className="bg-orange-50 border-r-2 border-orange-200"></td>

                  {/* Peso */}
                  <td className="px-4 py-3 text-sm text-right text-gray-600">
                    {(cantidadPedir * producto.peso_kg).toFixed(2)}
                  </td>

                  {/* Notas */}
                  <td className="px-4 py-3">
                    {seleccionado ? (
                      <input
                        type="text"
                        value={notasProducto}
                        onChange={(e) => actualizarNotas(producto.producto_id, e.target.value)}
                        placeholder="Agregar nota..."
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>

                  {/* Acciones */}
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
                <p className="text-sm text-indigo-700">Productos</p>
                <p className="text-2xl font-bold text-indigo-900">{totalSeleccionados}</p>
              </div>
              <div>
                <p className="text-sm text-indigo-700">Unidades</p>
                <p className="text-2xl font-bold text-indigo-900">{formatearNumero(totalUnidades)}</p>
              </div>
              <div>
                <p className="text-sm text-indigo-700">Peso Total</p>
                <p className="text-2xl font-bold text-indigo-900">{totalPeso.toFixed(2)} kg</p>
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
            desviacion_estandar_diaria: 0,
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
              nivel_servicio_z: 1.96,
              multiplicador_demanda: 1.0,
              multiplicador_ss: 1.0,
              timestamp: new Date().toISOString()
            }
          }}
        />
      )}

      {/* Modal de Clasificación ABC-XYZ */}
      {modalClasificacion.isOpen && modalClasificacion.producto && (
        <>
          {modalClasificacion.loading ? (
            // Modal de carga
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-2xl p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600 font-medium">Cargando datos de clasificación...</p>
                </div>
              </div>
            </div>
          ) : modalClasificacion.datosClasificacion ? (
            // Modal con datos
            <MatrizABCXYZExplicacionModal
              isOpen={true}
              onClose={handleCloseModalClasificacion}
              producto={{
                producto_id: modalClasificacion.producto.producto_id,
                nombre_producto: modalClasificacion.producto.nombre_producto,
                matriz_abc_xyz: modalClasificacion.producto.matriz_abc_xyz
              }}
              datosClasificacion={modalClasificacion.datosClasificacion}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
