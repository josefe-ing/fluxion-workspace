import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import http from '../../services/http';
import { formatNumber, formatInteger } from '../../utils/formatNumber';
import ProductHistoryModal from './ProductHistoryModal';
import CentroComandoCorreccionModal from './CentroComandoCorreccionModal';
import * as XLSX from 'xlsx';

interface StockItem {
  ubicacion_id: string;
  ubicacion_nombre: string;
  ubicacion_tipo: string;
  producto_id: string;
  codigo_producto: string;
  codigo_barras: string | null;
  descripcion_producto: string;
  categoria: string;
  marca: string | null;
  stock_actual: number | null;
  stock_minimo: number | null;
  stock_maximo: number | null;
  punto_reorden: number | null;
  precio_venta: number | null;
  cantidad_bultos: number | null;
  estado_stock: string;
  dias_cobertura_actual: number | null;
  es_producto_estrella: boolean;
  fecha_extraccion: string | null;
  peso_producto_kg: number | null;
  peso_total_kg: number | null;
  // Nuevos campos
  demanda_p75: number | null;
  ventas_60d: number | null;
  estado_criticidad: string | null;
  clasificacion_producto: string | null;
  clase_abc: string | null;
  rank_ventas: number | null;
  velocidad_venta: string | null;
  // Parámetros de inventario en días
  dias_ss: number | null;
  dias_rop: number | null;
  dias_max: number | null;
  // Stock en CEDI
  stock_cedi: number | null;
  // Límites forzados por configuración
  limite_min_forzado: number | null;
  limite_max_forzado: number | null;
  tipo_limite: string | null;
}

interface PaginationMetadata {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
  stock_cero?: number;
  stock_negativo?: number;
  criticos?: number;
  urgentes?: number;
  fantasmas?: number;
  anomalias?: number;
  dormidos?: number;
  activos?: number;
}

interface PaginatedStockResponse {
  data: StockItem[];
  pagination: PaginationMetadata;
}

interface Ubicacion {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
}

interface StockStats {
  total_productos: number;
  stock_cero: number;
  stock_negativo: number;
  criticos: number;
  urgentes: number;
  fantasmas: number;
  anomalias: number;
  dormidos: number;
  activos: number;
}

export default function InventoryDashboard() {
  const { ubicacionId } = useParams<{ ubicacionId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const almacenParam = searchParams.get('almacen');

  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [stats, setStats] = useState<StockStats>({
    total_productos: 0, stock_cero: 0, stock_negativo: 0,
    criticos: 0, urgentes: 0, fantasmas: 0, anomalias: 0, dormidos: 0, activos: 0
  });
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationMetadata | null>(null);

  // Filtros básicos
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>(ubicacionId || 'tienda_08');
  const [selectedAlmacen, _setSelectedAlmacen] = useState<string | null>(almacenParam);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  // Nuevos filtros
  const [selectedEstadoCriticidad, setSelectedEstadoCriticidad] = useState<string>('all');
  const [selectedClasificacionProducto, setSelectedClasificacionProducto] = useState<string>('all');
  const [selectedClaseABC, setSelectedClaseABC] = useState<string>('all');
  const [selectedTopVentas, setSelectedTopVentas] = useState<string>('all');
  const [selectedVelocidadVenta, setSelectedVelocidadVenta] = useState<string>('all');
  const [selectedStockCediFilter, setSelectedStockCediFilter] = useState<string>('all');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(30);

  // Ordenamiento
  const [sortBy, setSortBy] = useState<string>('rank_ventas');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal de histórico de inventario
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ codigo: string; descripcion: string } | null>(null);

  // Modal Centro de Comando de Corrección
  const [showCorreccionModal, setShowCorreccionModal] = useState(false);
  const [anomaliasCount, setAnomaliasCount] = useState<number>(0);

  // Estado para exportación a Excel
  const [exporting, setExporting] = useState(false);

  // Panel de ayuda colapsable
  const [showHelp, setShowHelp] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadUbicaciones();
    loadCategorias();
  }, []);

  useEffect(() => {
    if (selectedUbicacion && selectedUbicacion !== 'all') {
      loadAnomaliasCount();
    } else {
      setAnomaliasCount(0);
    }
  }, [selectedUbicacion, selectedAlmacen]);

  useEffect(() => {
    loadStock();
  }, [selectedUbicacion, selectedAlmacen, selectedCategoria, currentPage, debouncedSearchTerm,
      sortBy, sortOrder, selectedEstadoCriticidad, selectedClasificacionProducto,
      selectedClaseABC, selectedTopVentas, selectedVelocidadVenta, selectedStockCediFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUbicacion, selectedCategoria, debouncedSearchTerm, selectedEstadoCriticidad,
      selectedClasificacionProducto, selectedClaseABC, selectedTopVentas, selectedVelocidadVenta, selectedStockCediFilter]);

  const loadUbicaciones = async () => {
    try {
      const response = await http.get('/api/ubicaciones');
      setUbicaciones(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
    }
  };

  const loadCategorias = async () => {
    try {
      const response = await http.get('/api/categorias');
      setCategorias(response.data);
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }
  };

  const loadAnomaliasCount = async () => {
    try {
      const params: Record<string, string> = {};
      if (selectedAlmacen) params.almacen_codigo = selectedAlmacen;
      const response = await http.get(`/api/stock/anomalias/${selectedUbicacion}/count`, { params });
      setAnomaliasCount(response.data.total_anomalias || 0);
    } catch (error) {
      console.error('Error cargando conteo de anomalías:', error);
      setAnomaliasCount(0);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'rank_ventas' ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  const loadStock = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: itemsPerPage,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      if (selectedUbicacion !== 'all') params.ubicacion_id = selectedUbicacion;
      if (selectedAlmacen) params.almacen_codigo = selectedAlmacen;
      if (selectedCategoria !== 'all') params.categoria = selectedCategoria;
      if (debouncedSearchTerm) params.search = debouncedSearchTerm;
      if (selectedEstadoCriticidad !== 'all') params.estado_criticidad = selectedEstadoCriticidad;
      if (selectedClasificacionProducto !== 'all') params.clasificacion_producto = selectedClasificacionProducto;
      if (selectedClaseABC !== 'all') params.clase_abc = selectedClaseABC;
      if (selectedTopVentas !== 'all') params.top_ventas = parseInt(selectedTopVentas);
      if (selectedVelocidadVenta !== 'all') params.velocidad_venta = selectedVelocidadVenta;
      if (selectedStockCediFilter !== 'all') params.stock_cedi_filter = selectedStockCediFilter;

      const response = await http.get('/api/stock', { params });
      const { data, pagination: paginationData } = response.data as PaginatedStockResponse;

      setStockData(data);
      setPagination(paginationData);
      setStats({
        total_productos: paginationData.total_items,
        stock_cero: paginationData.stock_cero ?? 0,
        stock_negativo: paginationData.stock_negativo ?? 0,
        criticos: paginationData.criticos ?? 0,
        urgentes: paginationData.urgentes ?? 0,
        fantasmas: paginationData.fantasmas ?? 0,
        anomalias: paginationData.anomalias ?? 0,
        dormidos: paginationData.dormidos ?? 0,
        activos: paginationData.activos ?? 0,
      });
    } catch (error) {
      console.error('Error cargando stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUltimaActualizacion = (): string => {
    if (stockData.length === 0) return 'No disponible';
    const fechasMasRecientes = stockData
      .map(item => item.fecha_extraccion)
      .filter(fecha => fecha !== null)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());
    if (fechasMasRecientes.length === 0) return 'No disponible';
    const fecha = new Date(fechasMasRecientes[0]!);
    return fecha.toLocaleString('es-VE', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number> = { page: 1, page_size: 50000 };
      if (selectedUbicacion !== 'all') params.ubicacion_id = selectedUbicacion;
      if (selectedAlmacen) params.almacen_codigo = selectedAlmacen;
      if (selectedCategoria !== 'all') params.categoria = selectedCategoria;
      if (debouncedSearchTerm) params.search = debouncedSearchTerm;
      if (selectedEstadoCriticidad !== 'all') params.estado_criticidad = selectedEstadoCriticidad;
      if (selectedClasificacionProducto !== 'all') params.clasificacion_producto = selectedClasificacionProducto;
      if (selectedClaseABC !== 'all') params.clase_abc = selectedClaseABC;
      if (selectedTopVentas !== 'all') params.top_ventas = parseInt(selectedTopVentas);
      if (selectedVelocidadVenta !== 'all') params.velocidad_venta = selectedVelocidadVenta;
      if (selectedStockCediFilter !== 'all') params.stock_cedi_filter = selectedStockCediFilter;

      const response = await http.get('/api/stock', { params });
      const { data } = response.data as PaginatedStockResponse;

      const excelData = data.map((item) => ({
        'Código': item.codigo_producto,
        'Artículo': item.descripcion_producto,
        'Categoría': item.categoria,
        'Stock': item.stock_actual ?? 0,
        'Stock CEDI': item.stock_cedi ?? 0,
        'P75/día': item.demanda_p75 !== null ? Math.round(item.demanda_p75 * 10) / 10 : 0,
        'Días Stock': item.dias_cobertura_actual !== null ? Math.round(item.dias_cobertura_actual * 10) / 10 : '-',
        'Días SS': item.dias_ss !== null ? Math.round(item.dias_ss * 10) / 10 : '-',
        'Días ROP': item.dias_rop !== null ? Math.round(item.dias_rop * 10) / 10 : '-',
        'Días MAX': item.dias_max !== null ? Math.round(item.dias_max * 10) / 10 : '-',
        'Mín. Exhibición': item.limite_min_forzado ?? '-',
        'Cap. Máxima': item.limite_max_forzado ?? '-',
        'Tipo Límite': item.tipo_limite ?? '-',
        'Estado': item.estado_criticidad || '-',
        'ABC': item.clase_abc || '-',
        'Top': item.rank_ventas || '-',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 12 }, { wch: 45 }, { wch: 18 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 8 }, { wch: 8 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      const fecha = new Date().toISOString().split('T')[0];
      const ubicacionNombre = ubicaciones.find(u => u.id === selectedUbicacion)?.nombre || selectedUbicacion;
      XLSX.writeFile(wb, `Inventario_${ubicacionNombre}_${fecha}.xlsx`);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
    } finally {
      setExporting(false);
    }
  };

  const renderEstadoCriticidad = (estado: string | null) => {
    const estilos: Record<string, string> = {
      'CRITICO': 'bg-red-100 text-red-800 border-red-200',
      'URGENTE': 'bg-orange-100 text-orange-800 border-orange-200',
      'OPTIMO': 'bg-green-100 text-green-800 border-green-200',
      'EXCESO': 'bg-blue-100 text-blue-800 border-blue-200',
      'SIN_DEMANDA': 'bg-gray-100 text-gray-600 border-gray-200',
    };
    const labels: Record<string, string> = {
      'CRITICO': 'Crítico', 'URGENTE': 'Urgente', 'OPTIMO': 'Óptimo',
      'EXCESO': 'Exceso', 'SIN_DEMANDA': 'Sin demanda',
    };
    if (!estado) return <span className="text-gray-400">-</span>;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${estilos[estado] || 'bg-gray-100 text-gray-600'}`}>
        {labels[estado] || estado}
      </span>
    );
  };

  const renderClaseABC = (clase: string | null) => {
    const estilos: Record<string, string> = {
      'A': 'bg-green-600 text-white',
      'B': 'bg-yellow-500 text-white',
      'C': 'bg-gray-500 text-white',
      'SIN_VENTAS': 'bg-gray-200 text-gray-600',
    };
    if (!clase) return <span className="text-gray-400">-</span>;
    return (
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${estilos[clase] || 'bg-gray-200 text-gray-600'}`}>
        {clase === 'SIN_VENTAS' ? '-' : clase}
      </span>
    );
  };

  // Indicador visual compacto de nivel de inventario
  const renderInventoryLevelIndicator = (item: StockItem) => {
    const dias = item.dias_cobertura_actual;
    const ss = item.dias_ss;
    const rop = item.dias_rop;
    const max = item.dias_max;

    // Si no hay datos, mostrar placeholder
    if (dias === null || ss === null || rop === null || max === null) {
      return <span className="text-gray-400 text-xs">-</span>;
    }

    // Calcular la escala para el indicador visual
    const scaleMax = Math.max(max * 1.5, dias * 1.1);
    const toPercent = (val: number) => Math.min(100, Math.max(0, (val / scaleMax) * 100));

    const ssPercent = toPercent(ss);
    const ropPercent = toPercent(rop);
    const maxPercent = toPercent(max);
    const diasPercent = toPercent(dias);

    // Determinar color según posición
    let statusColor = 'bg-green-500'; // Óptimo (entre ROP y MAX)
    if (dias <= 0) {
      statusColor = 'bg-red-600';
    } else if (dias <= ss) {
      statusColor = 'bg-red-500';
    } else if (dias <= rop) {
      statusColor = 'bg-orange-500';
    } else if (dias > max) {
      statusColor = 'bg-blue-500';
    }

    return (
      <div className="w-full h-2.5 relative bg-gray-100 rounded-full overflow-visible" title={`Actual: ${formatNumber(dias, 1)}d | SS: ${formatNumber(ss, 1)}d | ROP: ${formatNumber(rop, 1)}d | MAX: ${formatNumber(max, 1)}d`}>
        {/* Zonas de color de fondo */}
        <div className="absolute h-full bg-red-200 rounded-l-full" style={{ left: 0, width: `${ssPercent}%` }} />
        <div className="absolute h-full bg-orange-200" style={{ left: `${ssPercent}%`, width: `${ropPercent - ssPercent}%` }} />
        <div className="absolute h-full bg-green-200" style={{ left: `${ropPercent}%`, width: `${maxPercent - ropPercent}%` }} />
        <div className="absolute h-full bg-blue-200 rounded-r-full" style={{ left: `${maxPercent}%`, width: `${100 - maxPercent}%` }} />

        {/* Marcadores SS, ROP, MAX */}
        <div className="absolute w-px h-3.5 bg-red-600 -top-0.5 z-10" style={{ left: `${ssPercent}%` }} />
        <div className="absolute w-px h-3.5 bg-orange-600 -top-0.5 z-10" style={{ left: `${ropPercent}%` }} />
        <div className="absolute w-px h-3.5 bg-green-700 -top-0.5 z-10" style={{ left: `${maxPercent}%` }} />

        {/* Indicador de posición actual */}
        <div className={`absolute w-2 h-2 ${statusColor} rounded-full border border-white shadow-sm top-0`} style={{ left: `calc(${diasPercent}% - 4px)` }} />
      </div>
    );
  };

  const ubicacionNombre = ubicaciones.find(u => u.id === selectedUbicacion)?.nombre || selectedUbicacion;

  return (
    <div className="space-y-4">
      {/* Header con título de ubicación */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold text-indigo-600">{ubicacionNombre}</h1>
            <p className="text-sm text-gray-500">Análisis de inventario • Actualizado: {getUltimaActualizacion()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedUbicacion && selectedUbicacion !== 'all' && (
            <button
              onClick={() => setShowCorreccionModal(true)}
              className="relative inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Corrección
              {anomaliasCount > 0 && (
                <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold text-white bg-red-600 rounded-full min-w-[20px]">
                  {anomaliasCount > 99 ? '99+' : anomaliasCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={exportToExcel}
            disabled={exporting || loading || stockData.length === 0}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? (
              <><div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-r-transparent"></div>Exportando...</>
            ) : (
              <><svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Excel</>
            )}
          </button>
        </div>
      </div>

      {/* Métricas Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500">Total</p>
          <p className="text-xl font-bold text-gray-900">{formatInteger(stats.total_productos)}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${selectedEstadoCriticidad === 'CRITICO' ? 'border-red-500 ring-2 ring-red-200' : 'border-gray-200 hover:border-red-300'}`}
          onClick={() => setSelectedEstadoCriticidad(selectedEstadoCriticidad === 'CRITICO' ? 'all' : 'CRITICO')}
        >
          <p className="text-xs font-medium text-red-600">Críticos</p>
          <p className="text-xl font-bold text-red-600">{formatInteger(stats.criticos)}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${selectedEstadoCriticidad === 'URGENTE' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200 hover:border-orange-300'}`}
          onClick={() => setSelectedEstadoCriticidad(selectedEstadoCriticidad === 'URGENTE' ? 'all' : 'URGENTE')}
        >
          <p className="text-xs font-medium text-orange-600">Urgentes</p>
          <p className="text-xl font-bold text-orange-600">{formatInteger(stats.urgentes)}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${selectedClasificacionProducto === 'FANTASMA' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 hover:border-purple-300'}`}
          onClick={() => setSelectedClasificacionProducto(selectedClasificacionProducto === 'FANTASMA' ? 'all' : 'FANTASMA')}
        >
          <p className="text-xs font-medium text-purple-600">Fantasmas</p>
          <p className="text-xl font-bold text-purple-600">{formatInteger(stats.fantasmas)}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${selectedClasificacionProducto === 'DORMIDO' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-200 hover:border-yellow-300'}`}
          onClick={() => setSelectedClasificacionProducto(selectedClasificacionProducto === 'DORMIDO' ? 'all' : 'DORMIDO')}
        >
          <p className="text-xs font-medium text-yellow-600">Dormidos</p>
          <p className="text-xl font-bold text-yellow-600">{formatInteger(stats.dormidos)}</p>
        </div>
        <div
          className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${selectedClasificacionProducto === 'ACTIVO' ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200 hover:border-green-300'}`}
          onClick={() => setSelectedClasificacionProducto(selectedClasificacionProducto === 'ACTIVO' ? 'all' : 'ACTIVO')}
        >
          <p className="text-xs font-medium text-green-600">Activos</p>
          <p className="text-xl font-bold text-green-600">{formatInteger(stats.activos)}</p>
        </div>
      </div>

      {/* Filtros compactos */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación</label>
            <select
              value={selectedUbicacion}
              onChange={(e) => setSelectedUbicacion(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
            <select
              value={selectedCategoria}
              onChange={(e) => setSelectedCategoria(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              {categorias.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
            <select
              value={selectedEstadoCriticidad}
              onChange={(e) => setSelectedEstadoCriticidad(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todos</option>
              <option value="CRITICO">Crítico</option>
              <option value="URGENTE">Urgente</option>
              <option value="OPTIMO">Óptimo</option>
              <option value="EXCESO">Exceso</option>
              <option value="SIN_DEMANDA">Sin demanda</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stock CEDI</label>
            <select
              value={selectedStockCediFilter}
              onChange={(e) => setSelectedStockCediFilter(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todos</option>
              <option value="CON_STOCK">Con stock</option>
              <option value="SIN_STOCK">Sin stock</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Clasificación</label>
            <select
              value={selectedClasificacionProducto}
              onChange={(e) => setSelectedClasificacionProducto(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              <option value="ACTIVO">Activo</option>
              <option value="DORMIDO">Dormido</option>
              <option value="ANOMALIA">Anomalía</option>
              <option value="FANTASMA">Fantasma</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ABC</label>
            <select
              value={selectedClaseABC}
              onChange={(e) => setSelectedClaseABC(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="SIN_VENTAS">Sin ventas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Top</label>
            <select
              value={selectedTopVentas}
              onChange={(e) => setSelectedTopVentas(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todos</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
              <option value="200">Top 200</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Velocidad</label>
            <select
              value={selectedVelocidadVenta}
              onChange={(e) => setSelectedVelocidadVenta(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              <option value="SIN_VENTAS">Sin ventas</option>
              <option value="BAJA">Baja (1-5/mes)</option>
              <option value="MEDIA">Media (6-15/mes)</option>
              <option value="ALTA">Alta (16-30/mes)</option>
              <option value="MUY_ALTA">Muy alta (+30/mes)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Código o descripción..."
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Total prominente + botón de ayuda */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
            <span className="text-sm text-indigo-600 font-medium">Mostrando </span>
            <span className="text-2xl font-bold text-indigo-700">{formatInteger(stats.total_productos)}</span>
            <span className="text-sm text-indigo-600 font-medium"> productos</span>
          </div>
          {(selectedEstadoCriticidad !== 'all' || selectedClasificacionProducto !== 'all' ||
            selectedClaseABC !== 'all' || selectedTopVentas !== 'all' || selectedVelocidadVenta !== 'all' ||
            selectedCategoria !== 'all' || selectedStockCediFilter !== 'all' || debouncedSearchTerm) && (
            <span className="text-xs text-gray-500 italic">(filtrado)</span>
          )}
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showHelp ? 'Ocultar ayuda' : '¿Qué significa cada campo?'}
        </button>
      </div>

      {/* Panel de ayuda colapsable */}
      {showHelp && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Clasificación del Producto</h4>
              <ul className="space-y-1 text-gray-600">
                <li><span className="inline-block w-20 font-medium text-green-600">Activo</span> Con stock y ventas recientes (últimos 14 días)</li>
                <li><span className="inline-block w-20 font-medium text-yellow-600">Dormido</span> Con stock pero sin ventas en 2 semanas</li>
                <li><span className="inline-block w-20 font-medium text-blue-600">Anomalía</span> Sin stock pero con ventas registradas (posible error)</li>
                <li><span className="inline-block w-20 font-medium text-purple-600">Fantasma</span> Sin stock y sin ventas en 30 días</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Estado de Criticidad (Stock)</h4>
              <ul className="space-y-1 text-gray-600">
                <li><span className="inline-block w-20 font-medium text-red-600">Crítico</span> Stock por debajo del stock de seguridad</li>
                <li><span className="inline-block w-20 font-medium text-orange-600">Urgente</span> Stock por debajo del punto de reorden</li>
                <li><span className="inline-block w-20 font-medium text-green-600">Óptimo</span> Stock dentro del rango ideal</li>
                <li><span className="inline-block w-20 font-medium text-blue-600">Exceso</span> Stock por encima del máximo recomendado</li>
                <li><span className="inline-block w-20 font-medium text-gray-500">Sin demanda</span> Sin ventas recientes para calcular</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Indicador de Nivel (SS/ROP/MAX)</h4>
              <ul className="space-y-1 text-gray-600">
                <li><span className="inline-block w-20 font-medium text-red-600">SS</span> Stock de Seguridad - mínimo para evitar quiebres</li>
                <li><span className="inline-block w-20 font-medium text-orange-600">ROP</span> Punto de Reorden - momento de reabastecer</li>
                <li><span className="inline-block w-20 font-medium text-green-700">MAX</span> Stock Máximo - límite superior recomendado</li>
              </ul>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">La barra muestra la posición actual (círculo) vs los umbrales:</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Bajo SS = Crítico</span>
                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">SS-ROP = Urgente</span>
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">ROP-MAX = Óptimo</span>
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Sobre MAX = Exceso</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Otras Métricas</h4>
              <ul className="space-y-1 text-gray-600">
                <li><span className="inline-block w-20 font-medium">ABC</span> Clasificación por volumen de venta (A=top 50, B=51-200, C=resto)</li>
                <li><span className="inline-block w-20 font-medium">Top #</span> Ranking por ventas en esta tienda</li>
                <li><span className="inline-block w-20 font-medium">P75/día</span> Demanda diaria (percentil 75, últimos 20 días)</li>
                <li><span className="inline-block w-20 font-medium">Días</span> Días de cobertura con stock actual</li>
              </ul>
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500"><span className="text-purple-600">🔒</span> = Límite forzado configurado (pasa el cursor para ver detalle)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent"></div>
            <p className="mt-4 text-sm text-gray-500">Cargando inventario...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('stock')}>
                    Stock {sortBy === 'stock' && <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                    <span title="Stock disponible en CEDI de la región">CEDI</span>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">P75/día</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('dias_stock')}>
                    Días {sortBy === 'dias_stock' && <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-red-500 uppercase" title="Stock de Seguridad (días)">SS</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-orange-500 uppercase" title="Punto de Reorden (días)">ROP</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-green-600 uppercase" title="Stock Máximo (días)">MAX</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase w-24" title="Indicador visual de nivel">
                    Nivel
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">ABC</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('rank_ventas')}>
                    Top {sortBy === 'rank_ventas' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">His.</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockData.length === 0 ? (
                  <tr><td colSpan={14} className="px-6 py-12 text-center text-gray-500">No se encontraron productos</td></tr>
                ) : (
                  stockData.map((item) => (
                    <tr key={`${item.producto_id}-${item.ubicacion_id}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{item.codigo_producto}</td>
                      <td className="px-3 py-2 text-gray-900 max-w-[180px] truncate" title={item.descripcion_producto}>{item.descripcion_producto}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-semibold ${(item.stock_actual ?? 0) <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatInteger(item.stock_actual)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-medium ${(item.stock_cedi ?? 0) <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {formatInteger(item.stock_cedi)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {item.demanda_p75 !== null && item.demanda_p75 > 0 ? formatNumber(item.demanda_p75, 1) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-medium ${
                          item.dias_cobertura_actual === null ? 'text-gray-400' :
                          item.dias_cobertura_actual < 3 ? 'text-red-600' :
                          item.dias_cobertura_actual < 7 ? 'text-orange-600' :
                          item.dias_cobertura_actual > 30 ? 'text-blue-600' : 'text-gray-900'
                        }`}>
                          {item.dias_cobertura_actual !== null ? (item.dias_cobertura_actual > 999 ? '999+' : formatNumber(item.dias_cobertura_actual, 1)) : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-red-600">
                        <div className="flex items-center justify-center gap-0.5">
                          {item.dias_ss !== null ? formatNumber(item.dias_ss, 1) : '-'}
                          {item.limite_min_forzado && (
                            <span
                              className="text-purple-600 cursor-help"
                              title={`Mín. exhibición forzado: ${formatInteger(item.limite_min_forzado)} uds${item.tipo_limite ? ` (${item.tipo_limite})` : ''}`}
                            >
                              🔒
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-orange-600">{item.dias_rop !== null ? formatNumber(item.dias_rop, 1) : '-'}</td>
                      <td className="px-2 py-2 text-center text-xs text-green-600">
                        <div className="flex items-center justify-center gap-0.5">
                          {item.dias_max !== null ? formatNumber(item.dias_max, 0) : '-'}
                          {item.limite_max_forzado && (
                            <span
                              className="text-purple-600 cursor-help"
                              title={`Cap. máxima forzada: ${formatInteger(item.limite_max_forzado)} uds${item.tipo_limite ? ` (${item.tipo_limite})` : ''}`}
                            >
                              🔒
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 w-24">{renderInventoryLevelIndicator(item)}</td>
                      <td className="px-3 py-2 text-center">{renderEstadoCriticidad(item.estado_criticidad)}</td>
                      <td className="px-3 py-2 text-center">{renderClaseABC(item.clase_abc)}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.rank_ventas ? `#${item.rank_ventas}` : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => { setSelectedProduct({ codigo: item.codigo_producto, descripcion: item.descripcion_producto }); setShowHistoryModal(true); }}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!loading && pagination && stockData.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, pagination.total_items)} de {formatInteger(pagination.total_items)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={!pagination.has_previous}
                className="px-3 py-1 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-gray-600">Pág {pagination.current_page}/{formatInteger(pagination.total_pages)}</span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!pagination.has_next}
                className="px-3 py-1 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      {selectedProduct && (
        <ProductHistoryModal
          isOpen={showHistoryModal}
          onClose={() => { setShowHistoryModal(false); setSelectedProduct(null); }}
          codigoProducto={selectedProduct.codigo}
          descripcionProducto={selectedProduct.descripcion}
          ubicacionId={selectedUbicacion}
          almacenCodigo={selectedAlmacen || undefined}
        />
      )}
      <CentroComandoCorreccionModal
        isOpen={showCorreccionModal}
        onClose={() => setShowCorreccionModal(false)}
        ubicacionId={selectedUbicacion}
        ubicacionNombre={ubicacionNombre}
        almacenCodigo={selectedAlmacen}
        onAjustesAplicados={() => { loadStock(); loadAnomaliasCount(); }}
      />
    </div>
  );
}
