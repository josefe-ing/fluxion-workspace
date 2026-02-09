import { Fragment, useState, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import type { ProductoInterCedi, VentaDiariaRegional } from '../../../services/pedidosInterCediService';
import {
  CEDI_ORIGEN_NOMBRES,
  ABC_COLORS,
  formatNumber,
  obtenerHistorialVentasRegional
} from '../../../services/pedidosInterCediService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: ProductoInterCedi;
  config: {
    dias_cobertura_a: number;
    dias_cobertura_b: number;
    dias_cobertura_c: number;
    dias_cobertura_d: number;
    lead_time_dias: number;
    frecuencia_viajes_dias: string;
  };
  numTiendasRegion: number;
}

export default function DetalleProductoInterCediModal({
  isOpen,
  onClose,
  producto,
  numTiendasRegion
}: Props) {
  const [historialVentas, setHistorialVentas] = useState<VentaDiariaRegional[]>([]);
  const [tiendas, setTiendas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const unidadesPorBulto = producto.unidades_por_bulto || 1;
  const abc = producto.clasificacion_abc || 'D';
  const abcColor = ABC_COLORS[abc] || ABC_COLORS.D;

  // Demanda regional
  const demandaRegionalUnidDia = producto.demanda_regional_p75;
  const demandaRegionalBultosDia = demandaRegionalUnidDia / unidadesPorBulto;

  // Desglose de P75 por tienda
  const p75PorTienda = producto.p75_por_tienda || [];

  const cargarHistorial = useCallback(async () => {
    try {
      setLoading(true);
      const data = await obtenerHistorialVentasRegional(producto.codigo_producto, 'cedi_caracas', 30);
      setHistorialVentas(data.ventas_diarias);
      setTiendas(data.tiendas);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  }, [producto.codigo_producto]);

  // Cargar historial cuando se abre el modal
  useEffect(() => {
    if (isOpen && producto.codigo_producto) {
      cargarHistorial();
    }
  }, [isOpen, producto.codigo_producto, cargarHistorial]);

  // Colores para cada tienda (para recharts)
  const tiendaColoresChart: Record<string, string> = {
    'tienda_17': '#3b82f6',   // Artigas - blue
    'tienda_18': '#10b981',   // Paraiso - green
  };

  // Preparar datos para recharts
  const chartData = historialVentas.slice().reverse().map((venta) => {
    const data: Record<string, string | number> = {
      fecha: new Date(venta.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
      fechaCompleta: venta.fecha,
      total: venta.total,
    };
    // Agregar ventas por tienda
    tiendas.forEach((tienda) => {
      data[tienda.id] = venta.por_tienda[tienda.id] || 0;
    });
    return data;
  });

  // Calcular estadísticas
  const estadisticas = historialVentas.length > 0 ? {
    max: Math.max(...historialVentas.map(v => v.total)),
    min: Math.min(...historialVentas.map(v => v.total)),
    promedio: historialVentas.reduce((s, v) => s + v.total, 0) / historialVentas.length
  } : null;

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
                        Demanda Regional P75
                      </Dialog.Title>
                      <p className="text-sm text-gray-300 mt-1">
                        {producto.codigo_producto} - {producto.descripcion_producto}
                      </p>
                    </div>
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

                <div className="p-6 space-y-5">
                  {/* Info del producto */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">CEDI Origen</div>
                      <div className="font-semibold text-gray-900 text-sm">
                        {CEDI_ORIGEN_NOMBRES[producto.cedi_origen_id] || 'CEDI Seco'}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">Clasificación</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold ${abcColor}`}>
                        Clase {abc}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">Unid/Bulto</div>
                      <div className="font-semibold text-gray-900">{unidadesPorBulto}</div>
                    </div>
                  </div>

                  {/* Desglose P75 por tienda */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold text-purple-900 mb-3">
                      Desglose P75 por Tienda
                    </h3>
                    <p className="text-sm text-purple-700 mb-4">
                      La demanda regional es la suma del percentil 75 de ventas diarias de cada tienda de la región ({numTiendasRegion} tiendas).
                    </p>

                    {/* Tabla de desglose */}
                    <div className="bg-white rounded-lg overflow-hidden border border-purple-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-purple-100">
                            <th className="text-left px-4 py-2 font-medium text-purple-900">Tienda</th>
                            <th className="text-right px-4 py-2 font-medium text-purple-900">P75 (unid/día)</th>
                            <th className="text-right px-4 py-2 font-medium text-purple-900">P75 (bultos/día)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p75PorTienda.length > 0 ? (
                            <>
                              {p75PorTienda.map((tienda, idx) => (
                                <tr key={tienda.tienda_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-4 py-2 text-gray-900 font-medium">
                                    {tienda.tienda_nombre}
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-700">
                                    {formatNumber(tienda.p75_unidades, 1)}
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-700">
                                    {formatNumber(tienda.p75_unidades / unidadesPorBulto, 2)}
                                  </td>
                                </tr>
                              ))}
                              {/* Fila de total */}
                              <tr className="bg-purple-100 font-semibold border-t-2 border-purple-300">
                                <td className="px-4 py-3 text-purple-900">
                                  TOTAL REGIONAL
                                </td>
                                <td className="px-4 py-3 text-right text-purple-900">
                                  {formatNumber(demandaRegionalUnidDia, 1)}
                                </td>
                                <td className="px-4 py-3 text-right text-purple-900">
                                  {formatNumber(demandaRegionalBultosDia, 2)}
                                </td>
                              </tr>
                            </>
                          ) : (
                            <tr>
                              <td colSpan={3} className="px-4 py-4 text-center text-gray-500">
                                No hay datos de P75 por tienda disponibles
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Fórmula */}
                    <div className="mt-4 bg-white rounded p-3 font-mono text-sm border border-purple-200">
                      <span className="text-purple-600">Demanda_Regional</span> = Σ(P75 de cada tienda)
                      <div className="mt-1 text-gray-600">
                        = {p75PorTienda.map(t => formatNumber(t.p75_unidades, 1)).join(' + ')}
                        = <strong>{formatNumber(demandaRegionalUnidDia, 1)}</strong> unid/día
                      </div>
                    </div>
                  </div>

                  {/* Gráfico de histórico de ventas */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Historial de Ventas Regionales (30 días)
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

                    {loading ? (
                      <div className="h-48 flex items-center justify-center text-gray-500">
                        <div className="flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Cargando historial...
                        </div>
                      </div>
                    ) : chartData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={200}>
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
                              labelFormatter={(label) => `Fecha: ${label}`}
                            />
                            <Legend
                              formatter={(value: string) => {
                                const tienda = tiendas.find(t => t.id === value);
                                return tienda?.nombre || value;
                              }}
                              wrapperStyle={{ fontSize: '11px' }}
                            />
                            <ReferenceLine
                              y={demandaRegionalUnidDia}
                              stroke="#9333ea"
                              strokeDasharray="5 5"
                              strokeWidth={2}
                              label={{
                                value: `P75: ${formatNumber(demandaRegionalUnidDia, 0)}`,
                                position: 'right',
                                fill: '#9333ea',
                                fontSize: 10,
                                fontWeight: 'bold'
                              }}
                            />
                            {tiendas.map((tienda) => (
                              <Bar
                                key={tienda.id}
                                dataKey={tienda.id}
                                stackId="ventas"
                                fill={tiendaColoresChart[tienda.id] || '#9ca3af'}
                                radius={tienda.id === tiendas[tiendas.length - 1]?.id ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>

                        {/* Resumen de P75 */}
                        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                          <div className="h-0.5 w-8 bg-purple-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #9333ea, #9333ea 5px, transparent 5px, transparent 10px)' }} />
                          <span className="text-purple-700 font-medium">
                            Demanda P75 Regional: {formatNumber(demandaRegionalUnidDia, 0)} unid/día
                          </span>
                          <div className="h-0.5 w-8 bg-purple-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #9333ea, #9333ea 5px, transparent 5px, transparent 10px)' }} />
                        </div>
                      </>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-gray-500">
                        No hay datos de historial disponibles
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
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
