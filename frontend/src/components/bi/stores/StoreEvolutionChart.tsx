import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { biService, StoreEvolutionResponse } from '../../../services/biService';

interface StoreEvolutionChartProps {
  ubicacionId: string;
  fechaInicio: string;
  fechaFin: string;
}

export default function StoreEvolutionChart({
  ubicacionId,
  fechaInicio,
  fechaFin,
}: StoreEvolutionChartProps) {
  const [data, setData] = useState<StoreEvolutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [ubicacionId, fechaInicio, fechaFin]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await biService.getStoreEvolution({
        ubicacion_id: ubicacionId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-80">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-80">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.evolution.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-80">
          <p className="text-sm text-gray-500">No hay datos disponibles</p>
        </div>
      </div>
    );
  }

  // Merge evolution data with network average
  const chartData = data.evolution.map((day) => {
    const redAvg = data.promedio_red.find((avg) => avg.fecha === day.fecha);
    return {
      fecha: new Date(day.fecha).toLocaleDateString('es-ES', {
        month: 'short',
        day: 'numeric',
      }),
      ventas: day.ventas,
      promedio_red: redAvg?.ventas_promedio || 0,
      tickets: day.tickets,
      margen: day.margen_pct,
    };
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Evolución de Ventas - {data.tienda.nombre}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Comparación con promedio de red ({data.metadata.dias_totales} días)
        </p>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickFormatter={(value) =>
              `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'margen') {
                return [`${value.toFixed(2)}%`, 'Margen %'];
              }
              if (name === 'tickets') {
                return [value.toLocaleString('en-US'), 'Tickets'];
              }
              return [
                `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                name === 'ventas' ? 'Ventas Tienda' : 'Promedio Red',
              ];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '14px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="ventas"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ fill: '#4f46e5', r: 4 }}
            name="Ventas Tienda"
          />
          <Line
            type="monotone"
            dataKey="promedio_red"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#10b981', r: 4 }}
            name="Promedio Red"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-gray-200">
        <div>
          <p className="text-xs text-gray-600">Ventas Totales</p>
          <p className="text-lg font-semibold text-gray-900">
            ${data.totales.ventas.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Tickets</p>
          <p className="text-lg font-semibold text-gray-900">
            {data.totales.tickets.toLocaleString('en-US')}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Ticket Promedio</p>
          <p className="text-lg font-semibold text-gray-900">
            ${data.totales.ticket_promedio.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Margen %</p>
          <p className="text-lg font-semibold text-gray-900">
            {data.totales.margen_pct.toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  );
}
