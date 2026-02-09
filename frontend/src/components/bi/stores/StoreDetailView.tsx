import { useState, useEffect } from 'react';
import { Store } from 'lucide-react';
import StoreEvolutionChart from './StoreEvolutionChart';
import CategoryPieChart from './CategoryPieChart';
import TicketDistributionChart from './TicketDistributionChart';
import HourlyHeatmapChart from './HourlyHeatmapChart';

interface Tienda {
  id: string;
  nombre: string;
  region: string;
}

export default function StoreDetailView() {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [loading, setLoading] = useState(true);

  // Default to last 30 days
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      inicio: start.toISOString().split('T')[0],
      fin: end.toISOString().split('T')[0],
    };
  };

  const defaultDates = getDefaultDates();
  const [fechaInicio, setFechaInicio] = useState(defaultDates.inicio);
  const [fechaFin, setFechaFin] = useState(defaultDates.fin);

  useEffect(() => {
    // Load tiendas list
    fetch('http://localhost:8001/ubicaciones?tipo=tienda')
      .then((res) => res.json())
      .then((data) => {
        const tiendasList = data.map((t: { id: string; nombre: string; region?: string }) => ({
          id: t.id,
          nombre: t.nombre,
          region: t.region || '',
        }));
        setTiendas(tiendasList);
        if (tiendasList.length > 0) {
          setSelectedStore(tiendasList[0].id);
        }
      })
      .catch((err) => console.error('Error loading tiendas:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Cargando tiendas...</p>
        </div>
      </div>
    );
  }

  if (!selectedStore) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-600">Seleccione una tienda para ver el detalle</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Detalle de Tienda</h2>
        <p className="mt-1 text-sm text-gray-600">
          Análisis profundo de métricas y comportamiento por tienda
        </p>
      </div>

      {/* Store and Period Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Store Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Store className="w-4 h-4 inline mr-1" />
              Tienda
            </label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {tiendas.map((tienda) => (
                <option key={tienda.id} value={tienda.id}>
                  {tienda.nombre} - {tienda.region}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha Fin
            </label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="space-y-6">
        {/* Evolution Chart - Full Width */}
        <StoreEvolutionChart
          ubicacionId={selectedStore}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
        />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Pie Chart */}
          <CategoryPieChart
            ubicacionId={selectedStore}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            top={10}
          />

          {/* Ticket Distribution */}
          <TicketDistributionChart
            ubicacionId={selectedStore}
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
          />
        </div>

        {/* Hourly Heatmap - Full Width */}
        <HourlyHeatmapChart ubicacionId={selectedStore} dias={30} />
      </div>
    </div>
  );
}
