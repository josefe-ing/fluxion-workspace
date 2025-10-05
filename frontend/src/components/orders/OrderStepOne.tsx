import { useState, useEffect } from 'react';
import http from '../../services/http';
import type { OrderData } from './OrderWizard';

interface Ubicacion {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
}

interface Props {
  orderData: OrderData;
  updateOrderData: (data: Partial<OrderData>) => void;
  onNext: () => void;
  onCancel: () => void;
}

export default function OrderStepOne({ orderData, updateOrderData, onNext, onCancel }: Props) {
  const [cedis, setCedis] = useState<Ubicacion[]>([]);
  const [tiendas, setTiendas] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUbicaciones();
  }, []);

  const loadUbicaciones = async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/ubicaciones');
      const ubicaciones = response.data;

      // Separar CEDIs y Tiendas
      const cedisList = ubicaciones.filter((u: Ubicacion) => u.tipo === 'cedi');
      const tiendasList = ubicaciones.filter((u: Ubicacion) => u.tipo === 'tienda');

      setCedis(cedisList);
      setTiendas(tiendasList);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCediChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cedi = cedis.find(c => c.id === e.target.value);
    updateOrderData({
      cedi_origen: e.target.value,
      cedi_origen_nombre: cedi?.nombre || '',
    });
  };

  const handleTiendaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tienda = tiendas.find(t => t.id === e.target.value);
    updateOrderData({
      tienda_destino: e.target.value,
      tienda_destino_nombre: tienda?.nombre || '',
    });
  };

  const canProceed = orderData.cedi_origen && orderData.tienda_destino;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="space-y-6">
          {/* Título */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Seleccionar Origen y Destino</h2>
            <p className="mt-2 text-sm text-gray-500">
              Selecciona el CEDI de origen y la tienda de destino para el pedido sugerido.
            </p>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="mt-4 text-sm text-gray-500">Cargando ubicaciones...</p>
            </div>
          ) : (
            <>
              {/* CEDI Origen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CEDI Origen <span className="text-red-500">*</span>
                </label>
                <select
                  value={orderData.cedi_origen}
                  onChange={handleCediChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">Seleccionar CEDI...</option>
                  {cedis.map((cedi) => (
                    <option key={cedi.id} value={cedi.id}>
                      {cedi.nombre}
                    </option>
                  ))}
                </select>
                {cedis.length === 0 && (
                  <p className="mt-2 text-sm text-red-600">No se encontraron CEDIs disponibles</p>
                )}
              </div>

              {/* Tienda Destino */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tienda Destino <span className="text-red-500">*</span>
                </label>
                <select
                  value={orderData.tienda_destino}
                  onChange={handleTiendaChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">Seleccionar Tienda...</option>
                  {tiendas.map((tienda) => (
                    <option key={tienda.id} value={tienda.id}>
                      {tienda.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Información de selección */}
              {orderData.cedi_origen && orderData.tienda_destino && (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Resumen de Selección</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Origen:</span> {orderData.cedi_origen_nombre}
                    </p>
                    <p>
                      <span className="font-medium">Destino:</span> {orderData.tienda_destino_nombre}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Botones */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
          >
            Cancelar
          </button>
          <button
            onClick={onNext}
            disabled={!canProceed}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
