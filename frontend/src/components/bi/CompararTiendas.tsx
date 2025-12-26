import { useState, useEffect } from 'react';
import { ArrowRight, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { biService, CompareStoresResponse } from '../../services/biService';
import { formatNumber } from '../../utils/formatNumber';

export default function CompararTiendas() {
  const [tiendas, setTiendas] = useState<string[]>([]);
  const [tiendasDisponibles, setTiendasDisponibles] = useState<Array<{ id: string; nombre: string; region: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompareStoresResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'unicos' | 'comunes' | 'parciales'>('unicos');

  useEffect(() => {
    cargarTiendasDisponibles();
  }, []);

  const cargarTiendasDisponibles = async () => {
    // Por ahora hardcodeamos las tiendas de Caracas, en el futuro esto vendría de una API
    setTiendasDisponibles([
      { id: 'tienda_17', nombre: 'Artigas', region: 'CARACAS' },
      { id: 'tienda_18', nombre: 'Paraíso', region: 'CARACAS' },
      // Puedes agregar más tiendas aquí cuando estén activas
    ]);
  };

  const handleComparar = async () => {
    if (tiendas.length < 2) {
      alert('Selecciona al menos 2 tiendas para comparar');
      return;
    }

    try {
      setLoading(true);
      console.log('Comparando tiendas:', tiendas);
      const result = await biService.compareStores(tiendas);
      console.log('Resultado:', result);
      setData(result);
    } catch (error: any) {
      console.error('Error comparando tiendas:', error);
      console.error('Error response:', error.response);
      alert(error.response?.data?.detail || error.message || 'Error al comparar tiendas');
    } finally {
      setLoading(false);
    }
  };

  const toggleTienda = (tiendaId: string) => {
    if (tiendas.includes(tiendaId)) {
      setTiendas(tiendas.filter(t => t !== tiendaId));
    } else {
      if (tiendas.length >= 5) {
        alert('Máximo 5 tiendas para comparar');
        return;
      }
      setTiendas([...tiendas, tiendaId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Comparar Tiendas</h2>
        <p className="text-gray-600 mt-1">
          Compara productos y ventas entre diferentes tiendas para identificar oportunidades
        </p>
      </div>

      {/* Selector de Tiendas */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Selecciona Tiendas a Comparar</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {tiendasDisponibles.map((tienda) => (
            <button
              key={tienda.id}
              onClick={() => toggleTienda(tienda.id)}
              className={`
                p-4 rounded-lg border-2 transition-all duration-200
                ${
                  tiendas.includes(tienda.id)
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }
              `}
            >
              <div className="font-semibold">{tienda.nombre}</div>
              <div className="text-xs text-gray-500 mt-1">{tienda.region}</div>
            </button>
          ))}
        </div>

        <button
          onClick={handleComparar}
          disabled={tiendas.length < 2 || loading}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Comparando...
            </>
          ) : (
            <>
              Comparar Tiendas ({tiendas.length})
            </>
          )}
        </button>
      </div>

      {/* Resultados */}
      {data && (
        <div className="space-y-6">
          {/* Cards de Resumen */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Productos</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {data.resumen.total_productos_analizados}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Productos Únicos</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {data.resumen.productos_unicos}
                  </p>
                </div>
                <div className="p-3 bg-orange-100 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Productos Comunes</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {data.resumen.productos_comunes}
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Distribución Parcial</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1">
                    {data.resumen.productos_parciales}
                  </p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <ArrowRight className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 px-6" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('unicos')}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      activeTab === 'unicos'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  Productos Únicos ({data.resumen.productos_unicos})
                </button>
                <button
                  onClick={() => setActiveTab('comunes')}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      activeTab === 'comunes'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  Productos Comunes ({data.resumen.productos_comunes})
                </button>
                <button
                  onClick={() => setActiveTab('parciales')}
                  className={`
                    py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      activeTab === 'parciales'
                        ? 'border-yellow-500 text-yellow-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  Distribución Parcial ({data.resumen.productos_parciales})
                </button>
              </nav>
            </div>

            <div className="p-6">
              {/* Tab Content: Productos Únicos */}
              {activeTab === 'unicos' && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Productos que solo se venden en una de las tiendas seleccionadas
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Código
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Producto
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Solo en
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Unidades Vendidas
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Stock
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.productos_unicos.map((producto) => (
                          <tr key={producto.producto_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-mono text-gray-900">
                              {producto.producto_id}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                              {producto.nombre}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                                {producto.tienda_nombre}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {formatNumber(producto.unidades_vendidas)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {formatNumber(producto.stock)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab Content: Productos Comunes */}
              {activeTab === 'comunes' && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Productos que se venden en todas las tiendas, ordenados por diferencia de ventas
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Producto
                          </th>
                          {data.tiendas.map((tienda) => (
                            <th key={tienda.id} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              {tienda.nombre}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Diferencia
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.productos_comunes.slice(0, 50).map((producto) => (
                          <tr key={producto.producto_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                              {producto.nombre}
                            </td>
                            {producto.ventas_por_tienda.map((venta) => (
                              <td key={venta.tienda_id} className="px-4 py-3 text-sm text-right text-gray-900">
                                ${formatNumber(venta.ventas_30d)}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-semibold ${producto.diferencia_pct > 100 ? 'text-red-600' : 'text-yellow-600'}`}>
                                {producto.diferencia_pct}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab Content: Productos Parciales */}
              {activeTab === 'parciales' && (
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Productos que se venden en algunas tiendas pero no en todas - oportunidades de distribución
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Producto
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Vende en
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            No vende en
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Venta Promedio
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.productos_parciales.map((producto) => (
                          <tr key={producto.producto_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                              {producto.nombre}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-wrap gap-1">
                                {producto.tiendas_con_venta.map((tienda, idx) => (
                                  <span key={idx} className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                    {tienda}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-wrap gap-1">
                                {producto.tiendas_sin_venta.map((tienda, idx) => (
                                  <span key={idx} className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                    {tienda}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              ${formatNumber(producto.venta_promedio_donde_existe)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
