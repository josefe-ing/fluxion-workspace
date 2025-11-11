import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { MatrizCell } from '../../../services/productosService';
import { useMemo, useCallback } from 'react';

interface ABCDistributionChartProps {
  resumenABC: Record<string, MatrizCell>;
}

const COLORS = {
  A: '#10b981', // green-500
  B: '#3b82f6', // blue-500
  C: '#6b7280', // gray-500
};

const DESCRIPCIONES = {
  A: 'Alta Rotación (70-80% del valor)',
  B: 'Rotación Media (15-25% del valor)',
  C: 'Baja Rotación (5-10% del valor)',
};

export default function ABCDistributionChart({ resumenABC }: ABCDistributionChartProps) {
  // Transform data for recharts
  const data = useMemo(() =>
    Object.entries(resumenABC).map(([clasificacion, datos]) => ({
      name: clasificacion,
      value: datos.count,
      porcentaje_productos: datos.porcentaje_productos,
      porcentaje_valor: datos.porcentaje_valor,
    })),
    [resumenABC]
  );

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const pctProductos = typeof data.porcentaje_productos === 'number' ? data.porcentaje_productos.toFixed(1) : '0.0';
      const pctValor = typeof data.porcentaje_valor === 'number' ? data.porcentaje_valor.toFixed(1) : '0.0';

      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-semibold text-gray-900 mb-1">
            Clase {data.name}
          </p>
          <p className="text-sm text-gray-700">
            {DESCRIPCIONES[data.name as keyof typeof DESCRIPCIONES]}
          </p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              <span className="font-medium">Productos:</span> {data.value} ({pctProductos}%)
            </p>
            <p className="text-sm">
              <span className="font-medium">Valor:</span> {pctValor}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = useCallback((entry: any) => {
    return `${entry.name} (${entry.value})`;
  }, []);

  const legendFormatter = useCallback((value: string) => {
    const item = data.find(d => d.name === value);
    if (!item) return value;
    const pctValor = typeof item.porcentaje_valor === 'number' ? item.porcentaje_valor.toFixed(1) : '0.0';
    return `${value}: ${item.value} (${pctValor}% valor)`;
  }, [data]);

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={legendFormatter} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
