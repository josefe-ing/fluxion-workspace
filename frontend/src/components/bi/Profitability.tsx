import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  RefreshCw,
  AlertCircle,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { biService, CategoryProfitability, TopProfitProduct } from '../../services/biService';

type ViewType = 'category' | 'products';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Profitability() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<ViewType>('category');
  const [categories, setCategories] = useState<CategoryProfitability[]>([]);
  const [topProducts, setTopProducts] = useState<TopProfitProduct[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [catData, prodData] = await Promise.all([
        biService.getProfitabilityByCategory(selectedRegion || undefined),
        biService.getTopProfitProducts(20, selectedRegion || undefined),
      ]);
      setCategories(catData);
      setTopProducts(prodData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [selectedRegion]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Calculate totals for summary
  const totals = categories.reduce(
    (acc, cat) => ({
      ventas: acc.ventas + cat.ventas_30d,
      margen: acc.margen + cat.margen_bruto_30d,
      stock: acc.stock + cat.stock_valorizado,
    }),
    { ventas: 0, margen: 0, stock: 0 }
  );

  const margenPct = totals.ventas > 0 ? (totals.margen / totals.ventas) * 100 : 0;
  const gmroiTotal = totals.stock > 0 ? totals.margen / totals.stock : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Ventas 30d
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(totals.ventas)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            Margen Bruto
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(totals.margen)}
          </div>
          <div className="text-sm text-gray-500">{margenPct.toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <BarChart3 className="w-4 h-4" />
            GMROI Total
          </div>
          <div className="text-2xl font-bold text-indigo-600">
            {gmroiTotal.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            Stock Valorizado
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(totals.stock)}
          </div>
        </div>
      </div>

      {/* Filters and View Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Todas las regiones</option>
              <option value="CARACAS">Caracas</option>
              <option value="VALENCIA">Valencia</option>
            </select>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewType('category')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewType === 'category'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Por Categoría
            </button>
            <button
              onClick={() => setViewType('products')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewType === 'products'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Top Productos
            </button>
          </div>
        </div>
      </div>

      {/* Category View */}
      {viewType === 'category' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Rentabilidad por Categoría
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Categoría
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Ventas 30d
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Margen Bruto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Margen %
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    GMROI
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Rotación
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Stock $
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categories.map((cat) => (
                  <tr key={cat.categoria} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 capitalize">
                        {cat.categoria.replace('cedi_', '')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(cat.ventas_30d)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {formatCurrency(cat.margen_bruto_30d)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {cat.margen_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-medium ${
                          cat.gmroi >= 2
                            ? 'text-green-600'
                            : cat.gmroi >= 1
                            ? 'text-gray-900'
                            : 'text-red-600'
                        }`}
                      >
                        {cat.gmroi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {cat.rotacion_anual.toFixed(1)}x
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(cat.stock_valorizado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Products View */}
      {viewType === 'products' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Top 20 Productos por Rentabilidad
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Categoría
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Margen Bruto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    GMROI
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Ventas 30d
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Margen %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {topProducts.map((product, index) => (
                  <tr key={product.producto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{index + 1}</td>
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
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {formatCurrency(product.margen_bruto_30d)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-medium ${
                          product.gmroi >= 2
                            ? 'text-green-600'
                            : product.gmroi >= 1
                            ? 'text-gray-900'
                            : 'text-red-600'
                        }`}
                      >
                        {product.gmroi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(product.ventas_30d)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {product.margen_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
