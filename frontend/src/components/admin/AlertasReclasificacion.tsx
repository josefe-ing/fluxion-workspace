/**
 * Componente de Alertas de Reclasificación ABC-XYZ
 *
 * Permite:
 * - Ver alertas de cambios críticos en clasificaciones
 * - Filtrar por tienda, prioridad y estado
 * - Marcar alertas como revisadas
 * - Ver detalle y acción recomendada
 */

import React, { useState, useEffect } from 'react';
import {
  getAlertasCambios,
  getResumenAlertasTiendas,
  marcarAlertaRevisada,
  getColorPrioridad,
  getIconoCambio,
  formatearCambio,
  getAccionRecomendada,
  type Alerta,
  type ResumenAlertasTienda,
} from '../../services/alertasService';

// =====================================================================================
// COMPONENTE PRINCIPAL
// =====================================================================================

const AlertasReclasificacion: React.FC = () => {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [resumenTiendas, setResumenTiendas] = useState<ResumenAlertasTienda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filtroUbicacion, setFiltroUbicacion] = useState<string>('');
  const [filtroPendientes, setFiltroPendientes] = useState<boolean>(true);
  const [filtroCriticas, setFiltroCriticas] = useState<boolean>(false);
  const [filtroDias, setFiltroDias] = useState<number>(7);

  // Estadísticas
  const [stats, setStats] = useState({
    total_en_periodo: 0,
    criticas: 0,
    alta_prioridad: 0,
    pendientes: 0,
    cambios_abc: 0,
    cambios_xyz: 0,
  });

  // Modal de detalle
  const [alertaSeleccionada, setAlertaSeleccionada] = useState<Alerta | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [notasRevision, setNotasRevision] = useState('');
  const [procesandoRevision, setProcesandoRevision] = useState(false);

  // =====================================================================================
  // EFECTOS
  // =====================================================================================

  useEffect(() => {
    loadAlertas();
  }, [filtroUbicacion, filtroPendientes, filtroCriticas, filtroDias]);

  useEffect(() => {
    loadResumenTiendas();
  }, [filtroDias]);

  // =====================================================================================
  // FUNCIONES
  // =====================================================================================

  const loadAlertas = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getAlertasCambios({
        ubicacion_id: filtroUbicacion || undefined,
        solo_pendientes: filtroPendientes,
        solo_criticas: filtroCriticas,
        dias: filtroDias,
        limit: 100,
      });

      setAlertas(response.alertas);
      setStats(response.estadisticas);
    } catch (err) {
      console.error('Error cargando alertas:', err);
      setError('Error al cargar alertas. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const loadResumenTiendas = async () => {
    try {
      const response = await getResumenAlertasTiendas(filtroDias);
      setResumenTiendas(response.resumen);
    } catch (err) {
      console.error('Error cargando resumen de tiendas:', err);
    }
  };

  const handleMarcarRevisada = async (alertaId: string, notas: string) => {
    try {
      setProcesandoRevision(true);
      await marcarAlertaRevisada(alertaId, notas);

      // Recargar alertas
      await loadAlertas();
      await loadResumenTiendas();

      // Cerrar modal
      setShowDetalle(false);
      setAlertaSeleccionada(null);
      setNotasRevision('');
    } catch (err) {
      console.error('Error marcando alerta como revisada:', err);
      alert('Error al marcar la alerta como revisada');
    } finally {
      setProcesandoRevision(false);
    }
  };

  const handleVerDetalle = (alerta: Alerta) => {
    setAlertaSeleccionada(alerta);
    setNotasRevision(alerta.notas || '');
    setShowDetalle(true);
  };

  // =====================================================================================
  // RENDER
  // =====================================================================================

  if (loading && alertas.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Alertas de Reclasificación</h1>
        <p className="mt-2 text-gray-600">
          Monitoreo de cambios en clasificaciones ABC-XYZ de productos
        </p>
      </div>

      {/* Estadísticas Generales */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="text-sm text-gray-600">Total Alertas</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total_en_periodo}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="text-sm text-gray-600">Críticas</div>
          <div className="text-2xl font-bold text-red-600">{stats.criticas}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <div className="text-sm text-gray-600">Alta Prioridad</div>
          <div className="text-2xl font-bold text-orange-600">{stats.alta_prioridad}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="text-sm text-gray-600">Pendientes</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.pendientes}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <div className="text-sm text-gray-600">Cambios ABC</div>
          <div className="text-2xl font-bold text-purple-600">{stats.cambios_abc}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-sm text-gray-600">Cambios XYZ</div>
          <div className="text-2xl font-bold text-green-600">{stats.cambios_xyz}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período
            </label>
            <select
              value={filtroDias}
              onChange={(e) => setFiltroDias(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>Últimos 7 días</option>
              <option value={15}>Últimos 15 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tienda
            </label>
            <select
              value={filtroUbicacion}
              onChange={(e) => setFiltroUbicacion(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las tiendas</option>
              {resumenTiendas.map((tienda) => (
                <option key={tienda.ubicacion_id} value={tienda.ubicacion_id}>
                  {tienda.ubicacion_id} ({tienda.pendientes_revision} pendientes)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filtroPendientes}
                onChange={(e) => setFiltroPendientes(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Solo pendientes</span>
            </label>
          </div>

          <div className="flex items-end">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filtroCriticas}
                onChange={(e) => setFiltroCriticas(e.target.checked)}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <span className="text-sm font-medium text-gray-700">Solo críticas</span>
            </label>
          </div>
        </div>
      </div>

      {/* Lista de Alertas */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">
            Alertas ({alertas.length})
          </h2>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
            {error}
          </div>
        )}

        {alertas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-6xl mb-4">✅</div>
            <div className="text-xl font-medium">No hay alertas</div>
            <div className="text-sm mt-2">
              {filtroPendientes ? 'Todas las alertas han sido revisadas' : 'No se encontraron alertas con los filtros seleccionados'}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {alertas.map((alerta) => (
              <div
                key={alerta.id}
                className={`p-4 hover:bg-gray-50 transition-colors ${
                  alerta.es_critico ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-2xl">{getIconoCambio(alerta.cambio_clasificacion)}</span>

                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-900">
                            {alerta.producto_descripcion || alerta.codigo_producto}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getColorPrioridad(alerta.nivel_prioridad)}`}>
                            {alerta.nivel_prioridad}
                          </span>
                          {alerta.es_critico && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                              CRÍTICO
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {alerta.categoria} • {alerta.ubicacion_id}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                      <div>
                        <span className="text-gray-600">Cambio:</span>
                        <div className="font-medium">
                          {formatearCambio(alerta.clasificacion_anterior, alerta.clasificacion_nueva)}
                        </div>
                        <div className="text-xs text-gray-500">{alerta.tipo_cambio}</div>
                      </div>

                      {alerta.cambio_porcentual !== null && alerta.cambio_porcentual !== undefined && (
                        <div>
                          <span className="text-gray-600">Variación:</span>
                          <div className={`font-medium ${alerta.cambio_porcentual > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {alerta.cambio_porcentual > 0 ? '+' : ''}{alerta.cambio_porcentual.toFixed(1)}%
                          </div>
                        </div>
                      )}

                      {alerta.matriz_anterior && alerta.matriz_nueva && (
                        <div>
                          <span className="text-gray-600">Matriz:</span>
                          <div className="font-medium">
                            {alerta.matriz_anterior} → {alerta.matriz_nueva}
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="text-gray-600">Fecha:</span>
                        <div className="font-medium">
                          {new Date(alerta.fecha_cambio).toLocaleDateString('es-VE')}
                        </div>
                      </div>
                    </div>

                    {alerta.revisado && (
                      <div className="mt-2 text-sm text-green-600 flex items-center space-x-2">
                        <span>✓</span>
                        <span>
                          Revisado por {alerta.revisado_por} el {new Date(alerta.revisado_fecha!).toLocaleDateString('es-VE')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="ml-4">
                    <button
                      onClick={() => handleVerDetalle(alerta)}
                      className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resumen por Tiendas */}
      {resumenTiendas.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Resumen por Tienda</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tienda
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Críticas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pendientes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ABC / XYZ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Última Alerta
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {resumenTiendas.map((tienda) => (
                  <tr key={tienda.ubicacion_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {tienda.ubicacion_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tienda.total_alertas}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 rounded-full bg-red-100 text-red-800">
                        {tienda.alertas_criticas}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        {tienda.pendientes_revision}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tienda.cambios_abc} / {tienda.cambios_xyz}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tienda.ultima_alerta).toLocaleDateString('es-VE')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Detalle */}
      {showDetalle && alertaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Detalle de Alerta</h3>
                <button
                  onClick={() => setShowDetalle(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Información del Producto */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Producto</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="font-semibold text-lg">{alertaSeleccionada.producto_descripcion}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Código: {alertaSeleccionada.codigo_producto}
                  </div>
                  <div className="text-sm text-gray-600">
                    {alertaSeleccionada.categoria} • {alertaSeleccionada.marca}
                  </div>
                  <div className="text-sm text-gray-600">
                    Tienda: {alertaSeleccionada.ubicacion_id}
                  </div>
                </div>
              </div>

              {/* Cambio Detectado */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Cambio Detectado</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Clasificación:</span>
                    <span className="font-semibold text-lg">
                      {formatearCambio(alertaSeleccionada.clasificacion_anterior, alertaSeleccionada.clasificacion_nueva)}
                    </span>
                  </div>

                  {alertaSeleccionada.matriz_anterior && (
                    <div className="flex items-center justify-between">
                      <span>Matriz ABC-XYZ:</span>
                      <span className="font-semibold">
                        {alertaSeleccionada.matriz_anterior} → {alertaSeleccionada.matriz_nueva}
                      </span>
                    </div>
                  )}

                  {alertaSeleccionada.cambio_porcentual !== null && (
                    <div className="flex items-center justify-between">
                      <span>Variación de valor:</span>
                      <span className={`font-semibold ${alertaSeleccionada.cambio_porcentual > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {alertaSeleccionada.cambio_porcentual > 0 ? '+' : ''}{alertaSeleccionada.cambio_porcentual.toFixed(2)}%
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span>Fecha del cambio:</span>
                    <span className="font-medium">
                      {new Date(alertaSeleccionada.fecha_cambio).toLocaleString('es-VE')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acción Recomendada */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Acción Recomendada</h4>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700">
                    {getAccionRecomendada(alertaSeleccionada)}
                  </p>
                </div>
              </div>

              {/* Notas de Revisión */}
              {!alertaSeleccionada.revisado && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Notas de Revisión</h4>
                  <textarea
                    value={notasRevision}
                    onChange={(e) => setNotasRevision(e.target.value)}
                    placeholder="Agrega notas sobre las acciones tomadas..."
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Notas existentes */}
              {alertaSeleccionada.revisado && alertaSeleccionada.notas && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Notas de Revisión</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-700">{alertaSeleccionada.notas}</p>
                    <div className="mt-2 text-xs text-gray-500">
                      Revisado por {alertaSeleccionada.revisado_por} el{' '}
                      {new Date(alertaSeleccionada.revisado_fecha!).toLocaleString('es-VE')}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setShowDetalle(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
              {!alertaSeleccionada.revisado && (
                <button
                  onClick={() => handleMarcarRevisada(alertaSeleccionada.id, notasRevision)}
                  disabled={procesandoRevision}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {procesandoRevision ? 'Procesando...' : 'Marcar como Revisada'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertasReclasificacion;
