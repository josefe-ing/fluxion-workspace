import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HistoricoClasificacionResponse } from '../../../services/productosService';
import { useMemo } from 'react';

interface ClasificacionHistoricoChartProps {
  historico: HistoricoClasificacionResponse;
}

export default function ClasificacionHistoricoChart({ historico }: ClasificacionHistoricoChartProps) {
  // Transform data for recharts
  const data = useMemo(() => {
    // Mapear clasificaciones a números para el gráfico
    const abcToNum: Record<string, number> = { 'A': 3, 'B': 2, 'C': 1 };
    const xyzToNum: Record<string, number> = { 'X': 3, 'Y': 2, 'Z': 1 };

    return historico.historico.map((punto) => ({
      mes: punto.mes,
      abc_num: abcToNum[punto.clasificacion_abc] || 2,
      xyz_num: xyzToNum[punto.clasificacion_xyz] || 2,
      abc: punto.clasificacion_abc,
      xyz: punto.clasificacion_xyz,
      matriz: punto.matriz,
      ranking: punto.ranking_valor,
      cv: punto.coeficiente_variacion
    }));
  }, [historico]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{data.mes}</p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">Matriz:</span>{' '}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                data.matriz.startsWith('A') ? 'bg-red-100 text-red-800' :
                data.matriz.startsWith('B') ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {data.matriz}
              </span>
            </p>
            <p>
              <span className="font-medium">ABC:</span> {data.abc}
            </p>
            <p>
              <span className="font-medium">XYZ:</span> {data.xyz}
            </p>
            <p>
              <span className="font-medium">Ranking:</span> #{data.ranking}
            </p>
            {data.cv !== null && (
              <p>
                <span className="font-medium">CV:</span> {data.cv.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Formato custom para el eje Y (ABC)
  const formatYAxisABC = (value: number) => {
    const numToAbc: Record<number, string> = { 3: 'A', 2: 'B', 1: 'C' };
    return numToAbc[value] || '';
  };

  // Formato custom para el eje Y (XYZ)
  const formatYAxisXYZ = (value: number) => {
    const numToXyz: Record<number, string> = { 3: 'X', 2: 'Y', 1: 'Z' };
    return numToXyz[value] || '';
  };

  return (
    <div className="space-y-4">
      {/* Nota sobre datos simulados */}
      {historico.nota && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            ℹ️ {historico.nota}
          </p>
        </div>
      )}

      {/* Clasificación actual */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Clasificación Actual</h4>
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-gray-600">Matriz:</span>{' '}
            <span className={`px-2 py-1 rounded text-sm font-medium ${
              historico.clasificacion_actual.matriz.startsWith('A') ? 'bg-red-100 text-red-800' :
              historico.clasificacion_actual.matriz.startsWith('B') ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {historico.clasificacion_actual.matriz}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Ranking:</span> #{historico.clasificacion_actual.ranking}
          </div>
          {historico.clasificacion_actual.cv !== null && (
            <div>
              <span className="text-gray-600">CV:</span> {historico.clasificacion_actual.cv.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Gráfico de evolución ABC */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Evolución Clasificación ABC (Valor)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" style={{ fontSize: '12px' }} />
            <YAxis
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={formatYAxisABC}
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="stepAfter"
              dataKey="abc_num"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: '#ef4444', r: 4 }}
              name="ABC"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de evolución XYZ */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Evolución Clasificación XYZ (Variabilidad)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" style={{ fontSize: '12px' }} />
            <YAxis
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={formatYAxisXYZ}
              style={{ fontSize: '12px' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="stepAfter"
              dataKey="xyz_num"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="XYZ"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
