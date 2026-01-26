import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { biService, TicketDistributionResponse } from '../../../services/biService';

interface TicketDistributionChartProps {
  ubicacionId: string;
  fechaInicio: string;
  fechaFin: string;
}

export default function TicketDistributionChart({
  ubicacionId,
  fechaInicio,
  fechaFin,
}: TicketDistributionChartProps) {
  const [data, setData] = useState<TicketDistributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [ubicacionId, fechaInicio, fechaFin]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await biService.getTicketDistribution({
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
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.distribucion.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-sm text-gray-500">No hay datos disponibles</p>
        </div>
      </div>
    );
  }

  const chartData = data.distribucion.map((rango) => ({
    rango: rango.rango,
    tickets: rango.cantidad_tickets,
    pct_tickets: rango.pct_tickets,
    ventas: rango.ventas_total,
    pct_ventas: rango.pct_ventas,
    ticket_promedio: rango.ticket_promedio,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Distribución de Tickets - {data.tienda.nombre}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Análisis de comportamiento de compra por rangos de valor
        </p>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="rango" tick={{ fontSize: 12 }} stroke="#6b7280" />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickFormatter={(value) => `${value.toLocaleString('en-US')}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12 }}
            stroke="#6b7280"
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'pct_tickets' || name === 'pct_ventas') {
                return [`${value.toFixed(2)}%`, name === 'pct_tickets' ? '% Tickets' : '% Ventas'];
              }
              if (name === 'tickets') {
                return [value.toLocaleString('en-US'), 'Tickets'];
              }
              return [
                `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                name === 'ventas' ? 'Ventas' : 'Ticket Promedio',
              ];
            }}
          />
          <Legend wrapperStyle={{ fontSize: '14px' }} />
          <Bar yAxisId="left" dataKey="tickets" fill="#4f46e5" name="Tickets" />
          <Bar yAxisId="right" dataKey="pct_ventas" fill="#10b981" name="% Ventas" />
        </BarChart>
      </ResponsiveContainer>

      {/* Detailed Breakdown */}
      <div className="mt-6 space-y-3">
        {data.distribucion.map((rango, index) => (
          <div
            key={index}
            className="grid grid-cols-5 gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div>
              <p className="text-xs text-gray-600">Rango</p>
              <p className="text-sm font-semibold text-gray-900">{rango.rango}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Tickets</p>
              <p className="text-sm font-semibold text-gray-900">
                {rango.cantidad_tickets.toLocaleString('en-US')}
              </p>
              <p className="text-xs text-gray-500">{rango.pct_tickets}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Ventas</p>
              <p className="text-sm font-semibold text-gray-900">
                ${rango.ventas_total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-500">{rango.pct_ventas}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Ticket Prom.</p>
              <p className="text-sm font-semibold text-gray-900">
                ${rango.ticket_promedio.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Impacto</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{ width: `${Math.min(rango.pct_ventas, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-gray-200">
        <div>
          <p className="text-xs text-gray-600">Total Tickets</p>
          <p className="text-lg font-semibold text-gray-900">
            {data.totales.total_tickets.toLocaleString('en-US')}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Ventas Totales</p>
          <p className="text-lg font-semibold text-gray-900">
            ${data.totales.total_ventas.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Ticket Promedio General</p>
          <p className="text-lg font-semibold text-gray-900">
            ${data.totales.ticket_promedio_general.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Insights */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs font-medium text-blue-900 mb-2">💡 Insights</p>
        <ul className="text-xs text-blue-700 space-y-1">
          {chartData[0] && (
            <li>
              El {chartData[0].pct_tickets.toFixed(1)}% de los tickets están en el rango{' '}
              {chartData[0].rango}, representando el {chartData[0].pct_ventas.toFixed(1)}% de las ventas
            </li>
          )}
          {chartData.length > 1 && (
            <li>
              Los tickets de mayor valor ({chartData[chartData.length - 1].rango}) representan solo el{' '}
              {chartData[chartData.length - 1].pct_tickets.toFixed(1)}% pero aportan el{' '}
              {chartData[chartData.length - 1].pct_ventas.toFixed(1)}% de las ventas
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
