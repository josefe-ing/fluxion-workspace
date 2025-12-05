/**
 * Panel de Configuración de Parámetros ABC
 *
 * Centraliza todos los parámetros configurables del modelo de inventario:
 * - Parámetros Globales (Lead Time, Ventana σD, etc.)
 * - Niveles de Servicio por clase ABC
 * - Días de Cobertura Máximo por clase
 * - Configuración por Tienda (override)
 */

import { useState, useEffect } from 'react';
import http from '../../services/http';
import { Settings, Store, TrendingUp, Shield, Package, Info, Save, RefreshCw } from 'lucide-react';

// Tipos
interface ParametrosGlobales {
  lead_time: number;
  ventana_sigma_d: number;
}

interface NivelServicioClase {
  clase: string;
  z_score: number;
  nivel_servicio_pct: number;
  dias_cobertura_max: number;
  metodo: 'estadistico' | 'padre_prudente';
}

interface ConfigTienda {
  tienda_id: string;
  tienda_nombre: string;
  lead_time_override: number | null;
  dias_cobertura_a: number | null;
  dias_cobertura_b: number | null;
  dias_cobertura_c: number | null;
  activo: boolean;
}

interface Tienda {
  id: string;
  nombre: string;
}

type TabType = 'global' | 'niveles' | 'tiendas';

// Valores por defecto (los mismos del backend)
const DEFAULTS = {
  lead_time: 1.5,
  ventana_sigma_d: 30,
  clases: [
    { clase: 'A', z_score: 2.33, nivel_servicio_pct: 99, dias_cobertura_max: 7, metodo: 'estadistico' as const },
    { clase: 'B', z_score: 1.88, nivel_servicio_pct: 97, dias_cobertura_max: 14, metodo: 'estadistico' as const },
    { clase: 'C', z_score: 0, nivel_servicio_pct: 0, dias_cobertura_max: 30, metodo: 'padre_prudente' as const },
  ]
};

// Tabla de conversión: Nivel de Servicio (%) -> Z-score
// Basado en la distribución normal estándar (cola derecha)
const NIVEL_SERVICIO_TO_ZSCORE: { [key: number]: number } = {
  99.9: 3.09,
  99.5: 2.58,
  99: 2.33,
  98: 2.05,
  97: 1.88,
  96: 1.75,
  95: 1.65,
  94: 1.55,
  93: 1.48,
  92: 1.41,
  91: 1.34,
  90: 1.28,
  85: 1.04,
  80: 0.84,
  75: 0.67,
  70: 0.52,
};

// Función para obtener Z-score desde nivel de servicio
const getZscoreFromNivelServicio = (nivelPct: number): number => {
  // Buscar el valor exacto o el más cercano
  if (NIVEL_SERVICIO_TO_ZSCORE[nivelPct] !== undefined) {
    return NIVEL_SERVICIO_TO_ZSCORE[nivelPct];
  }

  // Interpolación lineal para valores intermedios
  const niveles = Object.keys(NIVEL_SERVICIO_TO_ZSCORE)
    .map(Number)
    .sort((a, b) => b - a);

  for (let i = 0; i < niveles.length - 1; i++) {
    if (nivelPct <= niveles[i] && nivelPct >= niveles[i + 1]) {
      const n1 = niveles[i];
      const n2 = niveles[i + 1];
      const z1 = NIVEL_SERVICIO_TO_ZSCORE[n1];
      const z2 = NIVEL_SERVICIO_TO_ZSCORE[n2];
      // Interpolación lineal
      return z1 + (z2 - z1) * (nivelPct - n1) / (n2 - n1);
    }
  }

  // Si está fuera de rango, usar el límite más cercano
  if (nivelPct > 99.9) return 3.09;
  if (nivelPct < 70) return 0.52;

  return 1.65; // Default 95%
};

// Opciones predefinidas de nivel de servicio
const NIVELES_SERVICIO_OPTIONS = [
  { value: 99, label: '99%', description: 'Muy alto - Productos críticos' },
  { value: 97, label: '97%', description: 'Alto - Productos importantes' },
  { value: 95, label: '95%', description: 'Estándar - Mayoría de productos' },
  { value: 90, label: '90%', description: 'Moderado - Productos de baja rotación' },
  { value: 85, label: '85%', description: 'Bajo - Productos de muy baja demanda' },
];

export default function ConfiguracionABC() {
  const [activeTab, setActiveTab] = useState<TabType>('global');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estado de configuración
  const [parametrosGlobales, setParametrosGlobales] = useState<ParametrosGlobales>({
    lead_time: DEFAULTS.lead_time,
    ventana_sigma_d: DEFAULTS.ventana_sigma_d,
  });
  const [nivelesServicio, setNivelesServicio] = useState<NivelServicioClase[]>(DEFAULTS.clases);
  const [configTiendas, setConfigTiendas] = useState<ConfigTienda[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);

  // Cargar datos al montar
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar configuración actual
      const [configResponse, tiendasResponse] = await Promise.all([
        http.get('/api/config-inventario/parametros-abc'),
        http.get('/api/ubicaciones'),
      ]);

      if (configResponse.data) {
        const data = configResponse.data;

        // Parámetros globales
        if (data.globales) {
          setParametrosGlobales({
            lead_time: data.globales.lead_time ?? DEFAULTS.lead_time,
            ventana_sigma_d: data.globales.ventana_sigma_d ?? DEFAULTS.ventana_sigma_d,
          });
        }

        // Niveles de servicio
        if (data.niveles_servicio && data.niveles_servicio.length > 0) {
          setNivelesServicio(data.niveles_servicio);
        }

        // Config por tienda
        if (data.config_tiendas) {
          setConfigTiendas(data.config_tiendas);
        }
      }

      // Lista de tiendas
      if (tiendasResponse.data) {
        setTiendas(tiendasResponse.data.map((t: { codigo: string; nombre: string }) => ({
          id: t.codigo,
          nombre: t.nombre,
        })));
      }

    } catch (err) {
      console.error('Error cargando configuración:', err);
      setError('Error al cargar la configuración. Usando valores por defecto.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobales = async () => {
    try {
      setSaving(true);
      setError(null);

      await http.put('/api/config-inventario/parametros-abc/globales', parametrosGlobales);

      setSuccessMessage('Parámetros globales guardados correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error guardando:', err);
      setError('Error al guardar los parámetros globales');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNiveles = async () => {
    try {
      setSaving(true);
      setError(null);

      await http.put('/api/config-inventario/parametros-abc/niveles', { niveles: nivelesServicio });

      setSuccessMessage('Niveles de servicio guardados correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error guardando:', err);
      setError('Error al guardar los niveles de servicio');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfigTienda = async (config: ConfigTienda) => {
    try {
      setSaving(true);
      setError(null);

      await http.put(`/api/config-inventario/parametros-abc/tienda/${config.tienda_id}`, config);

      setSuccessMessage(`Configuración de ${config.tienda_nombre} guardada`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Recargar datos
      await loadData();
    } catch (err) {
      console.error('Error guardando:', err);
      setError('Error al guardar la configuración de tienda');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTiendaConfig = (tiendaId: string) => {
    const tienda = tiendas.find(t => t.id === tiendaId);
    if (!tienda) return;

    // Verificar que no exista ya
    if (configTiendas.some(c => c.tienda_id === tiendaId)) {
      setError('Esta tienda ya tiene configuración personalizada');
      return;
    }

    const nuevaConfig: ConfigTienda = {
      tienda_id: tiendaId,
      tienda_nombre: tienda.nombre,
      lead_time_override: null,
      dias_cobertura_a: null,
      dias_cobertura_b: null,
      dias_cobertura_c: null,
      activo: true,
    };

    setConfigTiendas([...configTiendas, nuevaConfig]);
  };

  const handleUpdateNivel = (index: number, field: keyof NivelServicioClase, value: number | string) => {
    const updated = [...nivelesServicio];

    // Si cambia el nivel de servicio, calcular automáticamente el Z-score
    if (field === 'nivel_servicio_pct') {
      const nivelPct = typeof value === 'number' ? value : parseInt(String(value)) || 0;
      const zScore = getZscoreFromNivelServicio(nivelPct);
      updated[index] = {
        ...updated[index],
        nivel_servicio_pct: nivelPct,
        z_score: Math.round(zScore * 100) / 100, // Redondear a 2 decimales
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    setNivelesServicio(updated);
  };

  const handleUpdateConfigTienda = (tiendaId: string, field: keyof ConfigTienda, value: number | null | boolean) => {
    setConfigTiendas(prev => prev.map(c =>
      c.tienda_id === tiendaId ? { ...c, [field]: value } : c
    ));
  };

  const tabs = [
    { id: 'global' as TabType, label: 'Parámetros Globales', icon: Settings },
    { id: 'niveles' as TabType, label: 'Niveles de Servicio', icon: TrendingUp },
    { id: 'tiendas' as TabType, label: 'Por Tienda', icon: Store },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-gray-600">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Package className="text-blue-600" />
          Parámetros del Modelo ABC
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configura los parámetros del cálculo de inventario: niveles de servicio, días de cobertura y configuración por tienda
        </p>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <span className="text-red-500">⚠️</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <span className="text-green-500">✓</span>
          <p className="text-sm text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* TAB: Parámetros Globales */}
        {activeTab === 'global' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-700">
                    <strong>Parámetros Globales:</strong> Estos valores se aplican a todos los cálculos de inventario.
                    Las tiendas pueden sobrescribir algunos valores en la pestaña "Por Tienda".
                  </p>
                </div>
              </div>
            </div>

            {/* Formulario */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Settings size={20} />
                  Parámetros Operativos
                </h3>
              </div>
              <div className="p-6 space-y-6">
                {/* Lead Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lead Time (días)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="10"
                      value={parametrosGlobales.lead_time}
                      onChange={(e) => setParametrosGlobales(prev => ({
                        ...prev,
                        lead_time: parseFloat(e.target.value) || DEFAULTS.lead_time
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Tiempo entre que se hace el pedido y llega a la tienda. Default: 1.5 días
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ventana σD (días)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="7"
                      max="90"
                      value={parametrosGlobales.ventana_sigma_d}
                      onChange={(e) => setParametrosGlobales(prev => ({
                        ...prev,
                        ventana_sigma_d: parseInt(e.target.value) || DEFAULTS.ventana_sigma_d
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Días para calcular la desviación estándar de demanda (σD). Default: 30 días
                    </p>
                  </div>
                </div>

                {/* Botón Guardar */}
                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSaveGlobales}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Save size={18} />
                    {saving ? 'Guardando...' : 'Guardar Parámetros'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Niveles de Servicio */}
        {activeTab === 'niveles' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="text-sm text-purple-700">
                    <strong>Niveles de Servicio:</strong> Define qué porcentaje de demanda quieres poder satisfacer.
                    Mayor nivel = más stock de seguridad = menos roturas de stock.
                  </p>
                </div>
              </div>
            </div>

            {/* Tabla de Niveles */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp size={20} />
                  Configuración por Clase ABC
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clase</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nivel Servicio</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Z-Score</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Días Cobertura Max</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Método</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {nivelesServicio.map((nivel, index) => (
                      <tr key={nivel.clase} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            nivel.clase === 'A' ? 'bg-green-100 text-green-800' :
                            nivel.clase === 'B' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            Clase {nivel.clase}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {nivel.metodo === 'estadistico' ? (
                            <select
                              value={nivel.nivel_servicio_pct}
                              onChange={(e) => handleUpdateNivel(index, 'nivel_servicio_pct', parseInt(e.target.value))}
                              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                            >
                              {NIVELES_SERVICIO_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label} - {opt.description}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-400 italic">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-mono text-sm px-2 py-1 rounded ${
                            nivel.metodo === 'padre_prudente'
                              ? 'bg-gray-100 text-gray-400'
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {nivel.metodo === 'estadistico' ? nivel.z_score.toFixed(2) : 'N/A'}
                          </span>
                          {nivel.metodo === 'estadistico' && (
                            <p className="text-xs text-gray-400 mt-1">calculado</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="60"
                            value={nivel.dias_cobertura_max}
                            onChange={(e) => handleUpdateNivel(index, 'dias_cobertura_max', parseInt(e.target.value) || 7)}
                            className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            nivel.metodo === 'estadistico'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {nivel.metodo === 'estadistico' ? 'Estadístico' : 'Padre Prudente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  * Clase C usa método "Padre Prudente" (heurístico), no requiere nivel de servicio estadístico
                </p>
                <button
                  onClick={handleSaveNiveles}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={18} />
                  {saving ? 'Guardando...' : 'Guardar Niveles'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Por Tienda */}
        {activeTab === 'tiendas' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Store className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-700">
                    <strong>Configuración por Tienda:</strong> Sobrescribe los valores globales para tiendas específicas.
                    Deja en blanco para usar el valor global.
                  </p>
                </div>
              </div>
            </div>

            {/* Agregar Tienda */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Agregar configuración para tienda:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddTiendaConfig(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  defaultValue=""
                >
                  <option value="">Seleccionar tienda...</option>
                  {tiendas
                    .filter(t => !configTiendas.some(c => c.tienda_id === t.id))
                    .map(tienda => (
                      <option key={tienda.id} value={tienda.id}>
                        {tienda.nombre}
                      </option>
                    ))
                  }
                </select>
              </div>
            </div>

            {/* Lista de Tiendas Configuradas */}
            {configTiendas.length === 0 ? (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <Store className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No hay configuraciones personalizadas por tienda.</p>
                <p className="text-sm text-gray-500 mt-1">Todas las tiendas usan los valores globales.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {configTiendas.map((config) => (
                  <div key={config.tienda_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Store size={18} className="text-blue-600" />
                        {config.tienda_nombre}
                      </h4>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.activo}
                          onChange={(e) => handleUpdateConfigTienda(config.tienda_id, 'activo', e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-600">Activo</span>
                      </label>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Lead Time Override</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max="10"
                            value={config.lead_time_override ?? ''}
                            onChange={(e) => handleUpdateConfigTienda(
                              config.tienda_id,
                              'lead_time_override',
                              e.target.value ? parseFloat(e.target.value) : null
                            )}
                            placeholder={`Global: ${parametrosGlobales.lead_time}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Cobertura A</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            value={config.dias_cobertura_a ?? ''}
                            onChange={(e) => handleUpdateConfigTienda(
                              config.tienda_id,
                              'dias_cobertura_a',
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                            placeholder={`Global: ${nivelesServicio.find(n => n.clase === 'A')?.dias_cobertura_max || 7}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Cobertura B</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            value={config.dias_cobertura_b ?? ''}
                            onChange={(e) => handleUpdateConfigTienda(
                              config.tienda_id,
                              'dias_cobertura_b',
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                            placeholder={`Global: ${nivelesServicio.find(n => n.clase === 'B')?.dias_cobertura_max || 14}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Cobertura C</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="60"
                            value={config.dias_cobertura_c ?? ''}
                            onChange={(e) => handleUpdateConfigTienda(
                              config.tienda_id,
                              'dias_cobertura_c',
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                            placeholder={`Global: ${nivelesServicio.find(n => n.clase === 'C')?.dias_cobertura_max || 30}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => handleSaveConfigTienda(config)}
                          disabled={saving}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          <Save size={14} />
                          Guardar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
