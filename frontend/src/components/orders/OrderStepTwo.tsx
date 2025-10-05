import { useState, useEffect } from 'react';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import ForecastDetailModal from './ForecastDetailModal';

interface Props {
  orderData: OrderData;
  updateOrderData: (data: Partial<OrderData>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SortField = 'prom_5d' | 'prom_20d' | 'prom_mismo_dia' | 'stock' | 'sugerido' | 'pedir';
type SortDirection = 'asc' | 'desc';

interface StockParams {
  stock_min_mult_a: number;
  stock_min_mult_ab: number;
  stock_min_mult_b: number;
  stock_min_mult_bc: number;
  stock_min_mult_c: number;
  stock_seg_mult_a: number;
  stock_seg_mult_ab: number;
  stock_seg_mult_b: number;
  stock_seg_mult_bc: number;
  stock_seg_mult_c: number;
}

export default function OrderStepTwo({ orderData, updateOrderData, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [productos, setProductos] = useState<ProductoPedido[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField | null>('prom_20d');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [stockParams, setStockParams] = useState<StockParams | null>(null);
  const [forecastData, setForecastData] = useState<Record<string, number>>({});
  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [selectedProductoForecast, setSelectedProductoForecast] = useState<ProductoPedido | null>(null);
  const [forecastsDiarios, setForecastsDiarios] = useState<any[]>([]);

  useEffect(() => {
    cargarStockParams();
    cargarForecast();
    if (orderData.productos.length > 0) {
      setProductos(orderData.productos);
    } else {
      cargarProductosSugeridos();
    }
  }, []);

  const cargarForecast = async () => {
    try {
      const response = await http.get(`/api/forecast/productos?ubicacion_id=${orderData.tienda_destino}&dias_adelante=7`);
      if (response.data.success && response.data.forecasts) {
        const forecastMap: Record<string, number> = {};
        response.data.forecasts.forEach((f: any) => {
          forecastMap[f.codigo_producto] = f.forecast_unidades;
        });
        setForecastData(forecastMap);
      }
    } catch (error) {
      console.error('Error cargando forecast:', error);
    }
  };

  const handleForecastClick = async (producto: ProductoPedido) => {
    try {
      const response = await http.get(
        `/api/forecast/producto/${producto.codigo_producto}/diario?ubicacion_id=${orderData.tienda_destino}&dias_adelante=7`
      );
      if (response.data.success && response.data.forecasts) {
        setForecastsDiarios(response.data.forecasts);
        setSelectedProductoForecast(producto);
        setForecastModalOpen(true);
      }
    } catch (error) {
      console.error('Error cargando forecast diario:', error);
    }
  };

  const cargarStockParams = async () => {
    try {
      const response = await http.get(`/api/ubicaciones/${orderData.tienda_destino}/stock-params`);
      setStockParams(response.data);
    } catch (error) {
      console.error('Error cargando parámetros de stock:', error);
      // Usar valores por defecto
      setStockParams({
        stock_min_mult_a: 2.0,
        stock_min_mult_ab: 2.0,
        stock_min_mult_b: 3.0,
        stock_min_mult_bc: 9.0,
        stock_min_mult_c: 15.0,
        stock_seg_mult_a: 1.0,
        stock_seg_mult_ab: 2.5,
        stock_seg_mult_b: 2.0,
        stock_seg_mult_bc: 3.0,
        stock_seg_mult_c: 7.0
      });
    }
  };

  const cargarProductosSugeridos = async () => {
    try {
      setLoading(true);
      const response = await http.post('/api/pedidos-sugeridos/calcular', {
        cedi_origen: orderData.cedi_origen,
        tienda_destino: orderData.tienda_destino,
        dias_cobertura: 3,
      });

      const productosConDefaults = response.data.map((p: ProductoPedido) => ({
        ...p,
        cantidad_pedida_bultos: p.cantidad_ajustada_bultos,
        incluido: true,
      }));

      setProductos(productosConDefaults);
      updateOrderData({ productos: productosConDefaults });
    } catch (error) {
      console.error('Error cargando productos sugeridos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCantidadChange = (codigoProducto: string, value: string) => {
    const newProductos = productos.map(p =>
      p.codigo_producto === codigoProducto
        ? { ...p, cantidad_pedida_bultos: parseInt(value) || 0 }
        : p
    );
    setProductos(newProductos);
    updateOrderData({ productos: newProductos });
  };

  const handleNotasChange = (codigoProducto: string, value: string) => {
    const newProductos = productos.map(p =>
      p.codigo_producto === codigoProducto
        ? { ...p, razon_pedido: value }
        : p
    );
    setProductos(newProductos);
    updateOrderData({ productos: newProductos });
  };

  const handleIncluirChange = (codigoProducto: string) => {
    const newProductos = productos.map(p =>
      p.codigo_producto === codigoProducto
        ? { ...p, incluido: !p.incluido }
        : p
    );
    setProductos(newProductos);
    updateOrderData({ productos: newProductos });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filtrar productos por búsqueda
  const productosFiltrados = productos.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.codigo_producto.toLowerCase().includes(term) ||
      p.descripcion_producto.toLowerCase().includes(term)
    );
  });

  // Ordenar productos
  const productosOrdenados = [...productosFiltrados].sort((a, b) => {
    if (!sortField) return 0;

    let aValue: number, bValue: number;

    switch (sortField) {
      case 'prom_5d':
        aValue = a.prom_ventas_5dias_unid;
        bValue = b.prom_ventas_5dias_unid;
        break;
      case 'prom_20d':
        aValue = a.prom_ventas_20dias_unid;
        bValue = b.prom_ventas_20dias_unid;
        break;
      case 'prom_mismo_dia':
        aValue = a.prom_mismo_dia_unid;
        bValue = b.prom_mismo_dia_unid;
        break;
      case 'stock':
        aValue = a.stock_total;
        bValue = b.stock_total;
        break;
      case 'sugerido':
        aValue = a.cantidad_ajustada_bultos;
        bValue = b.cantidad_ajustada_bultos;
        break;
      case 'pedir':
        aValue = a.cantidad_pedida_bultos || 0;
        bValue = b.cantidad_pedida_bultos || 0;
        break;
      default:
        return 0;
    }

    if (sortDirection === 'asc') {
      return aValue - bValue;
    } else {
      return bValue - aValue;
    }
  });

  const productosIncluidos = productos.filter(p => p.incluido);
  const totalBultos = productosIncluidos.reduce((sum, p) => sum + (p.cantidad_pedida_bultos || 0), 0);

  const calcularStockMinimo = (producto: ProductoPedido): number => {
    if (!stockParams) return 0;

    const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
    let multiplicador = 0;

    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_min_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_min_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_min_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_min_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_min_mult_c;
    else return 0;

    return ventaDiariaBultos * multiplicador;
  };

  const calcularStockSeguridad = (producto: ProductoPedido): number => {
    if (!stockParams) return 0;

    const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
    let multiplicador = 0;

    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_seg_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_seg_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_seg_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_seg_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_seg_mult_c;
    else return 0;

    return ventaDiariaBultos * multiplicador;
  };

  const calcularPuntoReorden = (producto: ProductoPedido): number => {
    if (!stockParams) return 0;

    const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
    const stockMin = calcularStockMinimo(producto);
    const stockSeg = calcularStockSeguridad(producto);

    return stockMin + stockSeg + (1.25 * ventaDiariaBultos);
  };

  const SortableHeader = ({ field, label, bgColor = 'bg-gray-50' }: { field: SortField; label: string; bgColor?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none ${bgColor}`}
    >
      <div className="flex items-center gap-1 justify-center">
        <span>{label}</span>
        {sortField === field && (
          <span className="text-gray-900">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header con stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Productos Sugeridos</h2>
            <p className="mt-1 text-sm text-gray-500">
              Revisa y ajusta las cantidades de los productos a pedir
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Productos seleccionados</div>
            <div className="text-3xl font-bold text-gray-900">{productosIncluidos.length}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-md p-3">
            <div className="text-xs text-gray-500">Total Bultos</div>
            <div className="text-lg font-semibold text-gray-900">{totalBultos.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded-md p-3">
            <div className="text-xs text-gray-500">CEDI Origen</div>
            <div className="text-sm font-medium text-gray-900">{orderData.cedi_origen_nombre}</div>
          </div>
          <div className="bg-gray-50 rounded-md p-3">
            <div className="text-xs text-gray-500">Tienda Destino</div>
            <div className="text-sm font-medium text-gray-900">{orderData.tienda_destino_nombre}</div>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Buscar por código o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {searchTerm && (
            <p className="mt-1 text-sm text-gray-500">
              Mostrando {productosFiltrados.length} de {productos.length} productos
            </p>
          )}
        </div>
      </div>

      {/* Tabla de productos */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-500">Calculando productos sugeridos...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden w-full">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200" style={{ minWidth: '2400px' }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    <input
                      type="checkbox"
                      checked={productos.every(p => p.incluido)}
                      onChange={(e) => {
                        const newProductos = productos.map(p => ({ ...p, incluido: e.target.checked }));
                        setProductos(newProductos);
                        updateOrderData({ productos: newProductos });
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="sticky left-12 z-10 bg-blue-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{ minWidth: '100px' }}>Código</th>
                  <th className="sticky left-40 z-10 bg-blue-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{ minWidth: '300px' }}>Descripción</th>
                  <th className="bg-blue-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Unid/Bulto</th>
                  <SortableHeader field="prom_5d" label="Venta/Día 5d" bgColor="bg-purple-50" />
                  <SortableHeader field="prom_20d" label="Venta/Día 20d" bgColor="bg-purple-50" />
                  <SortableHeader field="prom_mismo_dia" label="Venta/Día Mismo Día" bgColor="bg-purple-50" />
                  <th className="bg-purple-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    <div className="flex items-center gap-1 justify-center">
                      <span>Forecast 7d</span>
                      <span className="text-xs">🔮</span>
                    </div>
                  </th>
                  <SortableHeader field="stock" label="Stock Tienda" bgColor="bg-green-50" />
                  <th className="bg-green-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock en Tránsito
                  </th>
                  <th className="bg-green-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock Total
                  </th>
                  <th className="bg-green-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock Total (días)
                  </th>
                  <th className="bg-green-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock {orderData.cedi_origen_nombre}
                  </th>
                  <th className="bg-orange-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Clasificación
                  </th>
                  <th className="bg-orange-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock Min
                  </th>
                  <th className="bg-orange-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Punto Reorden
                  </th>
                  <th className="bg-orange-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock Seguridad
                  </th>
                  <th className="bg-orange-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Stock Max
                  </th>
                  <SortableHeader field="sugerido" label="Sugerido" bgColor="bg-gray-50" />
                  <SortableHeader field="pedir" label="Pedir (Bultos)" bgColor="bg-gray-50" />
                  <th className="bg-gray-50 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Notas</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productosOrdenados.slice(0, 50).map((producto, index) => (
                  <tr key={`${producto.codigo_producto}-${index}`} className={producto.incluido ? '' : 'opacity-50'}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-3" style={{ minWidth: '60px' }}>
                      <input
                        type="checkbox"
                        checked={producto.incluido || false}
                        onChange={() => handleIncluirChange(producto.codigo_producto)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="sticky left-12 z-10 bg-blue-50 px-4 py-3 text-sm font-medium text-gray-900 text-center" style={{ minWidth: '100px' }}>{producto.codigo_producto}</td>
                    <td className="sticky left-40 z-10 bg-blue-50 px-4 py-3 text-sm text-gray-900 text-left" style={{ minWidth: '300px' }}>{producto.descripcion_producto}</td>
                    <td className="bg-blue-50 px-4 py-3 text-sm text-gray-600 text-center">{Math.round(producto.cantidad_bultos)}</td>
                    <td className="bg-purple-50 px-4 py-3 text-sm text-purple-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{(producto.prom_ventas_5dias_unid / producto.cantidad_bultos).toFixed(1)}</span>
                        <span className="text-xs text-purple-500">({producto.prom_ventas_5dias_unid.toFixed(1)} unid)</span>
                      </div>
                    </td>
                    <td className="bg-purple-50 px-4 py-3 text-sm text-purple-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{(producto.prom_ventas_20dias_unid / producto.cantidad_bultos).toFixed(1)}</span>
                        <span className="text-xs text-purple-500">({producto.prom_ventas_20dias_unid.toFixed(1)} unid)</span>
                      </div>
                    </td>
                    <td className="bg-purple-50 px-4 py-3 text-sm text-purple-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{(producto.prom_mismo_dia_unid / producto.cantidad_bultos).toFixed(1)}</span>
                        <span className="text-xs text-purple-500">({producto.prom_mismo_dia_unid.toFixed(1)} unid)</span>
                      </div>
                    </td>
                    <td className="bg-purple-50 px-4 py-3 text-sm text-purple-700 text-center">
                      {forecastData[producto.codigo_producto] ? (
                        <button
                          onClick={() => handleForecastClick(producto)}
                          className="flex flex-col items-center w-full hover:bg-purple-100 rounded px-2 py-1 transition-colors group cursor-pointer"
                        >
                          <span className="font-medium group-hover:text-purple-900">
                            {(forecastData[producto.codigo_producto] / producto.cantidad_bultos).toFixed(1)}
                          </span>
                          <span className="text-xs text-purple-500 group-hover:text-purple-700">
                            ({forecastData[producto.codigo_producto].toFixed(1)} unid)
                          </span>
                          <span className="text-xs text-purple-400 group-hover:text-purple-600 mt-1">
                            📅 Ver detalle
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-sm text-gray-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{Math.round(producto.stock_tienda / producto.cantidad_bultos).toLocaleString('es-VE')}</span>
                        <span className="text-xs text-gray-500">({Math.round(producto.stock_tienda).toLocaleString('es-VE')} unid)</span>
                      </div>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-sm text-amber-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{Math.round(producto.stock_en_transito / producto.cantidad_bultos).toLocaleString('es-VE')}</span>
                        <span className="text-xs text-amber-500">({Math.round(producto.stock_en_transito).toLocaleString('es-VE')} unid)</span>
                      </div>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-sm text-blue-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{Math.round((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos).toLocaleString('es-VE')}</span>
                        <span className="text-xs text-blue-500">({Math.round(producto.stock_tienda + producto.stock_en_transito).toLocaleString('es-VE')} unid)</span>
                      </div>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-sm text-indigo-700 text-center">
                      <span className="font-medium">
                        {producto.prom_ventas_5dias_unid > 0
                          ? ((producto.stock_tienda + producto.stock_en_transito) / producto.prom_ventas_5dias_unid).toFixed(1)
                          : '∞'
                        } días
                      </span>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-sm text-green-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{Math.round(producto.stock_cedi_origen / producto.cantidad_bultos).toLocaleString('es-VE')}</span>
                        <span className="text-xs text-green-500">({Math.round(producto.stock_cedi_origen).toLocaleString('es-VE')} unid)</span>
                      </div>
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-sm text-orange-700 text-center">
                      <span className="font-medium">
                        {(() => {
                          const ventaDiariaBultos = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;
                          if (ventaDiariaBultos >= 20) return 'A';
                          if (ventaDiariaBultos >= 5) return 'AB';
                          if (ventaDiariaBultos >= 0.45) return 'B';
                          if (ventaDiariaBultos >= 0.20) return 'BC';
                          if (ventaDiariaBultos >= 0.001) return 'C';
                          return '-';
                        })()}
                      </span>
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-sm text-orange-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {stockParams && producto.prom_ventas_5dias_unid > 0
                            ? (calcularStockMinimo(producto) / (producto.prom_ventas_5dias_unid / producto.cantidad_bultos)).toFixed(1)
                            : '-'
                          } días
                        </span>
                        <span className="text-xs text-orange-500">
                          ({stockParams ? Math.round(calcularStockMinimo(producto)).toLocaleString('es-VE') : '-'} unid)
                        </span>
                      </div>
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-sm text-orange-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {stockParams && producto.prom_ventas_5dias_unid > 0
                            ? (calcularPuntoReorden(producto) / (producto.prom_ventas_5dias_unid / producto.cantidad_bultos)).toFixed(1)
                            : '-'
                          } días
                        </span>
                        <span className="text-xs text-orange-500">
                          ({stockParams ? Math.round(calcularPuntoReorden(producto)).toLocaleString('es-VE') : '-'} unid)
                        </span>
                      </div>
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-sm text-orange-700 text-center">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {stockParams && producto.prom_ventas_5dias_unid > 0
                            ? (calcularStockSeguridad(producto) / (producto.prom_ventas_5dias_unid / producto.cantidad_bultos)).toFixed(1)
                            : '-'
                          } días
                        </span>
                        <span className="text-xs text-orange-500">
                          ({stockParams ? Math.round(calcularStockSeguridad(producto)).toLocaleString('es-VE') : '-'} unid)
                        </span>
                      </div>
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-sm text-orange-700 text-center">
                      <span className="font-medium">-</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-orange-600 text-center">{producto.cantidad_ajustada_bultos}</td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        value={producto.cantidad_pedida_bultos || 0}
                        onChange={(e) => handleCantidadChange(producto.codigo_producto, e.target.value)}
                        disabled={!producto.incluido}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="text"
                        value={producto.razon_pedido || ''}
                        onChange={(e) => handleNotasChange(producto.codigo_producto, e.target.value)}
                        placeholder="Agregar notas..."
                        disabled={!producto.incluido}
                        className="w-40 px-2 py-1 border border-gray-300 rounded text-xs text-left disabled:bg-gray-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Botones */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Atrás
        </button>
        <button
          onClick={onNext}
          disabled={productosIncluidos.length === 0}
          className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>

      {/* Modal de Forecast Detallado */}
      {selectedProductoForecast && (
        <ForecastDetailModal
          isOpen={forecastModalOpen}
          onClose={() => setForecastModalOpen(false)}
          codigoProducto={selectedProductoForecast.codigo_producto}
          descripcionProducto={selectedProductoForecast.descripcion_producto}
          forecasts={forecastsDiarios}
          cantidadBultos={selectedProductoForecast.cantidad_bultos}
        />
      )}
    </div>
  );
}
