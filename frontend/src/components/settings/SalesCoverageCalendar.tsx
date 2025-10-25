import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';

interface CoverageData {
  registros: number;
  venta_total: number;
}

interface Ubicacion {
  id: string;
  nombre: string;
}

interface MesEstadisticas {
  dias_con_datos: number;
  total_dias: number;
  porcentaje: number;
}

interface Mes {
  key: string;
  nombre: string;
  nombre_corto: string;
  fechas: string[];
  total_dias: number;
  estadisticas: Record<string, MesEstadisticas>;
}

interface CoverageCalendarResponse {
  ubicaciones: Ubicacion[];
  fechas: string[];
  data: Record<string, Record<string, CoverageData | null>>;
  meses: Mes[];
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
    total_dias: number;
    total_meses: number;
  };
}

const SalesCoverageCalendar: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverageData, setCoverageData] = useState<CoverageCalendarResponse | null>(null);
  const [viewMode, setViewMode] = useState<'recent' | 'all'>('all');
  const [selectedUbicacion, setSelectedUbicacion] = useState<string | null>(null);

  const fetchCoverageData = async (mode: 'recent' | 'all') => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Fetching coverage data, mode:', mode);

      const params: Record<string, string> = {};
      if (mode === 'all') {
        params.mode = 'all';
      } else {
        params.days = '90';
      }

      const response = await http.get(
        `/api/ventas/coverage-calendar`,
        { params }
      );
      console.log('✅ Coverage data received:', response.data);
      setCoverageData(response.data as CoverageCalendarResponse);

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
    fetchCoverageData(viewMode);
  }, [viewMode]);

  const getCellColor = (data: CoverageData | null): string => {
    if (!data) return 'bg-red-500'; // Sin datos
    if (data.registros === 0) return 'bg-red-500'; // 0 registros
    if (data.registros < 100) return 'bg-yellow-400'; // Pocos registros
    if (data.registros < 1000) return 'bg-green-400'; // Datos normales
    return 'bg-green-600'; // Muchos datos
  };

  const getCellTitle = (data: CoverageData | null, fecha: string): string => {
    if (!data) return `${fecha}: Sin datos`;
    return `${fecha}\nRegistros: ${data.registros.toLocaleString()}\nVentas: ${data.venta_total.toLocaleString()} Bs`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center h-96">
            <div className="text-gray-600">Cargando calendario de cobertura de ventas...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-600">Error: {error}</p>
            <button
              onClick={() => fetchCoverageData(viewMode)}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!coverageData || !selectedUbicacion) {
    return null;
  }

  const ubicacionData = coverageData.data[selectedUbicacion] || {};

  // Calculate overall statistics
  const totalDias = coverageData.periodo.total_dias;
  const diasConDatos = Object.values(ubicacionData).filter((d) => d !== null).length;
  const diasFaltantes = totalDias - diasConDatos;
  const porcentajeCobertura = ((diasConDatos / totalDias) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header con botón volver */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Calendario de Cobertura - ETL Ventas
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Vista histórica de cobertura de datos por tienda y período
            </p>
          </div>
          <button
            onClick={() => navigate('/administrador')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver al ETL
          </button>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Período</p>
            <p className="text-2xl font-bold text-gray-800">
              {viewMode === 'all' ? 'Histórico' : '3 meses'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {coverageData.periodo.total_meses} meses
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Total de días</p>
            <p className="text-2xl font-bold text-gray-800">{totalDias}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Días con datos</p>
            <p className="text-2xl font-bold text-green-600">{diasConDatos}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Días faltantes</p>
            <p className="text-2xl font-bold text-red-600">{diasFaltantes}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Cobertura</p>
            <p className="text-2xl font-bold text-blue-600">{porcentajeCobertura}%</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          {/* Controles */}
          <div className="flex flex-wrap gap-4 items-center mb-6">
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

            {/* Selector de vista */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vista:
              </label>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'recent' | 'all')}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Histórico completo</option>
                <option value="recent">Últimos 3 meses</option>
              </select>
            </div>

            {/* Leyenda */}
            <div className="flex gap-4 text-sm text-gray-600 ml-auto items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span>Sin datos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                <span>Pocos (&lt;100)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 rounded"></div>
                <span>Normal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-600 rounded"></div>
                <span>Muchos (&gt;1000)</span>
              </div>
            </div>
          </div>

          {/* Heatmap compacto por mes */}
          <div className="space-y-2 overflow-x-auto">
            {[...coverageData.meses].reverse().map((mes) => {
              const estadisticas = mes.estadisticas[selectedUbicacion];
              const porcentajeMes = estadisticas.porcentaje;

              return (
                <div key={mes.key} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  {/* Nombre del mes */}
                  <div className="w-28 flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-700">{mes.nombre_corto}</div>
                    <div className="text-xs text-gray-500">
                      {estadisticas.dias_con_datos}/{estadisticas.total_dias} días
                    </div>
                  </div>

                  {/* Celdas de días del mes (heatmap) */}
                  <div className="flex gap-0.5 flex-1 min-w-0">
                    {mes.fechas.map((fecha) => {
                      const data = ubicacionData[fecha];
                      const fecha_obj = new Date(fecha);
                      const dia = fecha_obj.getDate();

                      return (
                        <div
                          key={fecha}
                          title={getCellTitle(data, fecha)}
                          className={`
                            w-2 h-8 rounded-sm cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all
                            ${getCellColor(data)}
                            ${dia === 1 ? 'ml-1' : ''}
                          `}
                        />
                      );
                    })}
                  </div>

                  {/* Barra de progreso y porcentaje */}
                  <div className="w-32 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            porcentajeMes >= 90 ? 'bg-green-600' :
                            porcentajeMes >= 70 ? 'bg-green-400' :
                            porcentajeMes >= 50 ? 'bg-yellow-400' : 'bg-red-500'
                          }`}
                          style={{ width: `${porcentajeMes}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold w-12 text-right ${
                        porcentajeMes >= 90 ? 'text-green-600' :
                        porcentajeMes >= 70 ? 'text-green-500' :
                        porcentajeMes >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {porcentajeMes}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info footer */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Cada línea representa un mes. Las barras pequeñas representan días individuales.
              Hover sobre cada día para ver detalles.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesCoverageCalendar;
