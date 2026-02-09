import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';
import { formatInteger, formatNumber } from '../../utils/formatNumber';

// ============================================================================
// INTERFACES
// ============================================================================

interface EvidenciaVenta {
  numero_factura: string;
  fecha_venta: string;
  hora: string;
  cantidad_vendida: number;
  stock_al_momento: number | null;
}

interface AnomaliaStockItem {
  producto_id: string;
  codigo_producto: string;
  descripcion_producto: string;
  categoria: string | null;
  stock_actual: number;
  tipo_anomalia: 'negativo';
  prioridad: number;
  total_ventas_evidencia: number;
  suma_cantidad_vendida: number;
  evidencias: EvidenciaVenta[];
  // Histórico del día
  stock_max_hoy: number | null;
  stock_min_hoy: number | null;
  snapshots_hoy: number | null;
}

interface AnomaliaStockResponse {
  ubicacion_id: string;
  ubicacion_nombre: string;
  total_anomalias: number;
  items: AnomaliaStockItem[];
}

interface AjusteResultItem {
  producto_id: string;
  stock_anterior: number;
  conteo_fisico: number;
  diferencia: number;
  ajuste_aplicado: boolean;
  mensaje: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ubicacionId: string;
  ubicacionNombre: string;
  almacenCodigo?: string | null;
  onAjustesAplicados?: () => void;
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function CentroComandoCorreccionModal({
  isOpen,
  onClose,
  ubicacionId,
  ubicacionNombre,
  almacenCodigo,
  onAjustesAplicados
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anomalias, setAnomalias] = useState<AnomaliaStockResponse | null>(null);

  // Estado para los inputs de conteo físico
  const [ajustes, setAjustes] = useState<Record<string, number | ''>>({});

  // Resultados después de guardar
  const [resultados, setResultados] = useState<AjusteResultItem[] | null>(null);
  const [showResultados, setShowResultados] = useState(false);

  // Modal de evidencia
  const [showEvidenciaModal, setShowEvidenciaModal] = useState(false);
  const [selectedItemEvidencia, setSelectedItemEvidencia] = useState<AnomaliaStockItem | null>(null);

  // ============================================================================
  // EFECTOS
  // ============================================================================

  const loadAnomalias = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {};
      if (almacenCodigo) {
        params.almacen_codigo = almacenCodigo;
      }

      const response = await http.get(`/api/stock/anomalias/${ubicacionId}`, { params });
      setAnomalias(response.data);

      // Inicializar ajustes vacíos
      const initialAjustes: Record<string, number | ''> = {};
      response.data.items.forEach((item: AnomaliaStockItem) => {
        initialAjustes[item.producto_id] = '';
      });
      setAjustes(initialAjustes);

    } catch (err: unknown) {
      console.error('Error cargando anomalías:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error cargando datos: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [almacenCodigo, ubicacionId]);

  useEffect(() => {
    if (isOpen && ubicacionId) {
      loadAnomalias();
    }
  }, [isOpen, ubicacionId, almacenCodigo, loadAnomalias]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAjustes({});
      setResultados(null);
      setShowResultados(false);
      setError(null);
      setShowEvidenciaModal(false);
      setSelectedItemEvidencia(null);
    }
  }, [isOpen]);

  // ============================================================================
  // FUNCIONES
  // ============================================================================

  const handleConteoChange = (productoId: string, value: string) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setAjustes(prev => ({
      ...prev,
      [productoId]: numValue
    }));
  };

  const handleConfirmarAjustes = async () => {
    const ajustesParaEnviar = Object.entries(ajustes)
      .filter(([_, value]) => value !== '' && value !== null)
      .map(([producto_id, conteo_fisico]) => ({
        producto_id,
        conteo_fisico: conteo_fisico as number
      }));

    if (ajustesParaEnviar.length === 0) {
      setError('Debe ingresar al menos un conteo físico para aplicar ajustes');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await http.post('/api/stock/ajustes', {
        ubicacion_id: ubicacionId,
        almacen_codigo: almacenCodigo || null,
        ajustes: ajustesParaEnviar,
        observaciones: 'Ajuste desde Centro de Comando de Corrección'
      });

      setResultados(response.data.resultados);
      setShowResultados(true);

      if (onAjustesAplicados) {
        onAjustesAplicados();
      }

    } catch (err: unknown) {
      console.error('Error aplicando ajustes:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error aplicando ajustes: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCerrar = () => {
    if (showResultados && onAjustesAplicados) {
      onAjustesAplicados();
    }
    onClose();
  };

  const handleVerEvidencia = (item: AnomaliaStockItem) => {
    setSelectedItemEvidencia(item);
    setShowEvidenciaModal(true);
  };

  // Lista de items (ya no hay filtro, solo stock negativo)
  const items = anomalias?.items || [];

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-900 rounded-t-lg">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center">
                <svg className="h-6 w-6 mr-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Centro de Comando de Corrección
              </h2>
              <p className="text-sm text-gray-300 mt-1">
                {ubicacionNombre} {almacenCodigo ? `- ${almacenCodigo}` : ''}
              </p>
            </div>
            <button
              onClick={handleCerrar}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
                <p className="ml-4 text-gray-600">Analizando anomalías de inventario...</p>
              </div>
            ) : error && !anomalias ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            ) : showResultados && resultados ? (
              // Vista de resultados después de guardar
              <div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-green-800 flex items-center">
                    <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Ajustes Procesados
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Se procesaron {resultados.length} productos. {resultados.filter(r => r.ajuste_aplicado).length} ajustes aplicados exitosamente.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock Anterior</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Conteo Físico</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Diferencia</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {resultados.map((resultado) => (
                        <tr key={resultado.producto_id} className={resultado.ajuste_aplicado ? 'bg-green-50' : 'bg-gray-50'}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {resultado.producto_id}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-500">
                            {formatInteger(resultado.stock_anterior)}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-900 font-medium">
                            {formatInteger(resultado.conteo_fisico)}
                          </td>
                          <td className="px-4 py-3 text-sm text-center font-medium">
                            <span className={resultado.diferencia > 0 ? 'text-green-600' : resultado.diferencia < 0 ? 'text-red-600' : 'text-gray-500'}>
                              {resultado.diferencia > 0 ? '+' : ''}{formatInteger(resultado.diferencia)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {resultado.ajuste_aplicado ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Aplicado
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                {resultado.mensaje || 'Sin cambios'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleCerrar}
                    className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : anomalias && anomalias.items.length === 0 ? (
              // Sin anomalías
              <div className="text-center py-12">
                <svg className="h-16 w-16 mx-auto text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Sin Stock Negativo</h3>
                <p className="text-gray-500 mt-2">
                  No se encontraron productos con stock negativo en esta ubicación.
                </p>
              </div>
            ) : anomalias ? (
              // Vista de anomalías para corregir
              <div>
                {/* Resumen */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-600">Productos con Stock Negativo</p>
                      <p className="text-3xl font-bold text-red-700">{anomalias.total_anomalias}</p>
                    </div>
                    <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                      <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Instrucciones */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800">
                    <strong>Misiones de Conteo:</strong> Haga clic en "Ver Facturas" para ver la evidencia de ventas.
                    Ingrese el conteo físico real y el sistema calculará el ajuste.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700 text-sm">
                    {error}
                  </div>
                )}

                {/* Tabla de anomalías */}
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Stock Actual
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Evidencia
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Conteo Físico
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {items.map((item) => (
                        <tr key={item.producto_id} className="hover:bg-gray-50">
                          {/* Producto */}
                          <td className="px-4 py-4">
                            <div className="flex items-start">
                              <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-lg flex items-center justify-center">
                                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium text-gray-900">{item.codigo_producto}</p>
                                <p className="text-sm text-gray-500 line-clamp-2">{item.descripcion_producto}</p>
                                {item.categoria && (
                                  <p className="text-xs text-gray-400 mt-1">{item.categoria}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Stock Actual */}
                          <td className="px-4 py-4 text-center">
                            <span className="text-2xl font-bold text-red-600">
                              {formatInteger(item.stock_actual)}
                            </span>
                          </td>

                          {/* Ventas (últimos 7 días) - Clickeable */}
                          <td className="px-4 py-4 text-center">
                            {item.total_ventas_evidencia > 0 ? (
                              <button
                                onClick={() => handleVerEvidencia(item)}
                                className="group inline-flex flex-col items-center hover:bg-orange-50 rounded-lg px-4 py-2 transition-colors"
                              >
                                <span className="text-3xl font-bold text-orange-600 group-hover:text-orange-700">
                                  {item.total_ventas_evidencia}
                                </span>
                                <span className="text-xs text-gray-500 group-hover:text-orange-600">
                                  {item.total_ventas_evidencia === 1 ? 'venta' : 'ventas'}
                                </span>
                                <span className="text-xs text-gray-400 mt-1">
                                  ({formatNumber(item.suma_cantidad_vendida, 2)} unid.)
                                </span>
                              </button>
                            ) : (
                              <span className="text-gray-400 text-sm">Sin ventas</span>
                            )}
                          </td>

                          {/* Input Conteo Físico */}
                          <td className="px-4 py-4 text-center">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={ajustes[item.producto_id] ?? ''}
                              onChange={(e) => handleConteoChange(item.producto_id, e.target.value)}
                              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          {!loading && anomalias && anomalias.items.length > 0 && !showResultados && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-lg">
              <p className="text-sm text-gray-500">
                {Object.values(ajustes).filter(v => v !== '').length} de {anomalias.items.length} productos con conteo ingresado
              </p>
              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarAjustes}
                  disabled={saving || Object.values(ajustes).filter(v => v !== '').length === 0}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                      Aplicando...
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Confirmar y Ajustar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Evidencia (Facturas) */}
      {showEvidenciaModal && selectedItemEvidencia && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Evidencia de Ventas</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedItemEvidencia.codigo_producto} - {selectedItemEvidencia.descripcion_producto}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEvidenciaModal(false);
                  setSelectedItemEvidencia(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Stock Actual</p>
                  <p className={`text-2xl font-bold ${selectedItemEvidencia.stock_actual < 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                    {formatInteger(selectedItemEvidencia.stock_actual)}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600">Total Vendido</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatNumber(selectedItemEvidencia.suma_cantidad_vendida, 2)}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600">Histórico Hoy</p>
                  {selectedItemEvidencia.snapshots_hoy && selectedItemEvidencia.snapshots_hoy > 0 ? (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Max:</span>
                        <span className={`font-bold ${(selectedItemEvidencia.stock_max_hoy ?? 0) <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatInteger(selectedItemEvidencia.stock_max_hoy ?? 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Min:</span>
                        <span className={`font-bold ${(selectedItemEvidencia.stock_min_hoy ?? 0) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatInteger(selectedItemEvidencia.stock_min_hoy ?? 0)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {selectedItemEvidencia.snapshots_hoy} snapshots
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">Sin datos</p>
                  )}
                </div>
              </div>

              {/* Lista de facturas */}
              {selectedItemEvidencia.evidencias.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="h-12 w-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No hay facturas registradas para este producto</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hora</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedItemEvidencia.evidencias.map((evidencia, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            #{evidencia.numero_factura}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-500">
                            {evidencia.fecha_venta}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-500">
                            {evidencia.hora}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {evidencia.stock_al_momento !== null ? (
                              <span className={`font-semibold ${evidencia.stock_al_momento < 0 ? 'text-red-600' : evidencia.stock_al_momento === 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {formatInteger(evidencia.stock_al_momento)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                            {formatNumber(evidencia.cantidad_vendida, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-sm font-medium text-gray-700 text-right">
                          Total:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          {formatNumber(selectedItemEvidencia.suma_cantidad_vendida, 2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowEvidenciaModal(false);
                  setSelectedItemEvidencia(null);
                }}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
