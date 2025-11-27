import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import http from '../../services/http';
import { formatNumber, formatInteger } from '../../utils/formatNumber';
import ProductHistoryModal from './ProductHistoryModal';

interface StockItem {
  ubicacion_id: string;
  ubicacion_nombre: string;
  ubicacion_tipo: string;
  producto_id: string;
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string;
  marca: string | null;
  stock_actual: number | null;
  stock_minimo: number | null;
  stock_maximo: number | null;
  punto_reorden: number | null;
  precio_venta: number | null;
  cantidad_bultos: number | null;
  estado_stock: string;
  dias_cobertura_actual: number | null;
  es_producto_estrella: boolean;
  fecha_extraccion: string | null;
  peso_producto_kg: number | null;
  peso_total_kg: number | null;
}

interface PaginationMetadata {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
  stock_cero?: number;
  stock_negativo?: number;
}

interface PaginatedStockResponse {
  data: StockItem[];
  pagination: PaginationMetadata;
}

interface Ubicacion {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
}

interface StockStats {
  total_productos: number;
  stock_cero: number;
  stock_negativo: number;
}

export default function InventoryDashboard() {
  const { ubicacionId } = useParams<{ ubicacionId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const almacenParam = searchParams.get('almacen');

  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [stats, setStats] = useState<StockStats>({ total_productos: 0, stock_cero: 0, stock_negativo: 0 });
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationMetadata | null>(null);

  // Filtros
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>(ubicacionId || 'tienda_08');
  const [selectedAlmacen, _setSelectedAlmacen] = useState<string | null>(almacenParam);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);

  // Ordenamiento (por defecto ordenar por stock descendente)
  const [sortByStock, setSortByStock] = useState(true);
  const [sortOrderStock, setSortOrderStock] = useState<'asc' | 'desc'>('desc');
  const [sortByPeso, setSortByPeso] = useState(false);
  const [sortOrderPeso, setSortOrderPeso] = useState<'asc' | 'desc'>('desc');

  // Modal de histórico de inventario
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ codigo: string; descripcion: string } | null>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Cargar ubicaciones y categorías al inicio
  useEffect(() => {
    loadUbicaciones();
    loadCategorias();
  }, []);

  // Cargar stock cuando cambian los filtros o la página
  useEffect(() => {
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUbicacion, selectedAlmacen, selectedCategoria, currentPage, debouncedSearchTerm, sortByStock, sortOrderStock, sortByPeso, sortOrderPeso]);

  // Resetear a página 1 cuando cambian filtros (pero no cuando cambia el ordenamiento)
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUbicacion, selectedCategoria, debouncedSearchTerm]);

  const loadUbicaciones = async () => {
    try {
      const response = await http.get('/api/ubicaciones');
      setUbicaciones(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
    }
  };

  const loadCategorias = async () => {
    try {
      const response = await http.get('/api/categorias');
      setCategorias(response.data);
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }
  };

  const handleStockSort = () => {
    // Desactivar ordenamiento por peso
    setSortByPeso(false);

    if (sortByStock) {
      // Si ya estamos ordenando por stock, cambiar el orden
      setSortOrderStock(sortOrderStock === 'desc' ? 'asc' : 'desc');
    } else {
      // Activar ordenamiento por stock (empezar con mayor a menor)
      setSortByStock(true);
      setSortOrderStock('desc');
    }
    setCurrentPage(1); // Reset a página 1
  };

  const handlePesoSort = () => {
    // Desactivar ordenamiento por stock
    setSortByStock(false);

    if (sortByPeso) {
      // Si ya estamos ordenando por peso, cambiar el orden
      setSortOrderPeso(sortOrderPeso === 'desc' ? 'asc' : 'desc');
    } else {
      // Activar ordenamiento por peso (empezar con mayor a menor)
      setSortByPeso(true);
      setSortOrderPeso('desc');
    }
    setCurrentPage(1); // Reset a página 1
  };

  const loadStock = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: itemsPerPage,
      };

      if (selectedUbicacion !== 'all') {
        params.ubicacion_id = selectedUbicacion;
      }

      if (selectedAlmacen) {
        params.almacen_codigo = selectedAlmacen;
      }

      if (selectedCategoria !== 'all') {
        params.categoria = selectedCategoria;
      }

      if (debouncedSearchTerm) {
        params.search = debouncedSearchTerm;
      }

      // Ordenamiento
      if (sortByStock) {
        params.sort_by = 'stock';
        params.sort_order = sortOrderStock;
      } else if (sortByPeso) {
        params.sort_by = 'peso';
        params.sort_order = sortOrderPeso;
      }

      const response = await http.get('/api/stock', { params });
      const { data, pagination: paginationData } = response.data as PaginatedStockResponse;

      setStockData(data);
      setPagination(paginationData);

      // Usar estadísticas del backend (calculadas sobre todo el dataset filtrado)
      setStats({
        total_productos: paginationData.total_items,
        stock_cero: paginationData.stock_cero ?? 0,
        stock_negativo: paginationData.stock_negativo ?? 0,
      });

    } catch (error) {
      console.error('Error cargando stock:', error);
    } finally {
      setLoading(false);
    }
  };

  // Ya no necesitamos ordenamiento ni filtrado client-side
  // Todo se maneja en el servidor

  // Obtener fecha de última actualización (la más reciente de todos los registros)
  const getUltimaActualizacion = (): string => {
    if (stockData.length === 0) {
      return 'No disponible';
    }

    // Encontrar la fecha más reciente
    const fechasMasRecientes = stockData
      .map(item => item.fecha_extraccion)
      .filter(fecha => fecha !== null)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());

    if (fechasMasRecientes.length === 0) {
      return 'No disponible';
    }

    const fecha = new Date(fechasMasRecientes[0]!);
    return fecha.toLocaleString('es-VE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Botón de regreso */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
      >
        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al resumen
      </button>

      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de Inventarios</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visualiza el stock actual de productos por tienda y categoría
        </p>
      </div>

      {/* Métricas Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Productos</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{formatInteger(stats.total_productos)}</p>
            </div>
            <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Stock en Cero</p>
              <p className="mt-2 text-3xl font-semibold text-yellow-600">{formatInteger(stats.stock_cero)}</p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Stock Negativo</p>
              <p className="mt-2 text-3xl font-semibold text-red-600">{formatInteger(stats.stock_negativo)}</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="ubicacion" className="block text-sm font-medium text-gray-700 mb-2">
              Filtrar por Ubicación
            </label>
            <select
              id="ubicacion"
              value={selectedUbicacion}
              onChange={(e) => setSelectedUbicacion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="all">Todas las ubicaciones</option>
              {ubicaciones.map((ubicacion) => (
                <option key={ubicacion.id} value={ubicacion.id}>
                  {ubicacion.nombre} ({ubicacion.tipo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="categoria" className="block text-sm font-medium text-gray-700 mb-2">
              Filtrar por Categoría
            </label>
            <select
              id="categoria"
              value={selectedCategoria}
              onChange={(e) => setSelectedCategoria(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="all">Todas las categorías</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="buscar" className="block text-sm font-medium text-gray-700 mb-2">
              Buscar Producto
            </label>
            <div className="relative">
              <input
                type="text"
                id="buscar"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Código o descripción..."
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Última actualización */}
        {!loading && stockData.length > 0 && (
          <div className="mt-3 text-sm text-gray-600 flex items-center">
            <svg className="h-4 w-4 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Última actualización: <span className="font-medium text-gray-900">{getUltimaActualizacion()}</span></span>
          </div>
        )}
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Productos</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
            <p className="mt-4 text-sm text-gray-500">Cargando inventario...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleStockSort()}>
                    <div className="flex items-center justify-center space-x-1">
                      <span>Stock Actual</span>
                      {sortByStock && (
                        <span className="text-gray-900">
                          {sortOrderStock === 'desc' ? '↓' : '↑'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePesoSort()}>
                    <div className="flex items-center justify-center space-x-1">
                      <span>Peso Total</span>
                      {sortByPeso && (
                        <span className="text-gray-900">
                          {sortOrderPeso === 'desc' ? '↓' : '↑'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Histórico
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                      No se encontraron productos con los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  stockData.map((item) => (
                    <tr key={`${item.producto_id}-${item.ubicacion_id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-center">
                        {item.codigo_producto}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-center">
                        {item.descripcion_producto}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {item.categoria}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex flex-col items-center">
                          <div className="text-lg font-semibold text-gray-900">
                            {(() => {
                              const stockActual = item.stock_actual ?? 0;
                              const bultos = item.cantidad_bultos ?? 0;

                              if (bultos === 0 || bultos === null) {
                                return formatInteger(stockActual);
                              }

                              const stockBultos = stockActual / bultos;
                              return formatNumber(stockBultos, 2);
                            })()}
                          </div>
                          <div className="text-xs text-gray-500">
                            ({formatInteger(item.stock_actual)} unid)
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {item.peso_total_kg !== null && item.peso_total_kg !== undefined ? (
                          <div className="flex flex-col items-center">
                            <div className="text-lg font-semibold text-gray-900">
                              {formatNumber(item.peso_total_kg, 2)} kg
                            </div>
                            <div className="text-xs text-gray-500">
                              ({formatNumber(item.peso_total_kg / 1000, 2)} ton)
                            </div>
                          </div>
                        ) : (
                          <div className="text-lg font-semibold text-gray-500">-</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => {
                            setSelectedProduct({
                              codigo: item.codigo_producto,
                              descripcion: item.descripcion_producto
                            });
                            setShowHistoryModal(true);
                          }}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!loading && pagination && stockData.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> a{' '}
              <span className="font-medium">{Math.min(currentPage * itemsPerPage, pagination.total_items)}</span> de{' '}
              <span className="font-medium">{formatInteger(pagination.total_items)}</span> productos
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={!pagination.has_previous}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-700">
                Página {pagination.current_page} de {formatInteger(pagination.total_pages)}
              </span>
              <button
                onClick={() => setCurrentPage(prev => prev + 1)}
                disabled={!pagination.has_next}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Histórico de Inventario */}
      {selectedProduct && (
        <ProductHistoryModal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedProduct(null);
          }}
          codigoProducto={selectedProduct.codigo}
          descripcionProducto={selectedProduct.descripcion}
          ubicacionId={selectedUbicacion}
          almacenCodigo={selectedAlmacen || undefined}
        />
      )}
    </div>
  );
}
