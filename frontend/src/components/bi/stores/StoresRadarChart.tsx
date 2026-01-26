import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from 'recharts';
import { CompareMultiStoresResponse } from '../../../services/biService';

interface StoresRadarChartProps {
  data: CompareMultiStoresResponse;
}

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function StoresRadarChart({ data }: StoresRadarChartProps) {
  // Normalize metrics to 0-100 scale for better visualization
  const normalizeValue = (value: number, min: number, max: number) => {
    if (max === min) return 50; // All same value
    return ((value - min) / (max - min)) * 100;
  };

  const getMetricRange = (metricKey: string) => {
    const values = data.stores.map((s) => (s.metrics as any)[metricKey]);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  };

  // Prepare data for radar chart
  const metrics = [
    { key: 'ventas_total', label: 'Ventas' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'ticket_promedio', label: 'Ticket Prom.' },
    { key: 'margen_pct', label: 'Margen %' },
    { key: 'items_por_ticket', label: 'Items/Ticket' },
  ];

  const radarData = metrics.map((metric) => {
    const range = getMetricRange(metric.key);
    const dataPoint: any = { metric: metric.label };

    data.stores.forEach((store) => {
      const value = (store.metrics as any)[metric.key];
      dataPoint[store.nombre] = normalizeValue(value, range.min, range.max);
    });

    return dataPoint;
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Comparación Multidimensional
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Valores normalizados (0-100) para comparación visual entre tiendas
      </p>

      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: '#6b7280', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
          />

          {data.stores.map((store, idx) => (
            <Radar
              key={store.ubicacion_id}
              name={store.nombre}
              dataKey={store.nombre}
              stroke={COLORS[idx % COLORS.length]}
              fill={COLORS[idx % COLORS.length]}
              fillOpacity={0.3}
              strokeWidth={2}
            />
          ))}

          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
          />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(1)}/100`}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend explanation */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-900">
          <strong>Nota:</strong> Los valores están normalizados (0-100) para permitir la
          comparación visual entre métricas de diferentes escalas. Un valor de 100 indica
          el mejor desempeño en esa métrica entre las tiendas seleccionadas.
        </p>
      </div>
    </div>
  );
}
