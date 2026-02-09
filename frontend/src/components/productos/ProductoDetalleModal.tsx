import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getProductoDetalleCompleto,
  getVentasPorTienda,
  getVentasSemanales,
  ProductoDetalleCompleto,
  VentasPorTiendaResponse,
  VentasSemanalesResponse,
  formatNumber
} from '../../services/productosService';

interface ProductoDetalleModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigo: string;
}

const ProductoDetalleModal: React.FC<ProductoDetalleModalProps> = ({ isOpen, onClose, codigo }) => {
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<ProductoDetalleCompleto | null>(null);
  const [ventasPorTienda, setVentasPorTienda] = useState<VentasPorTiendaResponse | null>(null);
  const [ventasSemanales, setVentasSemanales] = useState<VentasSemanalesResponse | null>(null);
  const [loadingVentasPorTienda, setLoadingVentasPorTienda] = useState(true);
  const [, setLoadingVentasSemanales] = useState(true);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState("2m");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const detalleData = await getProductoDetalleCompleto(codigo);
      setDetalle(detalleData);
    } catch (error) {
      console.error('Error loading producto detalle:', error);
    } finally {
      setLoading(false);
    }
  }, [codigo]);

  const loadVentasPorTienda = useCallback(async () => {
    setLoadingVentasPorTienda(true);
    try {
      const data = await getVentasPorTienda(codigo, periodoSeleccionado);
      setVentasPorTienda(data);
    } catch (error) {
      console.error('Error loading ventas por tienda:', error);
    } finally {
      setLoadingVentasPorTienda(false);
    }
  }, [codigo, periodoSeleccionado]);

  const loadVentasSemanales = useCallback(async () => {
    setLoadingVentasSemanales(true);
    try {
      const data = await getVentasSemanales(codigo);
      setVentasSemanales(data);
    } catch (error) {
      console.error('Error loading ventas semanales:', error);
    } finally {
      setLoadingVentasSemanales(false);
    }
  }, [codigo]);

  useEffect(() => {
    if (isOpen && codigo) {
      loadData();
      loadVentasSemanales();
    }
  }, [isOpen, codigo, loadData, loadVentasSemanales]);

  useEffect(() => {
    if (isOpen && codigo) {
      loadVentasPorTienda();
    }
  }, [isOpen, codigo, periodoSeleccionado, loadVentasPorTienda]);

  // Calcular CV y clasificacion XYZ de los datos semanales
  const cvData = useMemo(() => {
    if (!ventasSemanales?.semanas || ventasSemanales.semanas.length < 2) {
      return null;
    }

    const unidadesSemanales = ventasSemanales.semanas.map(s => s.unidades);
    const n = unidadesSemanales.length;
    const promedio = unidadesSemanales.reduce((a, b) => a + b, 0) / n;

    // Calcular desviacion estandar
    const varianza = unidadesSemanales.reduce((acc, val) => acc + Math.pow(val - promedio, 2), 0) / (n - 1);
    const desviacion = Math.sqrt(varianza);

    // Coeficiente de variacion
    const cv = promedio > 0 ? desviacion / promedio : 0;

    // Clasificacion XYZ
    let clasificacionXYZ = 'Z';
    if (cv < 0.5) clasificacionXYZ = 'X';
    else if (cv < 1.0) clasificacionXYZ = 'Y';

    return {
      semanas: ventasSemanales.semanas,
      unidadesSemanales,
      promedio,
      desviacion,
      cv,
      clasificacionXYZ,
      cvDelServicio: ventasSemanales.metricas.coeficiente_variacion
    };
  }, [ventasSemanales]);

  if (!isOpen) return null;

  // Obtener clasificación global del producto
  const clasificacionGlobal = detalle?.clasificacion_global;
  const claseABC = clasificacionGlobal?.clasificacion_abc || 'SIN_VENTAS';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {detalle?.producto.codigo} - {detalle?.producto.descripcion}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {detalle?.producto.categoria} {detalle?.producto.marca && `• ${detalle.producto.marca}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Clasificación ABC Explícita */}
            {clasificacionGlobal && (
              <div className={`rounded-lg p-6 border-2 ${
                claseABC === 'A' ? 'bg-red-50 border-red-300' :
                claseABC === 'B' ? 'bg-yellow-50 border-yellow-300' :
                claseABC === 'C' ? 'bg-gray-50 border-gray-300' :
                'bg-blue-50 border-blue-300'
              }`}>
                <div className="flex items-start gap-6">
                  {/* Badge Grande */}
                  <div className={`flex-shrink-0 w-24 h-24 rounded-xl flex items-center justify-center text-5xl font-black ${
                    claseABC === 'A' ? 'bg-red-600 text-white' :
                    claseABC === 'B' ? 'bg-yellow-500 text-white' :
                    claseABC === 'C' ? 'bg-gray-500 text-white' :
                    'bg-blue-500 text-white'
                  }`}>
                    {claseABC}
                  </div>

                  {/* Explicación */}
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold mb-2 ${
                      claseABC === 'A' ? 'text-red-800' :
                      claseABC === 'B' ? 'text-yellow-800' :
                      claseABC === 'C' ? 'text-gray-800' :
                      'text-blue-800'
                    }`}>
                      {claseABC === 'A' && 'Producto Clase A - Alto Valor'}
                      {claseABC === 'B' && 'Producto Clase B - Valor Medio'}
                      {claseABC === 'C' && 'Producto Clase C - Bajo Valor'}
                      {claseABC === 'SIN_VENTAS' && 'Sin Ventas Recientes'}
                    </h3>

                    <p className="text-gray-700 mb-4">
                      {claseABC === 'A' && 'Este producto forma parte del 80% del valor total de ventas. Son los productos que generan la mayor parte de los ingresos y requieren atención prioritaria en inventario.'}
                      {claseABC === 'B' && 'Este producto forma parte del siguiente 15% del valor de ventas (entre 80% y 95% acumulado). Tienen importancia moderada y requieren revisión periódica.'}
                      {claseABC === 'C' && 'Este producto representa solo el 5% restante del valor de ventas. Son productos de baja rotación económica.'}
                      {claseABC === 'SIN_VENTAS' && 'Este producto no ha registrado ventas en los últimos 30 días.'}
                    </p>

                    {/* Métricas Clave */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Ranking por Venta</div>
                        <div className="text-xl font-bold text-gray-900">
                          #{clasificacionGlobal.ranking_valor || '-'}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Venta 30 días</div>
                        <div className="text-xl font-bold text-gray-900">
                          ${formatNumber(clasificacionGlobal.venta_30d || 0)}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Penetración</div>
                        <div className="text-xl font-bold text-gray-900">
                          {clasificacionGlobal.penetracion_pct?.toFixed(1) || 0}%
                        </div>
                        <div className="text-xs text-gray-400">de los tickets</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <div className="text-xs text-gray-500 uppercase">Stock Total</div>
                        <div className="text-xl font-bold text-gray-900">
                          {detalle?.metricas_globales.total_inventario.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clasificacion XYZ y Calculo CV */}
            {cvData && (
              <div className={`rounded-lg p-6 border-2 ${
                cvData.clasificacionXYZ === 'X' ? 'bg-green-50 border-green-300' :
                cvData.clasificacionXYZ === 'Y' ? 'bg-blue-50 border-blue-300' :
                'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-start gap-6">
                  {/* Badge XYZ */}
                  <div className={`flex-shrink-0 w-24 h-24 rounded-xl flex items-center justify-center text-5xl font-black ${
                    cvData.clasificacionXYZ === 'X' ? 'bg-green-600 text-white' :
                    cvData.clasificacionXYZ === 'Y' ? 'bg-blue-600 text-white' :
                    'bg-red-600 text-white'
                  }`}>
                    {cvData.clasificacionXYZ}
                  </div>

                  {/* Explicacion */}
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold mb-2 ${
                      cvData.clasificacionXYZ === 'X' ? 'text-green-800' :
                      cvData.clasificacionXYZ === 'Y' ? 'text-blue-800' :
                      'text-red-800'
                    }`}>
                      {cvData.clasificacionXYZ === 'X' && 'Demanda Estable - Clase X'}
                      {cvData.clasificacionXYZ === 'Y' && 'Demanda Variable - Clase Y'}
                      {cvData.clasificacionXYZ === 'Z' && 'Demanda Erratica - Clase Z'}
                    </h3>

                    <p className="text-gray-700 mb-4">
                      {cvData.clasificacionXYZ === 'X' && 'Este producto tiene ventas consistentes semana a semana. Facil de predecir y planificar. Requiere stock de seguridad bajo.'}
                      {cvData.clasificacionXYZ === 'Y' && 'Este producto tiene variabilidad moderada en sus ventas. Puede tener patrones estacionales o tendencias. Requiere analisis de ciclos.'}
                      {cvData.clasificacionXYZ === 'Z' && 'Este producto tiene demanda muy impredecible. Alto riesgo de stockout o sobreinventario. Requiere atencion especial.'}
                    </p>

                    {/* Formula del Calculo */}
                    <div className="bg-white rounded-lg p-4 border mb-4">
                      <div className="text-sm font-semibold text-gray-700 mb-3">Calculo del Coeficiente de Variacion (CV):</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-500">Promedio Semanal</div>
                          <div className="text-lg font-bold text-gray-900">{cvData.promedio.toFixed(1)}</div>
                          <div className="text-xs text-gray-400">unidades/sem</div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-500">Desviacion (σ)</div>
                          <div className="text-lg font-bold text-gray-900">{cvData.desviacion.toFixed(2)}</div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-500">Semanas Analizadas</div>
                          <div className="text-lg font-bold text-gray-900">{cvData.semanas.length}</div>
                        </div>
                        <div className={`text-center p-2 rounded ${
                          cvData.clasificacionXYZ === 'X' ? 'bg-green-100' :
                          cvData.clasificacionXYZ === 'Y' ? 'bg-blue-100' :
                          'bg-red-100'
                        }`}>
                          <div className="text-xs text-gray-500">CV = σ / μ</div>
                          <div className={`text-xl font-bold ${
                            cvData.clasificacionXYZ === 'X' ? 'text-green-700' :
                            cvData.clasificacionXYZ === 'Y' ? 'text-blue-700' :
                            'text-red-700'
                          }`}>{cvData.cv.toFixed(3)}</div>
                        </div>
                      </div>

                      {/* Visualizacion de umbrales */}
                      <div className="relative h-8 bg-gradient-to-r from-green-500 via-blue-500 to-red-500 rounded-full overflow-hidden">
                        <div className="absolute inset-0 flex">
                          <div className="w-1/3 flex items-center justify-center text-white text-xs font-bold border-r border-white/30">X (&lt;0.5)</div>
                          <div className="w-1/3 flex items-center justify-center text-white text-xs font-bold border-r border-white/30">Y (0.5-1.0)</div>
                          <div className="w-1/3 flex items-center justify-center text-white text-xs font-bold">Z (&gt;1.0)</div>
                        </div>
                        {/* Indicador de posicion */}
                        <div
                          className="absolute top-0 w-1 h-full bg-white shadow-lg"
                          style={{
                            left: `${Math.min(cvData.cv / 1.5 * 100, 100)}%`,
                            transform: 'translateX(-50%)'
                          }}
                        />
                      </div>
                    </div>

                    {/* Clasificacion combinada ABC-XYZ */}
                    <div className={`p-3 rounded-lg border ${
                      claseABC === 'A' && cvData.clasificacionXYZ === 'X' ? 'bg-emerald-100 border-emerald-300' :
                      claseABC === 'A' && cvData.clasificacionXYZ === 'Z' ? 'bg-orange-100 border-orange-300' :
                      'bg-gray-100 border-gray-300'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-black">
                          {claseABC}{cvData.clasificacionXYZ}
                        </span>
                        <div className="text-sm text-gray-600">
                          {claseABC === 'A' && cvData.clasificacionXYZ === 'X' && '⭐ Producto estrella: Alto valor + Demanda estable. Nunca debe faltar.'}
                          {claseABC === 'A' && cvData.clasificacionXYZ === 'Y' && 'Alto valor + Demanda variable. Monitorear tendencias y ciclos.'}
                          {claseABC === 'A' && cvData.clasificacionXYZ === 'Z' && '⚠️ Riesgo critico: Alto valor + Demanda erratica. Requiere atencion especial.'}
                          {claseABC === 'B' && cvData.clasificacionXYZ === 'X' && 'Valor medio + Demanda estable. Gestion estandar.'}
                          {claseABC === 'B' && cvData.clasificacionXYZ === 'Y' && 'Valor medio + Demanda variable. Revision periodica.'}
                          {claseABC === 'B' && cvData.clasificacionXYZ === 'Z' && 'Valor medio + Demanda erratica. Evaluar niveles de servicio.'}
                          {claseABC === 'C' && cvData.clasificacionXYZ === 'X' && 'Bajo valor + Demanda estable. Automatizar reposicion.'}
                          {claseABC === 'C' && cvData.clasificacionXYZ === 'Y' && 'Bajo valor + Demanda variable. Minima atencion.'}
                          {claseABC === 'C' && cvData.clasificacionXYZ === 'Z' && 'Bajo valor + Demanda erratica. Evaluar si mantener en inventario.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resumen de Ubicaciones */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-green-600 font-medium">Tiendas con Stock</div>
                <div className="text-3xl font-bold text-green-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_con_stock}
                  <span className="text-lg font-normal text-green-600">/{detalle?.metricas_globales.total_ubicaciones}</span>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-sm text-red-600 font-medium">Tiendas sin Stock</div>
                <div className="text-3xl font-bold text-red-900 mt-1">
                  {detalle?.metricas_globales.ubicaciones_sin_stock}
                  <span className="text-lg font-normal text-red-600">/{detalle?.metricas_globales.total_ubicaciones}</span>
                </div>
              </div>
            </div>

            {/* Clasificación ABC por Tienda - Tabla Comparativa */}
            {detalle?.clasificaciones && detalle.clasificaciones.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    📊 Clasificación ABC por Tienda
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Comparativa de cómo se clasifica este producto en cada tienda
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ABC</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">XYZ</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matriz</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ranking</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venta</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CV</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {detalle.clasificaciones.map((clasif) => (
                        <tr key={clasif.ubicacion_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {clasif.ubicacion_nombre}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              clasif.clasificacion_abc === 'A' ? 'bg-red-100 text-red-800' :
                              clasif.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-800' :
                              clasif.clasificacion_abc === 'C' ? 'bg-gray-100 text-gray-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {clasif.clasificacion_abc}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              clasif.clasificacion_xyz === 'X' ? 'bg-green-100 text-green-800' :
                              clasif.clasificacion_xyz === 'Y' ? 'bg-blue-100 text-blue-800' :
                              clasif.clasificacion_xyz === 'Z' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {clasif.clasificacion_xyz || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              clasif.matriz?.startsWith('A') && clasif.matriz?.endsWith('X') ? 'bg-emerald-100 text-emerald-800' :
                              clasif.matriz?.startsWith('A') && clasif.matriz?.endsWith('Z') ? 'bg-orange-100 text-orange-800' :
                              clasif.matriz?.startsWith('A') ? 'bg-red-50 text-red-700' :
                              clasif.matriz?.startsWith('B') ? 'bg-yellow-50 text-yellow-700' :
                              'bg-gray-50 text-gray-600'
                            }`}>
                              {clasif.matriz || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            #{clasif.ranking_valor}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${formatNumber(clasif.valor_consumo)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`${
                              clasif.coeficiente_variacion !== null && clasif.coeficiente_variacion < 0.5 ? 'text-green-600' :
                              clasif.coeficiente_variacion !== null && clasif.coeficiente_variacion < 1.0 ? 'text-blue-600' :
                              clasif.coeficiente_variacion !== null ? 'text-red-600' :
                              'text-gray-400'
                            }`}>
                              {clasif.coeficiente_variacion !== null ? clasif.coeficiente_variacion.toFixed(2) : '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    💡 Un producto puede tener clasificación diferente en cada tienda según su comportamiento de ventas local
                  </p>
                </div>
              </div>
            )}

            {/* Stock por Tienda */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Stock por Tienda
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detalle?.inventarios.map((inv) => (
                      <tr key={inv.ubicacion_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {inv.ubicacion_nombre}
                          <span className="ml-2 text-xs text-gray-500">
                            ({inv.tipo_ubicacion})
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            inv.cantidad_actual === 0 ? 'text-red-600' :
                            inv.cantidad_actual < 10 ? 'text-yellow-600' :
                            'text-gray-900'
                          }`}>
                            {inv.cantidad_actual.toFixed(0)}
                          </span>
                          {inv.cantidad_actual === 0 && ' 🚨'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ventas por Tienda */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Ventas por Tienda
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Total de unidades vendidas y transacciones por ubicación
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 font-medium">Período:</label>
                    <select
                      value={periodoSeleccionado}
                      onChange={(e) => setPeriodoSeleccionado(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="1w">Última semana</option>
                      <option value="2w">2 semanas</option>
                      <option value="1m">1 mes</option>
                      <option value="2m">2 meses</option>
                      <option value="3m">3 meses</option>
                      <option value="4m">4 meses</option>
                      <option value="5m">5 meses</option>
                      <option value="6m">6 meses</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6">
                {loadingVentasPorTienda ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : ventasPorTienda ? (
                  <>
                    {/* Resumen */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="text-sm text-blue-600 font-medium">Total Unidades</div>
                        <div className="text-2xl font-bold text-blue-900 mt-1">
                          {formatNumber(ventasPorTienda.totales.total_unidades)}
                        </div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4">
                        <div className="text-sm text-green-600 font-medium">Total Transacciones</div>
                        <div className="text-2xl font-bold text-green-900 mt-1">
                          {formatNumber(ventasPorTienda.totales.total_transacciones)}
                        </div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4">
                        <div className="text-sm text-purple-600 font-medium">Tiendas con Ventas</div>
                        <div className="text-2xl font-bold text-purple-900 mt-1">
                          {ventasPorTienda.totales.tiendas_con_ventas}
                        </div>
                      </div>
                    </div>

                    {/* Tabla de ventas */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tienda</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidades</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transacciones</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Última Venta</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {ventasPorTienda.ventas.map((venta) => (
                            <tr key={venta.ubicacion_id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {venta.ubicacion_nombre}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`font-medium ${
                                  venta.total_unidades === 0 ? 'text-gray-400' :
                                  venta.total_unidades > 100 ? 'text-green-600' :
                                  'text-gray-900'
                                }`}>
                                  {formatNumber(venta.total_unidades)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatNumber(venta.total_transacciones)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {venta.ultima_venta ? new Date(venta.ultima_venta).toLocaleDateString('es-VE') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    No hay datos de ventas disponibles para este período
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductoDetalleModal;
