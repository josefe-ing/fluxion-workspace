/**
 * ABCXYZFullAnalysis - Componente wrapper que habilita el analisis XYZ completo
 *
 * Este componente usa el mismo ABCXYZAnalysis pero con XYZ habilitado,
 * mostrando la matriz 3x3 completa con clasificacion de variabilidad.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  getMatrizABCXYZ,
  getProductosPorMatriz,
  MatrizABCXYZ as MatrizData,
  ProductoEnriquecido,
  formatPercentageValue,
  getColorMatriz,
  getDescripcionMatriz,
  getEstrategiaMatriz,
  getIconoMatriz,
} from '../../services/productosService';
import { getTiendas, Ubicacion } from '../../services/ubicacionesService';
import MatrizABCXYZ from './MatrizABCXYZ';
import ProductoDetalleModal from './ProductoDetalleModal';
import ABCDistributionChart from './charts/ABCDistributionChart';
import XYZDistributionChart from './charts/XYZDistributionChart';

const ABCXYZFullAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [matrizData, setMatrizData] = useState<MatrizData | null>(null);
  const [selectedMatriz, setSelectedMatriz] = useState<string>('');
  const [selectedABC, setSelectedABC] = useState<string>('');
  const [productos, setProductos] = useState<ProductoEnriquecido[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'ranking' | 'stock' | 'abc' | 'xyz'>('ranking');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Estado para selector de tienda
  const [tiendas, setTiendas] = useState<Ubicacion[]>([]);
  const [selectedTienda, setSelectedTienda] = useState<string>('');

  // Cargar lista de tiendas al montar
  useEffect(() => {
    const loadTiendas = async () => {
      try {
        const data = await getTiendas();
        setTiendas(data);
        // Por defecto seleccionar la primera tienda
        if (data.length > 0) {
          setSelectedTienda(data[0].id);
        }
      } catch (error) {
        console.error('Error loading tiendas:', error);
      }
    };
    loadTiendas();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Pasar ubicacion_id al endpoint (vacío = global)
      const matriz = await getMatrizABCXYZ(selectedTienda || undefined);
      setMatrizData(matriz);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedTienda]);

  // Recargar datos cuando cambia la tienda seleccionada
  useEffect(() => {
    if (selectedTienda !== undefined) {
      loadData();
    }
  }, [selectedTienda, loadData]);

  // Cargar productos cuando cambia la tienda seleccionada
  useEffect(() => {
    const loadAllProducts = async () => {
      setLoadingProductos(true);
      setSelectedMatriz(''); // Limpiar filtro de matriz al cambiar tienda
      try {
        const data = await getProductosPorMatriz(undefined, selectedTienda || undefined, 10000, 0);
        setProductos(data);
        setHasMoreProducts(data.length >= 10000);
      } catch (error) {
        console.error('Error loading all productos:', error);
      } finally {
        setLoadingProductos(false);
      }
    };
    if (selectedTienda !== undefined) {
      loadAllProducts();
    }
  }, [selectedTienda]);

  const handleMatrizClick = async (matriz: string) => {
    setSelectedMatriz(matriz);
    setLoadingProductos(true);
    try {
      const data = await getProductosPorMatriz(matriz, selectedTienda || undefined, 10000, 0);
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

  const handleClearMatrizFilter = async () => {
    setSelectedMatriz('');
    setLoadingProductos(true);
    try {
      const data = await getProductosPorMatriz(undefined, selectedTienda || undefined, 10000, 0);
      setProductos(data);
      setHasMoreProducts(data.length >= 10000);
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
        selectedTienda || undefined,
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
      setSortOrder('asc');
    }
  };

  // Filter and sort products
  const filteredAndSortedProducts = React.useMemo(() => {
    let result = [...productos];

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.codigo_producto.toLowerCase().includes(term) ||
        p.descripcion.toLowerCase().includes(term)
      );
    }

    // Filter by ABC class
    if (selectedABC) {
      result = result.filter(p => p.clasificacion_abc === selectedABC);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'ranking':
          comparison = a.ranking_valor - b.ranking_valor;
          break;
        case 'stock':
          comparison = a.stock_actual - b.stock_actual;
          break;
        case 'abc':
          comparison = a.clasificacion_abc.localeCompare(b.clasificacion_abc);
          break;
        case 'xyz':
          comparison = (a.clasificacion_xyz || 'Z').localeCompare(b.clasificacion_xyz || 'Z');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [productos, searchTerm, selectedABC, sortBy, sortOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔬</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Matriz ABC-XYZ Completa</h2>
              <p className="text-sm text-gray-500">
                Clasificacion por valor (ABC) y variabilidad de demanda (XYZ) - Ultimos 30 dias
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Selector de Tienda */}
            <div className="flex items-center gap-2">
              <label htmlFor="tienda-select" className="text-sm font-medium text-gray-700">
                Tienda:
              </label>
              <select
                id="tienda-select"
                value={selectedTienda}
                onChange={(e) => setSelectedTienda(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas (Global)</option>
                {tiendas.map((tienda) => (
                  <option key={tienda.id} value={tienda.id}>
                    {tienda.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadData}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2"
            >
              Refrescar
            </button>
          </div>
        </div>
        {/* Indicador de tienda seleccionada */}
        {selectedTienda && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Analizando:</span>
              <span className="font-medium text-blue-600">
                {tiendas.find(t => t.id === selectedTienda)?.nombre || selectedTienda}
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">
                ABC y XYZ calculados especificamente para esta tienda
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Resumen ABC y XYZ */}
      {matrizData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Resumen ABC */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribucion ABC (Valor)</h3>
            <ABCDistributionChart resumenABC={matrizData.resumen_abc} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="font-bold text-red-600">{matrizData.resumen_abc?.A?.count || 0}</div>
                <div className="text-gray-500">Clase A (80%)</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-yellow-600">{matrizData.resumen_abc?.B?.count || 0}</div>
                <div className="text-gray-500">Clase B (15%)</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-gray-600">{matrizData.resumen_abc?.C?.count || 0}</div>
                <div className="text-gray-500">Clase C (5%)</div>
              </div>
            </div>
          </div>

          {/* Resumen XYZ */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribucion XYZ (Variabilidad)</h3>
            <XYZDistributionChart resumenXYZ={matrizData.resumen_xyz} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="font-bold text-green-600">{matrizData.resumen_xyz?.X?.count || 0}</div>
                <div className="text-gray-500">X (Estable)</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-blue-600">{matrizData.resumen_xyz?.Y?.count || 0}</div>
                <div className="text-gray-500">Y (Variable)</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-red-600">{matrizData.resumen_xyz?.Z?.count || 0}</div>
                <div className="text-gray-500">Z (Erratico)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matriz 3x3 */}
      {matrizData && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Matriz ABC-XYZ (9 cuadrantes)</h3>
          <MatrizABCXYZ
            data={matrizData.matriz}
            selectedCell={selectedMatriz}
            onCellClick={handleMatrizClick}
          />
          {selectedMatriz && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{getIconoMatriz(selectedMatriz)} {selectedMatriz}</span>
                  <span className="text-sm text-gray-600 ml-2">{getDescripcionMatriz(selectedMatriz)}</span>
                </div>
                <button
                  onClick={handleClearMatrizFilter}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Limpiar filtro
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">{getEstrategiaMatriz(selectedMatriz)}</p>
            </div>
          )}
        </div>
      )}

      {/* Filtros y busqueda */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar por codigo o descripcion..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Filtrar ABC:</label>
            <select
              value={selectedABC}
              onChange={(e) => setSelectedABC(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              <option value="A">Clase A</option>
              <option value="B">Clase B</option>
              <option value="C">Clase C</option>
            </select>
          </div>
          <div className="text-sm text-gray-500">
            {filteredAndSortedProducts.length} productos
          </div>
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Producto
                </th>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Matriz
                </th>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  % Valor
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingProductos ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredAndSortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron productos
                  </td>
                </tr>
              ) : (
                filteredAndSortedProducts.slice(0, 100).map((producto) => (
                  <tr
                    key={producto.codigo_producto}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedProducto(producto.codigo_producto)}
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {producto.codigo_producto}
                      </div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {producto.descripcion}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                        producto.clasificacion_abc === 'A' ? 'bg-red-100 text-red-800 border-red-300' :
                        producto.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                        'bg-gray-100 text-gray-800 border-gray-300'
                      }`}>
                        {producto.clasificacion_abc}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                        producto.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800 border-green-300' :
                        producto.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                        'bg-red-100 text-red-800 border-red-300'
                      }`}>
                        {producto.clasificacion_xyz || '-'}
                        {producto.coeficiente_variacion !== null && (
                          <span className="ml-1 text-gray-500">({producto.coeficiente_variacion.toFixed(2)})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded border ${getColorMatriz(producto.matriz)}`}>
                        {getIconoMatriz(producto.matriz)} {producto.matriz}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {producto.porcentaje_tiendas !== undefined && (
                        <span className={`font-medium ${
                          producto.porcentaje_tiendas >= 80 ? 'text-green-700' :
                          producto.porcentaje_tiendas >= 50 ? 'text-yellow-700' :
                          'text-gray-600'
                        }`}>
                          {producto.porcentaje_tiendas.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      #{producto.ranking_valor}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatPercentageValue(producto.porcentaje_valor)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredAndSortedProducts.length > 100 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 text-center">
            Mostrando 100 de {filteredAndSortedProducts.length} productos
          </div>
        )}

        {hasMoreProducts && !loadingProductos && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-center">
            <button
              onClick={loadMoreProducts}
              disabled={isLoadingMore}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {isLoadingMore ? 'Cargando...' : 'Cargar mas productos'}
            </button>
          </div>
        )}
      </div>

      {/* Explicacion Educativa del CV y XYZ */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-2xl">📐</span>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-indigo-900 mb-2">
              ¿Que es el Coeficiente de Variacion (CV)?
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              El CV mide <strong>que tan predecible</strong> es la demanda de un producto.
              Es la relacion entre la variabilidad de las ventas y su promedio.
            </p>

            {/* Formula Visual */}
            <div className="bg-white rounded-lg p-4 border border-indigo-200 mb-4">
              <div className="flex items-center justify-center gap-4 text-center">
                <div className="flex flex-col items-center">
                  <div className="text-2xl font-mono font-bold text-indigo-700">CV</div>
                  <div className="text-xs text-gray-500">Coeficiente</div>
                </div>
                <div className="text-2xl text-gray-400">=</div>
                <div className="flex flex-col items-center">
                  <div className="text-xl font-mono text-indigo-600 border-b-2 border-indigo-300 pb-1 px-2">σ (Desviacion)</div>
                  <div className="text-xl font-mono text-indigo-600 pt-1 px-2">μ (Promedio)</div>
                </div>
                <div className="text-2xl text-gray-400">=</div>
                <div className="flex flex-col items-center">
                  <div className="text-sm text-gray-600 border-b border-gray-300 pb-1 px-2">Variacion en ventas diarias</div>
                  <div className="text-sm text-gray-600 pt-1 px-2">Venta promedio diaria</div>
                </div>
              </div>
            </div>

            {/* Por que importa */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div>
                  <div className="font-semibold text-amber-800 text-sm">¿Por que importa?</div>
                  <p className="text-xs text-amber-700 mt-1">
                    Un producto con CV alto (erratico) necesita <strong>mas stock de seguridad</strong> porque
                    sus ventas son impredecibles. Un producto estable (CV bajo) puede manejarse con inventario minimo.
                  </p>
                </div>
              </div>
            </div>

            {/* Clasificacion XYZ */}
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Clasificacion segun CV:</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-green-600 text-white rounded-lg flex items-center justify-center font-bold">X</span>
                  <div>
                    <div className="font-semibold text-green-800 text-sm">Estable</div>
                    <div className="text-green-600 text-xs">CV &lt; 0.5</div>
                  </div>
                </div>
                <p className="text-xs text-green-700">
                  Ventas consistentes dia a dia. Facil de planificar. Stock de seguridad bajo.
                </p>
                <div className="mt-2 text-xs text-green-600 bg-green-100 rounded px-2 py-1">
                  Ej: Si vende ~100/dia, varia entre 80-120
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold">Y</span>
                  <div>
                    <div className="font-semibold text-blue-800 text-sm">Variable</div>
                    <div className="text-blue-600 text-xs">0.5 ≤ CV &lt; 1.0</div>
                  </div>
                </div>
                <p className="text-xs text-blue-700">
                  Patron con tendencias o estacionalidad. Requiere analisis de ciclos.
                </p>
                <div className="mt-2 text-xs text-blue-600 bg-blue-100 rounded px-2 py-1">
                  Ej: Si vende ~100/dia, varia entre 50-150
                </div>
              </div>

              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-red-600 text-white rounded-lg flex items-center justify-center font-bold">Z</span>
                  <div>
                    <div className="font-semibold text-red-800 text-sm">Erratico</div>
                    <div className="text-red-600 text-xs">CV ≥ 1.0</div>
                  </div>
                </div>
                <p className="text-xs text-red-700">
                  Demanda impredecible. Alto riesgo de stockout o sobreinventario.
                </p>
                <div className="mt-2 text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                  Ej: Si vende ~100/dia, varia entre 0-300
                </div>
              </div>
            </div>

            {/* Valor de negocio */}
            <div className="mt-4 bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-semibold text-gray-800 mb-2">Valor para el negocio:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  <span className="text-gray-600"><strong>AX (Alto valor + Estable):</strong> Productos estrella, nunca deben faltar</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-500">⚠</span>
                  <span className="text-gray-600"><strong>AZ (Alto valor + Erratico):</strong> Riesgo critico, requieren atencion especial</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500">→</span>
                  <span className="text-gray-600"><strong>CX (Bajo valor + Estable):</strong> Automatizar reposicion, minima atencion</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-400">○</span>
                  <span className="text-gray-600"><strong>CZ (Bajo valor + Erratico):</strong> Evaluar si vale mantener en inventario</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalle */}
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

export default ABCXYZFullAnalysis;
