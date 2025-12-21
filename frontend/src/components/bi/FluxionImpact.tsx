import { useState, useEffect } from 'react';
import {
  TrendingDown,
  DollarSign,
  Package,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { biService, ImpactSummary, StoreImpact } from '../../services/biService';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export default function FluxionImpact() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImpactSummary | null>(null);
  const [storeImpacts, setStoreImpacts] = useState<StoreImpact[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryData, storesData] = await Promise.all([
        biService.getImpactSummary(),
        biService.getImpactByStore(),
      ]);
      setSummary(summaryData);
      setStoreImpacts(storesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  if (!summary || (summary.tiendas_activas_fluxion ?? summary.tiendas_activas ?? 0) === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800">
              No hay tiendas activas con Fluxion
            </h3>
            <p className="text-amber-700 mt-1">
              Cuando se activen tiendas, aquí verás el impacto del sistema en el
              inventario y el capital liberado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Capital Liberado */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Capital Liberado</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {formatCurrency(summary.capital_liberado)}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-3 flex items-center text-sm">
            <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
            <span className="text-green-600 font-medium">
              {formatPercent(-summary.reduccion_pct)} vs baseline
            </span>
          </div>
        </div>

        {/* Stock Actual */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Stock Actual</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(summary.stock_actual_total ?? summary.stock_actual)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-3 text-sm text-gray-500">
            Baseline: {formatCurrency(summary.stock_baseline_total ?? summary.stock_baseline)}
          </div>
        </div>

        {/* Fill Rate */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Fill Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {summary.fill_rate.toFixed(1)}%
              </p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(summary.fill_rate, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tiendas Activas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tiendas con Fluxion</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {summary.tiendas_activas_fluxion ?? summary.tiendas_activas}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-3 text-sm text-gray-500">
            de 19 tiendas totales
          </div>
        </div>
      </div>

      {/* Por Región */}
      {summary.por_region && summary.por_region.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Impacto por Región
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Región
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Stock Actual
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Baseline
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Capital Liberado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Reducción
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Tiendas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {summary.por_region.map((region) => (
                  <tr key={region.region} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {region.region}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {formatCurrency(region.stock_actual)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {formatCurrency(region.stock_baseline ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-green-600">
                      {formatCurrency(region.capital_liberado)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          region.reduccion_pct > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {formatPercent(-region.reduccion_pct)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">
                      {region.tiendas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ranking de Tiendas */}
      {storeImpacts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Ranking de Tiendas por Mejora
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tienda
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Región
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Stock Actual
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Capital Liberado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Reducción
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Fill Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {storeImpacts.map((store) => (
                  <tr key={store.ubicacion_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          store.rank === 1
                            ? 'bg-yellow-100 text-yellow-700'
                            : store.rank === 2
                            ? 'bg-gray-200 text-gray-700'
                            : store.rank === 3
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {store.rank}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {store.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{store.region}</td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      {formatCurrency(store.stock_actual)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-green-600">
                      {formatCurrency(store.capital_liberado)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          store.reduccion_pct > 20
                            ? 'bg-green-100 text-green-700'
                            : store.reduccion_pct > 0
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {formatPercent(-store.reduccion_pct)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          store.fill_rate >= 95
                            ? 'bg-green-100 text-green-700'
                            : store.fill_rate >= 90
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {store.fill_rate.toFixed(1)}%
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
