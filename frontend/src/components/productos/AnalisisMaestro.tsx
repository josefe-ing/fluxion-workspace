import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getAnalisisMaestro,
  getAnalisisMaestroResumen,
  ProductoAnalisisMaestro,
  ResumenAnalisisMaestro,
  EstadoProducto,
  ClasificacionABC,
} from '../../services/productosService';
import DetalleTiendasModal from './DetalleTiendasModal';

// Configuración de estados con descripciones
const ESTADOS_CONFIG: Record<EstadoProducto, { label: string; color: string; bgColor: string; icon: string; accion: string; descripcion: string }> = {
  FANTASMA: { label: 'Fantasma', color: 'text-purple-800', bgColor: 'bg-purple-100', icon: '👻', accion: 'ELIMINAR', descripcion: 'Sin stock en ningún lado y sin ventas en 2 meses' },
  CRITICO: { label: 'Crítico', color: 'text-red-800', bgColor: 'bg-red-100', icon: '🔴', accion: 'EVALUAR', descripcion: 'Stock solo en CEDI, nada en tiendas, sin ventas' },
  ANOMALIA: { label: 'Anomalía', color: 'text-blue-800', bgColor: 'bg-blue-100', icon: '🔵', accion: 'INVESTIGAR', descripcion: 'Sin stock pero con ventas registradas (error de datos)' },
  DORMIDO: { label: 'Dormido', color: 'text-orange-800', bgColor: 'bg-orange-100', icon: '😴', accion: 'EVALUAR', descripcion: 'Con stock pero sin ventas en 2 meses' },
  AGOTANDOSE: { label: 'Agotándose', color: 'text-yellow-800', bgColor: 'bg-yellow-100', icon: '⚠️', accion: 'REABASTECER', descripcion: 'Con ventas pero stock bajo o sin respaldo en CEDI' },
  ACTIVO: { label: 'Activo', color: 'text-green-800', bgColor: 'bg-green-100', icon: '✅', accion: 'OK', descripcion: 'Con stock y ventas - funcionando normal' },
};

const ABC_CONFIG: Record<ClasificacionABC, { label: string; color: string; bgColor: string; description: string }> = {
  A: { label: 'A', color: 'text-red-800', bgColor: 'bg-red-100', description: '80% del valor' },
  B: { label: 'B', color: 'text-yellow-800', bgColor: 'bg-yellow-100', description: '15% del valor' },
  C: { label: 'C', color: 'text-gray-800', bgColor: 'bg-gray-100', description: '5% del valor' },
  SIN_VENTAS: { label: 'Sin Ventas', color: 'text-purple-800', bgColor: 'bg-purple-100', description: 'Sin ventas 2M' },
};

const AnalisisMaestro: React.FC = () => {
  const [productos, setProductos] = useState<ProductoAnalisisMaestro[]>([]);
  const [resumen, setResumen] = useState<ResumenAnalisisMaestro | null>(null);
  const [loading, setLoading] = useState(true);
  const [abcFiltro, setAbcFiltro] = useState<ClasificacionABC | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoProducto | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducto, setSelectedProducto] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductoAnalisisMaestro; direction: 'asc' | 'desc' }>({
    key: 'rank_valor',
    direction: 'asc',
  });
  const [showLeyenda, setShowLeyenda] = useState(false);

  // Cargar resumen (se actualiza cuando cambia el filtro ABC)
  useEffect(() => {
    const loadResumen = async () => {
      try {
        const data = await getAnalisisMaestroResumen(abcFiltro || undefined);
        setResumen(data);
      } catch (error) {
        console.error('Error loading resumen:', error);
      }
    };
    loadResumen();
  }, [abcFiltro]);

  // Cargar productos
  const loadProductos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAnalisisMaestro(
        estadoFiltro || undefined,
        abcFiltro || undefined,
        undefined,
        searchTerm || undefined,
        5000
      );
      setProductos(data);
    } catch (error) {
      console.error('Error loading productos:', error);
    } finally {
      setLoading(false);
    }
  }, [estadoFiltro, abcFiltro, searchTerm]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadProductos();
    }, 300);
    return () => clearTimeout(debounce);
  }, [loadProductos]);

  // Ordenar productos
  const sortedProductos = useMemo(() => {
    const sorted = [...productos];
    sorted.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
    return sorted;
  }, [productos, sortConfig]);

  const handleSort = (key: keyof ProductoAnalisisMaestro) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleAbcClick = (abc: ClasificacionABC | null) => {
    setAbcFiltro(abc);
    setEstadoFiltro(null); // Reset estado cuando cambia ABC
  };

  const SortIcon = ({ columnKey }: { columnKey: keyof ProductoAnalisisMaestro }) => {
    if (sortConfig.key !== columnKey) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString('es-VE', { maximumFractionDigits: 0 });
  };

  const exportToCSV = () => {
    const headers = [
      'Código', 'Descripción', 'Categoría', 'Estado', 'ABC',
      'Stock CEDI Seco', 'Stock CEDI Caracas', 'Stock Tiendas', '# Tiendas c/Stock',
      'Ventas 2M', '# Tiendas c/Ventas', 'Última Venta', 'Días Sin Venta',
      'Rank Qty', 'Rank $'
    ];

    const rows = sortedProductos.map(p => [
      p.codigo,
      `"${p.descripcion.replace(/"/g, '""')}"`,
      p.categoria,
      p.estado,
      p.clasificacion_abc,
      p.stock_cedi_seco,
      p.stock_cedi_caracas,
      p.stock_tiendas,
      p.num_tiendas_con_stock,
      p.ventas_2m,
      p.num_tiendas_con_ventas,
      p.ultima_venta || '',
      p.dias_sin_venta ?? '',
      p.rank_cantidad,
      p.rank_valor,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const abcLabel = abcFiltro || 'todos';
    const estadoLabel = estadoFiltro || 'todos';
    link.download = `analisis_maestro_${abcLabel}_${estadoLabel}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análisis Maestro de Productos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Detecta productos fantasma, críticos y anomalías para sincerar el maestro
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {/* Filtros ABC - Fila Superior */}
      {resumen && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-gray-700">Clasificación ABC:</span>
            <span className="text-xs text-gray-500">(Basada en valor de ventas - Pareto)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Todos */}
            <button
              onClick={() => handleAbcClick(null)}
              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium ${
                abcFiltro === null
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="text-lg font-bold">{resumen.total.toLocaleString()}</span>
              <span className="ml-2 text-sm">Todos</span>
            </button>

            {/* Por ABC - siempre mostrar todas las clasificaciones */}
            {(['A', 'B', 'C', 'SIN_VENTAS'] as ClasificacionABC[]).map(abc => {
              const config = ABC_CONFIG[abc];
              const count = resumen.por_abc[abc] || 0;
              const isEmpty = count === 0;
              return (
                <button
                  key={abc}
                  onClick={() => !isEmpty && handleAbcClick(abcFiltro === abc ? null : abc)}
                  disabled={isEmpty}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${
                    isEmpty
                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                      : abcFiltro === abc
                        ? 'border-blue-500 ring-2 ring-blue-200 ' + config.bgColor
                        : 'border-gray-200 hover:border-gray-300 ' + config.bgColor
                  }`}
                >
                  <span className={`text-lg font-bold ${isEmpty ? 'text-gray-400' : config.color}`}>{count.toLocaleString()}</span>
                  <span className={`ml-2 text-sm ${isEmpty ? 'text-gray-400' : config.color}`}>{config.label}</span>
                  <span className="ml-1 text-xs text-gray-500">({config.description})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Leyenda de Estados - Colapsable */}
      <div className="bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200">
        <button
          onClick={() => setShowLeyenda(!showLeyenda)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">¿Qué significa cada estado?</span>
          </div>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showLeyenda ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showLeyenda && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
              {(Object.keys(ESTADOS_CONFIG) as EstadoProducto[]).map(estado => {
                const config = ESTADOS_CONFIG[estado];
                return (
                  <div key={estado} className={`flex items-start gap-2 p-2 rounded ${config.bgColor} bg-opacity-50`}>
                    <span className="text-lg flex-shrink-0">{config.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white bg-opacity-60 text-gray-600">{config.accion}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{config.descripcion}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Estados Cards - Se actualizan según ABC seleccionado */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(Object.keys(ESTADOS_CONFIG) as EstadoProducto[]).map(estado => {
            const config = ESTADOS_CONFIG[estado];
            const count = resumen.por_estado[estado] || 0;
            return (
              <button
                key={estado}
                onClick={() => setEstadoFiltro(estadoFiltro === estado ? null : estado)}
                title={config.descripcion}
                className={`p-4 rounded-lg border-2 transition-all ${
                  estadoFiltro === estado
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300'
                } ${config.bgColor}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.icon}</span>
                  <span className={`text-2xl font-bold ${config.color}`}>{count.toLocaleString()}</span>
                </div>
                <div className={`text-xs ${config.color} font-medium`}>{config.label}</div>
                <div className="text-xs text-gray-500 mt-1">{config.accion}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + Filtros activos */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[250px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código o descripción..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtros activos */}
          <div className="flex items-center gap-2">
            {abcFiltro && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${ABC_CONFIG[abcFiltro].bgColor} ${ABC_CONFIG[abcFiltro].color}`}>
                ABC: {ABC_CONFIG[abcFiltro].label}
                <button onClick={() => setAbcFiltro(null)} className="ml-2">✕</button>
              </span>
            )}
            {estadoFiltro && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${ESTADOS_CONFIG[estadoFiltro].bgColor} ${ESTADOS_CONFIG[estadoFiltro].color}`}>
                {ESTADOS_CONFIG[estadoFiltro].icon} {ESTADOS_CONFIG[estadoFiltro].label}
                <button onClick={() => setEstadoFiltro(null)} className="ml-2">✕</button>
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-500">
          Mostrando {sortedProductos.length.toLocaleString()} productos
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200" style={{ minWidth: '1200px' }}>
              <thead className="bg-gray-50">
                <tr className="border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                    Estado
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('codigo')}
                  >
                    Código <SortIcon columnKey="codigo" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('descripcion')}
                    style={{ minWidth: '220px' }}
                  >
                    Producto <SortIcon columnKey="descripcion" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                    Cat / ABC
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('stock_cedi_seco')}
                    title="Stock en CEDI Seco"
                  >
                    Stock Seco <SortIcon columnKey="stock_cedi_seco" />
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('stock_cedi_caracas')}
                    title="Stock en CEDI Caracas"
                  >
                    Stock CCS <SortIcon columnKey="stock_cedi_caracas" />
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('stock_tiendas')}
                    title="Stock total en todas las tiendas"
                  >
                    Stock Tiendas <SortIcon columnKey="stock_tiendas" />
                  </th>
                  <th
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('num_tiendas_con_stock')}
                    title="Número de tiendas con stock > 0"
                  >
                    # Tiendas <SortIcon columnKey="num_tiendas_con_stock" />
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('ventas_2m')}
                    title="Unidades vendidas en últimos 2 meses"
                  >
                    Ventas 2M <SortIcon columnKey="ventas_2m" />
                  </th>
                  <th
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('num_tiendas_con_ventas')}
                    title="Número de tiendas con ventas en 2M"
                  >
                    # Vendiendo <SortIcon columnKey="num_tiendas_con_ventas" />
                  </th>
                  <th
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('dias_sin_venta')}
                    title="Días desde la última venta"
                  >
                    Días s/Vta <SortIcon columnKey="dias_sin_venta" />
                  </th>
                  <th
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('rank_valor')}
                    title="Ranking por valor de ventas"
                  >
                    Rank $ <SortIcon columnKey="rank_valor" />
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedProductos.map((producto) => {
                  const estadoConfig = ESTADOS_CONFIG[producto.estado];
                  const abcConfig = ABC_CONFIG[producto.clasificacion_abc as ClasificacionABC] || ABC_CONFIG.SIN_VENTAS;
                  return (
                    <tr
                      key={producto.codigo}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedProducto(producto.codigo)}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${estadoConfig.bgColor} ${estadoConfig.color}`}>
                          {estadoConfig.icon} {estadoConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm font-mono text-gray-900">
                        {producto.codigo}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900 truncate" style={{ maxWidth: '250px' }} title={producto.descripcion}>
                        {producto.descripcion}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 truncate" style={{ maxWidth: '80px' }} title={producto.categoria}>
                            {producto.categoria}
                          </span>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${abcConfig.bgColor} ${abcConfig.color}`}>
                            {producto.clasificacion_abc === 'SIN_VENTAS' ? 'S/V' : producto.clasificacion_abc}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono">
                        <span className={producto.stock_cedi_seco > 0 ? 'text-green-600' : producto.stock_cedi_seco < 0 ? 'text-red-600' : 'text-gray-400'}>
                          {formatNumber(producto.stock_cedi_seco)}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono">
                        <span className={producto.stock_cedi_caracas > 0 ? 'text-green-600' : producto.stock_cedi_caracas < 0 ? 'text-red-600' : 'text-gray-400'}>
                          {formatNumber(producto.stock_cedi_caracas)}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono">
                        <span className={producto.stock_tiendas > 0 ? 'text-green-600' : producto.stock_tiendas < 0 ? 'text-red-600' : 'text-gray-400'}>
                          {formatNumber(producto.stock_tiendas)}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                          producto.num_tiendas_con_stock > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {producto.num_tiendas_con_stock}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono">
                        <span className={producto.ventas_2m > 0 ? 'text-blue-600' : 'text-gray-400'}>
                          {formatNumber(producto.ventas_2m)}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                          producto.num_tiendas_con_ventas > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {producto.num_tiendas_con_ventas}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-center">
                        {producto.dias_sin_venta !== null ? (
                          <span className={`font-mono ${
                            producto.dias_sin_venta > 30 ? 'text-red-600' :
                            producto.dias_sin_venta > 14 ? 'text-orange-600' :
                            'text-gray-600'
                          }`}>
                            {producto.dias_sin_venta}d
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-center font-mono text-gray-500">
                        {producto.rank_valor < 999999 ? `#${producto.rank_valor}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedProducto && (
        <DetalleTiendasModal
          isOpen={!!selectedProducto}
          onClose={() => setSelectedProducto(null)}
          codigo={selectedProducto}
        />
      )}
    </div>
  );
};

export default AnalisisMaestro;
