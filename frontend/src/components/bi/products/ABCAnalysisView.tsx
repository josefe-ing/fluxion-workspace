import { useState, useEffect } from 'react';
import { Package, RefreshCw, AlertCircle, Filter, Globe, MapPin, Store } from 'lucide-react';
import { biService, ABCConsolidatedResponse } from '../../../services/biService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import http from '../../../services/http';

const ABC_CONFIG = {
  A: {
    label: 'Clase A',
    color: '#10b981',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    description: 'Alto valor de ventas'
  },
  B: {
    label: 'Clase B',
    color: '#3b82f6',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    description: 'Valor medio de ventas'
  },
  C: {
    label: 'Clase C',
    color: '#f59e0b',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
    description: 'Valor bajo de ventas'
  },
  D: {
    label: 'Clase D',
    color: '#ef4444',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    description: 'Muy bajo valor de ventas'
  }
};

interface StoreLocation {
  id: string;
  nombre: string;
  region: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ABCAnalysisView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ABCConsolidatedResponse | null>(null);
  const [stores, setStores] = useState<StoreLocation[]>([]);

  // Filters
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedStore, setSelectedStore] = useState<string>('');

  // Load stores
  useEffect(() => {
    const loadStores = async () => {
      try {
        const response = await http.get('/api/ubicaciones');
        const storesList = response.data
          .filter((u: any) => u.tipo === 'tienda' && !u.id.startsWith('cedi_'))
          .map((u: any) => ({
            id: u.id,
            nombre: u.nombre,
            region: u.region || 'SIN REGIÓN',
          }));
        setStores(storesList);
      } catch (error) {
        console.error('Error loading stores:', error);
      }
    };
    loadStores();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: { ubicacion_id?: string; region?: string } = {};
      if (selectedStore) {
        filters.ubicacion_id = selectedStore;
      } else if (selectedRegion) {
        filters.region = selectedRegion;
      }

      const response = await biService.getProductsABCConsolidated(filters);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRegion, selectedStore]);

  // Get unique regions
  const regions = Array.from(new Set(stores.map((s) => s.region))).sort();

  // Filter stores by selected region
  const filteredStores = selectedRegion
    ? stores.filter((s) => s.region === selectedRegion)
    : stores;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Prepare data for charts
  const ventasPieData = data.clasificaciones.map((c) => ({
    name: `Clase ${c.clase}`,
    value: c.pct_ventas,
    ventas: c.ventas_total,
    color: ABC_CONFIG[c.clase as keyof typeof ABC_CONFIG]?.color || '#666'
  }));

  const productosPieData = data.clasificaciones.map((c) => ({
    name: `Clase ${c.clase}`,
    value: c.pct_productos,
    cantidad: c.cantidad_productos,
    color: ABC_CONFIG[c.clase as keyof typeof ABC_CONFIG]?.color || '#666'
  }));

  // Group categories by ABC class
  const categoriasPorClase: Record<string, any[]> = {};
  data.categorias_abc.forEach((cat) => {
    if (!categoriasPorClase[cat.clase]) {
      categoriasPorClase[cat.clase] = [];
    }
    categoriasPorClase[cat.clase].push(cat);
  });

  // Determine filter context for header
  let filterLabel = 'Toda la Red';
  let filterIcon = <Globe className="w-5 h-5 text-indigo-600" />;

  if (data.filtro?.tipo === 'tienda') {
    filterLabel = `Tienda: ${data.filtro.ubicacion_nombre}`;
    filterIcon = <Store className="w-5 h-5 text-indigo-600" />;
  } else if (data.filtro?.tipo === 'region') {
    filterLabel = `Región: ${data.filtro.region}`;
    filterIcon = <MapPin className="w-5 h-5 text-indigo-600" />;
  }

  return (
    <div className="space-y-6">
      {/* Header with filter info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Análisis ABC de Productos</h2>
          <div className="flex items-center gap-2 mt-1">
            {filterIcon}
            <p className="text-sm text-gray-600">
              {filterLabel} - Últimos 30 días
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filtros:</span>
          </div>

          <select
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value);
              setSelectedStore(''); // Reset store when region changes
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todas las regiones</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>

          <select
            value={selectedStore}
            onChange={(e) => {
              setSelectedStore(e.target.value);
              if (e.target.value) {
                // When selecting a store, set its region too
                const store = stores.find((s) => s.id === e.target.value);
                if (store) setSelectedRegion(store.region);
              }
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todas las tiendas</option>
            {filteredStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.nombre}
              </option>
            ))}
          </select>

          {(selectedRegion || selectedStore) && (
            <button
              onClick={() => {
                setSelectedRegion('');
                setSelectedStore('');
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.clasificaciones.map((clase) => {
          const config = ABC_CONFIG[clase.clase as keyof typeof ABC_CONFIG];
          if (!config) return null;

          return (
            <div
              key={clase.clase}
              className={`p-6 rounded-xl border-2 ${config.borderColor} ${config.bgColor}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-lg font-bold ${config.textColor}`}>
                  Clase {clase.clase}
                </span>
                <Package className={`w-6 h-6 ${config.textColor}`} />
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-600">Ventas</p>
                  <p className={`text-2xl font-bold ${config.textColor}`}>
                    {clase.pct_ventas.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-600">
                    {formatCurrency(clase.ventas_total)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Productos</p>
                  <p className={`text-lg font-semibold ${config.textColor}`}>
                    {clase.cantidad_productos} ({clase.pct_productos.toFixed(1)}%)
                  </p>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-600">Margen promedio</p>
                  <p className={`text-sm font-semibold ${config.textColor}`}>
                    {clase.margen_pct?.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart - Ventas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Distribución de Ventas por Clasificación
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={ventasPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {ventasPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: string, entry: any) => [
                  `${value.toFixed(1)}% (${formatCurrency(entry.payload.ventas)})`,
                  name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart - Productos */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Distribución de Productos por Clasificación
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={productosPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {productosPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: string, entry: any) => [
                  `${value.toFixed(1)}% (${entry.payload.cantidad} productos)`,
                  name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Table by Class */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Métricas Detalladas por Clasificación</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clase
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Productos
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ventas Totales
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilidad
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Margen %
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unidades
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Venta Prom/Prod
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.clasificaciones.map((clase) => {
                const config = ABC_CONFIG[clase.clase as keyof typeof ABC_CONFIG];
                return (
                  <tr key={clase.clase} className={`${config?.bgColor} hover:bg-opacity-70`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${config?.bgColor} ${config?.textColor}`}>
                          Clase {clase.clase}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {clase.cantidad_productos}
                      <span className="text-xs text-gray-500 ml-2">({clase.pct_productos.toFixed(1)}%)</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(clase.ventas_total)}
                      <span className="text-xs text-gray-500 ml-2">({clase.pct_ventas.toFixed(1)}%)</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {formatCurrency(clase.utilidad_total || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {clase.margen_pct?.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {(clase.unidades_vendidas || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {formatCurrency(clase.venta_promedio_producto || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Categories by ABC Class */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {['A', 'B', 'C', 'D'].map((clase) => {
          const categoriasClase = categoriasPorClase[clase] || [];
          const config = ABC_CONFIG[clase as keyof typeof ABC_CONFIG];

          if (categoriasClase.length === 0) return null;

          return (
            <div key={clase} className={`bg-white rounded-xl border-2 ${config.borderColor} overflow-hidden`}>
              <div className={`px-6 py-4 ${config.bgColor} border-b ${config.borderColor}`}>
                <h3 className={`text-lg font-semibold ${config.textColor}`}>
                  Categorías - Clase {clase}
                </h3>
                <p className="text-xs text-gray-600 mt-1">{config.description}</p>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                        Categoría
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                        Productos
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                        Ventas
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                        Margen %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {categoriasClase
                      .sort((a, b) => b.ventas_total - a.ventas_total)
                      .map((cat) => (
                        <tr key={`${cat.categoria}-${cat.clase}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900 capitalize">
                            {cat.categoria.replace('cedi_', '')}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-gray-600">
                            {cat.cantidad_productos}
                          </td>
                          <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                            {formatCurrency(cat.ventas_total)}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-gray-600">
                            {cat.margen_pct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
