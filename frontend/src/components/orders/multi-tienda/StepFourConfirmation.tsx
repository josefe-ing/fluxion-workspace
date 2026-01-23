/**
 * Paso 4: Confirmación Consolidada
 *
 * Muestra resumen final de todos los pedidos y permite:
 * - Ver cards por tienda con totales
 * - Agregar observaciones globales
 * - Confirmar y crear todos los pedidos en lote
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import type {
  OrderDataMultiTienda,
  CalcularMultiTiendaResponse,
  GuardarMultiTiendaRequest,
  GuardarMultiTiendaResponse,
  PedidoTiendaParaGuardar,
  PedidoTienda,
} from '../../../types/multitienda';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface Props {
  orderData: OrderDataMultiTienda;
  calculationResult: CalcularMultiTiendaResponse;
  onBack: () => void;
}

export default function StepFourConfirmation({
  orderData,
  calculationResult: _calculationResult,
  onBack,
}: Props) {
  const navigate = useNavigate();
  const [observaciones, setObservaciones] = useState(orderData.observaciones_globales || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<GuardarMultiTiendaResponse | null>(null);

  // Usar orderData.pedidos_por_tienda que contiene los productos filtrados del paso anterior
  const pedidos = orderData.pedidos_por_tienda || [];

  // Formatear número
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('es-VE').format(Math.round(num));
  };

  // Exportar pedido de una tienda a Excel
  const exportarExcelTienda = (pedido: PedidoTienda) => {
    if (pedido.productos.length === 0) {
      alert('No hay productos para exportar');
      return;
    }

    // Preparar datos para Excel
    const datosExcel = pedido.productos.map((p, index) => {
      const pedidoUnidades = p.cantidad_sugerida_bultos * p.unidades_por_bulto;

      return {
        '#': index + 1,
        'Codigo': p.codigo_producto,
        'Descripción': p.descripcion_producto,
        'Categoría': p.categoria || '',
        'ABC': p.clasificacion_abc || '',
        'Cuadrante': p.cuadrante || 'NO ESPECIFICADO',
        'U/B': p.unidades_por_bulto,
        'P75 Unid/día': Number(p.prom_p75_unid.toFixed(2)),
        'Stock Tienda': p.stock_tienda,
        'Días Stock': Number(p.dias_stock.toFixed(1)),
        'Stock CEDI': p.stock_cedi_origen,
        'Pedido Bultos': p.cantidad_sugerida_bultos,
        'Pedido Unidades': pedidoUnidades,
        'Ajustado DPD+U': p.ajustado_por_dpdu ? 'Sí' : 'No',
      };
    });

    // Crear libro de Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosExcel);

    // Ajustar anchos de columnas
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 12 },  // Codigo
      { wch: 45 },  // Descripción
      { wch: 20 },  // Categoría
      { wch: 5 },   // ABC
      { wch: 15 },  // Cuadrante
      { wch: 6 },   // U/B
      { wch: 12 },  // P75
      { wch: 12 },  // Stock Tienda
      { wch: 10 },  // Días Stock
      { wch: 12 },  // Stock CEDI
      { wch: 13 },  // Pedido Bultos
      { wch: 15 },  // Pedido Unidades
      { wch: 12 },  // Ajustado DPD+U
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

    // Generar nombre de archivo con fecha y tienda
    const fecha = new Date().toISOString().split('T')[0];
    const tiendaNombre = pedido.tienda_nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'pedido';
    const nombreArchivo = `Pedido_${tiendaNombre}_${fecha}.xlsx`;

    // Descargar archivo
    XLSX.writeFile(wb, nombreArchivo);
  };

  // Guardar todos los pedidos
  const handleGuardarPedidos = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      // Preparar datos para el endpoint
      // Ensure all required fields have valid defaults to prevent 422 validation errors
      const pedidosParaGuardar: PedidoTiendaParaGuardar[] = pedidos.map((pedido) => ({
        tienda_destino_id: pedido.tienda_id,
        tienda_destino_nombre: pedido.tienda_nombre,
        productos: pedido.productos.map((p) => ({
          codigo_producto: p.codigo_producto,
          descripcion_producto: p.descripcion_producto,
          categoria: p.categoria || undefined,
          clasificacion_abc: p.clasificacion_abc || undefined,
          unidades_por_bulto: p.unidades_por_bulto || 1,
          cantidad_pedida_bultos: p.cantidad_sugerida_bultos || 0,
          cantidad_pedida_unidades: p.cantidad_sugerida_unid || 0,
          stock_tienda: p.stock_tienda ?? 0,
          stock_cedi_origen: p.stock_cedi_origen ?? 0,
          prom_p75_unid: p.prom_p75_unid ?? 0,
          ajustado_por_dpdu: p.ajustado_por_dpdu ?? false,
          cantidad_original_bultos: p.cantidad_original_bultos || undefined,
          incluido: true,
        })),
        observaciones: '',
      }));

      const request: GuardarMultiTiendaRequest = {
        cedi_origen_id: orderData.cedi_origen,
        cedi_origen_nombre: orderData.cedi_origen_nombre,
        pedidos: pedidosParaGuardar,
        dias_cobertura: orderData.dias_cobertura,
        fecha_pedido: orderData.fecha_pedido,
        observaciones_globales: observaciones,
      };

      const response = await fetch(`${API_URL}/api/pedidos-multitienda/guardar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Handle FastAPI validation errors (422) which come as array
        let errorMessage = 'Error guardando pedidos';
        if (Array.isArray(errorData.detail)) {
          // Extract meaningful messages from validation errors
          errorMessage = errorData.detail
            .map((err: { msg?: string; loc?: string[] }) => {
              const field = err.loc?.slice(-1)[0] || 'campo';
              return `${field}: ${err.msg || 'inválido'}`;
            })
            .join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        }
        throw new Error(errorMessage);
      }

      const result: GuardarMultiTiendaResponse = await response.json();
      setSaveSuccess(result);
    } catch (err) {
      console.error('Error guardando pedidos:', err);
      setSaveError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  // Descargar Excel del backend con cuadrante
  const descargarExcelBackend = async (pedidoId: string, tiendaNombre: string) => {
    try {
      const response = await fetch(`${API_URL}/api/pedidos-multitienda/${pedidoId}/exportar-excel`);
      if (!response.ok) throw new Error('Error descargando Excel');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().split('T')[0];
      a.download = `Pedido_${tiendaNombre.replace(/[^a-zA-Z0-9]/g, '_')}_${fecha}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error descargando Excel:', error);
      alert('Error al descargar Excel');
    }
  };

  // Ir a lista de pedidos
  const handleVerPedidos = () => {
    navigate('/pedidos-sugeridos');
  };

  // Vista de éxito
  if (saveSuccess) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          {/* Icono de éxito */}
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              ¡Pedidos Creados Exitosamente!
            </h2>
            <p className="mt-2 text-gray-500">{saveSuccess.mensaje}</p>
          </div>

          {/* Resumen de pedidos creados */}
          <div className="mt-8 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Pedidos Creados</h3>
            <div className="space-y-2">
              {saveSuccess.pedidos_creados.map((pedido) => (
                <div
                  key={pedido.pedido_id}
                  className="flex justify-between items-center py-2 px-3 bg-white rounded border border-gray-200"
                >
                  <div>
                    <span className="font-medium text-gray-900">{pedido.tienda_nombre}</span>
                    <span className="ml-2 text-xs text-gray-500">#{pedido.numero_pedido}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {pedido.total_productos} productos | {formatNumber(pedido.total_bultos)} bultos
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        pedido.estado === 'borrador'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {pedido.estado}
                    </span>
                    <button
                      onClick={() => descargarExcelBackend(pedido.pedido_id, pedido.tienda_nombre)}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs flex items-center gap-1"
                      title="Descargar Excel con cuadrante"
                    >
                      📊 Excel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grupo de pedido */}
          <div className="mt-4 text-center text-sm text-gray-500">
            <p>
              ID de Grupo:{' '}
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                {saveSuccess.grupo_pedido_id}
              </span>
            </p>
          </div>

          {/* Botón para ver pedidos */}
          <div className="mt-8 text-center">
            <button
              onClick={handleVerPedidos}
              className="px-8 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
            >
              Ver Pedidos Sugeridos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Confirmar Pedidos</h2>
          <p className="mt-2 text-sm text-gray-500">
            Revise el resumen final antes de crear los pedidos para todas las tiendas.
          </p>
        </div>

        {/* Error */}
        {saveError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error al guardar</h3>
                <p className="mt-1 text-sm text-red-700">{saveError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Info de origen */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">
                CEDI Origen: {orderData.cedi_origen_nombre}
              </h3>
              <p className="text-sm text-gray-500">
                Fecha: {new Date(orderData.fecha_pedido).toLocaleDateString('es-VE')} |
                Cobertura: {orderData.dias_cobertura} días
              </p>
            </div>
          </div>
        </div>

        {/* Cards de tiendas */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Pedidos a Crear ({pedidos.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pedidos.map((pedido) => {
              // Calcular peso total en toneladas
              const pesoTotalKg = pedido.productos.reduce((acc, p) => {
                const unidadesPedido = p.cantidad_sugerida_bultos * p.unidades_por_bulto;
                return acc + (unidadesPedido * (p.peso_kg || 0));
              }, 0);
              const pesoToneladas = pesoTotalKg / 1000;

              return (
                <div
                  key={pedido.tienda_id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  {/* Header con nombre y badge DPD+U */}
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-semibold text-gray-900 text-lg">{pedido.tienda_nombre}</h4>
                    {pedido.productos_ajustados_dpdu > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        {pedido.productos_ajustados_dpdu} DPD+U
                      </span>
                    )}
                  </div>

                  {/* Productos y Bultos lado a lado - prominentes */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-900">
                        {formatNumber(pedido.total_productos)}
                      </div>
                      <div className="text-sm text-gray-600 font-medium">Productos</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-900">
                        {formatNumber(pedido.total_bultos)}
                      </div>
                      <div className="text-sm text-gray-600 font-medium">Bultos</div>
                    </div>
                  </div>

                  {/* Peso total en toneladas */}
                  <div className="mt-3 text-center text-sm text-gray-500">
                    <span className="font-medium">{pesoToneladas.toFixed(2)}</span> toneladas
                  </div>

                  {/* Botón Exportar Excel */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => exportarExcelTienda(pedido)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Exportar Excel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totales consolidados */}
        {(() => {
          // Calcular totales desde los pedidos filtrados
          const totalProductos = pedidos.reduce((acc, p) => acc + p.total_productos, 0);
          const totalBultos = pedidos.reduce((acc, p) => acc + p.total_bultos, 0);
          const totalPesoKg = pedidos.reduce((acc, pedido) => {
            return acc + pedido.productos.reduce((accP, p) => {
              const unidadesPedido = p.cantidad_sugerida_bultos * p.unidades_por_bulto;
              return accP + (unidadesPedido * (p.peso_kg || 0));
            }, 0);
          }, 0);
          const totalToneladas = totalPesoKg / 1000;

          return (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Totales Consolidados</h3>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-blue-900">{pedidos.length}</div>
                  <div className="text-xs text-blue-600">Pedidos</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-blue-900">
                    {formatNumber(totalProductos)}
                  </div>
                  <div className="text-xs text-blue-600">Productos</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-blue-900">
                    {formatNumber(totalBultos)}
                  </div>
                  <div className="text-xs text-blue-600">Bultos</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-blue-900">
                    {totalToneladas.toFixed(1)}
                  </div>
                  <div className="text-xs text-blue-600">Toneladas</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Observaciones */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observaciones Globales (opcional)
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            placeholder="Agregar notas o instrucciones para todos los pedidos..."
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
          />
        </div>

        {/* Aviso */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex">
            <svg className="h-5 w-5 text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Antes de confirmar</h3>
              <div className="mt-1 text-sm text-yellow-700">
                <p>
                  Se crearán {pedidos.length} pedidos independientes en estado <strong>borrador</strong>.
                  Podrá revisarlos y aprobarlos individualmente desde la lista de pedidos sugeridos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de navegación */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={onBack}
          disabled={saving}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
        >
          ← Volver
        </button>
        <button
          onClick={handleGuardarPedidos}
          disabled={saving}
          className="px-8 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Guardando...
            </span>
          ) : (
            `Crear ${pedidos.length} Pedidos`
          )}
        </button>
      </div>
    </div>
  );
}
