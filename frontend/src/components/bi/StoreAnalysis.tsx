import { useState, useEffect } from 'react';
import {
  Store,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  BarChart2,
} from 'lucide-react';
import { biService, StoreRanking, StoreKPIs, StoreABCAnalysis } from '../../services/biService';

type MetricType = 'gmroi' | 'ventas' | 'rotacion' | 'stock';

const metricLabels: Record<MetricType, string> = {
  gmroi: 'GMROI',
  ventas: 'Ventas 30d',
  rotacion: 'Rotación',
  stock: 'Stock $',
};

function formatValue(value: number, metric: MetricType): string {
  if (metric === 'ventas' || metric === 'stock') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (metric === 'rotacion') {
    return `${value.toFixed(1)}x/año`;
  }
  return value.toFixed(2);
}

export default function StoreAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('gmroi');
  const [ranking, setRanking] = useState<StoreRanking[] | null>(null);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [storeKPIs, setStoreKPIs] = useState<StoreKPIs | null>(null);
  const [abcAnalysis, setAbcAnalysis] = useState<StoreABCAnalysis | null>(null);
  const [loadingKPIs, setLoadingKPIs] = useState(false);

  const loadRanking = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await biService.getStoresRanking(selectedMetric);
      // El endpoint retorna un objeto con { metric, promedio, tiendas }
      // Extraemos solo el array de tiendas
      if (data && Array.isArray(data)) {
        setRanking(data);
      } else if (data && (data as any).tiendas) {
        setRanking((data as any).tiendas);
      } else {
        setRanking([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  const loadStoreKPIs = async (ubicacionId: string) => {
    try {
      setLoadingKPIs(true);
      const [kpisData, abcData] = await Promise.all([
        biService.getStoreKPIs(ubicacionId),
        biService.getStoreABCAnalysis(ubicacionId),
      ]);
      setStoreKPIs(kpisData);
      setAbcAnalysis(abcData);
    } catch (err) {
      console.error('Error loading store data:', err);
    } finally {
      setLoadingKPIs(false);
    }
  };

  useEffect(() => {
    loadRanking();
  }, [selectedMetric]);

  useEffect(() => {
    if (selectedStore) {
      loadStoreKPIs(selectedStore);
    } else {
      setStoreKPIs(null);
      setAbcAnalysis(null);
    }
  }, [selectedStore]);

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
      {/* Metric Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">
            Ordenar por:
          </span>
          <div className="flex gap-2">
            {(Object.keys(metricLabels) as MetricType[]).map((metric) => (
              <button
                key={metric}
                onClick={() => setSelectedMetric(metric)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedMetric === metric
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {metricLabels[metric]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ranking Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Ranking de Tiendas
            </h2>
            {ranking && ranking.length > 0 && (
              <span className="text-sm text-gray-500">
                {ranking.length} tiendas
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tienda
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Región
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    {metricLabels[selectedMetric]}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    vs Prom
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Fill Rate
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ranking?.map((store: StoreRanking) => (
                  <tr
                    key={store.ubicacion_id}
                    className={`hover:bg-gray-50 cursor-pointer ${
                      selectedStore === store.ubicacion_id ? 'bg-indigo-50' : ''
                    }`}
                    onClick={() => setSelectedStore(store.ubicacion_id)}
                  >
                    <td className="px-4 py-3 text-center">
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
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {store.nombre}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{store.region}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatValue(store.valor, selectedMetric)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 text-sm ${
                          (store.vs_promedio ?? 0) > 0
                            ? 'text-green-600'
                            : (store.vs_promedio ?? 0) < 0
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}
                      >
                        {(store.vs_promedio ?? 0) > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (store.vs_promedio ?? 0) < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : null}
                        {(store.vs_promedio ?? 0) > 0 ? '+' : ''}
                        {(store.vs_promedio ?? 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          (store.fill_rate ?? 0) >= 95
                            ? 'bg-green-100 text-green-700'
                            : (store.fill_rate ?? 0) >= 90
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {(store.fill_rate ?? 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Store Detail Panel */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedStore ? 'Detalle de Tienda' : 'Selecciona una tienda'}
            </h2>
          </div>
          <div className="p-6">
            {!selectedStore ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Store className="w-12 h-12 mb-3 text-gray-300" />
                <p>Haz clic en una tienda para ver sus KPIs</p>
              </div>
            ) : loadingKPIs ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            ) : storeKPIs ? (
              <div className="space-y-4">
                <div className="text-center pb-4 border-b border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900">
                    {storeKPIs.nombre}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Ventas 30d</p>
                    <p className="text-lg font-bold text-gray-900">
                      ${(storeKPIs.ventas_30d / 1000).toFixed(1)}K
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Stock</p>
                    <p className="text-lg font-bold text-gray-900">
                      ${(storeKPIs.stock_valorizado / 1000).toFixed(1)}K
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">GMROI</p>
                    <p className="text-lg font-bold text-gray-900">
                      {storeKPIs.gmroi.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Rotación</p>
                    <p className="text-lg font-bold text-gray-900">
                      {storeKPIs.rotacion_anual.toFixed(1)}x
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Fill Rate</p>
                    <p className="text-lg font-bold text-gray-900">
                      {storeKPIs.fill_rate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Días Inv.</p>
                    <p className="text-lg font-bold text-gray-900">
                      {(storeKPIs.dias_inventario_promedio ?? 0).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Comparativa vs Red */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    vs Promedio de la Red
                  </p>
                  <div className="space-y-2">
                    {storeKPIs.vs_promedio_red && Object.entries(storeKPIs.vs_promedio_red).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-sm text-gray-600 capitalize">
                            {key.replace('_pct', '')}
                          </span>
                          <span
                            className={`text-sm font-medium ${
                              value > 0
                                ? 'text-green-600'
                                : value < 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {value > 0 ? '+' : ''}
                            {value.toFixed(1)}%
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Análisis ABC */}
                {abcAnalysis && abcAnalysis.clasificaciones.length > 0 && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart2 className="w-4 h-4 text-indigo-600" />
                      <p className="text-sm font-medium text-gray-700">
                        Clasificación ABC
                      </p>
                    </div>

                    <div className="space-y-3">
                      {abcAnalysis.clasificaciones.map((clasif) => {
                        const colorClasses = {
                          A: 'bg-green-100 text-green-700 border-green-300',
                          B: 'bg-blue-100 text-blue-700 border-blue-300',
                          C: 'bg-yellow-100 text-yellow-700 border-yellow-300',
                          D: 'bg-gray-100 text-gray-700 border-gray-300',
                        }[clasif.clase] || 'bg-gray-100 text-gray-700 border-gray-300';

                        return (
                          <div key={clasif.clase} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold border ${colorClasses}`}
                              >
                                {clasif.clase}
                              </span>
                              <span className="text-xs text-gray-500">
                                {clasif.cantidad_productos} productos
                              </span>
                            </div>

                            {/* Barra de % Ventas */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-gray-600">
                                  % Ventas
                                </span>
                                <span className="text-xs font-medium text-gray-900">
                                  {clasif.pct_ventas.toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    {
                                      A: 'bg-green-500',
                                      B: 'bg-blue-500',
                                      C: 'bg-yellow-500',
                                      D: 'bg-gray-400',
                                    }[clasif.clase]
                                  }`}
                                  style={{ width: `${Math.min(clasif.pct_ventas, 100)}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Barra de % Productos */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-gray-600">
                                  % Productos
                                </span>
                                <span className="text-xs font-medium text-gray-900">
                                  {clasif.pct_productos.toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    {
                                      A: 'bg-green-400',
                                      B: 'bg-blue-400',
                                      C: 'bg-yellow-400',
                                      D: 'bg-gray-300',
                                    }[clasif.clase]
                                  }`}
                                  style={{ width: `${Math.min(clasif.pct_productos, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Resumen rápido */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>
                          <strong>A:</strong> Alta rotación (top productos)
                        </p>
                        <p>
                          <strong>B:</strong> Rotación media
                        </p>
                        <p>
                          <strong>C:</strong> Rotación baja
                        </p>
                        <p>
                          <strong>D:</strong> Muy baja rotación
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
