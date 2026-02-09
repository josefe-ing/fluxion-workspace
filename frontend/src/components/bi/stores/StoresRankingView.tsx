import { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { biService, CompareMultiStoresResponse } from '../../../services/biService';
import http from '../../../services/http';

interface StoreLocation {
  id: string;
  nombre: string;
  region: string;
}

export default function StoresRankingView() {
  const getDefaultDates = () => {
    const end = new Date();
    end.setDate(end.getDate() - 2);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return {
      inicio: start.toISOString().split('T')[0],
      fin: end.toISOString().split('T')[0],
    };
  };

  const defaultDates = getDefaultDates();
  const [fechaInicio, setFechaInicio] = useState(defaultDates.inicio);
  const [fechaFin, setFechaFin] = useState(defaultDates.fin);
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [data, setData] = useState<CompareMultiStoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all stores
  useEffect(() => {
    const loadStores = async () => {
      try {
        const response = await http.get('/api/ubicaciones');
        const storesList = response.data
          .filter((u: { tipo: string; id: string }) => u.tipo === 'tienda' && !u.id.startsWith('cedi_'))
          .map((u: { id: string; nombre: string; region?: string }) => ({
            id: u.id,
            nombre: u.nombre,
            region: u.region || 'SIN REGIÓN',
          }));
        setStores(storesList);
      } catch (error) {
        console.error('Error loading stores:', error);
        setError('Error cargando lista de tiendas');
      }
    };
    loadStores();
  }, []);

  // Load comparison data for all stores
  useEffect(() => {
    if (stores.length === 0) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const storeIds = stores.map((s) => s.id);
        const response = await biService.compareMultiStores({
          store_ids: storeIds,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
        });

        setData(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error cargando datos';
        setError(message);
        console.error('Error loading comparison:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [stores, fechaInicio, fechaFin]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Calculate rankings
  const rankedByVentas = [...data.stores].sort(
    (a, b) => b.metrics.ventas_total - a.metrics.ventas_total
  );
  const rankedByMargen = [...data.stores].sort(
    (a, b) => b.metrics.margen_pct - a.metrics.margen_pct
  );
  const rankedByTicketProm = [...data.stores].sort(
    (a, b) => b.metrics.ticket_promedio - a.metrics.ticket_promedio
  );

  // Calculate totals and averages
  const totalVentas = data.stores.reduce((sum, s) => sum + s.metrics.ventas_total, 0);
  const totalTickets = data.stores.reduce((sum, s) => sum + s.metrics.tickets, 0);
  const avgTicketProm = totalVentas / totalTickets;
  const avgMargen =
    data.stores.reduce((sum, s) => sum + s.metrics.margen_pct, 0) / data.stores.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Ranking de Tiendas</h2>
        <p className="mt-1 text-sm text-gray-600">
          Desempeño individual de cada tienda ordenado por ventas
        </p>
      </div>

      {/* Date selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-medium text-gray-700">Período de Análisis</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
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
            <label className="block text-xs font-medium text-gray-700 mb-1">
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Ventas Totales Red</p>
          <p className="text-2xl font-bold text-gray-900">
            ${totalVentas.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">{data.stores.length} tiendas</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Tickets Totales</p>
          <p className="text-2xl font-bold text-gray-900">
            {totalTickets.toLocaleString('en-US')}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Ticket Promedio Red</p>
          <p className="text-2xl font-bold text-gray-900">${avgTicketProm.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Margen Promedio Red</p>
          <p className="text-2xl font-bold text-gray-900">{avgMargen.toFixed(2)}%</p>
        </div>
      </div>

      {/* Ranking table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Ranking por Ventas Totales
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tienda
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ventas
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % Red
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tickets
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket Prom.
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Margen %
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items/Ticket
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rankedByVentas.map((store, index) => {
                const pctRed = (store.metrics.ventas_total / totalVentas) * 100;
                const isTop3 = index < 3;

                return (
                  <tr
                    key={store.ubicacion_id}
                    className={isTop3 ? 'bg-yellow-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isTop3 ? 'text-yellow-600' : 'text-gray-900'
                          }`}
                        >
                          {index + 1}
                        </span>
                        {index === 0 && <Trophy className="w-4 h-4 text-yellow-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {store.nombre}
                        </div>
                        <div className="text-xs text-gray-500">{store.region}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        ${store.metrics.ventas_total.toLocaleString('en-US', {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-600">{pctRed.toFixed(1)}%</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900">
                        {store.metrics.tickets.toLocaleString('en-US')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm text-gray-900">
                          ${store.metrics.ticket_promedio.toFixed(2)}
                        </span>
                        {store.metrics.ticket_promedio > avgTicketProm ? (
                          <TrendingUp className="w-3 h-3 text-green-600" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm text-gray-900">
                          {store.metrics.margen_pct.toFixed(2)}%
                        </span>
                        {store.metrics.margen_pct > avgMargen ? (
                          <TrendingUp className="w-3 h-3 text-green-600" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900">
                        {store.metrics.items_por_ticket.toFixed(2)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top performers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-yellow-600" />
            <h3 className="text-sm font-semibold text-gray-900">Top Ventas</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rankedByVentas[0]?.nombre}</p>
          <p className="text-sm text-gray-600 mt-1">
            ${rankedByVentas[0]?.metrics.ventas_total.toLocaleString('en-US', {
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-900">Mejor Margen</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rankedByMargen[0]?.nombre}</p>
          <p className="text-sm text-gray-600 mt-1">
            {rankedByMargen[0]?.metrics.margen_pct.toFixed(2)}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Mejor Ticket Promedio</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {rankedByTicketProm[0]?.nombre}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            ${rankedByTicketProm[0]?.metrics.ticket_promedio.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
