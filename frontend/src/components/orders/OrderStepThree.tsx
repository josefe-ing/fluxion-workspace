import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import type { OrderData } from './OrderWizard';
import { formatNumber, formatInteger } from '../../utils/formatNumber';

interface Props {
  orderData: OrderData;
  onBack: () => void;
}

export default function OrderStepThree({ orderData, onBack }: Props) {
  const navigate = useNavigate();
  const [observaciones, setObservaciones] = useState(orderData.observaciones);
  const [loading, setLoading] = useState(false);

  const productosIncluidos = orderData.productos.filter(p => p.incluido);
  const totalBultos = productosIncluidos.reduce((sum, p) => sum + (p.cantidad_pedida_bultos || 0), 0);
  const totalUnidades = productosIncluidos.reduce((sum, p) => sum + ((p.cantidad_pedida_bultos || 0) * p.cantidad_bultos), 0);

  const handleSubmit = async (enviar: boolean = false) => {
    setLoading(true);
    try {
      // Preparar datos para enviar
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

      // Llamar API para guardar
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
      {/* Resumen del pedido */}
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
            <div className="text-xs text-blue-600 mb-1">Productos</div>
            <div className="text-2xl font-bold text-blue-900">{productosIncluidos.length}</div>
          </div>
          <div className="bg-green-50 rounded-md p-4">
            <div className="text-xs text-green-600 mb-1">Total Bultos</div>
            <div className="text-2xl font-bold text-green-900">{formatNumber(totalBultos, 2)}</div>
          </div>
          <div className="bg-purple-50 rounded-md p-4">
            <div className="text-xs text-purple-600 mb-1">Total Unidades</div>
            <div className="text-2xl font-bold text-purple-900">{formatInteger(Math.round(totalUnidades))}</div>
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

      {/* Lista de productos resumida */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Productos del Pedido</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cant. Bultos</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unidades</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Razón</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productosIncluidos.map((producto, index) => (
                <tr key={`${producto.codigo_producto}-${index}`}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{producto.codigo_producto}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{producto.descripcion_producto}</td>
                  <td className="px-6 py-3 text-sm text-right font-semibold text-gray-900">
                    {formatNumber(producto.cantidad_pedida_bultos, 2)}
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">
                    {formatInteger(Math.round((producto.cantidad_pedida_bultos || 0) * producto.cantidad_bultos))}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500">{producto.razon_pedido}</td>
                </tr>
              ))}
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
