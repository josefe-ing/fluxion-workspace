import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { obtenerHistorialVentasRegional } from '../../services/pedidosInterCediService';
import type { VentaDiariaRegional } from '../../services/pedidosInterCediService';
import { formatNumber, formatInteger } from '../../utils/formatNumber';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  stockActual: number | null;
  demandaP75: number | null;
  diasCobertura: number | null;
  claseAbc: string | null;
  cediId: string;
}

export default function CediCalculoModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  stockActual,
  demandaP75,
  diasCobertura,
  claseAbc,
  cediId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [tiendas, setTiendas] = useState<{ id: string; nombre: string }[]>([]);
  const [p75PorTienda, setP75PorTienda] = useState<Record<string, number>>({});
  const [p75Regional, setP75Regional] = useState<number>(0);
  const [historial, setHistorial] = useState<VentaDiariaRegional[]>([]);
  const [estadisticas, setEstadisticas] = useState<{ promedio: number; max: number; min: number } | null>(null);

  useEffect(() => {
    if (isOpen && codigoProducto) {
      cargarDatos();
    }
  }, [isOpen, codigoProducto]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const data = await obtenerHistorialVentasRegional(codigoProducto, cediId, 30);
      setTiendas(data.tiendas);
      setP75PorTienda(data.totales.p75_por_tienda);
      setP75Regional(data.totales.p75_regional);
      setHistorial(data.ventas_diarias);

      if (data.ventas_diarias.length > 0) {
        const totales = data.ventas_diarias.map(v => v.total);
        setEstadisticas({
          max: Math.max(...totales),
          min: Math.min(...totales),
          promedio: totales.reduce((s, v) => s + v, 0) / totales.length,
        });
      }
    } catch (error) {
      console.error('Error cargando datos P75:', error);
    } finally {
      setLoading(false);
    }
  };

  const tiendaColores: Record<string, string> = {
    'tienda_17': '#3b82f6',
    'tienda_18': '#10b981',
  };

  const chartData = historial.slice().reverse().map((venta) => {
    const data: Record<string, string | number> = {
      fecha: new Date(venta.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
      total: venta.total,
    };
    tiendas.forEach((tienda) => {
      data[tienda.id] = venta.por_tienda[tienda.id] || 0;
    });
    return data;
  });

  const abcColors: Record<string, string> = {
    'A': 'bg-green-100 text-green-800',
    'B': 'bg-blue-100 text-blue-800',
    'C': 'bg-yellow-100 text-yellow-800',
    'D': 'bg-gray-100 text-gray-800',
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                {/* Header */}
                <div className="bg-gray-900 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-white">
                        Cálculo P75 Regional y Días
                      </Dialog.Title>
                      <p className="text-sm text-gray-300 mt-1">
                        {codigoProducto} - {descripcionProducto}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {claseAbc && (
                        <span className={`px-2 py-0.5 rounded text-sm font-semibold ${abcColors[claseAbc] || abcColors.D}`}>
                          {claseAbc}
                        </span>
                      )}
                      <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {loading ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                      <div className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Cargando datos...
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Resumen de cálculos */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-indigo-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-indigo-500 font-medium">Stock CEDI</div>
                          <div className="text-xl font-bold text-indigo-700">{formatInteger(stockActual)}</div>
                          <div className="text-xs text-indigo-400">unidades</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-purple-500 font-medium">P75 Regional</div>
                          <div className="text-xl font-bold text-purple-700">{formatNumber(p75Regional || demandaP75, 1)}</div>
                          <div className="text-xs text-purple-400">unid/día</div>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-3 text-center">
                          <div className="text-xs text-amber-500 font-medium">Días de Inventario</div>
                          <div className={`text-xl font-bold ${
                            diasCobertura === null ? 'text-gray-400' :
                            diasCobertura < 3 ? 'text-red-600' :
                            diasCobertura < 7 ? 'text-orange-600' :
                            diasCobertura > 30 ? 'text-blue-600' : 'text-amber-700'
                          }`}>
                            {diasCobertura !== null ? (diasCobertura > 999 ? '999+' : formatNumber(diasCobertura, 1)) : '-'}
                          </div>
                          <div className="text-xs text-amber-400">días</div>
                        </div>
                      </div>

                      {/* Fórmula de Días */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <h3 className="font-semibold text-amber-900 mb-2">Cálculo de Días de Inventario</h3>
                        <div className="bg-white rounded p-3 font-mono text-sm border border-amber-200">
                          <span className="text-amber-600">Días</span> = Stock CEDI / P75 Regional
                          <div className="mt-1 text-gray-600">
                            = {formatInteger(stockActual)} / {formatNumber(p75Regional || demandaP75, 1)}
                            {(p75Regional || demandaP75) && (p75Regional || demandaP75 || 0) > 0 ? (
                              <> = <strong>{formatNumber((stockActual || 0) / (p75Regional || demandaP75 || 1), 1)} días</strong></>
                            ) : (
                              <> = <strong>Sin demanda</strong></>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-amber-700 mt-2">
                          Los días indican cuánto tiempo el stock actual del CEDI puede abastecer la demanda agregada de todas las tiendas de la región.
                        </p>
                      </div>

                      {/* Desglose P75 por tienda */}
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <h3 className="font-semibold text-purple-900 mb-2">
                          Desglose P75 por Tienda
                        </h3>
                        <p className="text-sm text-purple-700 mb-3">
                          P75 Regional = suma del percentil 75 de ventas diarias de cada tienda ({tiendas.length} tiendas, últimos 30 días).
                        </p>

                        <div className="bg-white rounded-lg overflow-hidden border border-purple-200">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-purple-100">
                                <th className="text-left px-4 py-2 font-medium text-purple-900">Tienda</th>
                                <th className="text-right px-4 py-2 font-medium text-purple-900">P75 (unid/día)</th>
                                <th className="text-right px-4 py-2 font-medium text-purple-900">% del total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tiendas.map((tienda, idx) => {
                                const p75 = p75PorTienda[tienda.nombre] ?? p75PorTienda[tienda.id] ?? 0;
                                const pct = (p75Regional || 0) > 0 ? (p75 / p75Regional) * 100 : 0;
                                return (
                                  <tr key={tienda.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-4 py-2 text-gray-900 font-medium flex items-center gap-2">
                                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: tiendaColores[tienda.id] || '#9ca3af' }} />
                                      {tienda.nombre}
                                    </td>
                                    <td className="px-4 py-2 text-right text-gray-700">{formatNumber(p75, 1)}</td>
                                    <td className="px-4 py-2 text-right text-gray-500">{formatNumber(pct, 0)}%</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-purple-100 font-semibold border-t-2 border-purple-300">
                                <td className="px-4 py-2.5 text-purple-900">TOTAL REGIONAL</td>
                                <td className="px-4 py-2.5 text-right text-purple-900">{formatNumber(p75Regional, 1)}</td>
                                <td className="px-4 py-2.5 text-right text-purple-900">100%</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Fórmula */}
                        <div className="mt-3 bg-white rounded p-3 font-mono text-sm border border-purple-200">
                          <span className="text-purple-600">P75_Regional</span> = {tiendas.map(t => `P75_${t.nombre}`).join(' + ')}
                          <div className="mt-1 text-gray-600">
                            = {tiendas.map(t => {
                              const p75 = p75PorTienda[t.nombre] ?? p75PorTienda[t.id] ?? 0;
                              return formatNumber(p75, 1);
                            }).join(' + ')}
                            = <strong>{formatNumber(p75Regional, 1)}</strong> unid/día
                          </div>
                        </div>
                      </div>

                      {/* Gráfico de ventas regionales */}
                      {chartData.length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-gray-900">
                              Ventas Regionales (30 días)
                            </h3>
                            {estadisticas && (
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-500">
                                  Prom: <span className="font-semibold text-gray-700">{formatNumber(estadisticas.promedio, 0)}</span>
                                </span>
                                <span className="text-gray-500">
                                  Máx: <span className="font-semibold text-green-600">{formatNumber(estadisticas.max, 0)}</span>
                                </span>
                                <span className="text-gray-500">
                                  Mín: <span className="font-semibold text-orange-600">{formatNumber(estadisticas.min, 0)}</span>
                                </span>
                              </div>
                            )}
                          </div>

                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="fecha"
                                tick={{ fontSize: 10 }}
                                interval={Math.ceil(chartData.length / 10)}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => formatNumber(value, 0)}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#fff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '8px',
                                  fontSize: '12px'
                                }}
                                formatter={(value: number, name: string) => {
                                  const tienda = tiendas.find(t => t.id === name);
                                  return [formatNumber(value, 0) + ' unid', tienda?.nombre || name];
                                }}
                              />
                              <Legend
                                formatter={(value: string) => {
                                  const tienda = tiendas.find(t => t.id === value);
                                  return tienda?.nombre || value;
                                }}
                                wrapperStyle={{ fontSize: '11px' }}
                              />
                              <ReferenceLine
                                y={p75Regional}
                                stroke="#9333ea"
                                strokeDasharray="5 5"
                                strokeWidth={2}
                                label={{
                                  value: `P75: ${formatNumber(p75Regional, 0)}`,
                                  position: 'right',
                                  fill: '#9333ea',
                                  fontSize: 10,
                                  fontWeight: 'bold'
                                }}
                              />
                              {tiendas.map((tienda, idx) => (
                                <Bar
                                  key={tienda.id}
                                  dataKey={tienda.id}
                                  stackId="ventas"
                                  fill={tiendaColores[tienda.id] || '#9ca3af'}
                                  radius={idx === tiendas.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                                />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-3 flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
                  >
                    Cerrar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
