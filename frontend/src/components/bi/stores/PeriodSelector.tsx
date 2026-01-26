import { Calendar } from 'lucide-react';

export type ComparisonType = 'anterior' | 'ano_anterior';

interface PeriodSelectorProps {
  fechaInicio: string;
  fechaFin: string;
  comparacion: ComparisonType;
  onFechaInicioChange: (fecha: string) => void;
  onFechaFinChange: (fecha: string) => void;
  onComparacionChange: (tipo: ComparisonType) => void;
  region?: string | null;
  onRegionChange?: (region: string | null) => void;
}

export default function PeriodSelector({
  fechaInicio,
  fechaFin,
  comparacion,
  onFechaInicioChange,
  onFechaFinChange,
  onComparacionChange,
  region,
  onRegionChange,
}: PeriodSelectorProps) {
  const presets = [
    {
      label: 'Últimos 7 días',
      onClick: () => {
        const end = new Date();
        end.setDate(end.getDate() - 2); // 2 days ago to ensure data is available
        const start = new Date(end);
        start.setDate(start.getDate() - 6); // 7 days total
        onFechaInicioChange(start.toISOString().split('T')[0]);
        onFechaFinChange(end.toISOString().split('T')[0]);
      },
    },
    {
      label: 'Últimos 30 días',
      onClick: () => {
        const end = new Date();
        end.setDate(end.getDate() - 2); // 2 days ago to ensure data is available
        const start = new Date(end);
        start.setDate(start.getDate() - 29); // 30 days total
        onFechaInicioChange(start.toISOString().split('T')[0]);
        onFechaFinChange(end.toISOString().split('T')[0]);
      },
    },
    {
      label: 'Este mes',
      onClick: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date();
        end.setDate(end.getDate() - 2); // 2 days ago to ensure data is available
        onFechaInicioChange(start.toISOString().split('T')[0]);
        onFechaFinChange(end.toISOString().split('T')[0]);
      },
    },
    {
      label: 'Mes anterior',
      onClick: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        onFechaInicioChange(start.toISOString().split('T')[0]);
        onFechaFinChange(end.toISOString().split('T')[0]);
      },
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-medium text-gray-700">Período de Análisis</h3>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={preset.onClick}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Fecha Inicio
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => onFechaInicioChange(e.target.value)}
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
            onChange={(e) => onFechaFinChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Comparison type */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Comparar con
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onComparacionChange('anterior')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              comparacion === 'anterior'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Período Anterior
          </button>
          <button
            onClick={() => onComparacionChange('ano_anterior')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              comparacion === 'ano_anterior'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Año Anterior
          </button>
        </div>
      </div>

      {/* Region filter (optional) */}
      {onRegionChange && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Región
          </label>
          <select
            value={region || ''}
            onChange={(e) => onRegionChange(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Todas las regiones</option>
            <option value="VALENCIA">VALENCIA</option>
            <option value="CARACAS">CARACAS</option>
          </select>
        </div>
      )}
    </div>
  );
}
