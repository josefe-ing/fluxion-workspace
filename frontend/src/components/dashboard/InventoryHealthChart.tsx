import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import http from '../../services/http';

interface HealthByABC {
  clase: string;
  total: number;
  critico: number;
  urgente: number;
  optimo: number;
  exceso: number;
  sin_demanda: number;
  health_score: number;
  peso_total_kg: number;
  volumen_total_m3: number;
}

interface InventoryHealthData {
  ubicacion_id: string;
  ubicacion_nombre: string;
  total_productos: number;
  global_critico: number;
  global_urgente: number;
  global_optimo: number;
  global_exceso: number;
  global_sin_demanda: number;
  global_health_score: number;
  ab_total: number;
  ab_critico: number;
  ab_urgente: number;
  ab_optimo: number;
  ab_exceso: number;
  ab_sin_demanda: number;
  ab_health_score: number;
  by_abc: HealthByABC[];
}

interface InventoryHealthChartProps {
  ubicacionId: string;
}

const COLORS = {
  critico: '#ef4444',    // red-500
  urgente: '#f97316',    // orange-500
  optimo: '#22c55e',     // green-500
  exceso: '#3b82f6',     // blue-500
  sin_demanda: '#9ca3af' // gray-400
};

export default function InventoryHealthChart({ ubicacionId }: InventoryHealthChartProps) {
  const [healthData, setHealthData] = useState<InventoryHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'ab' | 'all'>('ab'); // Default to A+B view
  const [excludeSinDemanda, setExcludeSinDemanda] = useState(true); // Por defecto excluir sin demanda
  const [stockCediFilter, setStockCediFilter] = useState<'all' | 'CON_STOCK' | 'SIN_STOCK'>('CON_STOCK'); // Por defecto solo con stock en CEDI

  const loadHealthData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = {};
      if (stockCediFilter !== 'all') {
        params.stock_cedi_filter = stockCediFilter;
      }
      const response = await http.get(`/api/stock/health/${ubicacionId}`, { params });
      setHealthData(response.data);
    } catch (err) {
      console.error('Error loading health data:', err);
      setError('Error al cargar datos de salud');
    } finally {
      setLoading(false);
    }
  }, [ubicacionId, stockCediFilter]);

  useEffect(() => {
    if (ubicacionId) {
      loadHealthData();
    }
  }, [ubicacionId, stockCediFilter, loadHealthData]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !healthData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-red-500 text-sm">{error || 'No hay datos disponibles'}</p>
      </div>
    );
  }

  // Get base values depending on view mode
  const baseData = viewMode === 'ab' ? {
    critico: healthData.ab_critico,
    urgente: healthData.ab_urgente,
    optimo: healthData.ab_optimo,
    exceso: healthData.ab_exceso,
    sin_demanda: healthData.ab_sin_demanda,
    total: healthData.ab_total,
  } : {
    critico: healthData.global_critico,
    urgente: healthData.global_urgente,
    optimo: healthData.global_optimo,
    exceso: healthData.global_exceso,
    sin_demanda: healthData.global_sin_demanda,
    total: healthData.total_productos,
  };

  // Calculate adjusted values when excluding sin demanda
  const adjustedTotal = excludeSinDemanda ? baseData.total - baseData.sin_demanda : baseData.total;
  const adjustedHealthScore = adjustedTotal > 0
    ? ((baseData.optimo + baseData.exceso) / adjustedTotal * 100)
    : 0;

  // Prepare data for pie chart
  const pieData = [
    { name: 'Crítico', value: baseData.critico, color: COLORS.critico },
    { name: 'Urgente', value: baseData.urgente, color: COLORS.urgente },
    { name: 'Óptimo', value: baseData.optimo, color: COLORS.optimo },
    { name: 'Exceso', value: baseData.exceso, color: COLORS.exceso },
    ...(!excludeSinDemanda ? [{ name: 'Sin demanda', value: baseData.sin_demanda, color: COLORS.sin_demanda }] : []),
  ];

  // Filter out zero values for cleaner chart
  const filteredPieData = pieData.filter(d => d.value > 0);

  // Prepare data for stacked bar chart (comparison by ABC)
  const barData = healthData.by_abc
    .filter(abc => abc.clase !== 'SIN_VENTAS') // Exclude sin ventas for clarity
    .map(abc => ({
      name: abc.clase,
      Crítico: abc.critico,
      Urgente: abc.urgente,
      Óptimo: abc.optimo,
      Exceso: abc.exceso,
    }));

  const currentHealthScore = adjustedHealthScore;
  const currentTotal = adjustedTotal;
  const currentCritico = baseData.critico;
  const currentUrgente = baseData.urgente;

  // Health score color
  const getHealthColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthBgColor = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Formato con unidades fijas
  const formatPeso = (pesoKg: number): string => {
    if (pesoKg === 0) return '-';
    return `${pesoKg.toFixed(0)} kg`;
  };

  const formatVolumen = (volumenM3: number): string => {
    if (volumenM3 === 0) return '-';
    const litros = volumenM3 * 1000;
    return `${litros.toFixed(0)} L`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Salud del Inventario</h3>
          <p className="text-xs text-gray-500">Distribución por estado de criticidad</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Filtro Stock CEDI */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">CEDI:</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              <button
                onClick={() => setStockCediFilter('CON_STOCK')}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  stockCediFilter === 'CON_STOCK'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title="Solo productos con stock disponible en CEDI"
              >
                Con stock
              </button>
              <button
                onClick={() => setStockCediFilter('all')}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  stockCediFilter === 'all'
                    ? 'bg-gray-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title="Todos los productos"
              >
                Todos
              </button>
            </div>
          </div>

          {/* Toggle excluir sin demanda */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeSinDemanda}
              onChange={(e) => setExcludeSinDemanda(e.target.checked)}
              className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-600">Excluir sin demanda</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Ver:</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              <button
                onClick={() => setViewMode('ab')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'ab'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                A+B (Prioritarios)
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Todos
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health Score Gauge */}
        <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500 mb-1">
            {viewMode === 'ab' ? 'Productos A+B' : 'Todos los productos'}
          </div>
          <div className={`text-4xl font-bold ${getHealthColor(currentHealthScore)}`}>
            {currentHealthScore.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600 mt-1">Salud del inventario</div>

          {/* Progress bar */}
          <div className="w-full mt-3 bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${getHealthBgColor(currentHealthScore)}`}
              style={{ width: `${Math.min(currentHealthScore, 100)}%` }}
            ></div>
          </div>

          {/* Quick stats */}
          <div className="mt-4 w-full space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Total productos:</span>
              <span className="font-medium">{currentTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-red-600">Requieren atención:</span>
              <span className="font-medium text-red-600">{(currentCritico + currentUrgente).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Pie Chart - Distribution */}
        <div className="flex flex-col">
          <div className="text-xs text-gray-500 text-center mb-2">Distribución por Estado</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={filteredPieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {filteredPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, tooltipName: string) => [value.toLocaleString(), tooltipName]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {filteredPieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-gray-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart - By ABC Class */}
        <div className="flex flex-col">
          <div className="text-xs text-gray-500 text-center mb-2">Comparación por Clase ABC</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontWeight: 500 }} width={25} />
              <Tooltip
                formatter={(value: number, tooltipName: string) => [value.toLocaleString(), tooltipName]}
              />
              <Bar dataKey="Crítico" stackId="a" fill={COLORS.critico} />
              <Bar dataKey="Urgente" stackId="a" fill={COLORS.urgente} />
              <Bar dataKey="Óptimo" stackId="a" fill={COLORS.optimo} />
              <Bar dataKey="Exceso" stackId="a" fill={COLORS.exceso} />
            </BarChart>
          </ResponsiveContainer>
          {/* Mini legend */}
          <div className="flex justify-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.critico }}></div>
              <span className="text-gray-500">Crít</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.urgente }}></div>
              <span className="text-gray-500">Urg</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.optimo }}></div>
              <span className="text-gray-500">Ópt</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.exceso }}></div>
              <span className="text-gray-500">Exc</span>
            </div>
          </div>
        </div>
      </div>

      {/* A+B Focus Message */}
      {viewMode === 'ab' && (
        <div className="mt-3 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
          <p className="text-xs text-indigo-700">
            <span className="font-medium">Foco A+B:</span> Estos {healthData.ab_total.toLocaleString()} productos representan ~75% de tu facturación.
            {healthData.ab_critico + healthData.ab_urgente > 0 && (
              <span className="text-red-600 font-medium">
                {' '}Hay {(healthData.ab_critico + healthData.ab_urgente).toLocaleString()} que requieren atención urgente.
              </span>
            )}
          </p>
        </div>
      )}

      {/* Peso y Volumen por Clase ABC */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        {healthData.by_abc
          .filter(abc => abc.clase !== 'SIN_VENTAS')
          .map((abc) => (
            <div key={abc.clase} className="bg-gray-50 rounded-lg p-2 border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  abc.clase === 'A' ? 'bg-green-600 text-white' :
                  abc.clase === 'B' ? 'bg-yellow-500 text-white' :
                  abc.clase === 'C' ? 'bg-gray-500 text-white' :
                  'bg-gray-300 text-gray-700'
                }`}>
                  {abc.clase}
                </span>
                <span className="text-xs text-gray-500">{abc.total.toLocaleString()} prod.</span>
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Peso:</span>
                  <span className="font-medium text-gray-700">{formatPeso(abc.peso_total_kg)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Volumen:</span>
                  <span className="font-medium text-gray-700">{formatVolumen(abc.volumen_total_m3)}</span>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
