import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import zoomPlugin from 'chartjs-plugin-zoom';
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
  ChartDataLabels,
  zoomPlugin
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
      // Agregar T00:00:00 para evitar problemas de timezone UTC
      const fecha = new Date(label + 'T00:00:00');
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

    // Encontrar el último punto con datos reales (no proyección)
    // Los datos de proyección empiezan después del último dato histórico
    // Buscamos el primer "salto" en las fechas consecutivas o usamos los datasets
    const datasets = chart.data.datasets;

    // Buscar el índice donde termina la data histórica (primer dataset sin "Proyección")
    let lastDataIndex = -1;
    for (const dataset of datasets) {
      if (dataset.label && !dataset.label.includes('Proyección') && !dataset.label.includes('Posible falta')) {
        const data = dataset.data as (number | null)[];
        for (let i = data.length - 1; i >= 0; i--) {
          if (data[i] !== null && data[i] !== undefined) {
            if (i > lastDataIndex) lastDataIndex = i;
            break;
          }
        }
      }
    }

    // El forecast empieza en el índice siguiente al último dato histórico
    const forecastStartIndex = lastDataIndex >= 0 ? lastDataIndex + 1 : -1;

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
      inventario?: number;
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

// Interfaces para historial de inventario
interface HistorialDataPoint {
  fecha: string;
  timestamp: number;
  ventas: number;
  inventario: number | null;
  inventario_bultos: number | null;  // Inventario convertido a bultos
  es_estimado: boolean;
}

interface HistorialInventarioResponse {
  producto_id: string;
  codigo_producto: string;
  descripcion_producto: string;
  ubicacion_id: string;
  ubicacion_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  granularidad: string;
  datos: HistorialDataPoint[];
  stock_actual: number;
  unidades_por_bulto: number;  // Para conversión de unidades a bultos
}

// Interfaces para ventas por hora
interface VentaHoraTienda {
  tienda: string;
  bultos: number;
  unidades: number;
  venta_total: number;
  transacciones: number;
}

interface VentaHoraria {
  hora: string;
  hora_display: string;
  tiendas: { [tiendaId: string]: VentaHoraTienda };
}

interface VentasHorariasResponse {
  producto: ProductoInfo;
  fecha: string;
  tiendas_disponibles: string[];
  ventas_horarias: VentaHoraria[];
  totales_dia: { [tiendaId: string]: VentaHoraTienda };
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
  const [semanas, setSemanas] = useState<number>(2); // Default: 2 semanas
  const [forecastData, setForecastData] = useState<{ [tiendaId: string]: ForecastResponse }>({});
  const [ventas20Dias, setVentas20Dias] = useState<VentaDiaria20D[]>([]);
  const [loading20D, setLoading20D] = useState(false);

  // Estado para el modal de transacciones
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [selectedTiendaForTransactions, setSelectedTiendaForTransactions] = useState<{id: string, nombre: string} | null>(null);

  // Estado para vista horaria (drill-down de un día)
  const [ventasHorarias, setVentasHorarias] = useState<VentasHorariasResponse | null>(null);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [showHourlyView, setShowHourlyView] = useState(false);
  const hourlyChartRef = useRef<ChartJS<'line'> | null>(null);

  // Estado para historial de inventario (overlay en gráfico)
  const [historialInventario, setHistorialInventario] = useState<{ [tiendaId: string]: HistorialDataPoint[] }>({});
  const [showInventario, setShowInventario] = useState(false);
  const [loadingInventario, setLoadingInventario] = useState(false);

  // Referencia al chart para control de zoom
  const chartRef = useRef<ChartJS<'line'> | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  // Estado para día seleccionado (click en punto)
  const [selectedDay, setSelectedDay] = useState<{ fecha: string; data: VentaDiaria } | null>(null);

  // Plugin para resaltar zonas de stock cero (dinámico basado en historialInventario)
  const stockZeroPlugin: Plugin<'line'> = useMemo(() => ({
    id: 'stockZeroHighlight',
    beforeDraw: (chart) => {
      if (!showInventario || Object.keys(historialInventario).length === 0) return;

      const ctx = chart.ctx;
      const chartArea = chart.chartArea;
      const xScale = chart.scales.x;

      if (!xScale || !chartArea) return;

      ctx.save();

      const labels = chart.data.labels as string[];

      // Encontrar fechas con stock cero en cualquier tienda seleccionada
      labels.forEach((label, index) => {
        const fecha = label.split('T')[0];
        let hasZeroStock = false;

        // Verificar si alguna tienda tiene stock cero en esta fecha (usando bultos)
        Object.entries(historialInventario).forEach(([tiendaId, datos]) => {
          if (selectedTiendas.has(tiendaId)) {
            const punto = datos.find(d => d.fecha.split('T')[0] === fecha);
            if (punto && (punto.inventario_bultos === 0 || punto.inventario === 0)) {
              hasZeroStock = true;
            }
          }
        });

        if (hasZeroStock) {
          const x = xScale.getPixelForValue(index);
          const nextX = index < labels.length - 1 ? xScale.getPixelForValue(index + 1) : chartArea.right;
          const width = nextX - x;

          // Fondo rojo semitransparente para días sin stock
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // Rojo claro transparente
          ctx.fillRect(x - width / 2, chartArea.top, width, chartArea.bottom - chartArea.top);
        }
      });

      ctx.restore();
    }
  }), [showInventario, historialInventario, selectedTiendas]);

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

  // Cargar historial de inventario para las tiendas seleccionadas
  const fetchHistorialInventario = useCallback(async () => {
    if (selectedTiendas.size === 0 || !ventasData) return;

    setLoadingInventario(true);
    const historial: { [tiendaId: string]: HistorialDataPoint[] } = {};

    try {
      // Calcular fechas basadas en las semanas seleccionadas
      const fechaFin = new Date().toISOString().split('T')[0];
      const fechaInicio = new Date(Date.now() - semanas * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Cargar en paralelo para todas las tiendas seleccionadas
      const promises = Array.from(selectedTiendas).map(async (tiendaId) => {
        try {
          const response = await http.get(
            `/api/productos/${codigoProducto}/historial-ventas-inventario?ubicacion_id=${tiendaId}&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}&granularidad=diario&incluir_diagnostico=false`
          );
          historial[tiendaId] = (response.data as HistorialInventarioResponse).datos;
        } catch (error) {
          console.error(`Error cargando inventario para tienda ${tiendaId}:`, error);
          historial[tiendaId] = [];
        }
      });

      await Promise.all(promises);
      setHistorialInventario(historial);
    } catch (error) {
      console.error('Error cargando historial de inventario:', error);
    } finally {
      setLoadingInventario(false);
    }
  }, [selectedTiendas, ventasData, codigoProducto, semanas]);

  // Cargar datos horarios para un día específico (drill-down)
  const fetchVentasHorarias = useCallback(async (fecha: string) => {
    try {
      setLoadingHorario(true);
      // Obtener las tiendas seleccionadas para el filtro
      const ubicacionIds = Array.from(selectedTiendas).join(',');
      const url = `/api/ventas/producto/horario?codigo_producto=${codigoProducto}&fecha=${fecha}${ubicacionIds ? `&ubicacion_ids=${ubicacionIds}` : ''}`;

      const response = await http.get(url);
      setVentasHorarias(response.data);
      setShowHourlyView(true);
    } catch (error) {
      console.error('Error cargando datos horarios:', error);
    } finally {
      setLoadingHorario(false);
    }
  }, [codigoProducto, selectedTiendas]);

  // Preparar datos para el gráfico horario
  const prepareHourlyChartData = useCallback(() => {
    if (!ventasHorarias) return null;

    const horas = ventasHorarias.ventas_horarias.map(v => v.hora_display);
    const datasets: {
      label: string;
      data: (number | null)[];
      borderColor: string;
      backgroundColor: string;
      borderWidth: number;
      pointRadius: number;
      pointHoverRadius: number;
      tension: number;
    }[] = [];

    // Crear dataset por cada tienda que tenga datos
    const tiendasConDatos = new Set<string>();
    ventasHorarias.ventas_horarias.forEach(vh => {
      Object.keys(vh.tiendas).forEach(tid => tiendasConDatos.add(tid));
    });

    tiendasConDatos.forEach(tiendaId => {
      const color = COLORES_TIENDAS[tiendaId] || '#64748b';
      const nombreTienda = ventasHorarias.totales_dia[tiendaId]?.tienda || tiendaId;

      const data = ventasHorarias.ventas_horarias.map(vh => {
        const tiendaData = vh.tiendas[tiendaId];
        return tiendaData ? tiendaData.bultos : 0;
      });

      datasets.push({
        label: nombreTienda,
        data,
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
      });
    });

    return { labels: horas, datasets };
  }, [ventasHorarias]);

  // Cerrar vista horaria y volver a vista diaria
  const closeHourlyView = useCallback(() => {
    setShowHourlyView(false);
    setVentasHorarias(null);
  }, []);

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

    // Fechas históricas (únicas, sin duplicados)
    const fechasHistoricas = ventasData.ventas_diarias.map(v => v.fecha);

    // Última fecha histórica (puede ser hoy o ayer dependiendo de los datos)
    const lastHistoricDateStr = fechasHistoricas[fechasHistoricas.length - 1];
    const lastHistoricDate = new Date(lastHistoricDateStr + 'T00:00:00');

    // Fechas futuras (forecast - 7 días después del último dato histórico)
    // Asegurarse de no duplicar fechas que ya estén en históricos
    const fechasHistoricasSet = new Set(fechasHistoricas);
    const fechasFuturas: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(lastHistoricDate);
      futureDate.setDate(lastHistoricDate.getDate() + i);
      const futureDateStr = futureDate.toISOString().split('T')[0];
      // Solo agregar si no está ya en las fechas históricas
      if (!fechasHistoricasSet.has(futureDateStr)) {
        fechasFuturas.push(futureDateStr);
      }
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
      const dataCompleta = [...dataHistoricaSuavizada, ...Array(fechasFuturas.length).fill(null)];

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

      // Dataset de outliers (puntos rojos para indicar posible falta de stock)
      const dataOutliers = dataHistoricaCompleta.map((valor, idx) => {
        return esOutlier[idx] ? valor : null;
      });

      datasets.push({
        label: `${nombreTienda} (⚠️ Posible falta de stock)`,
        data: [...dataOutliers, ...Array(fechasFuturas.length).fill(null)],
        borderColor: '#dc2626', // Rojo oscuro para el borde
        backgroundColor: '#fecaca', // Rojo claro para el relleno
        pointRadius: 8, // Más grande para ser visible
        pointHoverRadius: 10,
        pointBorderWidth: 2,
        pointStyle: 'circle',
        showLine: false, // Solo mostrar puntos, no línea
      });

      // Dataset de forecast (línea punteada) - solo para días FUTUROS
      if (forecastData[tiendaId] && forecastData[tiendaId].forecasts.length > 0) {
        // Obtener el último valor histórico válido para conectar con la proyección
        let lastHistoricValue: number | null = null;
        let lastHistoricIndex = -1;
        for (let i = dataHistoricaSuavizada.length - 1; i >= 0; i--) {
          if (dataHistoricaSuavizada[i] !== null) {
            lastHistoricValue = dataHistoricaSuavizada[i];
            lastHistoricIndex = i;
            break;
          }
        }

        // Solo usar tantos valores de forecast como fechas futuras tengamos
        const forecastValues = forecastData[tiendaId].forecasts
          .slice(0, fechasFuturas.length)
          .map(f => f.forecast_bultos);

        // Array de datos:
        // - null para todo hasta el último dato histórico (exclusivo)
        // - lastHistoricValue en el índice del último histórico (punto de conexión invisible)
        // - null para cualquier día histórico después (si hubiera)
        // - forecastValues para los días futuros
        const dataForecast = [
          ...Array(lastHistoricIndex).fill(null),
          lastHistoricValue, // Punto de conexión (último dato histórico real)
          ...Array(fechasHistoricas.length - lastHistoricIndex - 1).fill(null),
          ...forecastValues
        ];

        // pointRadius: 0 para todo excepto los días futuros que tienen forecast
        // El punto de conexión (lastHistoricIndex) no debe mostrar triángulo
        const pointRadiusArray = dataForecast.map((val, idx) => {
          // Solo mostrar triángulo en días futuros (índice >= fechasHistoricas.length)
          if (idx >= fechasHistoricas.length && val !== null) return 4;
          return 0;
        });

        datasets.push({
          label: `${nombreTienda} (Proyección PMP)`,
          data: dataForecast,
          borderColor: COLORES_TIENDAS[tiendaId] || '#64748b',
          backgroundColor: 'transparent',
          borderDash: [5, 5], // Línea punteada
          tension: 0.3,
          borderWidth: 2,
          pointRadius: pointRadiusArray,
          pointStyle: 'triangle',
        });
      }

      // Dataset de inventario (si está activado) - Ahora en bultos para consistencia
      if (showInventario && historialInventario[tiendaId]) {
        const inventarioData = historialInventario[tiendaId];

        // Mapear los datos de inventario EN BULTOS a las fechas del gráfico
        const inventarioMap = new Map(
          inventarioData.map(d => [d.fecha.split('T')[0], d.inventario_bultos])
        );

        const dataInventario = allFechas.map(fecha => {
          const inv = inventarioMap.get(fecha);
          return inv !== undefined ? inv : null;
        });

        // Obtener color base de la tienda y hacerlo más claro/diferente para inventario
        const colorBase = COLORES_TIENDAS[tiendaId] || '#64748b';

        datasets.push({
          label: `📦 ${nombreTienda} - Inventario`,
          data: dataInventario,
          borderColor: colorBase,
          backgroundColor: colorBase + '20', // 20% opacidad
          borderWidth: 1.5,
          borderDash: [3, 3], // Línea punteada para diferenciar
          tension: 0.2,
          fill: true, // Rellenar área bajo la curva
          // Usa el mismo eje Y que las ventas (ambos en bultos)
          pointRadius: 2,
          pointHoverRadius: 5,
          order: 10, // Dibujar detrás de las ventas
        });
      }
    });

    return {
      labels: allFechas,
      datasets,
    };
  };

  // Funciones de control de zoom
  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
      setIsZoomed(false);
    }
  };

  const handleZoomIn = () => {
    if (chartRef.current) {
      chartRef.current.zoom(1.5);
      setIsZoomed(true);
    }
  };

  const handleZoomOut = () => {
    if (chartRef.current) {
      chartRef.current.zoom(0.7);
    }
  };

  // Manejar click en punto del gráfico
  const handleChartClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!chartRef.current || !ventasData) return;

    const chart = chartRef.current;
    const points = chart.getElementsAtEventForMode(event.nativeEvent, 'nearest', { intersect: true }, false);

    if (points.length > 0) {
      const firstPoint = points[0];
      const fecha = chart.data.labels?.[firstPoint.index] as string;

      // Buscar datos de ese día
      const ventaDia = ventasData.ventas_diarias.find(v => v.fecha === fecha);
      if (ventaDia) {
        // Limpiar vista horaria al cambiar de día
        setShowHourlyView(false);
        setVentasHorarias(null);
        setSelectedDay({ fecha, data: ventaDia });
      }
    }
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
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: 'rgba(59, 130, 246, 0.8)',
            borderWidth: 1,
            threshold: 10, // Mínimo 10px de drag para activar zoom, permite clicks
          },
          pinch: {
            enabled: true,
          },
          mode: 'x',
          onZoomComplete: () => {
            setIsZoomed(true);
          },
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (tooltipItems) => {
            const fecha = tooltipItems[0].label;
            // Agregar T00:00:00 para evitar problemas de timezone UTC
            const fechaObj = new Date(fecha + 'T00:00:00');
            const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const diaNombre = diasSemana[fechaObj.getDay()];
            const esFinDeSemana = fechaObj.getDay() === 0 || fechaObj.getDay() === 6;
            return `${diaNombre}${esFinDeSemana ? ' 🎯' : ''}, ${fecha}`;
          },
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            const fecha = context.label;

            // Para datos históricos, buscar las unidades originales
            if (ventasData && !label.includes('Proyección') && !label.includes('⚠️')) {
              const tiendaId = Array.from(selectedTiendas).find(tid => {
                const nombreTienda = ventasData.ventas_diarias
                  .find(v => v.tiendas[tid])?.tiendas[tid]?.tienda;
                return label === nombreTienda || label === tid;
              });

              if (tiendaId) {
                const ventaDia = ventasData.ventas_diarias.find(v => v.fecha === fecha);
                if (ventaDia?.tiendas[tiendaId]) {
                  const unidades = ventaDia.tiendas[tiendaId].unidades || 0;
                  return `${label}: ${value.toFixed(2)} bultos (${unidades.toFixed(0)} unid)`;
                }
              }
            }

            // Para proyección, mostrar también unidades estimadas
            if (label.includes('Proyección') && forecastData) {
              const tiendaId = Array.from(selectedTiendas).find(tid => {
                const nombreTienda = ventasData?.ventas_diarias
                  .find(v => v.tiendas[tid])?.tiendas[tid]?.tienda;
                return label.includes(nombreTienda || '') || label.includes(tid);
              });

              if (tiendaId && forecastData[tiendaId]) {
                const forecastDia = forecastData[tiendaId].forecasts.find(f => f.fecha === fecha);
                if (forecastDia) {
                  return `${label}: ${value.toFixed(2)} bultos (${forecastDia.forecast_unidades.toFixed(0)} unid)`;
                }
              }
            }

            // Para inventario, mostrar bultos (ahora consistente con ventas)
            if (label.includes('Inventario')) {
              const stockValue = value !== null ? value : 0;
              const esStockCero = stockValue === 0;
              return `${label}: ${stockValue.toFixed(2)} bultos${esStockCero ? ' ⚠️ SIN STOCK' : ''}`;
            }

            return `${label}: ${value.toFixed(2)} bultos`;
          },
        },
      },
      datalabels: {
        display: (context) => {
          // NO mostrar en outliers
          const label = context.dataset.label || '';
          if (label.includes('⚠️ Posible falta de stock')) return false;

          // NO mostrar en datasets de inventario
          if (label.includes('Inventario')) return false;

          // Para Proyección PMP: no mostrar etiqueta en el punto de conexión (el primero no-null)
          // El punto de conexión es hoy (dato real), no queremos etiqueta naranja ahí
          if (label.includes('Proyección')) {
            const data = context.dataset.data as (number | null)[];
            // Encontrar el índice del primer valor no-null (punto de conexión)
            let firstNonNullIndex = -1;
            for (let i = 0; i < data.length; i++) {
              if (data[i] !== null) {
                firstNonNullIndex = i;
                break;
              }
            }
            // Si este es el punto de conexión, no mostrar etiqueta
            if (context.dataIndex === firstNonNullIndex) return false;
          }

          return true;
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
          return value.toFixed(2);
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
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        beginAtZero: true,
        title: {
          display: true,
          text: showInventario ? 'Bultos (Ventas e Inventario)' : 'Bultos Vendidos',
        },
      },
      // Ya no necesitamos eje Y secundario - todo está en bultos ahora
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
                      <div className="mt-2 flex gap-2 items-center">
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
                        <span className="text-gray-300 mx-2">|</span>
                        {/* Toggle de Inventario */}
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showInventario}
                            onChange={(e) => {
                              setShowInventario(e.target.checked);
                              if (e.target.checked && Object.keys(historialInventario).length === 0) {
                                fetchHistorialInventario();
                              }
                            }}
                            className="w-3.5 h-3.5 text-purple-600 rounded focus:ring-purple-500"
                          />
                          <span className="text-xs text-purple-700 font-medium">
                            Mostrar Inventario
                          </span>
                          {loadingInventario && (
                            <svg className="animate-spin h-3 w-3 text-purple-600" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Gráfico */}
                    <div className="h-96 relative">
                      {/* Controles de zoom */}
                      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleZoomIn}
                            className="p-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
                            title="Acercar"
                          >
                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleZoomOut}
                            className="p-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
                            title="Alejar"
                          >
                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                            </svg>
                          </button>
                          {isZoomed && (
                            <button
                              onClick={handleResetZoom}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Ver todo
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 bg-white/80 px-1 rounded">
                          Arrastra: zoom | Click: detalle hora
                        </span>
                      </div>

                      {prepareChartData() && (
                        <Line
                          ref={chartRef}
                          options={chartOptions}
                          data={prepareChartData()!}
                          plugins={[forecastZonePlugin, weekendPlugin, stockZeroPlugin]}
                          onClick={handleChartClick}
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
                        {showInventario && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 bg-purple-200 border border-purple-400 border-dashed"></span>
                              <span>Inventario (bultos)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 bg-red-200 border border-red-300"></span>
                              <span>Sin stock</span>
                            </div>
                          </>
                        )}
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

                    {/* Panel de detalle del día seleccionado */}
                    {selectedDay && (
                      <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Detalle del {new Date(selectedDay.fecha + 'T00:00:00').toLocaleDateString('es-VE', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </h4>
                          <div className="flex items-center gap-2">
                            {/* Botón para ver detalle por hora */}
                            <button
                              onClick={() => fetchVentasHorarias(selectedDay.fecha)}
                              disabled={loadingHorario}
                              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {loadingHorario ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                              Ver por hora
                            </button>
                            <button
                              onClick={() => setSelectedDay(null)}
                              className="text-indigo-400 hover:text-indigo-600"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {Object.entries(selectedDay.data.tiendas).map(([tiendaId, tiendaData]) => (
                            <div
                              key={tiendaId}
                              className="bg-white rounded-lg p-3 border-l-4"
                              style={{ borderColor: COLORES_TIENDAS[tiendaId] || '#64748b' }}
                            >
                              <div className="text-xs text-gray-600 font-medium">{tiendaData.tienda}</div>
                              <div className="text-xl font-bold text-gray-900">{tiendaData.bultos.toFixed(2)}</div>
                              <div className="text-xs text-gray-500">
                                {tiendaData.unidades.toFixed(0)} unid • ${tiendaData.venta_total.toFixed(2)}
                              </div>
                              {tiendaData.inventario !== undefined && (
                                <div className="text-xs text-green-600 mt-1">
                                  Stock: {tiendaData.inventario}
                                </div>
                              )}
                              {tiendaData.es_outlier && (
                                <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                  <span>⚠️</span> Posible quiebre
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Gráfico de ventas por hora */}
                        {showHourlyView && ventasHorarias && (
                          <div className="mt-4 bg-white rounded-lg p-4 border border-indigo-200">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Ventas por Hora - {new Date(ventasHorarias.fecha + 'T00:00:00').toLocaleDateString('es-VE', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'short'
                                })}
                              </h5>
                              <button
                                onClick={closeHourlyView}
                                className="text-gray-400 hover:text-gray-600 text-xs flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Cerrar
                              </button>
                            </div>

                            {/* Gráfico horario */}
                            <div className="h-64">
                              {prepareHourlyChartData() && (
                                <Line
                                  ref={hourlyChartRef}
                                  options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                      legend: {
                                        position: 'top' as const,
                                        labels: { usePointStyle: true, padding: 10, font: { size: 11 } },
                                      },
                                      title: {
                                        display: false,
                                      },
                                      datalabels: {
                                        display: false,
                                      },
                                      tooltip: {
                                        mode: 'index',
                                        intersect: false,
                                        callbacks: {
                                          label: (context) => {
                                            const label = context.dataset.label || '';
                                            const value = context.parsed.y;
                                            // Buscar unidades para este punto
                                            const hora = ventasHorarias.ventas_horarias[context.dataIndex];
                                            const tiendaId = Object.keys(hora?.tiendas || {}).find(tid => {
                                              const tiendaNombre = ventasHorarias.totales_dia[tid]?.tienda;
                                              return tiendaNombre === label || tid === label;
                                            });
                                            if (tiendaId && hora?.tiendas[tiendaId]) {
                                              const unidades = hora.tiendas[tiendaId].unidades;
                                              const trans = hora.tiendas[tiendaId].transacciones;
                                              return `${label}: ${value.toFixed(2)} bultos (${unidades.toFixed(0)} unid, ${trans} trans)`;
                                            }
                                            return `${label}: ${value.toFixed(2)} bultos`;
                                          },
                                        },
                                      },
                                    },
                                    scales: {
                                      x: {
                                        title: { display: true, text: 'Hora del día', font: { size: 11 } },
                                        grid: { display: false },
                                      },
                                      y: {
                                        title: { display: true, text: 'Bultos', font: { size: 11 } },
                                        beginAtZero: true,
                                      },
                                    },
                                  }}
                                  data={prepareHourlyChartData()!}
                                />
                              )}
                            </div>

                            {/* Tabla resumen por hora */}
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                Ver tabla detallada por hora
                              </summary>
                              <div className="mt-2 overflow-x-auto max-h-48">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left font-semibold">Hora</th>
                                      {Object.keys(ventasHorarias.totales_dia).map(tiendaId => (
                                        <th key={tiendaId} className="px-2 py-1.5 text-center font-semibold" style={{ color: COLORES_TIENDAS[tiendaId] || '#64748b' }}>
                                          {ventasHorarias.totales_dia[tiendaId]?.tienda || tiendaId}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ventasHorarias.ventas_horarias.map((vh) => {
                                      const tieneData = Object.keys(vh.tiendas).length > 0;
                                      return (
                                        <tr key={vh.hora} className={`border-b border-gray-100 ${tieneData ? 'bg-white' : 'bg-gray-50'}`}>
                                          <td className="px-2 py-1 font-medium text-gray-700">{vh.hora_display}</td>
                                          {Object.keys(ventasHorarias.totales_dia).map(tiendaId => {
                                            const data = vh.tiendas[tiendaId];
                                            return (
                                              <td key={tiendaId} className="px-2 py-1 text-center">
                                                {data ? (
                                                  <span className="font-medium">{data.bultos.toFixed(2)}</span>
                                                ) : (
                                                  <span className="text-gray-300">-</span>
                                                )}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="bg-indigo-50 sticky bottom-0">
                                    <tr className="font-bold">
                                      <td className="px-2 py-1.5">TOTAL</td>
                                      {Object.keys(ventasHorarias.totales_dia).map(tiendaId => (
                                        <td key={tiendaId} className="px-2 py-1.5 text-center" style={{ color: COLORES_TIENDAS[tiendaId] || '#64748b' }}>
                                          {ventasHorarias.totales_dia[tiendaId]?.bultos.toFixed(2) || '0'}
                                        </td>
                                      ))}
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tabla de Ventas Diarias y Proyección - Rediseñada */}
                    {selectedTiendas.size > 0 && (
                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-base font-semibold text-gray-800">
                            Detalle de Ventas, Inventario y Proyección
                          </h4>
                          <div className="flex gap-3 text-xs flex-wrap">
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded border border-blue-200">
                              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                              Fin de semana
                            </span>
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded border border-amber-200">
                              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                              Proyección
                            </span>
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded border border-red-200">
                              <span className="text-red-500 text-sm">⚠️</span>
                              Posible quiebre
                            </span>
                          </div>
                        </div>
                        <div className="overflow-x-auto border rounded-lg shadow-sm max-h-[420px]">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                              <tr className="border-b-2 border-gray-300">
                                <th className="px-3 py-2.5 text-left font-semibold text-gray-700 bg-gray-100 min-w-[180px]">
                                  Fecha
                                </th>
                                {Array.from(selectedTiendas).map(tiendaId => {
                                  const nombreTienda = ventasData.ventas_diarias
                                    .find(v => v.tiendas[tiendaId])?.tiendas[tiendaId]?.tienda || tiendaId;
                                  return (
                                    <React.Fragment key={tiendaId}>
                                      <th
                                        className="px-3 py-2.5 text-center font-semibold whitespace-nowrap bg-purple-50 border-l border-gray-200"
                                        style={{ color: COLORES_TIENDAS[tiendaId] || '#64748b' }}
                                      >
                                        <div>{nombreTienda}</div>
                                        <div className="text-xs font-normal text-gray-500">Venta (Unid)</div>
                                      </th>
                                      <th
                                        className="px-3 py-2.5 text-center font-semibold whitespace-nowrap bg-green-50"
                                        style={{ color: COLORES_TIENDAS[tiendaId] || '#64748b' }}
                                      >
                                        <div>Inventario</div>
                                        <div className="text-xs font-normal text-gray-500">Stock (Unid)</div>
                                      </th>
                                    </React.Fragment>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                                const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                                const fechasHistoricas = ventasData.ventas_diarias.map(v => v.fecha);
                                const lastHistoricDate = new Date(fechasHistoricas[fechasHistoricas.length - 1] + 'T00:00:00');

                                // Generar fechas futuras
                                const fechasFuturas: string[] = [];
                                for (let i = 1; i <= 7; i++) {
                                  const futureDate = new Date(lastHistoricDate);
                                  futureDate.setDate(lastHistoricDate.getDate() + i);
                                  fechasFuturas.push(futureDate.toISOString().split('T')[0]);
                                }

                                const allRows = [
                                  ...ventasData.ventas_diarias.map(v => ({ fecha: v.fecha, tipo: 'historico' as const, data: v })),
                                  ...fechasFuturas.map(f => ({ fecha: f, tipo: 'proyeccion' as const, data: null }))
                                ];

                                return allRows.map((row) => {
                                  const fechaObj = new Date(row.fecha + 'T00:00:00');
                                  const diaSemana = diasSemana[fechaObj.getDay()];
                                  const dia = fechaObj.getDate();
                                  const mes = mesesCortos[fechaObj.getMonth()];
                                  const esFinSemana = fechaObj.getDay() === 0 || fechaObj.getDay() === 6;
                                  const esProyeccion = row.tipo === 'proyeccion';

                                  // Formatear fecha: "Sáb 22 Nov"
                                  const fechaFormateada = `${diaSemana} ${dia} ${mes}`;

                                  return (
                                    <tr
                                      key={row.fecha}
                                      className={`
                                        border-b border-gray-100 transition-colors
                                        ${esFinSemana && !esProyeccion ? 'bg-blue-50/50' : ''}
                                        ${esProyeccion ? 'bg-amber-50/50' : ''}
                                        ${!esFinSemana && !esProyeccion ? 'bg-white' : ''}
                                        hover:bg-gray-50
                                      `}
                                    >
                                      <td className="px-3 py-2">
                                        <span className={`font-medium ${esFinSemana ? 'text-blue-700' : esProyeccion ? 'text-amber-700' : 'text-gray-700'}`}>
                                          {fechaFormateada}
                                        </span>
                                      </td>
                                      {Array.from(selectedTiendas).map(tiendaId => {
                                        if (esProyeccion) {
                                          const forecast = forecastData[tiendaId]?.forecasts?.find(f => f.fecha === row.fecha);
                                          if (forecast) {
                                            return (
                                              <React.Fragment key={`${tiendaId}-${row.fecha}`}>
                                                <td className="px-3 py-2 text-center bg-purple-50/30 border-l border-gray-100">
                                                  <span className="font-semibold text-amber-700">
                                                    {forecast.forecast_unidades.toFixed(0)}
                                                  </span>
                                                  <span className="text-xs text-amber-600 ml-1">
                                                    ({forecast.forecast_bultos.toFixed(1)} btos)
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 text-center bg-green-50/30 text-gray-400">
                                                  —
                                                </td>
                                              </React.Fragment>
                                            );
                                          }
                                          return (
                                            <React.Fragment key={`${tiendaId}-${row.fecha}`}>
                                              <td className="px-3 py-2 text-center bg-purple-50/30 border-l border-gray-100 text-gray-400">—</td>
                                              <td className="px-3 py-2 text-center bg-green-50/30 text-gray-400">—</td>
                                            </React.Fragment>
                                          );
                                        }

                                        // Datos históricos
                                        const tiendaData = row.data?.tiendas[tiendaId];
                                        const bultos = tiendaData?.bultos || 0;
                                        const unidades = tiendaData?.unidades || 0;
                                        const inventario = tiendaData?.inventario;
                                        const esOutlier = tiendaData?.es_outlier || false;

                                        return (
                                          <React.Fragment key={`${tiendaId}-${row.fecha}`}>
                                            <td className={`px-3 py-2 text-center border-l border-gray-100 ${esOutlier ? 'bg-red-50' : 'bg-purple-50/30'}`}>
                                              {esOutlier && <span className="text-red-500 mr-0.5">⚠️</span>}
                                              <span className={`font-semibold ${esOutlier ? 'text-red-600' : 'text-gray-800'}`}>
                                                {unidades.toFixed(0)}
                                              </span>
                                              <span className={`text-xs ml-1 ${esOutlier ? 'text-red-500' : 'text-gray-500'}`}>
                                                ({bultos.toFixed(1)} btos)
                                              </span>
                                            </td>
                                            <td className={`px-3 py-2 text-center bg-green-50/30 ${inventario !== null && inventario !== undefined ? '' : 'text-gray-400'}`}>
                                              {inventario !== null && inventario !== undefined ? (
                                                <span className="font-medium text-green-700">{inventario.toFixed(0)}</span>
                                              ) : (
                                                '—'
                                              )}
                                            </td>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

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

                    {/* Sección Educativa: Cálculo del Percentil 75 (P75) - Al final */}
                    {currentUbicacionId && ventas20Dias.length > 0 && (
                      <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <h4 className="text-sm font-semibold text-purple-900">
                            Cálculo del Percentil 75 - P75 (Tienda Actual)
                          </h4>
                        </div>

                        {loading20D ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                          </div>
                        ) : (
                          (() => {
                            // Calcular P75
                            const valoresOrdenados = [...ventas20Dias]
                              .map(v => v.cantidad_vendida)
                              .sort((a, b) => a - b);
                            const n = valoresOrdenados.length;
                            const posicionP75 = (n - 1) * 0.75;
                            const indiceBajo = Math.floor(posicionP75);
                            const indiceAlto = Math.ceil(posicionP75);
                            const fraccion = posicionP75 - indiceBajo;
                            const p75 = indiceBajo === indiceAlto
                              ? valoresOrdenados[indiceBajo]
                              : valoresOrdenados[indiceBajo] * (1 - fraccion) + valoresOrdenados[indiceAlto] * fraccion;

                            // Calcular mediana (P50) para comparación
                            const posicionP50 = (n - 1) * 0.50;
                            const indiceBajoP50 = Math.floor(posicionP50);
                            const indiceAltoP50 = Math.ceil(posicionP50);
                            const fraccionP50 = posicionP50 - indiceBajoP50;
                            const p50 = indiceBajoP50 === indiceAltoP50
                              ? valoresOrdenados[indiceBajoP50]
                              : valoresOrdenados[indiceBajoP50] * (1 - fraccionP50) + valoresOrdenados[indiceAltoP50] * fraccionP50;

                            const promedio = ventas20Dias.reduce((sum, v) => sum + v.cantidad_vendida, 0) / n;

                            return (
                              <>
                                {/* Estadísticas Principales */}
                                <div className="grid grid-cols-4 gap-3 mb-4">
                                  <div className="bg-purple-100 rounded-lg p-3 text-center border-2 border-purple-400">
                                    <div className="text-xs text-purple-700 mb-1 font-semibold">P75</div>
                                    <div className="text-2xl font-bold text-purple-700">
                                      {p75.toFixed(1)}
                                    </div>
                                    <div className="text-xs text-purple-600">unidades/día</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
                                    <div className="text-xs text-gray-600 mb-1">Mediana (P50)</div>
                                    <div className="text-2xl font-bold text-gray-700">
                                      {p50.toFixed(1)}
                                    </div>
                                    <div className="text-xs text-gray-500">unidades/día</div>
                                  </div>
                                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                                    <div className="text-xs text-gray-600 mb-1">Máximo</div>
                                    <div className="text-2xl font-bold text-green-700">
                                      {Math.max(...valoresOrdenados).toFixed(0)}
                                    </div>
                                    <div className="text-xs text-gray-500">unidades</div>
                                  </div>
                                  <div className="bg-orange-50 rounded-lg p-3 text-center border border-orange-200">
                                    <div className="text-xs text-gray-600 mb-1">Mínimo</div>
                                    <div className="text-2xl font-bold text-orange-700">
                                      {Math.min(...valoresOrdenados).toFixed(0)}
                                    </div>
                                    <div className="text-xs text-gray-500">unidades</div>
                                  </div>
                                </div>

                                {/* Explicación del P75 */}
                                <div className="bg-white rounded-lg p-4 border border-purple-200 mb-4">
                                  <h5 className="text-xs font-semibold text-gray-700 mb-3">¿Por qué usamos P75?</h5>
                                  <div className="space-y-3 text-sm">
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                                      <div>
                                        <div className="font-medium text-gray-800">Ordenar ventas de menor a mayor</div>
                                        <div className="text-xs text-gray-600 mt-1 font-mono bg-gray-50 px-2 py-1 rounded overflow-x-auto">
                                          [{valoresOrdenados.map(v => v.toFixed(0)).join(', ')}]
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                                      <div>
                                        <div className="font-medium text-gray-800">Tomar el valor en la posición 75%</div>
                                        <div className="text-xs text-gray-600 mt-1">
                                          Posición: ({n} - 1) × 0.75 = <span className="font-mono bg-gray-50 px-1 rounded">{posicionP75.toFixed(2)}</span>
                                        </div>
                                        <div className="text-xs text-purple-700 font-semibold mt-1">
                                          P75 = {p75.toFixed(2)} unidades/día
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">✓</div>
                                      <div>
                                        <div className="font-medium text-gray-800">Ventaja sobre el promedio</div>
                                        <div className="text-xs text-gray-600 mt-1">
                                          El P75 es más robusto que el promedio ({promedio.toFixed(1)}) porque <span className="font-semibold text-purple-700">ignora días atípicos con ventas muy bajas</span> (posibles quiebres de stock).
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Mini tabla de últimos días */}
                                <details className="bg-white rounded-lg border border-purple-200">
                                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-purple-900 hover:bg-purple-50 rounded-lg">
                                    Ver Detalle Día por Día ({ventas20Dias.length} días)
                                  </summary>
                                  <div className="p-4 max-h-64 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-purple-100 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-2 text-left">Fecha</th>
                                          <th className="px-2 py-2 text-left">Día</th>
                                          <th className="px-2 py-2 text-right">Unidades</th>
                                          <th className="px-2 py-2 text-center">vs P75</th>
                                          <th className="px-2 py-2 text-left">Visual</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {ventas20Dias.map((venta, idx) => {
                                          const maxVenta = Math.max(...ventas20Dias.map(v => v.cantidad_vendida));
                                          const porcentaje = maxVenta > 0 ? (venta.cantidad_vendida / maxVenta) * 100 : 0;
                                          const esMax = venta.cantidad_vendida === maxVenta;
                                          const esMin = venta.cantidad_vendida === Math.min(...ventas20Dias.map(v => v.cantidad_vendida));
                                          const sobreP75 = venta.cantidad_vendida >= p75;

                                          return (
                                            <tr key={idx} className={`border-b border-gray-100 ${esMax ? 'bg-green-50' : esMin ? 'bg-orange-50' : ''}`}>
                                              <td className="px-2 py-1 font-mono">
                                                {new Date(venta.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                              </td>
                                              <td className="px-2 py-1 text-gray-600">{venta.dia_semana}</td>
                                              <td className="px-2 py-1 text-right font-semibold">{venta.cantidad_vendida.toFixed(0)}</td>
                                              <td className="px-2 py-1 text-center">
                                                {sobreP75 ? (
                                                  <span className="text-green-600 font-semibold">≥P75</span>
                                                ) : (
                                                  <span className="text-gray-400">&lt;P75</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-1">
                                                <div className="w-full bg-gray-200 rounded-full h-2 relative">
                                                  <div
                                                    className={`h-2 rounded-full ${sobreP75 ? 'bg-purple-600' : 'bg-gray-400'}`}
                                                    style={{ width: `${porcentaje}%` }}
                                                  ></div>
                                                  {/* Línea de P75 */}
                                                  <div
                                                    className="absolute top-0 h-2 w-0.5 bg-purple-800"
                                                    style={{ left: `${(p75 / maxVenta) * 100}%` }}
                                                  ></div>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="bg-purple-100 sticky bottom-0">
                                        <tr className="font-bold">
                                          <td colSpan={2} className="px-2 py-2 text-left">P75</td>
                                          <td className="px-2 py-2 text-right text-purple-700">
                                            {p75.toFixed(1)}
                                          </td>
                                          <td colSpan={2} className="px-2 py-2 text-purple-700 text-xs">unidades/día</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </details>
                              </>
                            );
                          })()
                        )}
                      </div>
                    )}
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
