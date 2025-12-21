import { useState, useEffect } from 'react';
import {
  Star,
  Trash2,
  RefreshCw,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { biService, ProductMatrix, ProductStar } from '../../services/biService';

type CuadranteType = 'ESTRELLA' | 'VACA' | 'NICHO' | 'PERRO' | 'ALL';

const cuadranteConfig: Record<
  string,
  { label: string; color: string; bgColor: string; description: string }
> = {
  ESTRELLA: {
    label: 'Estrella',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    description: 'Alto GMROI + Alta Rotación',
  },
  VACA: {
    label: 'Vaca',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'Bajo GMROI + Alta Rotación',
  },
  NICHO: {
    label: 'Nicho',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    description: 'Alto GMROI + Baja Rotación',
  },
  PERRO: {
    label: 'Perro',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    description: 'Bajo GMROI + Baja Rotación',
  },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProductAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matrixData, setMatrixData] = useState<ProductMatrix | null>(null);
  const [stars, setStars] = useState<ProductStar[]>([]);
  const [eliminate, setEliminate] = useState<ProductStar[]>([]);
  const [selectedCuadrante, setSelectedCuadrante] = useState<CuadranteType>('ALL');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [matrix, starsData, eliminateData] = await Promise.all([
        biService.getProductsMatrix({ categoria: selectedCategoria || undefined }),
        biService.getProductsStars(20),
        biService.getProductsEliminate(20),
      ]);
      setMatrixData(matrix);
      setStars(starsData);
      setEliminate(eliminateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategoria]);

  const filteredProducts =
    matrixData?.productos.filter(
      (p) => selectedCuadrante === 'ALL' || p.cuadrante === selectedCuadrante
    ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cuadrante Summary Cards */}
      {matrixData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(matrixData.conteo_cuadrantes).map(([cuadrante, count]) => {
            const config = cuadranteConfig[cuadrante];
            return (
              <button
                key={cuadrante}
                onClick={() =>
                  setSelectedCuadrante(
                    selectedCuadrante === cuadrante ? 'ALL' : (cuadrante as CuadranteType)
                  )
                }
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedCuadrante === cuadrante
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${config.bgColor} ${config.color}`}
                  >
                    {count}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{config.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filtros:</span>
          </div>
          <select
            value={selectedCategoria}
            onChange={(e) => setSelectedCategoria(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todas las categorías</option>
            <option value="cedi_seco">Seco</option>
            <option value="cedi_frio">Frío</option>
            <option value="cedi_verde">Verde</option>
          </select>
          {selectedCuadrante !== 'ALL' && (
            <button
              onClick={() => setSelectedCuadrante('ALL')}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Limpiar filtro cuadrante
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Productos Estrella */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Productos Estrella
            </h2>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    GMROI
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Rotación
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Ventas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stars.map((product) => (
                  <tr key={product.producto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                        {product.nombre}
                      </div>
                      <div className="text-xs text-gray-500">
                        {product.categoria?.replace('cedi_', '')}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-green-600">
                      {product.gmroi.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {product.rotacion_anual.toFixed(1)}x
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {formatCurrency(product.ventas_30d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Candidatos a Eliminar */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Candidatos a Eliminar
            </h2>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    GMROI
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Rotación
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Stock $
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {eliminate.map((product) => (
                  <tr key={product.producto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                        {product.nombre}
                      </div>
                      <div className="text-xs text-gray-500">
                        {product.categoria?.replace('cedi_', '')}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-red-600">
                      {product.gmroi.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {product.rotacion_anual.toFixed(1)}x
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {formatCurrency(product.stock_valorizado || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Matriz Completa */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Matriz de Productos
          </h2>
          <span className="text-sm text-gray-500">
            {filteredProducts.length} productos
          </span>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Producto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Categoría
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  GMROI
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Rotación
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Ventas 30d
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Margen %
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Cuadrante
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => {
                const config = cuadranteConfig[product.cuadrante];
                return (
                  <tr key={product.producto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm truncate max-w-[250px]">
                        {product.nombre}
                      </div>
                      <div className="text-xs text-gray-500">
                        {product.producto_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                      {product.categoria?.replace('cedi_', '')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span
                        className={
                          product.gmroi >= 2
                            ? 'text-green-600'
                            : product.gmroi >= 1
                            ? 'text-gray-900'
                            : 'text-red-600'
                        }
                      >
                        {product.gmroi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {product.rotacion.toFixed(1)}x
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(product.ventas_30d)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {product.margen_promedio.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
                      >
                        {config.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
