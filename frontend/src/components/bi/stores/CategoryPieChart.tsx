import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { biService, StoreCategoriesResponse } from '../../../services/biService';

interface CategoryPieChartProps {
  ubicacionId: string;
  fechaInicio: string;
  fechaFin: string;
  top?: number;
}

const COLORS = [
  '#4f46e5', // indigo
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // violet
];

export default function CategoryPieChart({
  ubicacionId,
  fechaInicio,
  fechaFin,
  top = 10,
}: CategoryPieChartProps) {
  const [data, setData] = useState<StoreCategoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [ubicacionId, fechaInicio, fechaFin, top]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await biService.getStoreCategories({
        ubicacion_id: ubicacionId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        top,
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

  if (!data || data.categorias.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-sm text-gray-500">No hay datos disponibles</p>
        </div>
      </div>
    );
  }

  const pieData = data.categorias.map((cat) => ({
    name: cat.categoria,
    value: cat.ventas_total,
    pct: cat.pct_ventas,
    productos: cat.productos_vendidos,
    margen: cat.margen_pct,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Top {top} Categorías - {data.tienda.nombre}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {data.totales.categorias_activas} categorías activas en el período
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, pct }) => `${name}: ${pct.toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) =>
                  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category List */}
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {data.categorias.map((cat, index) => (
            <div
              key={cat.categoria}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{cat.categoria}</p>
                  <p className="text-xs text-gray-500">
                    {cat.productos_vendidos} productos · Margen {cat.margen_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  ${cat.ventas_total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500">{cat.pct_ventas.toFixed(1)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-600">Ventas Totales (Top {top})</p>
            <p className="text-lg font-semibold text-gray-900">
              ${data.totales.ventas_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Categorías Activas</p>
            <p className="text-lg font-semibold text-gray-900">
              {data.totales.categorias_activas}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
