import { useState } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, Package } from 'lucide-react';
import { useStoresBI, ComparisonType } from '../../../hooks/useStoresBI';
import KPICard from './KPICard';
import PeriodSelector from './PeriodSelector';

export default function StoresDashboard() {
  // Default to last 30 days (ending 2 days ago to ensure we have data)
  const getDefaultDates = () => {
    const end = new Date();
    end.setDate(end.getDate() - 2); // 2 days ago to ensure ETL has processed
    const start = new Date(end);
    start.setDate(start.getDate() - 29); // 30 days total
    return {
      inicio: start.toISOString().split('T')[0],
      fin: end.toISOString().split('T')[0],
    };
  };

  const defaultDates = getDefaultDates();

  const [fechaInicio, setFechaInicio] = useState(defaultDates.inicio);
  const [fechaFin, setFechaFin] = useState(defaultDates.fin);
  const [comparacion, setComparacion] = useState<ComparisonType>('anterior');
  const [region, setRegion] = useState<string | null>(null);

  const { data, loading, error } = useStoresBI({
    fechaInicio,
    fechaFin,
    comparacion,
    region,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard de Red</h2>
        <p className="mt-1 text-sm text-gray-600">
          Métricas consolidadas de todas las tiendas
        </p>
      </div>

      {/* Period Selector */}
      <PeriodSelector
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        comparacion={comparacion}
        onFechaInicioChange={setFechaInicio}
        onFechaFinChange={setFechaFin}
        onComparacionChange={setComparacion}
        region={region}
        onRegionChange={setRegion}
      />

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Ventas Totales"
          value={data?.periodo_actual.ventas_total || 0}
          format="currency"
          trend={
            data
              ? {
                  value: data.variacion.ventas_pct,
                  label: `vs ${comparacion === 'anterior' ? 'período anterior' : 'año anterior'}`,
                }
              : undefined
          }
          icon={DollarSign}
          iconColor="text-green-600"
          loading={loading}
        />

        <KPICard
          title="Tickets"
          value={data?.periodo_actual.tickets || 0}
          format="number"
          trend={
            data
              ? {
                  value: data.variacion.tickets_pct,
                  label: `vs ${comparacion === 'anterior' ? 'período anterior' : 'año anterior'}`,
                }
              : undefined
          }
          icon={ShoppingCart}
          iconColor="text-blue-600"
          loading={loading}
        />

        <KPICard
          title="Ticket Promedio"
          value={data?.periodo_actual.ticket_promedio || 0}
          format="currency"
          trend={
            data
              ? {
                  value: data.variacion.ticket_promedio_pct,
                  label: `vs ${comparacion === 'anterior' ? 'período anterior' : 'año anterior'}`,
                }
              : undefined
          }
          icon={TrendingUp}
          iconColor="text-indigo-600"
          loading={loading}
        />

        <KPICard
          title="Margen %"
          value={data?.periodo_actual.margen_pct || 0}
          format="percentage"
          subtitle={
            data
              ? `${data.variacion.margen_pct > 0 ? '+' : ''}${data.variacion.margen_pct.toFixed(1)}pp`
              : undefined
          }
          icon={Package}
          iconColor="text-purple-600"
          loading={loading}
        />
      </div>

      {/* Additional Info */}
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
                Comparación de períodos
              </p>
              <p className="mt-1 text-sm text-blue-700">
                Período actual: {data.metadata.fecha_inicio} hasta{' '}
                {data.metadata.fecha_fin} ({data.metadata.dias_periodo} días)
                <br />
                Comparando con: {data.metadata.fecha_inicio_comp} hasta{' '}
                {data.metadata.fecha_fin_comp}
                {region && (
                  <>
                    <br />
                    Región: {region}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Placeholder for future charts */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Ventas por Tienda
        </h3>
        <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 text-sm">
            Gráfico de barras - Próximamente
          </p>
        </div>
      </div>
    </div>
  );
}
