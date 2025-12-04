import React, { useState, useEffect, useCallback } from 'react';
import {
  getMatrizABCXYZ,
  getProductosPorMatriz,
  MatrizABCXYZ as MatrizData,
  ProductoEnriquecido,
  formatPercentageValue,
} from '../../services/productosService';
// Nota: ubicaciones ya no se usan porque la cache ABC es global
import MatrizABCXYZ from './MatrizABCXYZ';
import ProductoDetalleModal from './ProductoDetalleModal';
import ABCDistributionChart from './charts/ABCDistributionChart';
import XYZDistributionChart from './charts/XYZDistributionChart';
import { isXYZEnabled } from '../../config/featureFlags';

const ABCXYZAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(true);
  // La cache ABC es global, no se filtra por ubicacion
  const [matrizData, setMatrizData] = useState<MatrizData | null>(null);
  const [selectedMatriz, setSelectedMatriz] = useState<string>('');
  const [selectedABC, setSelectedABC] = useState<string>(''); // Filtro por clase ABC (A, B, C)
  const [productos, setProductos] = useState<ProductoEnriquecido[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'ranking' | 'stock' | 'abc' | 'xyz'>('ranking');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Cache es global, no se pasa ubicacion
      const matriz = await getMatrizABCXYZ();
      setMatrizData(matriz);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cargar TODOS los productos al montar el componente
  useEffect(() => {
    const loadAllProducts = async () => {
      setLoadingProductos(true);
      try {
        // Sin matriz = todos los productos (cache global)
        const data = await getProductosPorMatriz(undefined, undefined, 10000, 0);
        setProductos(data);
        setHasMoreProducts(data.length >= 10000);
      } catch (error) {
        console.error('Error loading all productos:', error);
      } finally {
        setLoadingProductos(false);
      }
    };
    loadAllProducts();
  }, []);

  const handleMatrizClick = async (matriz: string) => {
    setSelectedMatriz(matriz);
    setLoadingProductos(true);
    try {
      // Load with high limit to get all products (cache global)
      const data = await getProductosPorMatriz(matriz, undefined, 10000, 0);
      setProductos(data);
      setHasMoreProducts(data.length >= 10000);
      // Reset sort to default when loading new data
      setSortBy('ranking');
      setSortOrder('asc');
    } catch (error) {
      console.error('Error loading productos:', error);
    } finally {
      setLoadingProductos(false);
    }
  };

  const loadMoreProducts = async () => {
    if (!selectedMatriz || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const data = await getProductosPorMatriz(
        selectedMatriz,
        undefined, // cache global
        10000,
        productos.length
      );
      setProductos([...productos, ...data]);
      setHasMoreProducts(data.length >= 10000);
    } catch (error) {
      console.error('Error loading more productos:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSort = (column: 'ranking' | 'stock' | 'abc' | 'xyz') => {
    if (sortBy === column) {
      // Toggle sort order if clicking same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column with default descending order for abc/xyz (higher values first)
      setSortBy(column);
      setSortOrder(column === 'abc' || column === 'xyz' ? 'desc' : 'asc');
    }
  };

  // Handler para click en clase ABC
  const handleABCClick = (clase: string) => {
    // Si ya está seleccionada, deseleccionar (mostrar todos)
    if (selectedABC === clase) {
      setSelectedABC('');
    } else {
      setSelectedABC(clase);
    }
    // Limpiar selección de matriz completa si existía
    setSelectedMatriz('');
  };

  // Filter and sort productos based on search term, ABC filter, and sort settings
  const filteredAndSortedProductos = React.useMemo(() => {
    let filtered = productos;

    // Filter by selected ABC class
    if (selectedABC) {
      filtered = filtered.filter(p => p.clasificacion_abc === selectedABC);
    }

    // Filter by selected matriz (for when XYZ is enabled)
    if (selectedMatriz) {
      filtered = filtered.filter(p =>
        p.clasificacion_abc === selectedMatriz[0] &&
        p.clasificacion_xyz === selectedMatriz[1]
      );
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.codigo_producto.toLowerCase().includes(term) ||
        p.descripcion.toLowerCase().includes(term)
      );
    }

    // Then sort
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'ranking') {
        comparison = a.ranking_valor - b.ranking_valor;
      } else if (sortBy === 'stock') {
        comparison = a.stock_actual - b.stock_actual;
      } else if (sortBy === 'abc') {
        comparison = a.porcentaje_valor - b.porcentaje_valor;
      } else if (sortBy === 'xyz') {
        const aCV = a.coeficiente_variacion ?? Infinity;
        const bCV = b.coeficiente_variacion ?? Infinity;
        comparison = aCV - bCV;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [productos, sortBy, sortOrder, searchTerm, selectedABC, selectedMatriz]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con info de periodo - Cache global */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Clasificación ABC Global</h2>
              <p className="text-sm text-gray-500">Últimos 30 días - Todas las tiendas consolidado</p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            🔄 Refrescar
          </button>
        </div>
      </div>

      {/* Resumen ABC (y XYZ si está habilitado) */}
      {matrizData && (
        <div className={`grid grid-cols-1 ${isXYZEnabled() ? 'md:grid-cols-2' : ''} gap-6`}>
          {/* Resumen ABC (Tabla Pareto) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Resumen ABC (Pareto)</h2>
              <p className="text-xs text-gray-500 mt-1">Análisis por valor</p>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clase</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Productos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Productos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Valor</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(matrizData.resumen_abc).map(([clase, data]) => (
                  <tr
                    key={clase}
                    onClick={() => handleABCClick(clase)}
                    className={`cursor-pointer transition-all hover:bg-gray-50 ${
                      selectedABC === clase ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        clase === 'A' ? 'bg-red-100 text-red-800' :
                        clase === 'B' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {clase}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {data.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {data.porcentaje_productos.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {data.porcentaje_valor.toFixed(1)}%
                      {clase === 'A' && data.porcentaje_valor >= 70 && ' ✓'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
              <p className="text-sm text-blue-800 flex items-center gap-2">
                💡 Solo el {matrizData.resumen_abc.A?.porcentaje_productos.toFixed(1)}% de tus productos generan el {matrizData.resumen_abc.A?.porcentaje_valor.toFixed(1)}% del valor
              </p>
            </div>
            {/* Chart ABC */}
            <div className="px-6 py-6 border-t border-gray-200">
              <ABCDistributionChart resumenABC={matrizData.resumen_abc} />
            </div>
          </div>

          {/* Resumen XYZ (Variabilidad) - Solo si está habilitado */}
          {isXYZEnabled() && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Resumen XYZ (Variabilidad)</h2>
                <p className="text-xs text-gray-500 mt-1">Análisis por estabilidad de demanda</p>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clase</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Productos</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Productos</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(matrizData.resumen_xyz).map(([clase, data]) => (
                    <tr key={clase}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          clase === 'X' ? 'bg-green-100 text-green-800' :
                          clase === 'Y' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {clase}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {data.count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {data.porcentaje_productos.toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {clase === 'X' && 'Demanda estable (CV < 0.5)'}
                        {clase === 'Y' && 'Demanda variable (0.5 ≤ CV < 1.0)'}
                        {clase === 'Z' && 'Demanda errática (CV ≥ 1.0)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-6 py-4 bg-green-50 border-t border-green-100">
                <p className="text-sm text-green-800 flex items-center gap-2">
                  💡 {matrizData.resumen_xyz.X?.porcentaje_productos.toFixed(1)}% de tus productos tienen demanda estable y predecible
                </p>
              </div>
              {/* Chart XYZ */}
              <div className="px-6 py-6 border-t border-gray-200">
                <XYZDistributionChart resumenXYZ={matrizData.resumen_xyz} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Matriz ABC-XYZ - Solo si XYZ está habilitado */}
      {matrizData && isXYZEnabled() && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Matriz ABC × XYZ</h2>
          <MatrizABCXYZ
            data={matrizData.matriz}
            onCellClick={handleMatrizClick}
            selectedCell={selectedMatriz}
          />
        </div>
      )}

      {/* Lista de Productos */}
      {productos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedABC
                    ? `Productos Clase ${selectedABC}`
                    : selectedMatriz
                      ? `Productos en clasificación: ${selectedMatriz}`
                      : 'Todos los productos'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Mostrando {filteredAndSortedProductos.length} de {productos.length} productos
                  {selectedABC && (
                    <button
                      onClick={() => setSelectedABC('')}
                      className="ml-2 text-blue-600 hover:text-blue-800 underline"
                    >
                      Ver todos
                    </button>
                  )}
                </p>
              </div>
            </div>

            {/* Buscador */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Código o descripción..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {loadingProductos ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : productos.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('abc')}
                  >
                    <div className="flex items-center gap-1">
                      ABC
                      {sortBy === 'abc' && (
                        <span className="text-blue-600">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  {isXYZEnabled() && (
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('xyz')}
                    >
                      <div className="flex items-center gap-1">
                        XYZ
                        {sortBy === 'xyz' && (
                          <span className="text-blue-600">
                            {sortOrder === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  )}
                  {/* Siempre mostrar - cache global */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tiendas
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('ranking')}
                  >
                    <div className="flex items-center gap-1">
                      Ranking
                      {sortBy === 'ranking' && (
                        <span className="text-blue-600">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('stock')}
                  >
                    <div className="flex items-center gap-1">
                      Stock
                      {sortBy === 'stock' && (
                        <span className="text-blue-600">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedProductos.map((producto, index) => (
                  <tr
                    key={producto.codigo_producto}
                    onClick={() => setSelectedProducto(producto.codigo_producto)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {producto.codigo_producto}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {producto.descripcion}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {producto.categoria}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        producto.clasificacion_abc === 'A' ? 'bg-red-100 text-red-800' :
                        producto.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800' :
                        producto.clasificacion_abc === 'C' ? 'bg-gray-100 text-gray-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {producto.clasificacion_abc === 'SIN_VENTAS' ? 'Sin ventas' : producto.clasificacion_abc} {producto.clasificacion_abc !== 'SIN_VENTAS' && `(${formatPercentageValue(producto.porcentaje_valor)})`}
                      </span>
                    </td>
                    {isXYZEnabled() && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          producto.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800' :
                          producto.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {producto.clasificacion_xyz} ({producto.coeficiente_variacion !== null ? producto.coeficiente_variacion.toFixed(2) : 'Sin datos'})
                        </span>
                      </td>
                    )}
                    {/* Siempre mostrar - cache global */}
                    {producto.porcentaje_tiendas !== undefined && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col">
                          <span className={`font-medium ${
                            producto.porcentaje_tiendas >= 80 ? 'text-green-700' :
                            producto.porcentaje_tiendas >= 50 ? 'text-yellow-700' :
                            'text-gray-600'
                          }`}>
                            {producto.porcentaje_tiendas.toFixed(0)}%
                          </span>
                          <span className="text-xs text-gray-500">
                            {producto.tiendas_con_clasificacion}/{producto.total_tiendas}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      #{producto.ranking_valor}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {producto.stock_actual.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              No hay productos en esta clasificación
            </div>
          )}

          {/* Load More Button */}
          {productos.length > 0 && hasMoreProducts && (
            <div className="px-6 py-4 border-t border-gray-200 flex justify-center">
              <button
                onClick={loadMoreProducts}
                disabled={isLoadingMore}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Cargando...
                  </>
                ) : (
                  `Cargar más productos (mostrando ${productos.length})`
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Producto Detalle */}
      {selectedProducto && (
        <ProductoDetalleModal
          isOpen={!!selectedProducto}
          onClose={() => setSelectedProducto(null)}
          codigo={selectedProducto}
        />
      )}
    </div>
  );
};

export default ABCXYZAnalysis;
