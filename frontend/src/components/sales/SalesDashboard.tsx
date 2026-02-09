import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import http from '../../services/http';
import { useABCModel } from '../../services/abcModelService';
import ProductSalesModal from './ProductSalesModal';
import SyncVentasModal from './SyncVentasModal';
import CentroComandoVentasModal from './CentroComandoVentasModal';
import VentasPerdidasModal from './VentasPerdidasModal';

interface VentasDetail {
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string;
  marca: string | null;
  cantidad_total: number;
  promedio_diario: number;
  promedio_mismo_dia_semana: number;
  comparacion_ano_anterior: number | null;
  porcentaje_total: number;
  cantidad_bultos: number | null;
  total_bultos: number | null;
  promedio_bultos_diario: number | null;
  venta_total: number | null;
  clase_abc: string | null;
  rank_ventas: number | null;
  velocidad_venta: string | null;
  stock_actual: number | null;
  p75_unidades_dia: number | null;
  p75_lun: number | null;
  p75_mar: number | null;
  p75_mie: number | null;
  p75_jue: number | null;
  p75_vie: number | null;
  p75_sab: number | null;
  p75_dom: number | null;
  q15_boost: number | null;
}

interface PaginationMetadata {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
}

interface PaginatedVentasResponse {
  data: VentasDetail[];
  pagination: PaginationMetadata;
}

interface Categoria {
  value: string;
  label: string;
}

interface HistoricoDiaItem {
  fecha: string;
  fecha_display: string;
  cantidad: number;
  es_probable_rotura: boolean;
}

// Mapping de ubicaciones a nombres amigables
const UBICACION_FRIENDLY_NAMES: Record<string, string> = {
  'tienda_01': 'PERIFÉRICO',
  'tienda_02': 'AV. BOLÍVAR',
  'tienda_03': 'MAÑONGO',
  'tienda_04': 'SAN DIEGO',
  'tienda_05': 'VIVIENDA',
  'tienda_06': 'NAGUANAGUA',
  'tienda_07': 'CENTRO',
  'tienda_08': 'BOSQUE',
  'tienda_09': 'GUACARA',
  'tienda_10': 'FERIAS',
  'tienda_11': 'FLOR AMARILLO',
  'tienda_12': 'PARAPARAL',
  'tienda_13': 'NAGUANAGUA III',
  'tienda_15': 'ISABELICA',
  'tienda_16': 'TOCUYITO',
  'tienda_17': 'ARTIGAS',
  'tienda_18': 'PARAÍSO',
  'tienda_19': 'GUIGUE',
  'tienda_20': 'TAZAJAL',
};

// Mapeo de nombre de día a número de día de semana (DOW)
const diaToNumber: Record<string, number> = {
  'Domingo': 0,
  'Lunes': 1,
  'Martes': 2,
  'Miércoles': 3,
  'Jueves': 4,
  'Viernes': 5,
  'Sábado': 6,
};

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { ubicacionId } = useParams();
  const { filterOptions: abcFilterOptions } = useABCModel();
  const nombreTienda = ubicacionId ? UBICACION_FRIENDLY_NAMES[ubicacionId] || ubicacionId : '';

  const [ventasData, setVentasData] = useState<VentasDetail[]>([]);
  const [pagination, setPagination] = useState<PaginationMetadata | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  const [selectedMarca, setSelectedMarca] = useState<string>('');
  const [selectedClaseABC, setSelectedClaseABC] = useState<string>('');
  const [selectedVelocidad, setSelectedVelocidad] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('ultimo_mes');

  // Debounce para búsqueda
  const searchDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Paginación (ahora server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Modal de análisis de producto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<{codigo: string; descripcion: string} | null>(null);

  // Modal de sincronización de ventas
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Modal Centro de Comando de Ventas (Agotados Visuales)
  const [showCentroComandoModal, setShowCentroComandoModal] = useState(false);
  const [agotadosVisualesCount, setAgotadosVisualesCount] = useState<number>(0);

  // Modal Ventas Perdidas
  const [showVentasPerdidasModal, setShowVentasPerdidasModal] = useState(false);

  // Modal Análisis por Día
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ dia: string; producto: VentasDetail } | null>(null);

  // Modal Q15% Análisis
  const [showQ15Modal, setShowQ15Modal] = useState(false);
  const [selectedQ15Producto, setSelectedQ15Producto] = useState<VentasDetail | null>(null);

  // Histórico por día de semana
  const [historicoDia, setHistoricoDia] = useState<HistoricoDiaItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Estado para descarga Excel
  const [exportingExcel, setExportingExcel] = useState(false);

  // Métricas
  const stats = {
    productos_unicos: pagination?.total_items || 0,
    total_unidades: ventasData.reduce((sum, item) => sum + item.cantidad_total, 0),
    abc_a: ventasData.filter(i => i.clase_abc === 'A').length,
    abc_b: ventasData.filter(i => i.clase_abc === 'B').length,
    vel_muy_alta: ventasData.filter(i => i.velocidad_venta === 'MUY_ALTA').length,
  };

  // Debounce effect para búsqueda (300ms)
  useEffect(() => {
    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    searchDebounceTimer.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);

    return () => {
      if (searchDebounceTimer.current) {
        clearTimeout(searchDebounceTimer.current);
      }
    };
  }, [searchTerm]);

  // diaToNumber moved to module scope to avoid being a dependency

  // Cargar histórico cuando se abre el modal de día
  useEffect(() => {
    if (!showDayModal || !selectedDay || !ubicacionId) {
      setHistoricoDia([]);
      return;
    }

    const fetchHistorico = async () => {
      setLoadingHistorico(true);
      try {
        const diaSemana = diaToNumber[selectedDay.dia];
        const response = await http.get(`/api/ventas/producto/${selectedDay.producto.codigo_producto}/historico-dia`, {
          params: {
            ubicacion_id: ubicacionId,
            dia_semana: diaSemana
          }
        });
        setHistoricoDia(response.data.dias || []);
      } catch (error) {
        console.error('Error cargando histórico por día:', error);
        setHistoricoDia([]);
      } finally {
        setLoadingHistorico(false);
      }
    };

    fetchHistorico();
  }, [showDayModal, selectedDay, ubicacionId]);

  const calcularRangoFechas = (periodo: string) => {
    const hoy = new Date();
    let inicio = new Date();
    let fin = new Date();

    switch (periodo) {
      case 'hoy':
        inicio = hoy;
        fin = hoy;
        break;
      case 'ayer':
        inicio = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
        fin = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'ultima_semana':
        inicio = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'ultimo_mes':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate());
        break;
      case 'ultimos_3_meses':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate());
        break;
      case 'ultimo_ano':
        inicio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
        break;
      case 'mes_actual':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        break;
      case 'mes_anterior':
        inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
        break;
      default:
        return null;
    }

    return {
      inicio: inicio.toISOString().split('T')[0],
      fin: fin.toISOString().split('T')[0]
    };
  };

  const handlePeriodoChange = (periodo: string) => {
    setPeriodoSeleccionado(periodo);
    if (periodo === 'personalizado') {
      return;
    }
    const rango = calcularRangoFechas(periodo);
    if (rango) {
      setFechaInicio(rango.inicio);
      setFechaFin(rango.fin);
    }
  };

  const handleMesChange = (mes: string) => {
    if (!mes) return;
    const [year, month] = mes.split('-');
    const inicio = new Date(parseInt(year), parseInt(month) - 1, 1);
    const fin = new Date(parseInt(year), parseInt(month), 0);

    setFechaInicio(inicio.toISOString().split('T')[0]);
    setFechaFin(fin.toISOString().split('T')[0]);
    setPeriodoSeleccionado('personalizado');
  };

  const loadCategorias = async () => {
    try {
      const response = await http.get('/api/ventas/categorias');
      setCategorias(response.data);
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }
  };

  const loadVentasData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (ubicacionId) params.append('ubicacion_id', ubicacionId);
      if (selectedCategoria) params.append('categoria', selectedCategoria);
      if (fechaInicio) params.append('fecha_inicio', fechaInicio);
      if (fechaFin) params.append('fecha_fin', fechaFin);

      params.append('page', currentPage.toString());
      params.append('page_size', pageSize.toString());

      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);

      const response = await http.get(`/api/ventas/detail?${params.toString()}`) as { data: PaginatedVentasResponse };
      setVentasData(response.data.data);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error cargando datos de ventas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategorias();
    handlePeriodoChange('ultimo_mes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fechaInicio && fechaFin) {
      loadVentasData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicacionId, selectedCategoria, fechaInicio, fechaFin, currentPage, debouncedSearchTerm]);

  const loadAgotadosVisualesCount = useCallback(async () => {
    if (!ubicacionId) return;
    try {
      const response = await http.get(`/api/ventas/agotados-visuales/${ubicacionId}/count`);
      setAgotadosVisualesCount(response.data.total_alertas || 0);
    } catch (error) {
      console.error('Error cargando conteo de agotados visuales:', error);
      setAgotadosVisualesCount(0);
    }
  }, [ubicacionId]);

  useEffect(() => {
    if (ubicacionId) {
      loadAgotadosVisualesCount();
    } else {
      setAgotadosVisualesCount(0);
    }
  }, [ubicacionId, loadAgotadosVisualesCount]);

  const currentItems = ventasData;
  const totalPages = pagination?.total_pages || 1;

  const renderClaseABC = (clase: string | null) => {
    const estilos: Record<string, string> = {
      'A': 'bg-green-600 text-white',
      'B': 'bg-yellow-500 text-white',
      'C': 'bg-gray-500 text-white',
    };
    if (!clase) return <span className="text-gray-400">-</span>;
    return (
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${estilos[clase] || 'bg-gray-200 text-gray-600'}`}>
        {clase}
      </span>
    );
  };

  const renderVelocidad = (velocidad: string | null) => {
    const estilos: Record<string, string> = {
      'MUY_ALTA': 'bg-green-100 text-green-800 border-green-200',
      'ALTA': 'bg-blue-100 text-blue-800 border-blue-200',
      'MEDIA': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'BAJA': 'bg-orange-100 text-orange-800 border-orange-200',
      'SIN_VENTAS': 'bg-gray-100 text-gray-600 border-gray-200',
    };
    const labels: Record<string, string> = {
      'MUY_ALTA': 'Muy Alta',
      'ALTA': 'Alta',
      'MEDIA': 'Media',
      'BAJA': 'Baja',
      'SIN_VENTAS': 'Sin',
    };
    if (!velocidad) return <span className="text-gray-400">-</span>;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${estilos[velocidad] || 'bg-gray-100 text-gray-600'}`}>
        {labels[velocidad] || velocidad}
      </span>
    );
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProductClick = (codigo: string, descripcion: string) => {
    setSelectedProducto({ codigo, descripcion });
    setIsModalOpen(true);
  };

  const handleExportExcel = async () => {
    if (!ubicacionId || !fechaInicio || !fechaFin) return;
    try {
      setExportingExcel(true);
      const params = new URLSearchParams({
        ubicacion_id: ubicacionId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      const [diarioRes, resumenRes] = await Promise.all([
        http.get(`/api/ventas/export-diario?${params.toString()}`),
        http.get(`/api/ventas/export-resumen?${params.toString()}`),
      ]);

      const wb = XLSX.utils.book_new();

      // Hoja 1: Resumen con métricas
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumenRows = (resumenRes.data as any[]).map((prod) => ({
        'Codigo': prod.codigo_producto,
        'Descripcion': prod.descripcion_producto,
        'Categoria': prod.categoria,
        'ABC': prod.clase_abc || '',
        'Rank': prod.rank_ventas || '',
        'Total Unidades': Math.round(prod.cantidad_total),
        'Prom/Dia': Number((prod.promedio_diario || 0).toFixed(1)),
        'P75': Number((prod.p75_unidades_dia || 0).toFixed(1)),
        'P75 Lun': Number((prod.p75_lun || 0).toFixed(1)),
        'P75 Mar': Number((prod.p75_mar || 0).toFixed(1)),
        'P75 Mié': Number((prod.p75_mie || 0).toFixed(1)),
        'P75 Jue': Number((prod.p75_jue || 0).toFixed(1)),
        'P75 Vie': Number((prod.p75_vie || 0).toFixed(1)),
        'P75 Sáb': Number((prod.p75_sab || 0).toFixed(1)),
        'P75 Dom': Number((prod.p75_dom || 0).toFixed(1)),
        'Q15%': prod.q15_boost ? Number(prod.q15_boost.toFixed(1)) : 0,
        'Velocidad': prod.velocidad_venta || '',
        'Stock': prod.stock_actual ? Math.round(prod.stock_actual) : '',
        '% Total': Number((prod.porcentaje_total || 0).toFixed(2)),
      }));
      const wsResumen = XLSX.utils.json_to_sheet(resumenRows);
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Ventas');

      // Hoja 2: Ventas diarias (fechas ya vienen ordenadas de reciente a antigua)
      const { fechas, productos } = diarioRes.data as {
        fechas: string[];
        productos: { codigo: string; descripcion: string; categoria: string; abc?: string; rank?: number; ventas: Record<string, number> }[];
      };
      const diarioRows = productos.map((prod) => {
        const row: Record<string, string | number> = {
          'Codigo': prod.codigo,
          'Descripcion': prod.descripcion,
          'Categoria': prod.categoria,
          'ABC': prod.abc || '',
          'Rank': prod.rank || '',
        };
        let total = 0;
        for (const fecha of fechas) {
          const cantidad = prod.ventas[fecha] || 0;
          row[fecha] = cantidad;
          total += cantidad;
        }
        row['Total'] = total;
        return row;
      });
      const wsDiario = XLSX.utils.json_to_sheet(diarioRows);
      XLSX.utils.book_append_sheet(wb, wsDiario, 'Ventas Diarias');

      XLSX.writeFile(wb, `ventas_${nombreTienda || ubicacionId}_${fechaInicio}_${fechaFin}.xlsx`);
    } catch (error) {
      console.error('Error exportando Excel:', error);
    } finally {
      setExportingExcel(false);
    }
  };

  const currentUbicacionId = ubicacionId || null;

  const fmtNum = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  return (
    <div className="space-y-4">
      {/* Header estilo inventario */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/ventas')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold text-indigo-600">
              {nombreTienda || 'Todas las tiendas'}
            </h1>
            <p className="text-sm text-gray-500">
              Analisis de ventas &bull; {fechaInicio} al {fechaFin}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ubicacionId && (
            <button
              onClick={() => setShowVentasPerdidasModal(true)}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              V. Perdidas
            </button>
          )}
          {ubicacionId && (
            <button
              onClick={() => setShowCentroComandoModal(true)}
              className="relative inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Agotados
              {agotadosVisualesCount > 0 && (
                <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full min-w-[24px]">
                  {agotadosVisualesCount > 99 ? '99+' : agotadosVisualesCount}
                </span>
              )}
            </button>
          )}
          {ubicacionId && (
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel || !fechaInicio || !fechaFin}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {exportingExcel ? 'Descargando...' : 'Excel'}
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards compactos - estilo inventario */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500">Productos</p>
          <p className="text-xl font-bold text-gray-900">{stats.productos_unicos.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-green-600">Unidades</p>
          <p className="text-xl font-bold text-green-600">{Math.round(stats.total_unidades).toLocaleString()}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${
            selectedClaseABC === 'A' ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200 hover:border-green-300'
          }`}
          onClick={() => { setSelectedClaseABC(selectedClaseABC === 'A' ? '' : 'A'); setCurrentPage(1); }}
        >
          <p className="text-xs font-medium text-green-600">ABC-A</p>
          <p className="text-xl font-bold text-green-600">{stats.abc_a}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${
            selectedClaseABC === 'B' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-200 hover:border-yellow-300'
          }`}
          onClick={() => { setSelectedClaseABC(selectedClaseABC === 'B' ? '' : 'B'); setCurrentPage(1); }}
        >
          <p className="text-xs font-medium text-yellow-600">ABC-B</p>
          <p className="text-xl font-bold text-yellow-600">{stats.abc_b}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${
            selectedVelocidad === 'MUY_ALTA' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
          }`}
          onClick={() => { setSelectedVelocidad(selectedVelocidad === 'MUY_ALTA' ? '' : 'MUY_ALTA'); setCurrentPage(1); }}
        >
          <p className="text-xs font-medium text-blue-600">Muy Alta</p>
          <p className="text-xl font-bold text-blue-600">{stats.vel_muy_alta}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-purple-600">Prom/Dia</p>
          <p className="text-xl font-bold text-purple-600">
            {ventasData.length > 0 ? Math.round(ventasData.reduce((sum, item) => sum + item.promedio_diario, 0)).toLocaleString() : 0}
          </p>
        </div>
      </div>

      {/* Filtros compactos - estilo inventario */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Periodo</label>
            <select
              value={periodoSeleccionado}
              onChange={(e) => { handlePeriodoChange(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="ultima_semana">Ult. Semana</option>
              <option value="ultimo_mes">Ult. Mes</option>
              <option value="ultimos_3_meses">Ult. 3 Meses</option>
              <option value="ultimo_ano">Ult. Ano</option>
              <option value="mes_actual">Mes Actual</option>
              <option value="mes_anterior">Mes Anterior</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
            <input
              type="month"
              onChange={(e) => { handleMesChange(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
            <select
              value={selectedCategoria}
              onChange={(e) => { setSelectedCategoria(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
            <input
              type="text"
              placeholder="Filtrar..."
              value={selectedMarca}
              onChange={(e) => { setSelectedMarca(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ABC</label>
            <select
              value={selectedClaseABC}
              onChange={(e) => { setSelectedClaseABC(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Todas</option>
              {abcFilterOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Velocidad</label>
            <select
              value={selectedVelocidad}
              onChange={(e) => { setSelectedVelocidad(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Todas</option>
              <option value="MUY_ALTA">Muy Alta</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Media</option>
              <option value="BAJA">Baja</option>
              <option value="SIN_VENTAS">Sin Ventas</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Codigo o descripcion..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {periodoSeleccionado === 'personalizado' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => { setFechaInicio(e.target.value); setCurrentPage(1); }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => { setFechaFin(e.target.value); setCurrentPage(1); }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Indicador de productos */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm text-indigo-700">
            Mostrando <span className="font-bold text-indigo-900">{(pagination?.total_items || 0).toLocaleString()}</span> productos
          </span>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
            <p className="mt-4 text-sm text-gray-500">Cargando ventas...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Codigo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripcion</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cat</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">ABC</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prom/Dia</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-purple-500 uppercase">P75</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-blue-500 uppercase">Lun</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-blue-500 uppercase">Mar</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-blue-500 uppercase">Mié</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-blue-500 uppercase">Jue</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-blue-500 uppercase">Vie</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-orange-500 uppercase">Sáb</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-red-500 uppercase">Dom</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-green-600 uppercase">Q15%</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Vel</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentItems.length === 0 ? (
                    <tr>
                      <td colSpan={19} className="px-6 py-12 text-center text-sm text-gray-500">
                        No se encontraron ventas con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((item, index) => (
                      <tr
                        key={`${item.codigo_producto}-${index}`}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td
                          className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 cursor-pointer hover:text-indigo-600"
                          onClick={() => handleProductClick(item.codigo_producto, item.descripcion_producto)}
                        >
                          {item.codigo_producto}
                        </td>
                        <td
                          className="px-3 py-2 text-gray-900 max-w-[200px] truncate cursor-pointer hover:text-indigo-600"
                          title={item.descripcion_producto}
                          onClick={() => handleProductClick(item.codigo_producto, item.descripcion_producto)}
                        >
                          {item.descripcion_producto}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                          {item.categoria}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {renderClaseABC(item.clase_abc)}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">
                          {item.rank_ventas ? `#${item.rank_ventas}` : '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right font-semibold text-gray-900">
                          {Math.round(item.cantidad_total).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-blue-600 font-medium">
                          {fmtNum(item.promedio_diario)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-purple-600 font-medium">
                          {fmtNum(item.p75_unidades_dia)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-blue-600 cursor-pointer hover:bg-blue-50"
                          onClick={() => { setSelectedDay({ dia: 'Lunes', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_lun)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-blue-600 cursor-pointer hover:bg-blue-50"
                          onClick={() => { setSelectedDay({ dia: 'Martes', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_mar)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-blue-600 cursor-pointer hover:bg-blue-50"
                          onClick={() => { setSelectedDay({ dia: 'Miércoles', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_mie)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-blue-600 cursor-pointer hover:bg-blue-50"
                          onClick={() => { setSelectedDay({ dia: 'Jueves', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_jue)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-blue-600 cursor-pointer hover:bg-blue-50"
                          onClick={() => { setSelectedDay({ dia: 'Viernes', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_vie)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-orange-600 font-medium cursor-pointer hover:bg-orange-50"
                          onClick={() => { setSelectedDay({ dia: 'Sábado', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_sab)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-red-600 cursor-pointer hover:bg-red-50"
                          onClick={() => { setSelectedDay({ dia: 'Domingo', producto: item }); setShowDayModal(true); }}
                        >
                          {fmtNum(item.p75_dom)}
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap text-right text-green-600 font-medium cursor-pointer hover:bg-green-50"
                          onClick={() => { setSelectedQ15Producto(item); setShowQ15Modal(true); }}
                        >
                          {item.q15_boost !== null && item.q15_boost !== 0 ? `${item.q15_boost > 0 ? '+' : ''}${item.q15_boost.toFixed(0)}%` : '-'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {renderVelocidad(item.velocidad_venta)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <span className={`font-medium ${
                            !item.stock_actual || item.stock_actual === 0 ? 'text-red-600' :
                            item.stock_actual < item.promedio_diario * 3 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {item.stock_actual !== null && item.stock_actual !== undefined ? Math.round(item.stock_actual).toLocaleString() : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-500">
                          {item.porcentaje_total.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginacion */}
            {totalPages > 1 && pagination && (
              <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{((currentPage - 1) * pageSize) + 1}</span> a{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * pageSize, pagination.total_items)}
                    </span>{' '}
                    de <span className="font-medium">{pagination.total_items}</span> productos
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={!pagination.has_previous}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">
                      Pagina {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={!pagination.has_next}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modales */}
      {selectedProducto && (
        <ProductSalesModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          codigoProducto={selectedProducto.codigo}
          descripcionProducto={selectedProducto.descripcion}
          currentUbicacionId={currentUbicacionId}
        />
      )}

      <SyncVentasModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        ubicacionId={ubicacionId}
      />

      {ubicacionId && (
        <CentroComandoVentasModal
          isOpen={showCentroComandoModal}
          onClose={() => setShowCentroComandoModal(false)}
          ubicacionId={ubicacionId}
          ubicacionNombre={ubicacionId}
        />
      )}

      {ubicacionId && (
        <VentasPerdidasModal
          isOpen={showVentasPerdidasModal}
          onClose={() => setShowVentasPerdidasModal(false)}
          ubicacionId={ubicacionId}
          ubicacionNombre={ubicacionId}
        />
      )}

      {/* Modal Análisis por Día */}
      {showDayModal && selectedDay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Análisis de {selectedDay.dia}</h3>
                  <p className="text-sm text-gray-500">{selectedDay.producto.codigo_producto} - {selectedDay.producto.descripcion_producto}</p>
                </div>
                <button
                  onClick={() => setShowDayModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-700 font-medium">P75 de {selectedDay.dia}</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {fmtNum(
                      selectedDay.dia === 'Lunes' ? selectedDay.producto.p75_lun :
                      selectedDay.dia === 'Martes' ? selectedDay.producto.p75_mar :
                      selectedDay.dia === 'Miércoles' ? selectedDay.producto.p75_mie :
                      selectedDay.dia === 'Jueves' ? selectedDay.producto.p75_jue :
                      selectedDay.dia === 'Viernes' ? selectedDay.producto.p75_vie :
                      selectedDay.dia === 'Sábado' ? selectedDay.producto.p75_sab :
                      selectedDay.producto.p75_dom
                    )} unidades
                  </p>
                </div>

                {/* Histórico de los últimos 8 días de este día de semana */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Últimos 8 {selectedDay.dia}s</p>
                  {loadingHistorico ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-sm text-gray-500">Cargando...</span>
                    </div>
                  ) : historicoDia.length > 0 ? (
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100 text-gray-600">
                            <th className="px-3 py-2 text-left font-medium">Fecha</th>
                            <th className="px-3 py-2 text-right font-medium">Unidades</th>
                            <th className="px-3 py-2 text-center font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicoDia.map((item, idx) => (
                            <tr key={idx} className={`border-t border-gray-200 ${item.es_probable_rotura ? 'bg-red-50' : ''}`}>
                              <td className="px-3 py-2 text-gray-700">
                                {new Date(item.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${item.es_probable_rotura ? 'text-red-600' : 'text-gray-900'}`}>
                                {Math.round(item.cantidad).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {item.es_probable_rotura ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                    Excluido
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                    Incluido
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic py-2">No hay datos históricos disponibles</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-500">P75 General</p>
                    <p className="text-lg font-semibold">{fmtNum(selectedDay.producto.p75_unidades_dia)}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Promedio Diario</p>
                    <p className="text-lg font-semibold">{fmtNum(selectedDay.producto.promedio_diario)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Comparación por Día de Semana</p>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {[
                      { dia: 'Lun', val: selectedDay.producto.p75_lun, color: 'blue' },
                      { dia: 'Mar', val: selectedDay.producto.p75_mar, color: 'blue' },
                      { dia: 'Mié', val: selectedDay.producto.p75_mie, color: 'blue' },
                      { dia: 'Jue', val: selectedDay.producto.p75_jue, color: 'blue' },
                      { dia: 'Vie', val: selectedDay.producto.p75_vie, color: 'blue' },
                      { dia: 'Sáb', val: selectedDay.producto.p75_sab, color: 'orange' },
                      { dia: 'Dom', val: selectedDay.producto.p75_dom, color: 'red' },
                    ].map(d => (
                      <div key={d.dia} className={`p-2 rounded ${selectedDay.dia.startsWith(d.dia) ? `bg-${d.color}-100 ring-2 ring-${d.color}-500` : 'bg-gray-100'}`}>
                        <p className="font-medium">{d.dia}</p>
                        <p className={`font-bold text-${d.color}-600`}>{fmtNum(d.val)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-gray-500 italic">
                  * P75 excluye días con venta menor al 40% del promedio (probable rotura de stock)
                </p>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowDayModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Q15% Análisis */}
      {showQ15Modal && selectedQ15Producto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Análisis Q15% (Segunda Quincena)</h3>
                  <p className="text-sm text-gray-500">{selectedQ15Producto.codigo_producto} - {selectedQ15Producto.descripcion_producto}</p>
                </div>
                <button
                  onClick={() => setShowQ15Modal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${selectedQ15Producto.q15_boost && selectedQ15Producto.q15_boost > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className={`text-sm font-medium ${selectedQ15Producto.q15_boost && selectedQ15Producto.q15_boost > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    Variación días 15-20 vs días normales
                  </p>
                  <p className={`text-3xl font-bold ${selectedQ15Producto.q15_boost && selectedQ15Producto.q15_boost > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedQ15Producto.q15_boost !== null && selectedQ15Producto.q15_boost !== 0
                      ? `${selectedQ15Producto.q15_boost > 0 ? '+' : ''}${selectedQ15Producto.q15_boost.toFixed(1)}%`
                      : 'Sin variación'}
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-2">¿Qué significa Q15%?</p>
                  <p className="text-sm text-gray-600">
                    Compara las ventas promedio durante los días <strong>15 al 20</strong> del mes
                    (período de quincena) contra los días normales (6-14 y 21-31).
                  </p>
                  <ul className="mt-2 text-sm text-gray-600 space-y-1">
                    <li>• <span className="text-green-600 font-medium">+X%</span> = Vende más en quincena</li>
                    <li>• <span className="text-red-600 font-medium">-X%</span> = Vende menos en quincena</li>
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-500">P75 General</p>
                    <p className="text-lg font-semibold">{fmtNum(selectedQ15Producto.p75_unidades_dia)}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Stock Actual</p>
                    <p className="text-lg font-semibold">{selectedQ15Producto.stock_actual ? Math.round(selectedQ15Producto.stock_actual).toLocaleString() : '-'}</p>
                  </div>
                </div>

                {selectedQ15Producto.q15_boost && selectedQ15Producto.q15_boost > 20 && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>💡 Tip:</strong> Este producto tiene un boost significativo en quincena.
                      Considera aumentar el stock antes del día 15.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowQ15Modal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
