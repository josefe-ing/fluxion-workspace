import { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  Plugin
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import http from '../../services/http';
import TransactionsModal from './TransactionsModal';

// Registrar componentes de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

// Plugin para resaltar fines de semana
const weekendPlugin: Plugin<'line'> = {
  id: 'weekendHighlight',
  beforeDraw: (chart) => {
    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const xScale = chart.scales.x;

    if (!xScale || !chartArea) return;

    ctx.save();

    // Obtener las etiquetas (fechas)
    const labels = chart.data.labels as string[];

    labels.forEach((label, index) => {
      const fecha = new Date(label);
      const diaSemana = fecha.getDay();

      // 0 = Domingo, 6 = Sábado
      if (diaSemana === 0 || diaSemana === 6) {
        const x = xScale.getPixelForValue(index);
        const nextX = index < labels.length - 1 ? xScale.getPixelForValue(index + 1) : chartArea.right;
        const width = nextX - x;

        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)'; // Azul claro transparente
        ctx.fillRect(x - width / 2, chartArea.top, width, chartArea.bottom - chartArea.top);
      }
    });

    ctx.restore();
  }
};

// Plugin para resaltar zona de proyección/forecast
const forecastZonePlugin: Plugin<'line'> = {
  id: 'forecastZone',
  beforeDraw: (chart) => {
    const ctx = chart.ctx;
    const chartArea = chart.chartArea;
    const xScale = chart.scales.x;

    if (!xScale || !chartArea) return;

    ctx.save();

    const labels = chart.data.labels as string[];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Encontrar el índice donde comienza el forecast (fechas futuras)
    let forecastStartIndex = -1;
    for (let i = 0; i < labels.length; i++) {
      const labelDate = new Date(labels[i]);
      labelDate.setHours(0, 0, 0, 0);
      if (labelDate > today) {
        forecastStartIndex = i;
        break;
      }
    }

    // Si hay zona de forecast, dibujar fondo
    if (forecastStartIndex > 0) {
      const startX = xScale.getPixelForValue(forecastStartIndex);

      ctx.fillStyle = 'rgba(251, 191, 36, 0.08)'; // Amarillo/naranja claro transparente
      ctx.fillRect(startX - 10, chartArea.top, chartArea.right - startX + 10, chartArea.bottom - chartArea.top);

      // Línea divisoria
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(startX, chartArea.top);
      ctx.lineTo(startX, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
};

interface ProductSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  currentUbicacionId: string | null;
}

interface VentaDiaria {
  fecha: string;
  tiendas: {
    [tiendaId: string]: {
      tienda: string;
      bultos: number;
      unidades: number;
      venta_total: number;
      es_outlier?: boolean;
    };
  };
}

interface ProductoInfo {
  codigo: string;
  descripcion: string;
  categoria: string;
}

interface VentasResponse {
  producto: ProductoInfo;
  fecha_inicio: string;
  fecha_fin: string;
  tiendas_disponibles: string[];
  ventas_diarias: VentaDiaria[];
}

interface ForecastDiario {
  dia: number;
  fecha: string;
  fecha_display: string;
  dia_semana: string;
  forecast_unidades: number;
  forecast_bultos: number;
}

interface ForecastResponse {
  ubicacion_id: string;
  codigo_producto: string;
  dias_adelante: number;
  forecasts: ForecastDiario[];
  dias_excluidos?: number;
  metodo?: string;
}

interface VentaDiaria20D {
  fecha: string;
  dia_semana: string;
  cantidad_vendida: number;
}

// Colores para las líneas de cada tienda
const COLORES_TIENDAS: { [key: string]: string } = {
  'tienda_01': '#3b82f6', // Azul
  'tienda_02': '#10b981', // Verde
  'tienda_03': '#f59e0b', // Amarillo
  'tienda_04': '#ef4444', // Rojo
  'tienda_05': '#8b5cf6', // Púrpura
  'tienda_06': '#ec4899', // Rosa
  'tienda_07': '#14b8a6', // Teal
  'tienda_08': '#f97316', // Naranja
  'tienda_09': '#6366f1', // Índigo
};

export default function ProductSalesModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  currentUbicacionId
}: ProductSalesModalProps) {
  const [loading, setLoading] = useState(true);
  const [ventasData, setVentasData] = useState<VentasResponse | null>(null);
  const [selectedTiendas, setSelectedTiendas] = useState<Set<string>>(new Set());
  const [semanas, setSemanas] = useState<number>(8); // Default: 8 semanas
  const [forecastData, setForecastData] = useState<{ [tiendaId: string]: ForecastResponse }>({});
  const [ventas20Dias, setVentas20Dias] = useState<VentaDiaria20D[]>([]);
  const [loading20D, setLoading20D] = useState(false);

  // Estado para el modal de transacciones
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [selectedTiendaForTransactions, setSelectedTiendaForTransactions] = useState<{id: string, nombre: string} | null>(null);

  // Cargar datos de 20 días para el cálculo educativo
  const fetch20DiasData = useCallback(async () => {
    if (!currentUbicacionId) return;

    try {
      setLoading20D(true);
      const response = await http.get(
        `/api/ventas/producto/${codigoProducto}/ultimos-20-dias?ubicacion_id=${currentUbicacionId}`
      );
      if (response.data.ventas) {
        setVentas20Dias(response.data.ventas);
      }
    } catch (error) {
      console.error('Error cargando datos de 20 días:', error);
    } finally {
      setLoading20D(false);
    }
  }, [codigoProducto, currentUbicacionId]);

  // Declarar fetchForecastsData primero (antes de usarla en fetchVentasData)
  const fetchForecastsData = useCallback(async (tiendas: string[]) => {
    try {
      const forecasts: { [tiendaId: string]: ForecastResponse } = {};

      // Fetch forecast para cada tienda en paralelo
      await Promise.all(
        tiendas.map(async (tiendaId) => {
          try {
            const response = await http.get(
              `/api/ventas/producto/forecast?ubicacion_id=${tiendaId}&codigo_producto=${codigoProducto}&dias_adelante=7`
            );
            forecasts[tiendaId] = response.data;
          } catch (error) {
            console.error(`Error fetching forecast for ${tiendaId}:`, error);
          }
        })
      );

      setForecastData(forecasts);
    } catch (error) {
      console.error('Error fetching forecasts:', error);
    }
  }, [codigoProducto]);

  const fetchVentasData = useCallback(async () => {
    setLoading(true);
    try {
      // Calcular fechas basadas en las semanas seleccionadas
      const fechaFin = new Date();
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - (semanas * 7));

      const response = await http.get(
        `/api/ventas/producto/diario?codigo_producto=${codigoProducto}&fecha_inicio=${fechaInicio.toISOString().split('T')[0]}&fecha_fin=${fechaFin.toISOString().split('T')[0]}`
      );
      setVentasData(response.data);

      // Si currentUbicacionId está disponible, seleccionar solo esa tienda, sino todas
      if (currentUbicacionId && response.data.tiendas_disponibles.includes(currentUbicacionId)) {
        setSelectedTiendas(new Set([currentUbicacionId]));
      } else {
        setSelectedTiendas(new Set(response.data.tiendas_disponibles));
      }

      // Cargar forecasts para todas las tiendas disponibles
      await fetchForecastsData(response.data.tiendas_disponibles);

      // Cargar datos de 20 días si hay ubicación actual
      if (currentUbicacionId) {
        await fetch20DiasData();
      }

    } catch (error) {
      console.error('Error fetching sales data:', error);
    } finally {
      setLoading(false);
    }
  }, [codigoProducto, semanas, currentUbicacionId, fetchForecastsData, fetch20DiasData]);

  useEffect(() => {
    if (isOpen && codigoProducto) {
      fetchVentasData();
    }
  }, [isOpen, codigoProducto, fetchVentasData]);

  const toggleTienda = (tiendaId: string) => {
    const newSelected = new Set(selectedTiendas);
    if (newSelected.has(tiendaId)) {
      newSelected.delete(tiendaId);
    } else {
      newSelected.add(tiendaId);
    }
    setSelectedTiendas(newSelected);
  };

  const prepareChartData = () => {
    if (!ventasData) return null;

    // Fechas históricas
    const fechasHistoricas = ventasData.ventas_diarias.map(v => v.fecha);

    // Fechas futuras (forecast - 7 días adelante)
    const fechasFuturas: string[] = [];
    const lastDate = new Date(fechasHistoricas[fechasHistoricas.length - 1]);
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(lastDate.getDate() + i);
      fechasFuturas.push(futureDate.toISOString().split('T')[0]);
    }

    // Combinar todas las fechas
    const allFechas = [...fechasHistoricas, ...fechasFuturas];

    const datasets: any[] = [];

    // Datasets de ventas históricas
    Array.from(selectedTiendas).forEach(tiendaId => {
      const nombreTienda = ventasData.ventas_diarias
        .find(v => v.tiendas[tiendaId])?.tiendas[tiendaId]?.tienda || tiendaId;

      // Datos históricos y detección de outliers
      const dataHistoricaCompleta = ventasData.ventas_diarias.map(ventaDia => {
        return ventaDia.tiendas[tiendaId]?.bultos || 0;
      });

      const esOutlier = ventasData.ventas_diarias.map(ventaDia => {
        return ventaDia.tiendas[tiendaId]?.es_outlier || false;
      });

      // Crear datos suavizados: reemplazar outliers con null para que Chart.js interpole
      const dataHistoricaSuavizada = dataHistoricaCompleta.map((valor, idx) => {
        return esOutlier[idx] ? null : valor;
      });

      // Rellenar con nulls para las fechas futuras
      const dataCompleta = [...dataHistoricaSuavizada, ...Array(7).fill(null)];

      // Dataset principal (línea suavizada sin outliers)
      datasets.push({
        label: nombreTienda,
        data: dataCompleta,
        borderColor: COLORES_TIENDAS[tiendaId] || '#64748b',
        backgroundColor: COLORES_TIENDAS[tiendaId] || '#64748b',
        tension: 0.4, // Más suavizado
        borderWidth: 2,
        spanGaps: true, // Importante: conecta los puntos saltando los nulls
      });

      // Dataset de outliers (puntos rojos pequeños para indicar posible falta de stock)
      const dataOutliers = dataHistoricaCompleta.map((valor, idx) => {
        return esOutlier[idx] ? valor : null;
      });

      datasets.push({
        label: `${nombreTienda} (⚠️ Posible falta de stock)`,
        data: [...dataOutliers, ...Array(7).fill(null)],
        borderColor: 'transparent',
        backgroundColor: '#ef4444', // Rojo
        pointRadius: 4,
        pointStyle: 'crossRot',
        showLine: false, // Solo mostrar puntos, no línea
      });

      // Dataset de forecast (línea punteada)
      if (forecastData[tiendaId] && forecastData[tiendaId].forecasts.length > 0) {
        // Obtener el último valor válido (no outlier)
        let lastHistoricValue: number | null = 0;
        for (let i = dataHistoricaSuavizada.length - 1; i >= 0; i--) {
          if (dataHistoricaSuavizada[i] !== null) {
            lastHistoricValue = dataHistoricaSuavizada[i];
            break;
          }
        }

        // Crear array con nulls para fechas históricas, excepto la última
        const dataForecast = [
          ...Array(fechasHistoricas.length - 1).fill(null),
          lastHistoricValue, // Conectar con el último punto histórico
          ...forecastData[tiendaId].forecasts.map(f => f.forecast_bultos)
        ];

        datasets.push({
          label: `${nombreTienda} (Proyección PMP)`,
          data: dataForecast,
          borderColor: COLORES_TIENDAS[tiendaId] || '#64748b',
          backgroundColor: 'transparent',
          borderDash: [5, 5], // Línea punteada
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 4,
          pointStyle: 'triangle',
        });
      }
    });

    return {
      labels: allFechas,
      datasets,
    };
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      title: {
        display: true,
        text: `Ventas Diarias en Bultos - ${descripcionProducto}`,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (tooltipItems) => {
            const fecha = tooltipItems[0].label;
            const fechaObj = new Date(fecha);
            const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const diaNombre = diasSemana[fechaObj.getDay()];
            const esFinDeSemana = fechaObj.getDay() === 0 || fechaObj.getDay() === 6;
            return `${diaNombre}${esFinDeSemana ? ' 🎯' : ''}, ${fecha}`;
          },
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toFixed(2)} bultos`;
          },
        },
      },
      datalabels: {
        display: (context) => {
          // Mostrar etiquetas en líneas principales y proyección PMP, pero NO en outliers
          const label = context.dataset.label || '';
          return !label.includes('⚠️ Posible falta de stock');
        },
        align: (context) => {
          const label = context.dataset.label || '';
          // Proyección PMP: alinear abajo para distinguir visualmente
          return label.includes('Proyección') ? 'bottom' : 'top';
        },
        anchor: 'end',
        color: (context) => {
          return context.dataset.borderColor as string || '#64748b';
        },
        font: {
          size: 10,
          weight: 'bold',
        },
        formatter: (value: number | null) => {
          if (value === null || value === undefined) return '';
          return Math.round(value);
        },
        padding: 4,
        backgroundColor: (context) => {
          const label = context.dataset.label || '';
          // Fondo naranja/ámbar para proyección PMP para mayor distinción
          return label.includes('Proyección') ? 'rgba(251, 191, 36, 0.8)' : 'rgba(255, 255, 255, 0.7)';
        },
        borderRadius: 3,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Bultos Vendidos',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Fecha',
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="w-full">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900" id="modal-title">
                      Análisis de Ventas por Tienda
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {ventasData?.producto.descripcion} ({ventasData?.producto.codigo})
                    </p>
                    <p className="text-xs text-gray-400">
                      {ventasData?.fecha_inicio} - {ventasData?.fecha_fin}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <span className="sr-only">Cerrar</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {loading ? (
                  <div className="flex justify-center items-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                ) : ventasData ? (
                  <>
                    {/* Selector de rango de tiempo */}
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Rango de Tiempo:</h4>
                      <div className="flex gap-2">
                        {[1, 2, 4, 8].map((numSemanas) => (
                          <button
                            key={numSemanas}
                            onClick={() => setSemanas(numSemanas)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                              semanas === numSemanas
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                            }`}
                          >
                            {numSemanas} {numSemanas === 1 ? 'semana' : 'semanas'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Selector de tiendas */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Seleccionar Tiendas:</h4>
                      <div className="flex flex-wrap gap-2">
                        {ventasData.tiendas_disponibles.map(tiendaId => {
                          const ventaDia = ventasData.ventas_diarias.find(v => v.tiendas[tiendaId]);
                          const nombreTienda = ventaDia?.tiendas[tiendaId]?.tienda || tiendaId;
                          const isSelected = selectedTiendas.has(tiendaId);

                          return (
                            <button
                              key={tiendaId}
                              onClick={() => toggleTienda(tiendaId)}
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                isSelected
                                  ? 'text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                              }`}
                              style={{
                                backgroundColor: isSelected ? COLORES_TIENDAS[tiendaId] || '#64748b' : undefined,
                              }}
                            >
                              {nombreTienda}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setSelectedTiendas(new Set(ventasData.tiendas_disponibles))}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Seleccionar todas
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => setSelectedTiendas(new Set())}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Deseleccionar todas
                        </button>
                      </div>
                    </div>

                    {/* Sección Educativa: Cálculo del Promedio 20 Días */}
                    {currentUbicacionId && ventas20Dias.length > 0 && (
                      <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <h4 className="text-sm font-semibold text-purple-900">
                            📊 Cálculo del Promedio 20 Días (Tienda Actual)
                          </h4>
                        </div>

                        {loading20D ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                          </div>
                        ) : (
                          <>
                            {/* Estadísticas Principales */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                              <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                                <div className="text-xs text-gray-600 mb-1">Total Vendido</div>
                                <div className="text-2xl font-bold text-purple-700">
                                  {ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0).toFixed(0)}
                                </div>
                                <div className="text-xs text-gray-500">unidades en {ventas20Dias.length} días</div>
                              </div>
                              <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                                <div className="text-xs text-gray-600 mb-1">Día Máximo</div>
                                <div className="text-2xl font-bold text-green-700">
                                  {Math.max(...ventas20Dias.map(v => v.cantidad_vendida)).toFixed(0)}
                                </div>
                                <div className="text-xs text-gray-500">bultos en un día</div>
                              </div>
                              <div className="bg-orange-50 rounded-lg p-3 text-center border border-orange-200">
                                <div className="text-xs text-gray-600 mb-1">Día Mínimo</div>
                                <div className="text-2xl font-bold text-orange-700">
                                  {Math.min(...ventas20Dias.map(v => v.cantidad_vendida)).toFixed(0)}
                                </div>
                                <div className="text-xs text-gray-500">bultos en un día</div>
                              </div>
                            </div>

                            {/* Fórmula del cálculo */}
                            <div className="bg-white rounded-lg p-4 border border-purple-200 mb-4">
                              <h5 className="text-xs font-semibold text-gray-700 mb-3">📐 Cómo se Calcula:</h5>
                              <div className="space-y-3 text-sm">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                                  <div>
                                    <div className="font-medium text-gray-800">Sumar todas las ventas de los últimos 20 días</div>
                                    <div className="text-xs text-gray-600 mt-1 font-mono bg-gray-50 px-2 py-1 rounded">
                                      Total = {ventas20Dias.map(v => v.cantidad_vendida.toFixed(0)).join(' + ')}...
                                    </div>
                                    <div className="text-xs text-purple-700 font-semibold mt-1">
                                      Total = {ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0).toFixed(0)} unidades
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                                  <div>
                                    <div className="font-medium text-gray-800">Dividir entre el número de días</div>
                                    <div className="text-xs text-gray-600 mt-1 font-mono bg-gray-50 px-2 py-1 rounded">
                                      Promedio = {ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0).toFixed(0)} ÷ {ventas20Dias.length}
                                    </div>
                                    <div className="text-xs text-purple-700 font-semibold mt-1">
                                      Promedio = {(ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0) / ventas20Dias.length).toFixed(2)} unidades/día
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Mini tabla de últimos días */}
                            <details className="bg-white rounded-lg border border-purple-200">
                              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-purple-900 hover:bg-purple-50 rounded-lg">
                                📅 Ver Detalle Día por Día (últimos 20 días)
                              </summary>
                              <div className="p-4 max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-purple-100 sticky top-0">
                                    <tr>
                                      <th className="px-2 py-2 text-left">Fecha</th>
                                      <th className="px-2 py-2 text-left">Día</th>
                                      <th className="px-2 py-2 text-right">Unidades</th>
                                      <th className="px-2 py-2 text-left">Visual</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ventas20Dias.map((venta, idx) => {
                                      const maxVenta = Math.max(...ventas20Dias.map(v => v.cantidad_vendida));
                                      const porcentaje = maxVenta > 0 ? (venta.cantidad_vendida / maxVenta) * 100 : 0;
                                      const esMax = venta.cantidad_vendida === maxVenta;
                                      const esMin = venta.cantidad_vendida === Math.min(...ventas20Dias.map(v => v.cantidad_vendida));

                                      return (
                                        <tr key={idx} className={`border-b border-gray-100 ${esMax ? 'bg-green-50' : esMin ? 'bg-orange-50' : ''}`}>
                                          <td className="px-2 py-1 font-mono">
                                            {new Date(venta.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                          </td>
                                          <td className="px-2 py-1 text-gray-600">{venta.dia_semana}</td>
                                          <td className="px-2 py-1 text-right font-semibold">{venta.cantidad_vendida.toFixed(0)}</td>
                                          <td className="px-2 py-1">
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                              <div
                                                className="bg-purple-600 h-2 rounded-full"
                                                style={{ width: `${porcentaje}%` }}
                                              ></div>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="bg-purple-100 sticky bottom-0">
                                    <tr className="font-bold">
                                      <td colSpan={2} className="px-2 py-2 text-left">PROMEDIO</td>
                                      <td className="px-2 py-2 text-right text-purple-700">
                                        {(ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0) / ventas20Dias.length).toFixed(1)}
                                      </td>
                                      <td className="px-2 py-2 text-purple-700 text-xs">unidades/día</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    )}

                    {/* Gráfico */}
                    <div className="h-96 relative">
                      {prepareChartData() && (
                        <Line
                          options={chartOptions}
                          data={prepareChartData()!}
                          plugins={[forecastZonePlugin, weekendPlugin]}
                        />
                      )}
                      <div className="absolute top-2 right-2 text-xs text-gray-500 bg-white/90 px-3 py-2 rounded border border-gray-200 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-blue-100"></span>
                          <span>Fin de semana</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-amber-100"></span>
                          <span>Proyección PMP (7 días)</span>
                        </div>
                        {Object.values(forecastData).some(f => f.dias_excluidos && f.dias_excluidos > 0) && (
                          <div className="pt-1 border-t border-gray-200 mt-1">
                            <span className="text-orange-600 font-medium">
                              ⚠️ {Math.max(...Object.values(forecastData).map(f => f.dias_excluidos || 0))} días excluidos
                            </span>
                            <br />
                            <span className="text-gray-400 text-xs">(posible falta de stock)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Estadísticas resumidas */}
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {Array.from(selectedTiendas).map(tiendaId => {
                        const ventaDia = ventasData.ventas_diarias.find(v => v.tiendas[tiendaId]);
                        const nombreTienda = ventaDia?.tiendas[tiendaId]?.tienda || tiendaId;

                        const totalBultos = ventasData.ventas_diarias.reduce(
                          (sum, v) => sum + (v.tiendas[tiendaId]?.bultos || 0),
                          0
                        );
                        const promedioDiario = totalBultos / ventasData.ventas_diarias.length;

                        return (
                          <div
                            key={tiendaId}
                            className="p-4 rounded-lg border-l-4 bg-white"
                            style={{ borderColor: COLORES_TIENDAS[tiendaId] || '#64748b' }}
                          >
                            <h5 className="text-sm font-medium text-gray-700 uppercase">{nombreTienda}</h5>
                            <p className="text-3xl font-bold text-gray-900 mt-2">
                              {promedioDiario.toFixed(2)}
                            </p>
                            <p className="text-sm text-gray-500 mb-3">bultos/día</p>
                            <p className="text-sm text-gray-600 border-t pt-2">
                              Promedio: {totalBultos.toFixed(2)} bultos totales
                            </p>
                            <button
                              onClick={() => {
                                setSelectedTiendaForTransactions({ id: tiendaId, nombre: nombreTienda });
                                setIsTransactionsModalOpen(true);
                              }}
                              className="mt-3 w-full px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Ver Transacciones
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    No se encontraron datos de ventas para este producto
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Modal de transacciones */}
      {selectedTiendaForTransactions && (
        <TransactionsModal
          isOpen={isTransactionsModalOpen}
          onClose={() => {
            setIsTransactionsModalOpen(false);
            setSelectedTiendaForTransactions(null);
          }}
          codigoProducto={codigoProducto}
          descripcionProducto={descripcionProducto}
          ubicacionId={selectedTiendaForTransactions.id}
          ubicacionNombre={selectedTiendaForTransactions.nombre}
        />
      )}
    </div>
  );
}
