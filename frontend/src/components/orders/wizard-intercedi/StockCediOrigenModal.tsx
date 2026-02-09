import { Fragment, useState, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ProductoInterCedi, SnapshotInventario } from '../../../services/pedidosInterCediService';
import {
  CEDI_ORIGEN_NOMBRES,
  CEDI_ORIGEN_COLORS,
  ABC_COLORS,
  formatNumber,
  obtenerHistorialInventarioCedi
} from '../../../services/pedidosInterCediService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: ProductoInterCedi;
}

// Colores del header según CEDI origen
const getCediHeaderColor = (cediId: string): string => {
  switch (cediId) {
    case 'cedi_seco':
      return 'bg-amber-600';
    case 'cedi_frio':
      return 'bg-sky-600';
    case 'cedi_verde':
      return 'bg-emerald-600';
    default:
      return 'bg-gray-600';
  }
};

const getCediHeaderTextColor = (cediId: string): string => {
  switch (cediId) {
    case 'cedi_seco':
      return 'text-amber-100';
    case 'cedi_frio':
      return 'text-sky-100';
    case 'cedi_verde':
      return 'text-emerald-100';
    default:
      return 'text-gray-100';
  }
};

const getCediChartColor = (cediId: string): string => {
  switch (cediId) {
    case 'cedi_seco':
      return '#d97706'; // amber-600
    case 'cedi_frio':
      return '#0284c7'; // sky-600
    case 'cedi_verde':
      return '#059669'; // emerald-600
    default:
      return '#6b7280';
  }
};

// Evaluar disponibilidad
const getDisponibilidadInfo = (stockOrigen: number, cantidadSugerida: number): { texto: string; color: string; bgColor: string } => {
  if (stockOrigen <= 0) {
    return { texto: 'SIN STOCK', color: 'text-red-700', bgColor: 'bg-red-100 border-red-300' };
  }
  if (stockOrigen < cantidadSugerida * 0.5) {
    return { texto: 'STOCK BAJO', color: 'text-orange-700', bgColor: 'bg-orange-100 border-orange-300' };
  }
  if (stockOrigen < cantidadSugerida) {
    return { texto: 'STOCK PARCIAL', color: 'text-yellow-700', bgColor: 'bg-yellow-100 border-yellow-300' };
  }
  return { texto: 'DISPONIBLE', color: 'text-green-700', bgColor: 'bg-green-100 border-green-300' };
};

export default function StockCediOrigenModal({
  isOpen,
  onClose,
  producto
}: Props) {
  const [historial, setHistorial] = useState<SnapshotInventario[]>([]);
  const [loading, setLoading] = useState(false);
  const [estadisticas, setEstadisticas] = useState<{
    max: number;
    min: number;
    promedio: number;
  } | null>(null);

  const unidadesPorBulto = producto.unidades_por_bulto || 1;
  const abc = producto.clasificacion_abc || 'D';
  const abcColor = ABC_COLORS[abc] || ABC_COLORS.D;
  const cediOrigenId = producto.cedi_origen_id || 'cedi_seco';
  const cediOrigenNombre = CEDI_ORIGEN_NOMBRES[cediOrigenId] || 'CEDI Seco';

  // Stock en CEDI origen
  const stockUnidades = producto.stock_cedi_origen;
  const stockBultos = stockUnidades / unidadesPorBulto;

  // Cantidad sugerida
  const cantidadSugeridaUnid = producto.cantidad_sugerida_unidades;
  const cantidadSugeridaBultos = producto.cantidad_sugerida_bultos;

  // Evaluación de disponibilidad
  const disponibilidad = getDisponibilidadInfo(stockUnidades, cantidadSugeridaUnid);

  // Porcentaje de cobertura
  const porcentajeCobertura = cantidadSugeridaUnid > 0
    ? Math.min((stockUnidades / cantidadSugeridaUnid) * 100, 100)
    : 100;

  // Cantidad que se puede enviar
  const cantidadPosibleUnid = Math.min(stockUnidades, cantidadSugeridaUnid);
  const cantidadPosibleBultos = Math.ceil(cantidadPosibleUnid / unidadesPorBulto);

  const cargarHistorial = useCallback(async () => {
    try {
      setLoading(true);
      const data = await obtenerHistorialInventarioCedi(producto.codigo_producto, cediOrigenId, 30);
      setHistorial(data.snapshots);
      setEstadisticas({
        max: data.estadisticas.max,
        min: data.estadisticas.min,
        promedio: data.estadisticas.promedio
      });
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  }, [producto.codigo_producto, cediOrigenId]);

  // Cargar historial
  useEffect(() => {
    if (isOpen && producto.codigo_producto && cediOrigenId) {
      cargarHistorial();
    }
  }, [isOpen, producto.codigo_producto, cediOrigenId, cargarHistorial]);

  // Preparar datos para el gráfico (invertir para mostrar más antiguo primero)
  const chartData = historial.slice().reverse().map((snap) => ({
    fecha: new Date(snap.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
    cantidad: snap.cantidad,
    bultos: snap.cantidad / unidadesPorBulto
  }));

  const chartColor = getCediChartColor(cediOrigenId);

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
                {/* Header con color según CEDI */}
                <div className={`${getCediHeaderColor(cediOrigenId)} px-6 py-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-white">
                        Stock {cediOrigenNombre}
                      </Dialog.Title>
                      <p className={`text-sm ${getCediHeaderTextColor(cediOrigenId)} mt-1`}>
                        {producto.codigo_producto} - {producto.descripcion_producto}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className={`${getCediHeaderTextColor(cediOrigenId)} hover:text-white transition-colors`}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Stock y cobertura - Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Stock disponible - GRANDE */}
                    <div className={`rounded-lg p-4 text-center border-2 ${disponibilidad.bgColor}`}>
                      <div className="text-xs text-gray-600 mb-1">Stock en Origen</div>
                      <div className="text-3xl font-bold text-gray-900">
                        {formatNumber(stockBultos, 0)} <span className="text-lg font-medium">bultos</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatNumber(stockUnidades, 0)} unidades
                      </div>
                      <div className={`mt-2 text-xs font-semibold ${disponibilidad.color}`}>
                        {disponibilidad.texto}
                      </div>
                    </div>

                    {/* Cobertura del pedido */}
                    <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 mb-1">Cobertura del Pedido</div>
                      <div className={`text-3xl font-bold ${
                        porcentajeCobertura >= 100 ? 'text-green-600' :
                        porcentajeCobertura >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {formatNumber(porcentajeCobertura, 0)}%
                      </div>
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            porcentajeCobertura >= 100 ? 'bg-green-500' :
                            porcentajeCobertura >= 50 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${porcentajeCobertura}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        de {formatNumber(cantidadSugeridaBultos, 0)} b sugeridos
                      </div>
                    </div>
                  </div>

                  {/* Gráfico de historial */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4" style={{ color: chartColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                        Historial de Stock {cediOrigenNombre.replace('CEDI ', '')} (30 días)
                      </h3>
                      {estadisticas && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-500">
                            Máx: <span className="font-semibold text-green-600">{formatNumber(estadisticas.max / unidadesPorBulto, 0)}b</span>
                          </span>
                          <span className="text-gray-500">
                            Mín: <span className="font-semibold text-orange-600">{formatNumber(estadisticas.min / unidadesPorBulto, 0)}b</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {loading ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">
                        <div className="flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" style={{ color: chartColor }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Cargando historial...
                        </div>
                      </div>
                    ) : chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                          <defs>
                            <linearGradient id={`colorStock-${cediOrigenId}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="fecha"
                            tick={{ fontSize: 9 }}
                            interval={Math.ceil(chartData.length / 8)}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 9 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => formatNumber(value, 0)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '11px'
                            }}
                            formatter={(value: number) => [formatNumber(value, 0) + ' bultos', 'Stock']}
                            labelFormatter={(label) => `Fecha: ${label}`}
                          />
                          <Area
                            type="monotone"
                            dataKey="bultos"
                            stroke={chartColor}
                            strokeWidth={2}
                            fill={`url(#colorStock-${cediOrigenId})`}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
                        No hay datos de historial disponibles
                      </div>
                    )}
                  </div>

                  {/* Comparación con cantidad sugerida */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Detalle del Pedido</h4>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center">
                        <span className="text-gray-500 text-xs block">Sugerido</span>
                        <span className="font-semibold">{formatNumber(cantidadSugeridaBultos, 0)} b</span>
                        <span className="text-xs text-gray-400 block">({formatNumber(cantidadSugeridaUnid, 0)}u)</span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 text-xs block">Disponible</span>
                        <span className="font-semibold">{formatNumber(stockBultos, 0)} b</span>
                        <span className="text-xs text-gray-400 block">({formatNumber(stockUnidades, 0)}u)</span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 text-xs block">Se puede enviar</span>
                        <span className="font-semibold text-green-600">{formatNumber(cantidadPosibleBultos, 0)} b</span>
                        <span className="text-xs text-gray-400 block">({formatNumber(cantidadPosibleUnid, 0)}u)</span>
                      </div>
                    </div>
                  </div>

                  {/* Info del producto */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-lg p-3 text-center border ${CEDI_ORIGEN_COLORS[cediOrigenId]}`}>
                      <div className="text-xs text-gray-500">CEDI Origen</div>
                      <div className="font-semibold text-gray-900 text-sm">{cediOrigenNombre.replace('CEDI ', '')}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">Clasificación</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold ${abcColor}`}>
                        {abc}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">Unid/Bulto</div>
                      <div className="font-semibold text-gray-900">{unidadesPorBulto}</div>
                    </div>
                  </div>

                  {/* Nota informativa */}
                  {stockUnidades < cantidadSugeridaUnid && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                      <strong>Nota:</strong> El stock disponible en origen es menor que la cantidad sugerida.
                      Se recomienda ajustar el pedido a {formatNumber(cantidadPosibleBultos, 0)} bultos
                      o esperar reposición en el CEDI origen.
                    </div>
                  )}
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
