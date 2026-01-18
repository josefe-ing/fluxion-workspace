/**
 * Paso 1: Seleccionar Origen y Destinos (Multi-Tienda)
 *
 * Permite seleccionar:
 * - CEDI origen (dropdown)
 * - Múltiples tiendas destino (checkboxes)
 *
 * Las tiendas se cargan dinámicamente según el CEDI seleccionado.
 */

import { useState, useEffect } from 'react';
import type {
  TiendaSeleccionada,
  CediDisponible,
  OrderDataMultiTienda,
} from '../../../types/multitienda';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface Props {
  orderData: OrderDataMultiTienda;
  updateOrderData: (data: Partial<OrderDataMultiTienda>) => void;
  onNext: () => void;
  onCancel: () => void;
}

export default function StepOneMultiSelect({
  orderData,
  updateOrderData,
  onNext,
  onCancel,
}: Props) {
  const [cedis, setCedis] = useState<CediDisponible[]>([]);
  const [tiendas, setTiendas] = useState<TiendaSeleccionada[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTiendas, setLoadingTiendas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar CEDIs al montar
  useEffect(() => {
    cargarCedis();
  }, []);

  // Cargar tiendas cuando cambia el CEDI
  useEffect(() => {
    if (orderData.cedi_origen) {
      cargarTiendasPorCedi(orderData.cedi_origen);
    }
  }, [orderData.cedi_origen]);

  const cargarCedis = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/ubicaciones/cedis`);
      if (!response.ok) throw new Error('Error cargando CEDIs');

      const data = await response.json();
      setCedis(data.cedis || []);

      // Auto-seleccionar primer CEDI si no hay ninguno seleccionado
      if (!orderData.cedi_origen && data.cedis?.length > 0) {
        const primerCedi = data.cedis[0];
        updateOrderData({
          cedi_origen: primerCedi.id,
          cedi_origen_nombre: primerCedi.nombre,
        });
      }
    } catch (err) {
      console.error('Error cargando CEDIs:', err);
      setError('No se pudieron cargar los CEDIs');
    } finally {
      setLoading(false);
    }
  };

  const cargarTiendasPorCedi = async (cediId: string) => {
    try {
      setLoadingTiendas(true);
      const response = await fetch(
        `${API_URL}/api/ubicaciones/tiendas-por-cedi/${cediId}`
      );
      if (!response.ok) throw new Error('Error cargando tiendas');

      const data = await response.json();
      const tiendasConSeleccion: TiendaSeleccionada[] = (data.tiendas || []).map(
        (t: { id: string; nombre: string; codigo_klk?: string; ciudad?: string }) => ({
          id: t.id,
          nombre: t.nombre,
          codigo_klk: t.codigo_klk,
          ciudad: t.ciudad,
          seleccionada: true, // Por defecto todas seleccionadas
        })
      );

      setTiendas(tiendasConSeleccion);
      updateOrderData({ tiendas_seleccionadas: tiendasConSeleccion });
    } catch (err) {
      console.error('Error cargando tiendas:', err);
      setError('No se pudieron cargar las tiendas');
    } finally {
      setLoadingTiendas(false);
    }
  };

  const handleCediChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cediId = e.target.value;
    const cedi = cedis.find((c) => c.id === cediId);

    updateOrderData({
      cedi_origen: cediId,
      cedi_origen_nombre: cedi?.nombre || '',
      tiendas_seleccionadas: [], // Reset tiendas
    });
    setTiendas([]);
  };

  const handleTiendaToggle = (tiendaId: string) => {
    const nuevasTiendas = tiendas.map((t) =>
      t.id === tiendaId ? { ...t, seleccionada: !t.seleccionada } : t
    );
    setTiendas(nuevasTiendas);
    updateOrderData({ tiendas_seleccionadas: nuevasTiendas });
  };

  const handleSeleccionarTodas = () => {
    const nuevasTiendas = tiendas.map((t) => ({ ...t, seleccionada: true }));
    setTiendas(nuevasTiendas);
    updateOrderData({ tiendas_seleccionadas: nuevasTiendas });
  };

  const handleDeseleccionarTodas = () => {
    const nuevasTiendas = tiendas.map((t) => ({ ...t, seleccionada: false }));
    setTiendas(nuevasTiendas);
    updateOrderData({ tiendas_seleccionadas: nuevasTiendas });
  };

  const tiendasSeleccionadas = tiendas.filter((t) => t.seleccionada);
  const canProceed = orderData.cedi_origen && tiendasSeleccionadas.length > 0;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <span className="ml-3 text-gray-600">Cargando...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg border border-red-200 p-8">
          <div className="text-center text-red-600">
            <p>{error}</p>
            <button
              onClick={cargarCedis}
              className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="space-y-6">
          {/* Título */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Seleccionar Origen y Destinos
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Seleccione el CEDI de origen y las tiendas destino para el pedido.
            </p>
          </div>

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
                  {cedi.nombre} ({cedi.region})
                </option>
              ))}
            </select>
          </div>

          {/* Tiendas Destino */}
          {orderData.cedi_origen && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Tiendas Destino <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSeleccionarTodas}
                    className="text-xs px-3 py-1 text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
                  >
                    Seleccionar todas
                  </button>
                  <button
                    type="button"
                    onClick={handleDeseleccionarTodas}
                    className="text-xs px-3 py-1 text-gray-600 hover:bg-gray-50 rounded border border-gray-200"
                  >
                    Deseleccionar todas
                  </button>
                </div>
              </div>

              {loadingTiendas ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                  <span className="ml-3 text-gray-600">Cargando tiendas...</span>
                </div>
              ) : tiendas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay tiendas disponibles para este CEDI
                </div>
              ) : (
                <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {tiendas.map((tienda) => (
                    <label
                      key={tienda.id}
                      className={`flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                        tienda.seleccionada ? 'bg-blue-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={tienda.seleccionada}
                        onChange={() => handleTiendaToggle(tienda.id)}
                        className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded"
                      />
                      <div className="ml-3 flex-1">
                        <span className="font-medium text-gray-900">
                          {tienda.nombre}
                        </span>
                        {tienda.ciudad && (
                          <span className="ml-2 text-sm text-gray-500">
                            ({tienda.ciudad})
                          </span>
                        )}
                      </div>
                      {tienda.seleccionada && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Incluida
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resumen de selección */}
          {tiendasSeleccionadas.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Resumen de Selección
              </h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Origen:</span>{' '}
                  {orderData.cedi_origen_nombre || orderData.cedi_origen}
                </p>
                <p>
                  <span className="font-medium">Destinos:</span>{' '}
                  {tiendasSeleccionadas.length} tienda
                  {tiendasSeleccionadas.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tiendasSeleccionadas.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700"
                    >
                      {t.nombre}
                    </span>
                  ))}
                </div>
              </div>

              {/* Aviso multi-tienda */}
              {tiendasSeleccionadas.length > 1 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-start">
                    <svg
                      className="h-5 w-5 text-blue-400 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="ml-2 text-sm text-blue-700">
                      <span className="font-medium">Modo Multi-Tienda:</span> Si
                      hay productos con stock insuficiente para todas las
                      tiendas, se mostrará un paso adicional para resolver la
                      distribución de forma justa.
                    </p>
                  </div>
                </div>
              )}
            </div>
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
            Siguiente ({tiendasSeleccionadas.length} tienda
            {tiendasSeleccionadas.length !== 1 ? 's' : ''}) →
          </button>
        </div>
      </div>
    </div>
  );
}
