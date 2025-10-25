import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import { formatNumber } from '../../utils/formatNumber';

interface Props {
  orderData: OrderData;
  onBack: () => void;
}

// Definir umbrales ABC (mismo que OrderStepTwo)
const ABC_THRESHOLDS = {
  A: 5.0,
  AB: 2.5,
  B: 1.0,
  BC: 0.5,
  C: 0.0
};

export default function OrderStepThree({ orderData, onBack }: Props) {
  const navigate = useNavigate();
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);

  const productosIncluidos = orderData.productos.filter(p => p.incluido);
  const totalBultos = productosIncluidos.reduce((sum, p) => sum + (p.cantidad_pedida_bultos || 0), 0);

  // Función para clasificación ABC
  const getClasificacionABC = (producto: ProductoPedido): string => {
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    if (ventaDiariaBultos >= ABC_THRESHOLDS.A) return 'A';
    if (ventaDiariaBultos >= ABC_THRESHOLDS.AB) return 'AB';
    if (ventaDiariaBultos >= ABC_THRESHOLDS.B) return 'B';
    if (ventaDiariaBultos >= ABC_THRESHOLDS.BC) return 'BC';
    if (ventaDiariaBultos > 0) return 'C';
    return '-';
  };

  const handleSubmit = async (enviar: boolean = false) => {
    setLoading(true);
    try {
      const payload = {
        cedi_origen: orderData.cedi_origen,
        cedi_origen_nombre: orderData.cedi_origen_nombre,
        tienda_destino: orderData.tienda_destino,
        tienda_destino_nombre: orderData.tienda_destino_nombre,
        dias_cobertura: 3,
        productos: orderData.productos,
        observaciones: observaciones
      };

      console.log('Guardando pedido:', payload);
      const response = await http.post('/api/pedidos-sugeridos', payload);
      console.log('Pedido guardado:', response.data);

      const mensaje = enviar
        ? `¡Pedido ${response.data.numero_pedido} enviado exitosamente!`
        : `¡Pedido ${response.data.numero_pedido} guardado como borrador!`;

      alert(mensaje);
      navigate('/pedidos-sugeridos');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error creando pedido:', error);
      const mensaje = error.response?.data?.detail || 'Error al crear el pedido';
      alert(mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header con información del pedido */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Confirmación de Pedido</h2>

        {/* Información origen/destino */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Origen</h3>
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-sm font-medium text-gray-900">{orderData.cedi_origen_nombre}</p>
              <p className="text-xs text-gray-500">CEDI Origen</p>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Destino</h3>
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-sm font-medium text-gray-900">{orderData.tienda_destino_nombre}</p>
              <p className="text-xs text-gray-500">Tienda Destino</p>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-md p-4">
            <div className="text-xs text-blue-600 mb-1">Productos Seleccionados</div>
            <div className="text-2xl font-bold text-blue-900">{productosIncluidos.length}</div>
          </div>
          <div className="bg-green-50 rounded-md p-4">
            <div className="text-xs text-green-600 mb-1">Total Bultos</div>
            <div className="text-2xl font-bold text-green-900">{formatNumber(totalBultos, 2)}</div>
          </div>
          <div className="bg-purple-50 rounded-md p-4">
            <div className="text-xs text-purple-600 mb-1">Total Productos</div>
            <div className="text-2xl font-bold text-purple-900">{orderData.productos.length}</div>
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            placeholder="Agregar notas o instrucciones especiales para el pedido..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabla de productos con todas las columnas */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-xs" style={{ minWidth: '1400px' }}>
            <thead className="bg-gray-100">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '80px' }}>Código</th>
                <th className="bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase" style={{ minWidth: '200px' }}>Descripción</th>
                <th className="bg-yellow-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Pedir</th>
                <th className="bg-gray-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '65px' }}>¿Bulto?</th>
                <th className="bg-blue-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '40px' }}>5D</th>
                <th className="bg-blue-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '40px' }}>20D</th>
                <th className="bg-blue-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Mismo Día</th>
                <th className="bg-purple-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Proyección</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Stock</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Tránsito</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Total</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '45px' }}>Días</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>CEDI</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '40px' }}>ABC</th>
                <th className="bg-red-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>🔥</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '45px' }}>Min</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '70px' }}>Seguridad</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '70px' }}>Pto. Reorden</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Máx</th>
                <th className="bg-yellow-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Sugerido</th>
                <th className="bg-yellow-50 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase" style={{ minWidth: '150px' }}>Notas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productosIncluidos.map((producto, index) => {
                const clasificacion = getClasificacionABC(producto);

                return (
                  <tr key={`${producto.codigo_producto}-${index}`} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1 text-[11px] font-medium text-gray-900">{producto.codigo_producto}</td>
                    <td className="px-2 py-1 text-[11px] text-gray-900">{producto.descripcion_producto}</td>
                    <td className="bg-yellow-50 px-2 py-1 text-center">
                      <span className="text-[11px] font-bold text-gray-900">{formatNumber(producto.cantidad_pedida_bultos, 2)}</span>
                    </td>
                    <td className="bg-gray-50 px-2 py-1 text-[11px] text-gray-700 text-center">{producto.cantidad_bultos}</td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-blue-800 text-center">{formatNumber(producto.prom_ventas_5dias_unid / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-blue-800 text-center font-medium">{formatNumber(producto.prom_ventas_20dias_unid / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-blue-800 text-center">{formatNumber(producto.prom_mismo_dia_unid / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-purple-50 px-2 py-1 text-[11px] text-purple-800 text-center font-medium">-</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-indigo-800 text-center">{formatNumber(producto.stock_tienda / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-700 text-center">{formatNumber(producto.stock_en_transito / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-800 text-center font-medium">{formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-center font-bold">
                      {producto.prom_ventas_20dias_unid > 0
                        ? formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.prom_ventas_20dias_unid, 1)
                        : '∞'
                      }
                    </td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-800 text-center font-medium">{formatNumber(producto.stock_cedi_origen / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-center">
                      <span className={`font-bold ${(() => {
                        if (clasificacion === 'A') return 'text-red-700';
                        if (clasificacion === 'AB') return 'text-orange-700';
                        if (clasificacion === 'B') return 'text-yellow-700';
                        return 'text-gray-600';
                      })()}`}>
                        {clasificacion}
                      </span>
                    </td>
                    <td className="bg-red-50 px-2 py-1 text-[10px] text-center font-bold">-</td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">-</td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">-</td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">-</td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">-</td>
                    <td className="bg-yellow-50 px-2 py-1 text-[11px] text-yellow-800 text-center font-medium">{formatNumber(producto.cantidad_sugerida_bultos, 2)}</td>
                    <td className="bg-yellow-50 px-2 py-1 text-[11px] text-gray-700">{producto.razon_pedido}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ← Atrás
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="px-6 py-2 border border-gray-900 rounded-md text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar Borrador'}
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar Pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
