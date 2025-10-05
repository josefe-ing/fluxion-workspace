import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import http from '../../services/http';

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

  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [stats, setStats] = useState<StockStats>({ total_productos: 0, stock_cero: 0, stock_negativo: 0 });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>(ubicacionId || 'tienda_08');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  // Ordenamiento
  const [sortBy, setSortBy] = useState<'stock' | 'estado' | 'categoria' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Cargar ubicaciones y categorías al inicio
  useEffect(() => {
    loadUbicaciones();
    loadCategorias();
  }, []);

  // Cargar stock cuando cambian los filtros
  useEffect(() => {
    loadStock();
    setCurrentPage(1); // Resetear a página 1 cuando cambian los filtros
  }, [selectedUbicacion, selectedCategoria]);

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

  const loadStock = async () => {
    setLoading(true);
    try {
      const params: any = {};

      if (selectedUbicacion !== 'all') {
        params.ubicacion_id = selectedUbicacion;
      }

      if (selectedCategoria !== 'all') {
        params.categoria = selectedCategoria;
      }

      const response = await http.get('/api/stock', { params });
      const data: StockItem[] = response.data;
      setStockData(data);

      // Calcular estadísticas
      const total = data.length;
      const cero = data.filter((item) => item.stock_actual === 0).length;
      const negativo = data.filter((item) => item.stock_actual !== null && item.stock_actual < 0).length;

      setStats({
        total_productos: total,
        stock_cero: cero,
        stock_negativo: negativo,
      });

    } catch (error) {
      console.error('Error cargando stock:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función de ordenamiento
  const handleSort = (column: 'stock' | 'estado' | 'categoria') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Resetear a página 1
  };

  // Aplicar filtro de búsqueda
  const filteredData = stockData.filter(item => {
    if (!searchTerm) return true;

    const search = searchTerm.toLowerCase();
    const codigo = (item.codigo_producto || '').toLowerCase();
    const descripcion = (item.descripcion_producto || '').toLowerCase();

    return codigo.includes(search) || descripcion.includes(search);
  });

  // Aplicar ordenamiento
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortBy) return 0;

    let comparison = 0;

    if (sortBy === 'stock') {
      const aStock = a.stock_actual ?? 0;
      const bStock = b.stock_actual ?? 0;
      comparison = aStock - bStock;
    } else if (sortBy === 'estado') {
      const estadoOrder: { [key: string]: number } = {
        'CRITICO': 1,
        'SIN_STOCK': 2,
        'BAJO': 3,
        'NORMAL': 4,
        'EXCESO': 5
      };
      comparison = (estadoOrder[a.estado_stock] || 99) - (estadoOrder[b.estado_stock] || 99);
    } else if (sortBy === 'categoria') {
      comparison = (a.categoria || '').localeCompare(b.categoria || '');
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Cálculos de paginación
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = sortedData.slice(startIndex, endIndex);

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
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.total_productos}</p>
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
              <p className="mt-2 text-3xl font-semibold text-yellow-600">{stats.stock_cero}</p>
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
              <p className="mt-2 text-3xl font-semibold text-red-600">{stats.stock_negativo}</p>
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
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); // Reset to page 1 on search
                }}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('categoria')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Categoría</span>
                      {sortBy === 'categoria' && (
                        <span className="text-gray-900">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ubicación
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('stock')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Stock Actual</span>
                      {sortBy === 'stock' && (
                        <span className="text-gray-900">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock Bultos
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('estado')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Estado</span>
                      {sortBy === 'estado' && (
                        <span className="text-gray-900">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      No se encontraron productos con los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item) => (
                    <tr key={`${item.producto_id}-${item.ubicacion_id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.codigo_producto}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.descripcion_producto}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.categoria}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <div className="font-medium text-gray-900">{item.ubicacion_nombre}</div>
                          <div className="text-xs text-gray-500">{item.ubicacion_tipo}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          item.stock_actual === null || item.stock_actual < 0
                            ? 'bg-red-100 text-red-800'
                            : item.stock_actual === 0
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {(item.stock_actual ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                        {(() => {
                          const stockActual = item.stock_actual ?? 0;
                          const bultos = item.cantidad_bultos ?? 0;

                          if (bultos === 0 || bultos === null) {
                            return '-';
                          }

                          const stockBultos = stockActual / bultos;
                          return stockBultos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          item.estado_stock === 'CRITICO' || item.estado_stock === 'SIN_STOCK'
                            ? 'bg-red-100 text-red-800'
                            : item.estado_stock === 'BAJO'
                            ? 'bg-yellow-100 text-yellow-800'
                            : item.estado_stock === 'EXCESO'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {item.estado_stock}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!loading && stockData.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Mostrando <span className="font-medium">{startIndex + 1}</span> a{' '}
              <span className="font-medium">{Math.min(endIndex, stockData.length)}</span> de{' '}
              <span className="font-medium">{stockData.length}</span> productos
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-700">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
