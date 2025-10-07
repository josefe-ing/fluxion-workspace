import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import http from '../../services/http';

interface VentasDetail {
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string;
  cantidad_total: number;
  promedio_diario: number;
  promedio_mismo_dia_semana: number;
  comparacion_ano_anterior: number | null;
  porcentaje_total: number;
  cantidad_bultos: number | null;
  total_bultos: number | null;
  promedio_bultos_diario: number | null;
}

interface Categoria {
  value: string;
  label: string;
}

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { ubicacionId } = useParams();

  const [ventasData, setVentasData] = useState<VentasDetail[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('ultimo_mes');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Métricas
  const stats = {
    total_transacciones: ventasData.length,
    total_unidades: ventasData.reduce((sum, item) => sum + item.cantidad_total, 0),
    productos_unicos: ventasData.length,
  };

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
      // No hacer nada, usar los valores de fechaInicio y fechaFin
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

      const response = await http.get(`/api/ventas/detail?${params.toString()}`);
      setVentasData(response.data);
    } catch (error) {
      console.error('Error cargando datos de ventas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategorias();
    // Establecer el período inicial al cargar
    handlePeriodoChange('ultimo_mes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fechaInicio && fechaFin) {
      loadVentasData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicacionId, selectedCategoria, fechaInicio, fechaFin]);

  // Filtrado por búsqueda
  const filteredData = ventasData.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const codigo = (item.codigo_producto || '').toLowerCase();
    const descripcion = (item.descripcion_producto || '').toLowerCase();
    return codigo.includes(search) || descripcion.includes(search);
  });

  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* Botón de regreso */}
      <button
        onClick={() => navigate('/ventas')}
        className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
      >
        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al resumen
      </button>

      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Detalle de Ventas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Análisis de productos vendidos con promedios y comparaciones
        </p>
      </div>

      {/* Métricas Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Productos Únicos</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.productos_unicos}</p>
            </div>
            <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Unidades Vendidas</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{Math.round(stats.total_unidades).toLocaleString()}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Promedio Diario</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {ventasData.length > 0 ? Math.round(ventasData.reduce((sum, item) => sum + item.promedio_diario, 0) / ventasData.length).toLocaleString() : 0}
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {/* Primera fila: Período y Mes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Período */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
            <select
              value={periodoSeleccionado}
              onChange={(e) => {
                handlePeriodoChange(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="ultima_semana">Última Semana</option>
              <option value="ultimo_mes">Último Mes</option>
              <option value="ultimos_3_meses">Últimos 3 Meses</option>
              <option value="ultimo_ano">Último Año</option>
              <option value="mes_actual">Mes Actual</option>
              <option value="mes_anterior">Mes Anterior</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>

          {/* Selector de Mes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Seleccionar Mes</label>
            <input
              type="month"
              onChange={(e) => {
                handleMesChange(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Segunda fila: Fechas personalizadas (solo visible si periodo es personalizado) */}
        {periodoSeleccionado === 'personalizado' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
            {/* Fecha Inicio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Inicio</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Fin</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => {
                  setFechaFin(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Tercera fila: Categoría y Búsqueda */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
            <select
              value={selectedCategoria}
              onChange={(e) => {
                setSelectedCategoria(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Búsqueda */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar Producto</label>
            <input
              type="text"
              placeholder="Código o descripción..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Indicador de rango de fechas actual */}
        <div className="pt-2 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Período seleccionado:</span> {fechaInicio} al {fechaFin}
          </p>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Productos Vendidos ({filteredData.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
            <p className="mt-4 text-sm text-gray-500">Cargando ventas...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Código
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descripción
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cant. Total
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prom. Diario
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bultos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Bultos
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prom. Bultos/Día
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                        No se encontraron ventas con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((item, index) => (
                      <tr key={`${item.codigo_producto}-${index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.codigo_producto}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {item.descripcion_producto}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.categoria}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                          {Math.round(item.cantidad_total).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-blue-600">
                          {item.promedio_diario.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                          {item.cantidad_bultos ? Math.round(item.cantidad_bultos).toLocaleString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-orange-600">
                          {item.total_bultos ? item.total_bultos.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-purple-600">
                          {item.promedio_bultos_diario ? item.promedio_bultos_diario.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                          {item.porcentaje_total.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{indexOfFirstItem + 1}</span> a{' '}
                    <span className="font-medium">
                      {Math.min(indexOfLastItem, filteredData.length)}
                    </span>{' '}
                    de <span className="font-medium">{filteredData.length}</span> productos
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-700">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
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
    </div>
  );
}
