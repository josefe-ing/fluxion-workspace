import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface CoverageData {
  registros: number;
  venta_total: number;
}

interface Ubicacion {
  id: string;
  nombre: string;
}

interface CoverageCalendarResponse {
  ubicaciones: Ubicacion[];
  fechas: string[];
  data: Record<string, Record<string, CoverageData | null>>;
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
    total_dias: number;
  };
}

const SalesCoverageCalendar: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverageData, setCoverageData] = useState<CoverageCalendarResponse | null>(null);
  const [days, setDays] = useState(90);
  const [selectedUbicacion, setSelectedUbicacion] = useState<string | null>(null);

  const fetchCoverageData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get<CoverageCalendarResponse>(
        `/api/ventas/coverage-calendar?days=${days}`
      );
      setCoverageData(response.data);

      // Seleccionar la primera ubicación por defecto
      if (response.data.ubicaciones.length > 0 && !selectedUbicacion) {
        setSelectedUbicacion(response.data.ubicaciones[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching coverage data:', err);
      setError(err.response?.data?.detail || 'Error cargando datos de cobertura');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoverageData();
  }, [days]);

  const getCellColor = (data: CoverageData | null): string => {
    if (!data) return 'bg-red-100 border-red-300'; // Sin datos
    if (data.registros === 0) return 'bg-red-100 border-red-300'; // 0 registros
    if (data.registros < 100) return 'bg-yellow-100 border-yellow-300'; // Pocos registros
    if (data.registros < 1000) return 'bg-green-100 border-green-300'; // Datos normales
    return 'bg-green-200 border-green-400'; // Muchos datos
  };

  const getCellTitle = (data: CoverageData | null, fecha: string): string => {
    if (!data) return `${fecha}: Sin datos`;
    return `${fecha}\nRegistros: ${data.registros.toLocaleString()}\nVentas: $${data.venta_total.toLocaleString()}`;
  };

  const groupByWeek = (fechas: string[]): string[][] => {
    const weeks: string[][] = [];
    let currentWeek: string[] = [];

    fechas.forEach((fecha, index) => {
      currentWeek.push(fecha);
      // Si es sábado (día 6) o es la última fecha, cerrar la semana
      const date = new Date(fecha);
      if (date.getDay() === 6 || index === fechas.length - 1) {
        weeks.push([...currentWeek]);
        currentWeek = [];
      }
    });

    return weeks;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-gray-600">Cargando calendario de cobertura de ventas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-600">Error: {error}</p>
        <button
          onClick={fetchCoverageData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!coverageData || !selectedUbicacion) {
    return null;
  }

  const weeks = groupByWeek(coverageData.fechas);
  const ubicacionData = coverageData.data[selectedUbicacion] || {};

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      {/* Header con controles */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Calendario de Cobertura de Datos - Ventas
        </h2>

        <div className="flex gap-4 items-center mb-4">
          {/* Selector de tienda */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tienda:
            </label>
            <select
              value={selectedUbicacion}
              onChange={(e) => setSelectedUbicacion(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {coverageData.ubicaciones.map((ub) => (
                <option key={ub.id} value={ub.id}>
                  {ub.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de período */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Período:
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={30}>Últimos 30 días</option>
              <option value={60}>Últimos 60 días</option>
              <option value={90}>Últimos 90 días</option>
              <option value={180}>Últimos 6 meses</option>
            </select>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
            <span>Sin datos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span>Pocos datos (&lt;100)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span>Datos normales</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-200 border border-green-400 rounded"></div>
            <span>Muchos datos (&gt;1000)</span>
          </div>
        </div>
      </div>

      {/* Calendario por semanas */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex gap-1 mb-1">
              {week.map((fecha) => {
                const data = ubicacionData[fecha];
                const date = new Date(fecha);
                const dayOfMonth = date.getDate();
                const month = date.toLocaleDateString('es-ES', { month: 'short' });

                return (
                  <div
                    key={fecha}
                    title={getCellTitle(data, fecha)}
                    className={`
                      w-12 h-12 border rounded flex flex-col items-center justify-center
                      text-xs cursor-pointer hover:scale-110 transition-transform
                      ${getCellColor(data)}
                    `}
                  >
                    <div className="font-semibold text-gray-700">{dayOfMonth}</div>
                    {dayOfMonth === 1 && (
                      <div className="text-[10px] text-gray-500">{month}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Estadísticas del período */}
      <div className="mt-6 grid grid-cols-3 gap-4 border-t pt-4">
        <div>
          <p className="text-sm text-gray-600">Total de días</p>
          <p className="text-2xl font-bold text-gray-800">
            {coverageData.periodo.total_dias}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Días con datos</p>
          <p className="text-2xl font-bold text-green-600">
            {Object.values(ubicacionData).filter((d) => d !== null).length}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Días faltantes</p>
          <p className="text-2xl font-bold text-red-600">
            {Object.values(ubicacionData).filter((d) => d === null).length}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SalesCoverageCalendar;
