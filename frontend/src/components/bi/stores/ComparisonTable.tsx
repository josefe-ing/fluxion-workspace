import { Crown } from 'lucide-react';
import { CompareMultiStoresResponse } from '../../../services/biService';

interface ComparisonTableProps {
  data: CompareMultiStoresResponse;
}

export default function ComparisonTable({ data }: ComparisonTableProps) {
  const metrics = [
    {
      key: 'ventas_total',
      label: 'Ventas Totales',
      format: (val: number) => `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      bestStore: data.comparacion.mejor_ventas,
    },
    {
      key: 'tickets',
      label: 'Tickets',
      format: (val: number) => val.toLocaleString('en-US'),
    },
    {
      key: 'ticket_promedio',
      label: 'Ticket Promedio',
      format: (val: number) => `$${val.toFixed(2)}`,
      bestStore: data.comparacion.mejor_ticket_promedio,
    },
    {
      key: 'items_totales',
      label: 'Items Vendidos',
      format: (val: number) => val.toLocaleString('en-US'),
    },
    {
      key: 'items_por_ticket',
      label: 'Items/Ticket',
      format: (val: number) => val.toFixed(2),
    },
    {
      key: 'margen_pct',
      label: 'Margen %',
      format: (val: number) => `${val.toFixed(2)}%`,
      bestStore: data.comparacion.mejor_margen,
    },
  ];

  const getMaxValue = (metricKey: string) => {
    return Math.max(...data.stores.map((s) => (s.metrics as unknown as Record<string, number>)[metricKey]));
  };

  const getMinValue = (metricKey: string) => {
    return Math.min(...data.stores.map((s) => (s.metrics as unknown as Record<string, number>)[metricKey]));
  };

  const getCellStyle = (storeId: string, metricKey: string, value: number) => {
    const metric = metrics.find((m) => m.key === metricKey);
    const isBest = metric?.bestStore === storeId;
    const maxValue = getMaxValue(metricKey);
    const minValue = getMinValue(metricKey);

    if (isBest) {
      return 'bg-green-50 text-green-900 font-semibold';
    }

    if (value === maxValue && maxValue !== minValue) {
      return 'bg-blue-50 text-blue-900';
    }

    if (value === minValue && maxValue !== minValue) {
      return 'bg-gray-50 text-gray-600';
    }

    return '';
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Métrica
              </th>
              {data.stores.map((store) => (
                <th
                  key={store.ubicacion_id}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{store.nombre}</div>
                    <div className="text-xs text-gray-500 normal-case">{store.region}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {metrics.map((metric, idx) => (
              <tr key={metric.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="sticky left-0 z-10 bg-white px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    {metric.label}
                    {metric.bestStore && (
                      <span title="Mejor desempeño"><Crown className="w-4 h-4 text-yellow-500" /></span>
                    )}
                  </div>
                </td>
                {data.stores.map((store) => {
                  const value = (store.metrics as unknown as Record<string, number>)[metric.key];
                  const cellStyle = getCellStyle(store.ubicacion_id, metric.key, value);

                  return (
                    <td
                      key={store.ubicacion_id}
                      className={`px-6 py-4 whitespace-nowrap text-sm ${cellStyle}`}
                    >
                      {metric.format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Top category row */}
            <tr className="bg-indigo-50">
              <td className="sticky left-0 z-10 bg-indigo-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                Categoría Principal
              </td>
              {data.stores.map((store) => (
                <td key={store.ubicacion_id} className="px-6 py-4 text-sm">
                  {store.metrics.top_categoria ? (
                    <div>
                      <div className="font-medium text-indigo-900">
                        {store.metrics.top_categoria.nombre}
                      </div>
                      <div className="text-xs text-indigo-600">
                        ${store.metrics.top_categoria.ventas.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Mayor Ventas: </span>
            <span className="font-semibold text-gray-900">
              {data.stores.find((s) => s.ubicacion_id === data.comparacion.mejor_ventas)?.nombre}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Mejor Margen: </span>
            <span className="font-semibold text-gray-900">
              {data.stores.find((s) => s.ubicacion_id === data.comparacion.mejor_margen)?.nombre}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Mejor Ticket: </span>
            <span className="font-semibold text-gray-900">
              {
                data.stores.find((s) => s.ubicacion_id === data.comparacion.mejor_ticket_promedio)
                  ?.nombre
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
