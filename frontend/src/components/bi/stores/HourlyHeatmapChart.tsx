import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { biService, HourlyHeatmapResponse, HeatmapCell } from '../../../services/biService';

interface HourlyHeatmapChartProps {
  ubicacionId: string;
  dias?: number;
}

export default function HourlyHeatmapChart({ ubicacionId, dias = 30 }: HourlyHeatmapChartProps) {
  const [data, setData] = useState<HourlyHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await biService.getHourlyHeatmap({
        ubicacion_id: ubicacionId,
        dias,
      });

      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [ubicacionId, dias]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  if (!data || data.heatmap.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-sm text-gray-500">No hay datos disponibles</p>
        </div>
      </div>
    );
  }

  // Create 7x24 matrix
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const horas = Array.from({ length: 24 }, (_, i) => i);

  // Build matrix lookup
  const matrixLookup = new Map<string, HeatmapCell>();
  data.heatmap.forEach((cell) => {
    const key = `${cell.dia_semana}-${cell.hora}`;
    matrixLookup.set(key, cell);
  });

  // Find max for color scaling
  const maxVentas = Math.max(...data.heatmap.map((cell) => cell.ventas));

  // Color scale function
  const getColor = (ventas: number): string => {
    if (ventas === 0) return 'bg-gray-100';
    const intensity = Math.floor((ventas / maxVentas) * 9);
    const colors = [
      'bg-indigo-50',
      'bg-indigo-100',
      'bg-indigo-200',
      'bg-indigo-300',
      'bg-indigo-400',
      'bg-indigo-500',
      'bg-indigo-600',
      'bg-indigo-700',
      'bg-indigo-800',
      'bg-indigo-900',
    ];
    return colors[intensity] || colors[colors.length - 1];
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Heatmap de Ventas por Hora - {data.tienda.nombre}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Últimos {data.metadata.dias_analizados} días
        </p>
      </div>

      {/* Peak Hour Alert */}
      {data.hora_pico && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-900">Hora Pico</p>
            <p className="text-sm text-green-700 mt-1">
              {data.hora_pico.dia_nombre} a las {data.hora_pico.hora}:00 - $
              {data.hora_pico.ventas.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour headers */}
          <div className="flex">
            <div className="w-16 flex-shrink-0" />
            {horas.map((hora) => (
              <div
                key={hora}
                className="w-10 h-8 flex items-center justify-center text-xs text-gray-600 flex-shrink-0"
              >
                {hora}
              </div>
            ))}
          </div>

          {/* Matrix rows */}
          {diasSemana.map((dia, diaIndex) => (
            <div key={diaIndex} className="flex">
              {/* Day label */}
              <div className="w-16 h-10 flex items-center justify-end pr-2 text-xs font-medium text-gray-700 flex-shrink-0">
                {dia}
              </div>

              {/* Hour cells */}
              {horas.map((hora) => {
                const key = `${diaIndex}-${hora}`;
                const cell = matrixLookup.get(key);
                const ventas = cell?.ventas || 0;
                const pct = cell?.pct_total || 0;

                return (
                  <div
                    key={hora}
                    className={`w-10 h-10 flex items-center justify-center text-xs font-medium border border-gray-200 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all flex-shrink-0 ${getColor(
                      ventas
                    )}`}
                    title={`${dia} ${hora}:00\nVentas: $${ventas.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}\n${pct.toFixed(2)}% del total${
                      cell ? `\nTickets: ${cell.tickets}` : ''
                    }`}
                  >
                    {ventas > 0 && pct >= 1 && (
                      <span className={ventas > maxVentas * 0.5 ? 'text-white' : 'text-gray-900'}>
                        {pct.toFixed(0)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-600">Intensidad de ventas:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-indigo-100 border border-gray-200 rounded" />
            <span className="text-xs text-gray-600">Bajo</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-indigo-500 border border-gray-200 rounded" />
            <span className="text-xs text-gray-600">Medio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-indigo-900 border border-gray-200 rounded" />
            <span className="text-xs text-gray-600">Alto</span>
          </div>
        </div>

        <div className="text-xs text-gray-600">
          Ventas totales: ${data.metadata.total_ventas.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* Insights */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs font-medium text-blue-900 mb-2">💡 Insights</p>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>
            Los números en cada celda representan el porcentaje del total de ventas
          </li>
          <li>
            Colores más oscuros indican mayor actividad de ventas
          </li>
          {data.hora_pico && (
            <li>
              La hora pico es {data.hora_pico.dia_nombre} a las {data.hora_pico.hora}:00
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
