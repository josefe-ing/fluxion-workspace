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
  const [sortBy, setSortBy] = useState<'tienda' | 'unidades'>('tienda');
  const [modalProducto, setModalProducto] = useState<any>(null);

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

  const getTiendaColor = (tiendaNombre: string) => {
    const colors = [
      'bg-orange-100 text-orange-800',
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800',
      'bg-purple-100 text-purple-800',
      'bg-pink-100 text-pink-800',
    ];
    const index = data?.tiendas.findIndex(t => t.nombre === tiendaNombre) || 0;
    return colors[index % colors.length];
  };

  const getProductosUnicosOrdenados = () => {
    if (!data) return [];
    const productos = [...data.productos_unicos];
    if (sortBy === 'tienda') {
      productos.sort((a, b) => a.tienda_nombre.localeCompare(b.tienda_nombre));
    } else {
      productos.sort((a, b) => b.unidades_vendidas - a.unidades_vendidas);
    }
    return productos;
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
                  <div className="mb-4 flex gap-2">
                    <button
                      onClick={() => setSortBy('tienda')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${
                        sortBy === 'tienda'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Ordenar por Tienda
                    </button>
                    <button
                      onClick={() => setSortBy('unidades')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${
                        sortBy === 'unidades'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Ordenar por Unidades
                    </button>
                  </div>
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100">
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
                        {getProductosUnicosOrdenados().map((producto) => (
                          <tr
                            key={producto.producto_id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setModalProducto(producto)}
                          >
                            <td className="px-4 py-3 text-sm font-mono text-gray-900">
                              {producto.producto_id}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                              {producto.nombre}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTiendaColor(producto.tienda_nombre)}`}>
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
                          {data.tiendas.map((tienda, idx) => (
                            <th key={tienda.id} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                              <span className={`px-2 py-1 text-xs rounded-full ${getTiendaColor(tienda.nombre)}`}>
                                {tienda.nombre}
                              </span>
                            </th>
                          ))}
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Diferencia
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.productos_comunes.slice(0, 50).map((producto) => (
                          <tr
                            key={producto.producto_id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setModalProducto(producto)}
                          >
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                              {producto.nombre}
                            </td>
                            {producto.ventas_por_tienda.map((venta) => (
                              <td key={venta.tienda_id} className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">
                                {formatNumber(venta.unidades_vendidas)}
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
                          <tr
                            key={producto.producto_id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setModalProducto(producto)}
                          >
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                              {producto.nombre}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-wrap gap-1">
                                {producto.tiendas_con_venta.map((tienda, idx) => (
                                  <span key={idx} className={`px-2 py-1 text-xs rounded-full ${getTiendaColor(tienda)}`}>
                                    {tienda}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-wrap gap-1">
                                {producto.tiendas_sin_venta.map((tienda, idx) => (
                                  <span key={idx} className="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-700">
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

      {/* Modal de Detalles del Producto */}
      {modalProducto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalProducto.nombre || 'Producto'}
                </h3>
                <p className="text-sm text-gray-500 font-mono mt-1">
                  {modalProducto.producto_id}
                </p>
              </div>
              <button
                onClick={() => setModalProducto(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Producto Único */}
              {modalProducto.tienda_id && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900">Producto Exclusivo</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Este producto solo se vende en una tienda
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase">Tienda</p>
                      <p className={`mt-1 px-3 py-1 rounded-full inline-block ${getTiendaColor(modalProducto.tienda_nombre)}`}>
                        {modalProducto.tienda_nombre}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase">Unidades Vendidas (30d)</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {formatNumber(modalProducto.unidades_vendidas)}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase">Ventas (30d)</p>
                      <p className="text-xl font-semibold text-green-600 mt-1">
                        ${formatNumber(modalProducto.ventas_30d)}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase">Stock Actual</p>
                      <p className="text-xl font-semibold text-gray-900 mt-1">
                        {formatNumber(modalProducto.stock)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-medium text-yellow-900">💡 Oportunidad</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Considera evaluar si este producto podría venderse en otras tiendas
                    </p>
                  </div>
                </div>
              )}

              {/* Producto Común */}
              {modalProducto.ventas_por_tienda && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-900">Producto Común</p>
                    <p className="text-xs text-green-700 mt-1">
                      Este producto se vende en todas las tiendas comparadas
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Tienda
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Unidades Vendidas
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Ventas ($)
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Stock
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            GMROI
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {modalProducto.ventas_por_tienda.map((venta: any) => (
                          <tr key={venta.tienda_id}>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTiendaColor(venta.tienda_nombre)}`}>
                                {venta.tienda_nombre}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {formatNumber(venta.unidades_vendidas)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-600">
                              ${formatNumber(venta.ventas_30d)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {formatNumber(venta.stock)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                              {venta.gmroi.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase">Diferencia entre tiendas</p>
                      <p className={`text-2xl font-bold mt-1 ${modalProducto.diferencia_pct > 100 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {modalProducto.diferencia_pct}%
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase">Rango de ventas</p>
                      <p className="text-sm text-gray-900 mt-1">
                        ${formatNumber(modalProducto.venta_min)} - ${formatNumber(modalProducto.venta_max)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Producto Parcial */}
              {modalProducto.tiendas_con_venta && modalProducto.tiendas_sin_venta && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-yellow-900">Distribución Parcial</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Este producto se vende solo en algunas tiendas
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs text-green-700 font-medium uppercase mb-2">
                        ✓ Vende en ({modalProducto.num_tiendas_con})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {modalProducto.tiendas_con_venta.map((tienda: string, idx: number) => (
                          <span key={idx} className={`px-2 py-1 text-xs font-medium rounded-full ${getTiendaColor(tienda)}`}>
                            {tienda}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-xs text-red-700 font-medium uppercase mb-2">
                        ✗ No vende en ({modalProducto.num_tiendas_sin})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {modalProducto.tiendas_sin_venta.map((tienda: string, idx: number) => (
                          <span key={idx} className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
                            {tienda}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-600 uppercase">Venta Promedio (donde existe)</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      ${formatNumber(modalProducto.venta_promedio_donde_existe)}
                    </p>
                  </div>

                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">💡 Oportunidad de Expansión</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Este producto tiene potencial para distribuirse en las tiendas donde no se vende actualmente
                    </p>
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
