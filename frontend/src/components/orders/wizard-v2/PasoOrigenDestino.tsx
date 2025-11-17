import { useState, useEffect } from 'react';
import { Building2, Store } from 'lucide-react';
import type { DatosOrigenDestino } from '../PedidoSugeridoV2Wizard';
import { getUbicacionesVisiblesPedidos, type Ubicacion } from '../../../services/ubicacionesService';

interface PasoOrigenDestinoProps {
  onSiguiente: (datos: DatosOrigenDestino) => void;
  onCancelar: () => void;
}

export default function PasoOrigenDestino({ onSiguiente, onCancelar }: PasoOrigenDestinoProps) {
  const [cedis, setCedis] = useState<Ubicacion[]>([]);
  const [tiendas, setTiendas] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);

  const [cediSeleccionado, setCediSeleccionado] = useState('');
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState('');
  const [fechaPedido, setFechaPedido] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    cargarUbicaciones();
  }, []);

  const cargarUbicaciones = async () => {
    try {
      // Obtener solo ubicaciones visibles para el módulo de Pedidos Sugeridos
      const data = await getUbicacionesVisiblesPedidos();

      // Separar CEDIs y tiendas
      const cedisList = data.filter((u: Ubicacion) => u.tipo === 'cedi');
      const tiendasList = data.filter((u: Ubicacion) => u.tipo === 'tienda');

      setCedis(cedisList);
      setTiendas(tiendasList);

      // Seleccionar CEDI por defecto si solo hay uno
      if (cedisList.length === 1) {
        setCediSeleccionado(cedisList[0].id);
      }
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSiguiente = () => {
    if (!cediSeleccionado || !tiendaSeleccionada) {
      alert('Por favor selecciona un CEDI de origen y una tienda de destino');
      return;
    }

    const cedi = cedis.find(c => c.id === cediSeleccionado);
    const tienda = tiendas.find(t => t.id === tiendaSeleccionada);

    if (!cedi || !tienda) {
      alert('Error al obtener datos de ubicaciones');
      return;
    }

    onSiguiente({
      cediOrigenId: cedi.id,
      cediOrigenNombre: cedi.nombre,
      tiendaDestinoId: tienda.id,
      tiendaDestinoNombre: tienda.nombre,
      fechaPedido
    });
  };

  const puedeAvanzar = cediSeleccionado && tiendaSeleccionada && fechaPedido;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando ubicaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Seleccionar Origen y Destino
          </h3>
          <p className="text-gray-600">
            Selecciona el CEDI de origen y la tienda de destino para el pedido sugerido.
          </p>
        </div>

        <div className="space-y-6">
          {/* CEDI Origen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="inline h-4 w-4 mr-1" />
              CEDI Origen
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={cediSeleccionado}
              onChange={(e) => setCediSeleccionado(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            >
              <option value="">Seleccionar CEDI...</option>
              {cedis.map((cedi) => (
                <option key={cedi.id} value={cedi.id}>
                  {cedi.nombre} {cedi.ciudad && `- ${cedi.ciudad}`}
                </option>
              ))}
            </select>
            {cedis.length === 0 && (
              <p className="mt-2 text-sm text-red-600">
                ⚠️ No hay CEDIs configurados en el sistema
              </p>
            )}
          </div>

          {/* Tienda Destino */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Store className="inline h-4 w-4 mr-1" />
              Tienda Destino
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={tiendaSeleccionada}
              onChange={(e) => setTiendaSeleccionada(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            >
              <option value="">Seleccionar Tienda...</option>
              {tiendas.map((tienda) => (
                <option key={tienda.id} value={tienda.id}>
                  {tienda.nombre} {tienda.ciudad && `- ${tienda.ciudad}`}
                </option>
              ))}
            </select>
            {tiendas.length === 0 && (
              <p className="mt-2 text-sm text-red-600">
                ⚠️ No hay tiendas configuradas en el sistema
              </p>
            )}
          </div>

          {/* Fecha del Pedido */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha del Pedido
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="date"
              value={fechaPedido}
              onChange={(e) => setFechaPedido(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            />
          </div>

          {/* Preview Resumen */}
          {cediSeleccionado && tiendaSeleccionada && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
              <p className="text-sm font-medium text-indigo-900 mb-2">Resumen:</p>
              <div className="space-y-1 text-sm text-indigo-800">
                <p>
                  <strong>Desde:</strong> {cedis.find(c => c.id === cediSeleccionado)?.nombre}
                </p>
                <p>
                  <strong>Hacia:</strong> {tiendas.find(t => t.id === tiendaSeleccionada)?.nombre}
                </p>
                <p>
                  <strong>Fecha:</strong> {new Date(fechaPedido).toLocaleDateString('es-VE', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="mt-8 flex justify-between items-center">
          <button
            onClick={onCancelar}
            className="px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancelar
          </button>

          <button
            onClick={handleSiguiente}
            disabled={!puedeAvanzar}
            className={`
              px-6 py-2.5 rounded-lg font-medium transition-colors
              ${puedeAvanzar
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
