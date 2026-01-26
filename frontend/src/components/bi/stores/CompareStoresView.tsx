import { useState } from 'react';
import { Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import { useCompareStores } from '../../../hooks/useCompareStores';
import StoreMultiSelector from './StoreMultiSelector';
import ComparisonTable from './ComparisonTable';
import StoresRadarChart from './StoresRadarChart';

export default function CompareStoresView() {
  // Default to last 30 days (ending 2 days ago)
  const getDefaultDates = () => {
    const end = new Date();
    end.setDate(end.getDate() - 2);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return {
      inicio: start.toISOString().split('T')[0],
      fin: end.toISOString().split('T')[0],
    };
  };

  const defaultDates = getDefaultDates();

  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState(defaultDates.inicio);
  const [fechaFin, setFechaFin] = useState(defaultDates.fin);

  const { data, loading, error, reload } = useCompareStores({
    storeIds: selectedStores,
    fechaInicio,
    fechaFin,
    autoLoad: true,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Comparador de Tiendas</h2>
        <p className="mt-1 text-sm text-gray-600">
          Compara el desempeño de hasta 5 tiendas lado a lado
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Store selector */}
        <div className="lg:col-span-1">
          <StoreMultiSelector
            selectedStores={selectedStores}
            onStoresChange={setSelectedStores}
            minStores={2}
            maxStores={5}
          />
        </div>

        {/* Date range and actions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Date range */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-medium text-gray-700">Período de Comparación</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fecha Fin
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              onClick={reload}
              disabled={loading || selectedStores.length < 2}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando...' : 'Actualizar Comparación'}
            </button>
          </div>

          {/* Info panel */}
          {data && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-blue-600 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    Comparando {data.metadata.tiendas_comparadas} tiendas
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    Período: {data.metadata.fecha_inicio} hasta {data.metadata.fecha_fin}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-lg shadow p-12">
          <div className="flex flex-col items-center justify-center">
            <RefreshCw className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <p className="text-gray-600">Cargando comparación...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="space-y-6">
          {/* Radar chart */}
          <StoresRadarChart data={data} />

          {/* Comparison table */}
          <ComparisonTable data={data} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && selectedStores.length < 2 && (
        <div className="bg-white rounded-lg shadow p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Selecciona tiendas para comparar
            </h3>
            <p className="text-sm text-gray-600 max-w-md">
              Elige al menos 2 tiendas de la lista para ver un análisis comparativo de su
              desempeño en ventas, margen, tickets y otras métricas clave.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
