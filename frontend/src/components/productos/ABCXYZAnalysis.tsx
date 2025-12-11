import React, { useState, useEffect, useCallback } from 'react';
import {
  getMatrizABCXYZ,
  getProductosPorMatriz,
  MatrizABCXYZ as MatrizData,
  ProductoEnriquecido,
  formatNumber,
} from '../../services/productosService';
import { getUbicaciones, Ubicacion } from '../../services/ubicacionesService';
import MatrizABCXYZ from './MatrizABCXYZ';
import ProductoDetalleModal from './ProductoDetalleModal';
import ABCDistributionChart from './charts/ABCDistributionChart';
import XYZDistributionChart from './charts/XYZDistributionChart';
import { isXYZEnabled } from '../../config/featureFlags';

const ABCXYZAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [matrizData, setMatrizData] = useState<MatrizData | null>(null);
  const [selectedMatriz, setSelectedMatriz] = useState<string>('');
  const [selectedABC, setSelectedABC] = useState<string>(''); // Filtro por clase ABC (A, B, C, D)
  const [productos, setProductos] = useState<ProductoEnriquecido[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'ranking' | 'stock' | 'abc' | 'xyz'>('ranking');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Nuevos estados para selector de tienda
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>('todas');

  // Cargar ubicaciones al inicio
  useEffect(() => {
    const loadUbicaciones = async () => {
      try {
        const data = await getUbicaciones('tienda');
        setUbicaciones(data);
      } catch (error) {
        console.error('Error loading ubicaciones:', error);
      }
    };
    loadUbicaciones();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
      const matriz = await getMatrizABCXYZ(ubicacionParam);
      setMatrizData(matriz);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUbicacion]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cargar productos cuando cambia la ubicación o se monta
  useEffect(() => {
    const loadAllProducts = async () => {
      setLoadingProductos(true);
      try {
        const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
        const data = await getProductosPorMatriz(undefined, ubicacionParam, 10000, 0);
        setProductos(data);
        setHasMoreProducts(data.length >= 10000);
        // Reset filters when location changes
        setSelectedABC('');
        setSelectedMatriz('');
      } catch (error) {
        console.error('Error loading all productos:', error);
      } finally {
        setLoadingProductos(false);
      }
    };
    loadAllProducts();
  }, [selectedUbicacion]);

  const handleMatrizClick = async (matriz: string) => {
    setSelectedMatriz(matriz);
    setSelectedABC('');
    setLoadingProductos(true);
    try {
      const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
      const data = await getProductosPorMatriz(matriz, ubicacionParam, 10000, 0);
      setProductos(data);
      setHasMoreProducts(data.length >= 10000);
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
      const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
      const data = await getProductosPorMatriz(
        selectedMatriz,
        ubicacionParam,
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
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'abc' || column === 'xyz' ? 'desc' : 'asc');
    }
  };

  // Handler para click en clase ABC (A, B, C, D)
  const handleABCClick = async (clase: string) => {
    if (selectedABC === clase) {
      setSelectedABC('');
      // Recargar todos los productos
      setLoadingProductos(true);
      try {
        const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
        const data = await getProductosPorMatriz(undefined, ubicacionParam, 10000, 0);
        setProductos(data);
        setHasMoreProducts(data.length >= 10000);
      } catch (error) {
        console.error('Error loading productos:', error);
      } finally {
        setLoadingProductos(false);
      }
    } else {
      setSelectedABC(clase);
      setSelectedMatriz('');
      // Cargar productos filtrados por clase
      setLoadingProductos(true);
      try {
        const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
        const data = await getProductosPorMatriz(clase, ubicacionParam, 10000, 0);
        setProductos(data);
        setHasMoreProducts(data.length >= 10000);
      } catch (error) {
        console.error('Error loading productos:', error);
      } finally {
        setLoadingProductos(false);
      }
    }
  };

  // Filter and sort productos based on search term, ABC filter, and sort settings
  const filteredAndSortedProductos = React.useMemo(() => {
    let filtered = productos;

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
  }, [productos, sortBy, sortOrder, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const ubicacionNombre = selectedUbicacion === 'todas'
    ? 'Todas las tiendas'
    : ubicaciones.find(u => u.id === selectedUbicacion)?.nombre || selectedUbicacion;

  return (
    <div className="space-y-6">
      {/* Header con selector de tienda */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Clasificación ABC</h2>
              <p className="text-sm text-gray-500">Últimos 30 días - {ubicacionNombre}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Selector de tienda */}
            <div className="flex items-center gap-2">
              <label htmlFor="ubicacion-select" className="text-sm text-gray-600">
                Tienda:
              </label>
              <select
                id="ubicacion-select"
                value={selectedUbicacion}
                onChange={(e) => setSelectedUbicacion(e.target.value)}
                className="block w-48 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="todas">Global (todas)</option>
                {ubicaciones.map((ub) => (
                  <option key={ub.id} value={ub.id}>
                    {ub.nombre}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={loadData}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2"
            >
              🔄 Refrescar
            </button>
          </div>
        </div>
      </div>

      {/* Resumen ABC (y XYZ si está habilitado) */}
      {matrizData && (
        <div className={`grid grid-cols-1 ${isXYZEnabled() ? 'md:grid-cols-2' : ''} gap-6`}>
          {/* Resumen ABC (Ranking por Cantidad) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Clasificación ABC</h2>
              <p className="text-xs text-gray-500 mt-1">Ranking por cantidad vendida (30 días)</p>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clase</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ranking</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Productos</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Productos</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Valor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unidades Vendidas</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Clases A, B, C, D */}
                {Object.entries(matrizData.resumen_abc).map(([clase, data]) => (
                  <tr
                    key={clase}
                    onClick={() => handleABCClick(clase)}
                    className={`cursor-pointer transition-all hover:bg-gray-50 ${
                      selectedABC === clase ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        clase === 'A' ? 'bg-green-100 text-green-800' :
                        clase === 'B' ? 'bg-yellow-100 text-yellow-800' :
                        clase === 'C' ? 'bg-orange-100 text-orange-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {clase}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {data.descripcion || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(data.count)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {data.porcentaje_productos.toFixed(1)}%
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {data.porcentaje_valor.toFixed(1)}%
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(data.total_cantidad || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
              <p className="text-sm text-blue-800 flex items-center gap-2">
                💡 Los productos Clase A (Top {matrizData.umbrales?.umbral_a || 50}) son los de mayor rotación
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
                  {(selectedABC || selectedMatriz) && (
                    <button
                      onClick={() => {
                        setSelectedABC('');
                        setSelectedMatriz('');
                        // Reload all products
                        const loadAll = async () => {
                          setLoadingProductos(true);
                          try {
                            const ubicacionParam = selectedUbicacion === 'todas' ? undefined : selectedUbicacion;
                            const data = await getProductosPorMatriz(undefined, ubicacionParam, 10000, 0);
                            setProductos(data);
                            setHasMoreProducts(data.length >= 10000);
                          } catch (error) {
                            console.error('Error loading productos:', error);
                          } finally {
                            setLoadingProductos(false);
                          }
                        };
                        loadAll();
                      }}
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                    <th
                      className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
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
                        className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
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
                    {selectedUbicacion === 'todas' && (
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Tiendas
                      </th>
                    )}
                    <th
                      className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
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
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase" title="Unidades vendidas en los últimos 30 días">
                      Cant. 30d
                    </th>
                    <th
                      className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
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
                      <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {producto.codigo_producto}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-900 max-w-xs truncate">
                        {producto.descripcion}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {producto.categoria}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          producto.clasificacion_abc === 'A' ? 'bg-green-100 text-green-800' :
                          producto.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800' :
                          producto.clasificacion_abc === 'C' ? 'bg-orange-100 text-orange-800' :
                          producto.clasificacion_abc === 'D' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {producto.clasificacion_abc === 'SIN_VENTAS' ? 'Sin ventas' : producto.clasificacion_abc}
                        </span>
                      </td>
                      {isXYZEnabled() && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            producto.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800' :
                            producto.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {producto.clasificacion_xyz} ({producto.coeficiente_variacion !== null ? producto.coeficiente_variacion.toFixed(2) : 'Sin datos'})
                          </span>
                        </td>
                      )}
                      {selectedUbicacion === 'todas' && (
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          {producto.porcentaje_tiendas !== undefined ? (
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
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        #{producto.ranking_valor}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900" title="Unidades vendidas en 30 días">
                        {producto.cantidad_30d !== undefined && producto.cantidad_30d > 0
                          ? formatNumber(Math.round(producto.cantidad_30d))
                          : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {producto.stock_actual.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
