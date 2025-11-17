import { useState } from 'react';
import { CheckCircle, AlertCircle, Package, TrendingUp } from 'lucide-react';
import MatrizABCXYZBadge from '../../shared/MatrizABCXYZBadge';
import { formatearNumero } from '../../../services/nivelObjetivoService';
import type { DatosOrigenDestino, ProductoSeleccionado } from '../PedidoSugeridoV2Wizard';

interface PasoConfirmacionProps {
  datosOrigenDestino: DatosOrigenDestino;
  productosSeleccionados: ProductoSeleccionado[];
  onAnterior: () => void;
  onPedidoCreado: (pedidoId: string) => void;
}

export default function PasoConfirmacion({
  datosOrigenDestino,
  productosSeleccionados,
  onAnterior,
  onPedidoCreado
}: PasoConfirmacionProps) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cálculos de resumen
  const totalProductos = productosSeleccionados.length;
  const totalUnidades = productosSeleccionados.reduce((sum, p) => sum + p.cantidad_pedida, 0);

  // Agrupar por matriz
  const productosPorMatriz = productosSeleccionados.reduce((acc, p) => {
    if (!acc[p.matriz_abc_xyz]) {
      acc[p.matriz_abc_xyz] = [];
    }
    acc[p.matriz_abc_xyz].push(p);
    return acc;
  }, {} as Record<string, ProductoSeleccionado[]>);

  const handleCrearPedido = async () => {
    try {
      setCreando(true);
      setError(null);

      // TODO: Implementar endpoint real de creación
      const response = await fetch('/api/pedidos-sugeridos/crear-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cedi_origen_id: datosOrigenDestino.cediOrigenId,
          tienda_destino_id: datosOrigenDestino.tiendaDestinoId,
          fecha_pedido: datosOrigenDestino.fechaPedido,
          tipo_pedido: 'sugerido_v2',
          metodo_calculo: 'NIVEL_OBJETIVO_V2',
          productos: productosSeleccionados.map(p => ({
            producto_id: p.producto_id,
            cantidad_pedida: p.cantidad_pedida,
            cantidad_sugerida: p.cantidad_sugerida,
            nivel_objetivo: p.nivel_objetivo,
            stock_actual: p.stock_actual,
            inventario_en_transito: p.inventario_en_transito,
            stock_seguridad: p.stock_seguridad,
            demanda_ciclo: p.demanda_ciclo,
            matriz_abc_xyz: p.matriz_abc_xyz,
            prioridad: p.prioridad
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Error al crear el pedido');
      }

      const data = await response.json();
      onPedidoCreado(data.pedido_id || 'nuevo_pedido');
    } catch (err) {
      console.error('Error creando pedido:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al crear el pedido');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Confirmar Pedido Sugerido
          </h3>
          <p className="text-gray-600">
            Revisa los detalles antes de crear el pedido.
          </p>
        </div>

        {/* Información del Pedido */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-200 rounded-lg p-6 mb-6">
          <h4 className="font-semibold text-indigo-900 mb-4">Información del Pedido</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-indigo-700">CEDI Origen</p>
              <p className="text-lg font-medium text-indigo-900">{datosOrigenDestino.cediOrigenNombre}</p>
            </div>
            <div>
              <p className="text-sm text-indigo-700">Tienda Destino</p>
              <p className="text-lg font-medium text-indigo-900">{datosOrigenDestino.tiendaDestinoNombre}</p>
            </div>
            <div>
              <p className="text-sm text-indigo-700">Fecha del Pedido</p>
              <p className="text-lg font-medium text-indigo-900">
                {new Date(datosOrigenDestino.fechaPedido).toLocaleDateString('es-VE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-indigo-700">Método de Cálculo</p>
              <p className="text-lg font-medium text-indigo-900">Nivel Objetivo v2.0 (ABC-XYZ)</p>
            </div>
          </div>
        </div>

        {/* Resumen Numérico */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-6 w-6 text-blue-600" />
              <p className="text-sm text-gray-600">Total Productos</p>
            </div>
            <p className="text-3xl font-bold text-blue-700">{totalProductos}</p>
          </div>

          <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-6 w-6 text-green-600" />
              <p className="text-sm text-gray-600">Total Unidades</p>
            </div>
            <p className="text-3xl font-bold text-green-700">{formatearNumero(totalUnidades)}</p>
          </div>

          <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="h-6 w-6 text-indigo-600" />
              <p className="text-sm text-gray-600">Matrices Incluidas</p>
            </div>
            <p className="text-3xl font-bold text-indigo-700">{Object.keys(productosPorMatriz).length}</p>
          </div>
        </div>

        {/* Resumen por Matriz */}
        <div className="bg-white border-2 border-gray-200 rounded-lg p-6 mb-6">
          <h4 className="font-semibold text-gray-900 mb-4">Distribución por Clasificación ABC-XYZ</h4>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(productosPorMatriz)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([matriz, productos]) => {
                const totalUnidadesMatriz = productos.reduce((sum, p) => sum + p.cantidad_pedida, 0);
                return (
                  <div key={matriz} className="border border-gray-200 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <MatrizABCXYZBadge matriz={matriz} size="sm" mostrarTooltip={false} />
                      <span className="text-xs text-gray-600">{productos.length} items</span>
                    </div>
                    <p className="text-lg font-bold text-gray-800">{formatearNumero(totalUnidadesMatriz)}</p>
                    <p className="text-xs text-gray-500">unidades</p>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Tabla de Productos */}
        <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden mb-6">
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900">Productos Seleccionados ({totalProductos})</h4>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matriz</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Nivel Obj.</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sugerido</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">A Pedir</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prior.</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productosSeleccionados
                  .sort((a, b) => a.prioridad - b.prioridad)
                  .map((producto) => {
                    const ajustado = producto.cantidad_pedida !== producto.cantidad_sugerida;
                    return (
                      <tr key={producto.producto_id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-mono text-gray-900">{producto.producto_id}</td>
                        <td className="px-6 py-3 text-sm text-gray-900">{producto.nombre_producto}</td>
                        <td className="px-6 py-3">
                          <MatrizABCXYZBadge matriz={producto.matriz_abc_xyz} size="sm" mostrarTooltip={false} />
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-indigo-700 font-medium">
                          {formatearNumero(producto.nivel_objetivo)}
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-gray-600">
                          {formatearNumero(producto.cantidad_sugerida)}
                        </td>
                        <td className={`px-6 py-3 text-sm text-right font-bold ${ajustado ? 'text-orange-700' : 'text-green-700'}`}>
                          {formatearNumero(producto.cantidad_pedida)}
                          {ajustado && <span className="ml-1 text-xs">(Ajustado)</span>}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
                            {producto.prioridad}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nota Informativa */}
        <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Acerca de este pedido:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Utiliza el método de <strong>Nivel Objetivo v2.0</strong> basado en clasificación ABC-XYZ</li>
                <li>Las cantidades se calcularon usando datos de las últimas <strong>8 semanas</strong></li>
                <li>Incluye <strong>stock de seguridad</strong> según el nivel de servicio de cada matriz</li>
                <li>El pedido será guardado en estado <strong>Borrador</strong> y puede ser revisado antes de enviarlo a aprobación</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-medium">❌ {error}</p>
          </div>
        )}

        {/* Botones */}
        <div className="flex justify-between items-center">
          <button
            onClick={onAnterior}
            disabled={creando}
            className="px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
          >
            ← Anterior
          </button>

          <button
            onClick={handleCrearPedido}
            disabled={creando}
            className={`
              px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
              ${creando
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
              }
            `}
          >
            {creando ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Creando Pedido...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                Crear Pedido
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
