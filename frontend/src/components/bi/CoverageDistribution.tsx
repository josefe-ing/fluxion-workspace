import { useState, useEffect } from 'react';
import {
  MapPin,
  Package,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Store,
} from 'lucide-react';
import {
  biService,
  CoverageSummary,
  LowCoverageProduct,
  TrappedStock,
  StoreGap,
} from '../../services/biService';

type ViewType = 'summary' | 'low-coverage' | 'trapped' | 'gaps';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CoverageDistribution() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<ViewType>('summary');
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [lowCoverage, setLowCoverage] = useState<LowCoverageProduct[]>([]);
  const [trappedStock, setTrappedStock] = useState<TrappedStock[]>([]);
  const [storeGaps, setStoreGaps] = useState<StoreGap[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryData, lowCovData, trappedData, gapsData] = await Promise.all([
        biService.getCoverageSummary(selectedRegion || undefined),
        biService.getLowCoverageProducts(20, selectedRegion || undefined),
        biService.getTrappedInCedi(20, selectedRegion || undefined),
        biService.getStoreGaps(20, selectedRegion || undefined),
      ]);
      setSummary(summaryData);
      setLowCoverage(lowCovData);
      setTrappedStock(trappedData);
      setStoreGaps(gapsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRegion]);

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
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Package className="w-4 h-4" />
              Total SKUs
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {summary.total_skus.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Store className="w-4 h-4" />
              Cobertura Promedio
            </div>
            <div className="text-2xl font-bold text-indigo-600">
              {summary.cobertura_promedio.toFixed(1)}%
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              SKUs Baja Cobertura
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {summary.skus_baja_cobertura.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">{'<50% tiendas'}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Oportunidad Estimada
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.oportunidad_estimada)}
            </div>
          </div>
        </div>
      )}

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
          <div className="flex bg-gray-100 rounded-lg p-1 flex-wrap">
            <button
              onClick={() => setViewType('summary')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewType === 'summary'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Resumen
            </button>
            <button
              onClick={() => setViewType('low-coverage')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewType === 'low-coverage'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Baja Cobertura
            </button>
            <button
              onClick={() => setViewType('trapped')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewType === 'trapped'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Stock Atrapado
            </button>
            <button
              onClick={() => setViewType('gaps')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewType === 'gaps'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Oportunidades
            </button>
          </div>
        </div>
      </div>

      {/* Summary View */}
      {viewType === 'summary' && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Distribución de Cobertura
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Cobertura Alta ({'>'}80%)</span>
                  <span className="font-medium text-green-600">
                    {summary.skus_alta_cobertura} SKUs
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{
                      width: `${(summary.skus_alta_cobertura / summary.total_skus) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Cobertura Media (50-80%)</span>
                  <span className="font-medium text-amber-600">
                    {summary.skus_media_cobertura} SKUs
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full"
                    style={{
                      width: `${(summary.skus_media_cobertura / summary.total_skus) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Cobertura Baja ({'<'}50%)</span>
                  <span className="font-medium text-red-600">
                    {summary.skus_baja_cobertura} SKUs
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{
                      width: `${(summary.skus_baja_cobertura / summary.total_skus) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Stock Atrapado en CEDI
            </h3>
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-red-600 mb-2">
                {formatCurrency(summary.stock_atrapado_cedi)}
              </div>
              <p className="text-gray-500">
                Stock con {'<'}20 unidades en tiendas de la región
              </p>
            </div>
            <div className="mt-4 p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-800">
                Este stock podría redistribuirse a tiendas que lo necesitan,
                liberando capital y mejorando el fill rate.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Low Coverage Products */}
      {viewType === 'low-coverage' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Productos con Baja Cobertura
            </h2>
            <p className="text-sm text-gray-500">
              Productos presentes en menos del 50% de las tiendas
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Cobertura
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Tiendas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Venta Promedio
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Oportunidad
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lowCoverage.map((product) => (
                  <tr key={product.producto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm truncate max-w-[250px]">
                        {product.nombre}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {product.categoria?.replace('cedi_', '')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-500 h-2 rounded-full"
                            style={{ width: `${product.cobertura_pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-red-600">
                          {product.cobertura_pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {product.tiendas_con_stock} / {product.total_tiendas}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(product.venta_promedio_tienda)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {formatCurrency(product.oportunidad_estimada)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trapped Stock */}
      {viewType === 'trapped' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Stock Atrapado en CEDI
            </h2>
            <p className="text-sm text-gray-500">
              Productos con stock en CEDI pero sin presencia en tiendas de la región
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    CEDI
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Stock CEDI
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Valor $
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Días Stock
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Tiendas sin Stock
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {trappedStock.map((item, index) => (
                  <tr key={`${item.producto_id}-${item.cedi_id}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm truncate max-w-[250px]">
                        {item.nombre}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.producto_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                      {item.cedi_id.replace('cedi_', '')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {item.stock_cedi.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">
                      {formatCurrency(item.valor_atrapado)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          item.dias_stock > 90
                            ? 'bg-red-100 text-red-700'
                            : item.dias_stock > 30
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {item.dias_stock > 999 ? '999+' : item.dias_stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {item.tiendas_sin_stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Store Gaps / Opportunities */}
      {viewType === 'gaps' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Oportunidades de Distribución
            </h2>
            <p className="text-sm text-gray-500">
              Productos que venden bien en otras tiendas pero faltan en esta
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tienda
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Venta Otras Tiendas
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Margen %
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Oportunidad Est.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Prioridad
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {storeGaps.map((gap, index) => (
                  <tr key={`${gap.tienda_id}-${gap.producto_id}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {gap.tienda_nombre}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                        {gap.producto_nombre}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {gap.categoria?.replace('cedi_', '')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(gap.venta_otras_tiendas)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {gap.margen_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {formatCurrency(gap.oportunidad_estimada)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          gap.prioridad === 'ALTA'
                            ? 'bg-red-100 text-red-700'
                            : gap.prioridad === 'MEDIA'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {gap.prioridad}
                      </span>
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
