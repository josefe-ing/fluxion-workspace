import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { ProductoInterCedi, SnapshotInventario } from '../../../services/pedidosInterCediService';
import {
  ABC_COLORS,
  formatNumber,
  obtenerHistorialInventarioCedi
} from '../../../services/pedidosInterCediService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  producto: ProductoInterCedi;
  cediDestinoNombre?: string;
}

// Colores según días de stock
const getDiasStockColor = (dias: number): string => {
  if (dias <= 3) return 'text-red-600';
  if (dias <= 7) return 'text-orange-500';
  if (dias <= 14) return 'text-yellow-600';
  return 'text-green-600';
};

const getDiasStockBg = (dias: number): string => {
  if (dias <= 3) return 'bg-red-100 border-red-300';
  if (dias <= 7) return 'bg-orange-100 border-orange-300';
  if (dias <= 14) return 'bg-yellow-100 border-yellow-300';
  return 'bg-green-100 border-green-300';
};

const getEstadoStock = (dias: number): { texto: string; color: string } => {
  if (dias <= 0) return { texto: 'SIN STOCK', color: 'text-red-700' };
  if (dias <= 3) return { texto: 'CRITICO', color: 'text-red-700' };
  if (dias <= 7) return { texto: 'BAJO', color: 'text-orange-700' };
  if (dias <= 14) return { texto: 'MODERADO', color: 'text-yellow-700' };
  return { texto: 'SUFICIENTE', color: 'text-green-700' };
};

export default function StockCediDestinoModal({
  isOpen,
  onClose,
  producto,
  cediDestinoNombre = 'CEDI Caracas'
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

  // Stock en CEDI destino
  const stockUnidades = producto.stock_actual_cedi;
  const stockBultos = stockUnidades / unidadesPorBulto;

  // Demanda regional
  const demandaUnidDia = producto.demanda_regional_p75;
  const demandaBultosDia = demandaUnidDia / unidadesPorBulto;

  // Días de stock
  const diasStock = demandaUnidDia > 0 ? stockUnidades / demandaUnidDia : 999;
  const estado = getEstadoStock(diasStock);

  // Niveles de referencia (del backend)
  const stockMinUnid = producto.stock_minimo_cedi;
  const stockMinBultos = stockMinUnid / unidadesPorBulto;
  const stockMaxUnid = producto.stock_maximo_cedi;
  const stockMaxBultos = stockMaxUnid / unidadesPorBulto;
  const stockSegUnid = producto.stock_seguridad_cedi;
  const stockSegBultos = stockSegUnid / unidadesPorBulto;

  // Cargar historial
  useEffect(() => {
    if (isOpen && producto.codigo_producto) {
      cargarHistorial();
    }
  }, [isOpen, producto.codigo_producto]);

  const cargarHistorial = async () => {
    try {
      setLoading(true);
      const data = await obtenerHistorialInventarioCedi(producto.codigo_producto, 'cedi_caracas', 30);
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
  };

  // Preparar datos para el gráfico (invertir para mostrar más antiguo primero)
  const chartData = historial.slice().reverse().map((snap) => ({
    fecha: new Date(snap.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
    cantidad: snap.cantidad,
    bultos: snap.cantidad / unidadesPorBulto
  }));

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
                <div className="bg-sky-700 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-white">
                        Stock {cediDestinoNombre}
                      </Dialog.Title>
                      <p className="text-sm text-sky-200 mt-1">
                        {producto.codigo_producto} - {producto.descripcion_producto}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-sky-200 hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Stock actual y días - Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Stock actual - GRANDE */}
                    <div className={`rounded-lg p-4 text-center border-2 ${getDiasStockBg(diasStock)}`}>
                      <div className="text-xs text-gray-600 mb-1">Stock Disponible</div>
                      <div className="text-3xl font-bold text-gray-900">
                        {formatNumber(stockBultos, 0)} <span className="text-lg font-medium">bultos</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatNumber(stockUnidades, 0)} unidades
                      </div>
                      <div className={`mt-2 text-xs font-semibold ${estado.color}`}>
                        {estado.texto}
                      </div>
                    </div>

                    {/* Días de stock */}
                    <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 mb-1">Días de Stock</div>
                      <div className={`text-3xl font-bold ${getDiasStockColor(diasStock)}`}>
                        {diasStock >= 999 ? '∞' : formatNumber(diasStock, 1)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        días de cobertura
                      </div>
                      <div className="mt-2 text-xs text-gray-400">
                        P75: {formatNumber(demandaBultosDia, 2)} b/día
                      </div>
                    </div>
                  </div>

                  {/* Gráfico de historial */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                        Historial de Inventario (30 días)
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
                          <svg className="animate-spin h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24">
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
                            <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
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
                          <ReferenceLine
                            y={stockMinBultos}
                            stroke="#f59e0b"
                            strokeDasharray="5 5"
                            label={{ value: 'ROP', position: 'right', fill: '#f59e0b', fontSize: 9 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="bultos"
                            stroke="#0ea5e9"
                            strokeWidth={2}
                            fill="url(#colorStock)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
                        No hay datos de historial disponibles
                      </div>
                    )}
                  </div>

                  {/* Info del producto */}
                  <div className="grid grid-cols-2 gap-3">
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

                  {/* Niveles de referencia */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Niveles de Referencia</h4>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center">
                        <span className="text-gray-500 text-xs block">Stock Seguridad</span>
                        <span className="font-semibold">{formatNumber(stockSegBultos, 0)} b</span>
                        <span className="text-xs text-gray-400 block">({formatNumber(stockSegUnid, 0)}u)</span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 text-xs block">Stock Mínimo (ROP)</span>
                        <span className="font-semibold text-orange-600">{formatNumber(stockMinBultos, 0)} b</span>
                        <span className="text-xs text-gray-400 block">({formatNumber(stockMinUnid, 0)}u)</span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500 text-xs block">Stock Máximo</span>
                        <span className="font-semibold text-green-600">{formatNumber(stockMaxBultos, 0)} b</span>
                        <span className="text-xs text-gray-400 block">({formatNumber(stockMaxUnid, 0)}u)</span>
                      </div>
                    </div>
                  </div>

                  {/* Fórmula */}
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                    <div className="font-mono text-xs text-gray-700">
                      <span className="text-sky-700">Días_Stock</span> = Stock_Actual / Demanda_P75
                      <span className="text-gray-500 ml-2">
                        = {formatNumber(stockUnidades, 0)} / {formatNumber(demandaUnidDia, 1)}
                        = <strong>{diasStock >= 999 ? '∞' : formatNumber(diasStock, 1)}</strong> días
                      </span>
                    </div>
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
