import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import {
  ejecutarScan,
  getConfigTiendas,
  habilitarTienda,
  deshabilitarTienda,
  getDetalleProducto,
  ScanResponse,
  ConfigTiendasListResponse,
  EmergenciaDetectada,
  TipoEmergencia,
  DetalleProductoEmergencia,
} from '../../services/emergenciasService';

// ============================================================================
// HELPERS
// ============================================================================

function getTipoEmergenciaColor(tipo: TipoEmergencia): string {
  switch (tipo) {
    case 'STOCKOUT':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'CRITICO':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'INMINENTE':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'ALERTA':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getTipoEmergenciaDot(tipo: TipoEmergencia): string {
  switch (tipo) {
    case 'STOCKOUT':
      return 'bg-red-500';
    case 'CRITICO':
      return 'bg-orange-500';
    case 'INMINENTE':
      return 'bg-yellow-500';
    case 'ALERTA':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
}

function getClaseABCColor(clase: string | null): string {
  switch (clase) {
    case 'A':
      return 'bg-purple-100 text-purple-700';
    case 'B':
      return 'bg-indigo-100 text-indigo-700';
    case 'C':
      return 'bg-cyan-100 text-cyan-700';
    case 'D':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-50 text-gray-500';
  }
}

function formatNumber(value: number | string, decimals = 0): string {
  const num = Number(value);
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number | string): string {
  const num = Number(value);
  return `${(num * 100).toFixed(0)}%`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EmergenciasDashboard() {
  // State
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [configTiendas, setConfigTiendas] = useState<ConfigTiendasListResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'emergencias' | 'config'>('emergencias');
  const [selectedTienda, setSelectedTienda] = useState<string | null>(null);
  const [selectedTipo, setSelectedTipo] = useState<TipoEmergencia | 'ALL'>('ALL');
  const [selectedEmergencia, setSelectedEmergencia] = useState<EmergenciaDetectada | null>(null);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoadingConfig(true);
      const config = await getConfigTiendas();
      setConfigTiendas(config);
    } catch (err) {
      console.error('Error loading config:', err);
      setError('Error al cargar configuracion de tiendas');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleScan = async () => {
    try {
      setIsScanning(true);
      setError(null);
      const result = await ejecutarScan({ incluir_anomalias: true });
      setScanResult(result);
    } catch (err) {
      console.error('Error executing scan:', err);
      setError('Error al ejecutar scan de emergencias');
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleTienda = async (ubicacionId: string, habilitado: boolean) => {
    try {
      if (habilitado) {
        await deshabilitarTienda(ubicacionId);
      } else {
        await habilitarTienda(ubicacionId);
      }
      await loadConfig();
    } catch (err) {
      console.error('Error toggling tienda:', err);
      setError('Error al cambiar estado de tienda');
    }
  };

  // Filter emergencias
  const filteredEmergencias = scanResult?.emergencias.filter((e) => {
    if (selectedTienda && e.ubicacion_id !== selectedTienda) return false;
    if (selectedTipo !== 'ALL' && e.tipo_emergencia !== selectedTipo) return false;
    return true;
  }) || [];

  // Group by tienda for summary
  const tiendasEnScan = [...new Set(scanResult?.emergencias.map((e) => e.ubicacion_id) || [])];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Emergencias de Inventario</h1>
              <p className="mt-2 text-sm text-gray-600">
                Detecta productos con stock critico antes de que se agoten
              </p>
            </div>
            <button
              onClick={handleScan}
              disabled={isScanning}
              className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white ${
                isScanning
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
              }`}
            >
              {isScanning ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Escaneando...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Ejecutar Scan
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('emergencias')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'emergencias'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Emergencias
              {scanResult && (
                <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                  {scanResult.total_emergencias}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'config'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Configuracion de Tiendas
              {configTiendas && (
                <span className="ml-2 bg-green-100 text-green-600 py-0.5 px-2 rounded-full text-xs">
                  {configTiendas.habilitadas} activas
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'emergencias' && (
          <>
            {/* Scan Summary */}
            {scanResult && (
              <div className="mb-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-sm text-gray-500">Total Emergencias</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">
                      {formatNumber(scanResult.total_emergencias)}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-lg shadow-sm border border-red-200 p-4">
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                      <span className="text-sm text-red-700">Stockouts</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-red-600">
                      {formatNumber(scanResult.stockouts)}
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg shadow-sm border border-orange-200 p-4">
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                      <span className="text-sm text-orange-700">Criticos</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-orange-600">
                      {formatNumber(scanResult.criticos)}
                    </div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg shadow-sm border border-yellow-200 p-4">
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                      <span className="text-sm text-yellow-700">Inminentes</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-yellow-600">
                      {formatNumber(scanResult.inminentes)}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-4">
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      <span className="text-sm text-blue-700">Alertas</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-blue-600">
                      {formatNumber(scanResult.alertas)}
                    </div>
                  </div>
                </div>

                {/* Scan Metadata */}
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 flex items-center justify-between">
                  <div>
                    Scan ID: <span className="font-mono text-gray-800">{scanResult.scan_id}</span>
                  </div>
                  <div>
                    {formatNumber(scanResult.total_productos_analizados)} productos analizados en{' '}
                    {formatNumber(scanResult.duracion_ms)}ms
                  </div>
                  <div>
                    {new Date(scanResult.fecha_fin).toLocaleString('es-VE')}
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            {scanResult && scanResult.total_emergencias > 0 && (
              <div className="mb-6 flex flex-wrap gap-4">
                {/* Filter by Tienda */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tienda</label>
                  <select
                    value={selectedTienda || ''}
                    onChange={(e) => setSelectedTienda(e.target.value || null)}
                    className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm"
                  >
                    <option value="">Todas las tiendas</option>
                    {tiendasEnScan.map((tiendaId) => {
                      const resumen = scanResult.resumen_por_tienda.find((r) => r.ubicacion_id === tiendaId);
                      return (
                        <option key={tiendaId} value={tiendaId}>
                          {resumen?.nombre_tienda || tiendaId} ({resumen?.total_emergencias || 0})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Filter by Tipo */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                  <select
                    value={selectedTipo}
                    onChange={(e) => setSelectedTipo(e.target.value as TipoEmergencia | 'ALL')}
                    className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm"
                  >
                    <option value="ALL">Todos</option>
                    <option value="STOCKOUT">Stockouts</option>
                    <option value="CRITICO">Criticos</option>
                    <option value="INMINENTE">Inminentes</option>
                    <option value="ALERTA">Alertas</option>
                  </select>
                </div>

                {/* Results count */}
                <div className="flex items-end">
                  <span className="text-sm text-gray-500">
                    Mostrando {filteredEmergencias.length} de {scanResult.total_emergencias}
                  </span>
                </div>
              </div>
            )}

            {/* Leyenda de Tipos */}
            {scanResult && scanResult.total_emergencias > 0 && (
              <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Tipos de Emergencia</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-start space-x-2">
                    <span className="w-3 h-3 bg-red-500 rounded-full mt-0.5 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-red-700">STOCKOUT</span>
                      <p className="text-gray-500 text-xs">Sin stock (cobertura = 0%)</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="w-3 h-3 bg-orange-500 rounded-full mt-0.5 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-orange-700">CRITICO</span>
                      <p className="text-gray-500 text-xs">Cobertura menor al 25%</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="w-3 h-3 bg-yellow-500 rounded-full mt-0.5 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-yellow-700">INMINENTE</span>
                      <p className="text-gray-500 text-xs">Cobertura menor al 50%</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mt-0.5 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-blue-700">ALERTA</span>
                      <p className="text-gray-500 text-xs">Cobertura menor al 75%</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    <strong>Cobertura</strong> = Stock actual / Demanda restante del dia.
                    <strong className="ml-2">Factor Intensidad</strong> = Ventas reales / Ventas esperadas (mayor a 1 = dia mas activo de lo normal).
                  </p>
                </div>
              </div>
            )}

            {/* Emergencias Table */}
            {scanResult && scanResult.total_emergencias > 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tienda
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ABC
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stock
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Demanda Rest.
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cobertura
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Factor Int.
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Accion
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEmergencias.map((emergencia, idx) => (
                      <EmergenciaRow
                        key={`${emergencia.ubicacion_id}-${emergencia.producto_id}-${idx}`}
                        emergencia={emergencia}
                        onVerDetalle={() => setSelectedEmergencia(emergencia)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : scanResult ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-green-800">Sin emergencias detectadas</h3>
                <p className="mt-2 text-sm text-green-600">
                  Todos los productos tienen stock suficiente para cubrir la demanda del dia.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                <svg
                  className="mx-auto h-16 w-16 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Ejecuta un scan para detectar emergencias</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Haz click en "Ejecutar Scan" para analizar el inventario de las tiendas habilitadas.
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'config' && (
          <ConfigTiendasPanel
            config={configTiendas}
            isLoading={isLoadingConfig}
            onToggle={handleToggleTienda}
            onRefresh={loadConfig}
          />
        )}
      </div>

      {/* Modal de Detalle */}
      {selectedEmergencia && (
        <EmergenciaDetalleModal
          emergencia={selectedEmergencia}
          onClose={() => setSelectedEmergencia(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EmergenciaRow({
  emergencia,
  onVerDetalle,
}: {
  emergencia: EmergenciaDetectada;
  onVerDetalle: () => void;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900 truncate max-w-xs" title={emergencia.nombre_producto}>
          {emergencia.nombre_producto}
        </div>
        <div className="text-xs text-gray-500">{emergencia.producto_id}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-gray-900">{emergencia.nombre_tienda}</div>
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getClaseABCColor(
            emergencia.clase_abc
          )}`}
        >
          {emergencia.clase_abc || '-'}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTipoEmergenciaColor(
            emergencia.tipo_emergencia
          )}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getTipoEmergenciaDot(emergencia.tipo_emergencia)}`}></span>
          {emergencia.tipo_emergencia}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-medium ${Number(emergencia.stock_actual) <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {formatNumber(emergencia.stock_actual)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-gray-600">{formatNumber(emergencia.demanda_restante, 1)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={`text-sm font-medium ${
            Number(emergencia.cobertura) <= 0.25 ? 'text-red-600' : Number(emergencia.cobertura) <= 0.5 ? 'text-yellow-600' : 'text-gray-600'
          }`}
        >
          {formatPercent(emergencia.cobertura)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={`text-sm ${
            Number(emergencia.factor_intensidad) > 1.2
              ? 'text-red-600 font-medium'
              : Number(emergencia.factor_intensidad) < 0.8
              ? 'text-blue-600'
              : 'text-gray-600'
          }`}
        >
          {Number(emergencia.factor_intensidad).toFixed(2)}x
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={onVerDetalle}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Ver detalle
        </button>
      </td>
    </tr>
  );
}

function ConfigTiendasPanel({
  config,
  isLoading,
  onToggle,
  onRefresh,
}: {
  config: ConfigTiendasListResponse | null;
  isLoading: boolean;
  onToggle: (ubicacionId: string, habilitado: boolean) => void;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <svg
          className="animate-spin mx-auto h-8 w-8 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <p className="mt-4 text-sm text-gray-500">Cargando configuracion...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <p className="text-red-600">Error al cargar configuracion</p>
        <button onClick={onRefresh} className="mt-4 text-red-600 hover:text-red-800 underline">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Tiendas Configuradas</h3>
            <p className="mt-1 text-sm text-gray-500">
              {config.habilitadas} de {config.total} tiendas habilitadas para deteccion de emergencias
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="text-gray-400 hover:text-gray-600"
            title="Refrescar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Tiendas List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tienda
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Umbral Critico
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Umbral Inminente
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Umbral Alerta
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Accion
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {config.tiendas.map((tienda) => (
              <tr key={tienda.ubicacion_id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{tienda.nombre_tienda}</div>
                  <div className="text-xs text-gray-500">{tienda.ubicacion_id}</div>
                </td>
                <td className="px-6 py-4 text-center">
                  {tienda.habilitado ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Habilitada
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      Deshabilitada
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-600">
                  {formatPercent(tienda.umbral_critico)}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-600">
                  {formatPercent(tienda.umbral_inminente)}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-600">
                  {formatPercent(tienda.umbral_alerta)}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onToggle(tienda.ubicacion_id, tienda.habilitado)}
                    className={`text-sm font-medium ${
                      tienda.habilitado
                        ? 'text-red-600 hover:text-red-800'
                        : 'text-green-600 hover:text-green-800'
                    }`}
                  >
                    {tienda.habilitado ? 'Deshabilitar' : 'Habilitar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmergenciaDetalleModal({
  emergencia,
  onClose,
}: {
  emergencia: EmergenciaDetectada;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleProductoEmergencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos detallados al abrir el modal
  useEffect(() => {
    const cargarDetalle = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getDetalleProducto(emergencia.ubicacion_id, emergencia.producto_id);
        setDetalle(data);
      } catch (err) {
        console.error('Error cargando detalle:', err);
        setError('Error al cargar datos detallados');
      } finally {
        setLoading(false);
      }
    };
    cargarDetalle();
  }, [emergencia.ubicacion_id, emergencia.producto_id]);

  // Valores del emergencia (fallback mientras carga)
  const stockActual = detalle ? detalle.stock_actual : Number(emergencia.stock_actual);
  const demandaRestante = detalle ? detalle.demanda_restante : Number(emergencia.demanda_restante);
  const cobertura = detalle ? detalle.cobertura : Number(emergencia.cobertura);
  const factorIntensidad = detalle ? detalle.factor_intensidad : Number(emergencia.factor_intensidad);
  const ventasHoy = detalle ? detalle.ventas_hoy : Number(emergencia.ventas_hoy);

  // Calcular explicaciones
  const getCoberturaExplicacion = () => {
    if (cobertura <= 0) {
      return 'El stock esta agotado. No hay unidades disponibles para satisfacer la demanda.';
    }
    if (cobertura < 0.25) {
      return `Con ${formatNumber(stockActual)} unidades y una demanda restante de ${formatNumber(demandaRestante, 1)} unidades, el stock solo cubre el ${formatPercent(cobertura)} de lo que se espera vender hoy.`;
    }
    if (cobertura < 0.5) {
      return `El stock actual (${formatNumber(stockActual)} uds) cubre menos de la mitad de la demanda esperada (${formatNumber(demandaRestante, 1)} uds). Hay riesgo de agotamiento antes del cierre.`;
    }
    return `El stock (${formatNumber(stockActual)} uds) cubre el ${formatPercent(cobertura)} de la demanda restante (${formatNumber(demandaRestante, 1)} uds). Nivel moderado de riesgo.`;
  };

  const getFactorExplicacion = () => {
    if (factorIntensidad > 1.5) {
      return `Las ventas de hoy (${formatNumber(ventasHoy)} uds) son ${factorIntensidad.toFixed(1)}x mas altas de lo esperado. Dia excepcionalmente activo.`;
    }
    if (factorIntensidad > 1.2) {
      return `Las ventas de hoy (${formatNumber(ventasHoy)} uds) estan ${((factorIntensidad - 1) * 100).toFixed(0)}% por encima de lo esperado. Dia mas activo de lo normal.`;
    }
    if (factorIntensidad < 0.8) {
      return `Las ventas de hoy (${formatNumber(ventasHoy)} uds) estan ${((1 - factorIntensidad) * 100).toFixed(0)}% por debajo de lo esperado. Dia mas tranquilo de lo normal.`;
    }
    return `Las ventas de hoy (${formatNumber(ventasHoy)} uds) estan dentro del rango esperado.`;
  };

  const getRecomendacion = () => {
    if (emergencia.tipo_emergencia === 'STOCKOUT') {
      if (emergencia.clase_abc === 'A') {
        return 'URGENTE: Producto clase A sin stock. Priorizar reposicion inmediata o pedido de emergencia al CEDI.';
      }
      return 'Producto agotado. Evaluar si es necesario un pedido de emergencia o esperar al proximo reabastecimiento.';
    }
    if (emergencia.tipo_emergencia === 'CRITICO') {
      if (emergencia.clase_abc === 'A') {
        return 'Producto clase A en estado critico. Recomendar pedido de emergencia para evitar stockout.';
      }
      return 'Stock muy bajo. Monitorear de cerca y considerar adelantar el proximo pedido.';
    }
    if (emergencia.tipo_emergencia === 'INMINENTE') {
      return 'El stock podria agotarse antes del proximo reabastecimiento. Verificar fecha del proximo pedido.';
    }
    return 'Nivel de stock bajo pero manejable. Incluir en el proximo pedido regular.';
  };

  // Preparar datos para graficos
  const prepararDatosGrafico = () => {
    if (!detalle?.comparativo_ventas) return [];

    const { hoy, ayer, semana_pasada, promedio_historico } = detalle.comparativo_ventas;

    return hoy.map((h, idx) => ({
      hora: `${h.hora}:00`,
      horaNum: h.hora,
      hoy: h.cantidad,
      hoyAcum: h.acumulado,
      esProyeccion: h.es_proyeccion,
      ayer: ayer[idx]?.cantidad || 0,
      ayerAcum: ayer[idx]?.acumulado || 0,
      semanaPasada: semana_pasada[idx]?.cantidad || 0,
      semanaPasadaAcum: semana_pasada[idx]?.acumulado || 0,
      promedio: promedio_historico[idx]?.cantidad || 0,
      promedioAcum: promedio_historico[idx]?.acumulado || 0,
    }));
  };

  const chartData = prepararDatosGrafico();

  // Custom tooltip para el grafico
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const esProyeccion = payload[0]?.payload?.esProyeccion;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">
            {label} {esProyeccion && <span className="text-xs text-orange-500">(proyectado)</span>}
          </p>
          {payload.map((entry: any, idx: number) => (
            <p key={idx} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatNumber(entry.value, 1)} uds
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        {/* Modal - mas grande para graficos */}
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className={`px-6 py-4 ${getTipoEmergenciaColor(emergencia.tipo_emergencia)} border-b sticky top-0 z-10`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className={`w-4 h-4 rounded-full ${getTipoEmergenciaDot(emergencia.tipo_emergencia)}`}></span>
                <div>
                  <h3 className="text-lg font-semibold">Emergencia: {emergencia.tipo_emergencia}</h3>
                  <p className="text-sm opacity-80">{emergencia.nombre_tienda}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            {/* Producto Info */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Producto</h4>
              <p className="text-lg font-semibold text-gray-900">{emergencia.nombre_producto}</p>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-sm text-gray-500">{emergencia.producto_id}</span>
                {emergencia.clase_abc && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getClaseABCColor(emergencia.clase_abc)}`}>
                    Clase {emergencia.clase_abc}
                  </span>
                )}
                {emergencia.categoria && (
                  <span className="text-sm text-gray-500">| {emergencia.categoria}</span>
                )}
              </div>
            </div>

            {/* Metricas principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Stock Actual</div>
                <div className={`text-xl font-bold ${stockActual <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatNumber(stockActual)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Demanda Restante</div>
                <div className="text-xl font-bold text-gray-900">{formatNumber(demandaRestante, 1)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Cobertura</div>
                <div className={`text-xl font-bold ${cobertura <= 0.25 ? 'text-red-600' : cobertura <= 0.5 ? 'text-yellow-600' : 'text-gray-900'}`}>
                  {formatPercent(cobertura)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Factor Intensidad</div>
                <div className={`text-xl font-bold ${factorIntensidad > 1.2 ? 'text-red-600' : factorIntensidad < 0.8 ? 'text-blue-600' : 'text-gray-900'}`}>
                  {factorIntensidad.toFixed(2)}x
                </div>
              </div>
            </div>

            {/* Comparativos de ventas */}
            {detalle && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="text-xs text-blue-600">Ventas Hoy</div>
                  <div className="text-lg font-bold text-blue-700">{formatNumber(detalle.ventas_hoy)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Ventas Ayer</div>
                  <div className="text-lg font-bold text-gray-700">{formatNumber(detalle.ventas_ayer)}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <div className="text-xs text-purple-600">Mismo Dia Sem. Pasada</div>
                  <div className="text-lg font-bold text-purple-700">{formatNumber(detalle.ventas_semana_pasada)}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                  <div className="text-xs text-green-600">Prom. 30 Dias</div>
                  <div className="text-lg font-bold text-green-700">{formatNumber(detalle.promedio_30_dias, 1)}</div>
                </div>
              </div>
            )}

            {/* Proyeccion y hora agotamiento */}
            {detalle && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-orange-600 font-medium">Proyeccion Venta Hoy</div>
                      <div className="text-2xl font-bold text-orange-700">{formatNumber(detalle.proyeccion_venta_dia, 1)}</div>
                      <div className="text-xs text-orange-500">unidades estimadas al cierre</div>
                    </div>
                    <svg className="h-10 w-10 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <div className={`rounded-lg p-4 border ${detalle.hora_agotamiento_estimada ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-xs font-medium ${detalle.hora_agotamiento_estimada ? 'text-red-600' : 'text-green-600'}`}>
                        Hora Agotamiento Estimada
                      </div>
                      <div className={`text-2xl font-bold ${detalle.hora_agotamiento_estimada ? 'text-red-700' : 'text-green-700'}`}>
                        {detalle.hora_agotamiento_estimada ? `${detalle.hora_agotamiento_estimada}:00` : 'No aplica'}
                      </div>
                      <div className={`text-xs ${detalle.hora_agotamiento_estimada ? 'text-red-500' : 'text-green-500'}`}>
                        {detalle.hora_agotamiento_estimada ? 'Se agotara antes de este horario' : 'Stock suficiente para el dia'}
                      </div>
                    </div>
                    <svg className={`h-10 w-10 ${detalle.hora_agotamiento_estimada ? 'text-red-300' : 'text-green-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Grafico de ventas por hora */}
            {loading ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center mb-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Cargando datos de comparativo...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : chartData.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h5 className="text-sm font-medium text-gray-700 mb-4">Ventas Acumuladas por Hora</h5>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {/* Area sombreada para promedio */}
                      <Area
                        type="monotone"
                        dataKey="promedioAcum"
                        name="Promedio 30d"
                        fill="#d1fae5"
                        stroke="#10b981"
                        strokeWidth={1}
                        fillOpacity={0.3}
                      />
                      {/* Linea de hoy (con proyeccion) */}
                      <Line
                        type="monotone"
                        dataKey="hoyAcum"
                        name="Hoy"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      {/* Linea de ayer */}
                      <Line
                        type="monotone"
                        dataKey="ayerAcum"
                        name="Ayer"
                        stroke="#6b7280"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        dot={false}
                      />
                      {/* Linea de semana pasada */}
                      <Line
                        type="monotone"
                        dataKey="semanaPasadaAcum"
                        name="Sem. Pasada"
                        stroke="#8b5cf6"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                      {/* Linea de hora actual */}
                      {detalle && (
                        <ReferenceLine
                          x={`${detalle.hora_actual}:00`}
                          stroke="#ef4444"
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          label={{ value: 'Ahora', fill: '#ef4444', fontSize: 10 }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  La linea azul despues de la hora actual es proyeccion basada en el factor de intensidad del dia
                </p>
              </div>
            )}

            {/* Grafico de ventas por hora (barras) */}
            {!loading && !error && chartData.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h5 className="text-sm font-medium text-gray-700 mb-4">Comparativo por Hora (Ventas)</h5>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="hoy" name="Hoy" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="ayer" name="Ayer" stroke="#6b7280" strokeWidth={1} dot={false} />
                      <Line type="monotone" dataKey="semanaPasada" name="Sem. Pasada" stroke="#8b5cf6" strokeWidth={1} dot={false} />
                      <Line type="monotone" dataKey="promedio" name="Promedio" stroke="#10b981" strokeWidth={1} dot={false} />
                      {detalle && (
                        <ReferenceLine
                          x={`${detalle.hora_actual}:00`}
                          stroke="#ef4444"
                          strokeDasharray="3 3"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Explicaciones */}
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                <h5 className="text-sm font-medium text-red-800 mb-1">Por que es una emergencia?</h5>
                <p className="text-sm text-red-700">{getCoberturaExplicacion()}</p>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h5 className="text-sm font-medium text-blue-800 mb-1">Intensidad del dia</h5>
                <p className="text-sm text-blue-700">{getFactorExplicacion()}</p>
              </div>

              <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                <h5 className="text-sm font-medium text-green-800 mb-1">Recomendacion</h5>
                <p className="text-sm text-green-700">{getRecomendacion()}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 sticky bottom-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
