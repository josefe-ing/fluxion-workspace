import { useState } from 'react';
import type { ProductoInterCedi, TotalesPorCedi, ConfiguracionDiasCobertura } from '../../../services/pedidosInterCediService';
import {
  CEDI_ORIGEN_COLORS,
  CEDI_ORIGEN_NOMBRES,
  formatNumber,
  agruparPorCediOrigen,
  calcularTotales,
  getExportarExcelUrl
} from '../../../services/pedidosInterCediService';

interface Props {
  productos: ProductoInterCedi[];
  totalesPorCedi: Record<string, TotalesPorCedi>;
  config: ConfiguracionDiasCobertura & {
    cedi_destino_id: string;
    cedi_destino_nombre: string;
    frecuencia_viajes_dias: string;
    lead_time_dias: number;
  };
  region: string;
  numTiendasRegion: number;
  observaciones: string;
  onObservacionesChange: (value: string) => void;
  onBack: () => void;
  onGuardarBorrador: () => void;
  onConfirmar: () => void;
  isLoading: boolean;
  pedidoGuardadoId?: string;
}

export default function PasoConfirmacionInterCedi({
  productos,
  totalesPorCedi: _totalesPorCedi,
  config,
  region,
  numTiendasRegion,
  observaciones,
  onObservacionesChange,
  onBack,
  onGuardarBorrador,
  onConfirmar,
  isLoading,
  pedidoGuardadoId
}: Props) {
  const [expandedCedi, setExpandedCedi] = useState<string | null>(null);

  // Calcular totales de productos incluidos
  const totalesActuales = calcularTotales(productos);
  const productosAgrupados = agruparPorCediOrigen(productos.filter(p =>
    p.incluido !== false && (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) > 0
  ));

  // Calcular totales por CEDI de productos incluidos
  const totalesPorCediActuales: Record<string, TotalesPorCedi> = {
    cedi_seco: {
      productos: productosAgrupados.cedi_seco.length,
      bultos: productosAgrupados.cedi_seco.reduce((sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos), 0),
      unidades: productosAgrupados.cedi_seco.reduce((sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) * p.unidades_por_bulto, 0)
    },
    cedi_frio: {
      productos: productosAgrupados.cedi_frio.length,
      bultos: productosAgrupados.cedi_frio.reduce((sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos), 0),
      unidades: productosAgrupados.cedi_frio.reduce((sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) * p.unidades_por_bulto, 0)
    },
    cedi_verde: {
      productos: productosAgrupados.cedi_verde.length,
      bultos: productosAgrupados.cedi_verde.reduce((sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos), 0),
      unidades: productosAgrupados.cedi_verde.reduce((sum, p) => sum + (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) * p.unidades_por_bulto, 0)
    }
  };

  const handleExportExcel = (cediOrigen?: string) => {
    if (!pedidoGuardadoId) {
      alert('Debe guardar el pedido primero para exportar');
      return;
    }
    const url = getExportarExcelUrl(pedidoGuardadoId, cediOrigen);
    window.open(url, '_blank');
  };

  const cedisConProductos = ['cedi_seco', 'cedi_frio', 'cedi_verde'].filter(
    cedi => totalesPorCediActuales[cedi]?.productos > 0
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirmar Pedido Inter-CEDI</h2>
        <p className="text-sm text-gray-500">
          Revise los detalles del pedido antes de guardar o confirmar.
        </p>
      </div>

      {/* Resumen General */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen del Pedido</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total Productos */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-gray-900">{formatNumber(totalesActuales.totalProductos)}</div>
            <div className="text-sm text-gray-500">Productos</div>
          </div>

          {/* Total Bultos */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-gray-900">{formatNumber(totalesActuales.totalBultos)}</div>
            <div className="text-sm text-gray-500">Bultos</div>
          </div>

          {/* Total Unidades */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-gray-900">{formatNumber(totalesActuales.totalUnidades)}</div>
            <div className="text-sm text-gray-500">Unidades</div>
          </div>

          {/* CEDIs Origen */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-gray-900">{cedisConProductos.length}</div>
            <div className="text-sm text-gray-500">CEDIs Origen</div>
          </div>
        </div>

        {/* Info Destino y Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Destino</h4>
            <div className="space-y-1 text-sm text-blue-800">
              <p><span className="font-medium">CEDI:</span> {config.cedi_destino_nombre}</p>
              <p><span className="font-medium">Región:</span> {region}</p>
              <p><span className="font-medium">Tiendas:</span> {numTiendasRegion}</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Configuración</h4>
            <div className="space-y-1 text-sm text-gray-700">
              <p><span className="font-medium">Viajes:</span> {config.frecuencia_viajes_dias}</p>
              <p><span className="font-medium">Lead time:</span> {config.lead_time_dias} días</p>
              <p><span className="font-medium">Cobertura:</span> A={config.dias_cobertura_a}d, B={config.dias_cobertura_b}d, C={config.dias_cobertura_c}d, D={config.dias_cobertura_d}d</p>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen por CEDI Origen */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Detalle por CEDI Origen</h3>
          {pedidoGuardadoId && (
            <button
              onClick={() => handleExportExcel()}
              className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar Todo
            </button>
          )}
        </div>

        <div className="space-y-3">
          {(['cedi_seco', 'cedi_frio', 'cedi_verde'] as const).map((cediId) => {
            const totales = totalesPorCediActuales[cediId];
            const productosDelCedi = productosAgrupados[cediId];
            const isExpanded = expandedCedi === cediId;
            const colorClass = CEDI_ORIGEN_COLORS[cediId];

            if (totales.productos === 0) return null;

            return (
              <div key={cediId} className={`border rounded-lg overflow-hidden ${colorClass.replace('bg-', 'border-').split(' ')[0]}`}>
                {/* Header del CEDI */}
                <div
                  className={`${colorClass} px-4 py-3 cursor-pointer flex items-center justify-between`}
                  onClick={() => setExpandedCedi(isExpanded ? null : cediId)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{CEDI_ORIGEN_NOMBRES[cediId]}</span>
                    <span className="text-sm opacity-75">
                      {formatNumber(totales.productos)} productos · {formatNumber(totales.bultos)} bultos · {formatNumber(totales.unidades)} unid
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {pedidoGuardadoId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleExportExcel(cediId); }}
                        className="px-2 py-1 text-xs font-medium bg-white/50 rounded hover:bg-white/70"
                      >
                        Excel
                      </button>
                    )}
                    <svg
                      className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Lista de productos expandida */}
                {isExpanded && (
                  <div className="bg-white max-h-64 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">ABC</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Bultos</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unidades</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {productosDelCedi.map((producto) => (
                          <tr key={producto.codigo_producto} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-600 font-mono">
                              {producto.codigo_producto}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900 truncate max-w-[200px]">
                              {producto.descripcion_producto}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-xs font-semibold">{producto.clasificacion_abc || 'D'}</span>
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                              {formatNumber(producto.cantidad_pedida_bultos ?? producto.cantidad_sugerida_bultos)}
                            </td>
                            <td className="px-3 py-2 text-right text-sm text-gray-600">
                              {formatNumber((producto.cantidad_pedida_bultos ?? producto.cantidad_sugerida_bultos) * producto.unidades_por_bulto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observaciones */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Observaciones</h3>
        <textarea
          value={observaciones}
          onChange={(e) => onObservacionesChange(e.target.value)}
          placeholder="Notas adicionales para el pedido (opcional)..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
        />
      </div>

      {/* Botones de acción */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <button
            onClick={onBack}
            disabled={isLoading}
            className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 w-full sm:w-auto"
          >
            ← Volver
          </button>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={onGuardarBorrador}
              disabled={isLoading || totalesActuales.totalProductos === 0}
              className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Guardar Borrador
                </>
              )}
            </button>

            <button
              onClick={onConfirmar}
              disabled={isLoading || totalesActuales.totalProductos === 0}
              className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirmar Pedido
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
