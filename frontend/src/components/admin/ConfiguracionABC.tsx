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
import { Settings, Store, TrendingUp, Shield, Package, Info, Save, RefreshCw, Leaf, Plus, Trash2, Warehouse, Search } from 'lucide-react';

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
  dias_cobertura_d: number | null;
  activo: boolean;
}

interface UmbralesABC {
  umbral_a: number;
  umbral_b: number;
  umbral_c: number;
}

interface Tienda {
  id: string;
  nombre: string;
}

interface CoberturaCategoria {
  id: string;
  categoria: string;
  categoria_normalizada: string;
  dias_cobertura_a: number;
  dias_cobertura_b: number;
  dias_cobertura_c: number;
  dias_cobertura_d: number;
  es_perecedero: boolean;
  descripcion: string;
  activo: boolean;
}

interface CapacidadAlmacenamiento {
  id: string;
  tienda_id: string;
  producto_codigo: string;
  capacidad_maxima_unidades: number | null;
  minimo_exhibicion_unidades: number | null;
  tipo_restriccion: string;
  notas: string | null;
  activo: boolean;
  tienda_nombre?: string;
  producto_descripcion?: string;
}

interface ProductoBusqueda {
  codigo: string;
  descripcion: string;
  categoria: string;
}

type TabType = 'global' | 'umbrales' | 'niveles' | 'tiendas' | 'categorias' | 'capacidad';

// Valores por defecto (los mismos del backend)
const DEFAULTS = {
  lead_time: 1.5,
  ventana_sigma_d: 30,
  clases: [
    { clase: 'A', z_score: 2.33, nivel_servicio_pct: 99, dias_cobertura_max: 7, metodo: 'estadistico' as const },
    { clase: 'B', z_score: 1.88, nivel_servicio_pct: 97, dias_cobertura_max: 14, metodo: 'estadistico' as const },
    { clase: 'C', z_score: 1.28, nivel_servicio_pct: 90, dias_cobertura_max: 21, metodo: 'estadistico' as const },
    { clase: 'D', z_score: 0, nivel_servicio_pct: 0, dias_cobertura_max: 30, metodo: 'padre_prudente' as const },
  ],
  umbrales: {
    umbral_a: 50,
    umbral_b: 200,
    umbral_c: 800,
  }
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
  const [umbrales, setUmbrales] = useState<UmbralesABC>(DEFAULTS.umbrales);
  const [configTiendas, setConfigTiendas] = useState<ConfigTienda[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [coberturaCategorias, setCoberturaCategorias] = useState<CoberturaCategoria[]>([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<{ categoria: string; categoria_normalizada: string; productos: number }[]>([]);
  const [nuevaCategoria, setNuevaCategoria] = useState<string>('');

  // Estado para capacidad de almacenamiento
  const [capacidadesAlmacenamiento, setCapacidadesAlmacenamiento] = useState<CapacidadAlmacenamiento[]>([]);
  const [capacidadTiendaSeleccionada, setCapacidadTiendaSeleccionada] = useState<string>('');
  const [capacidadBusquedaProducto, setCapacidadBusquedaProducto] = useState<string>('');
  const [productosEncontrados, setProductosEncontrados] = useState<ProductoBusqueda[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoBusqueda | null>(null);
  const [nuevaCapacidad, setNuevaCapacidad] = useState({
    capacidad_maxima_unidades: null as number | null,
    minimo_exhibicion_unidades: null as number | null,
    tipo_restriccion: 'congelador',
    notas: ''
  });
  const [buscandoProductos, setBuscandoProductos] = useState(false);

  // Cargar datos al montar
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar configuración actual
      const [configResponse, tiendasResponse, categoriasResponse, categoriasDispResponse, capacidadesResponse] = await Promise.all([
        http.get('/api/config-inventario/parametros-abc'),
        http.get('/api/ubicaciones'),
        http.get('/api/config-inventario/cobertura-categoria'),
        http.get('/api/config-inventario/categorias-disponibles'),
        http.get('/api/config-inventario/capacidad-almacenamiento').catch(() => ({ data: [] })),
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

        // Umbrales de ranking
        if (data.umbrales) {
          setUmbrales({
            umbral_a: data.umbrales.umbral_a ?? DEFAULTS.umbrales.umbral_a,
            umbral_b: data.umbrales.umbral_b ?? DEFAULTS.umbrales.umbral_b,
            umbral_c: data.umbrales.umbral_c ?? DEFAULTS.umbrales.umbral_c,
          });
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

      // Cobertura por categoría
      if (categoriasResponse.data) {
        setCoberturaCategorias(categoriasResponse.data);
      }

      // Categorías disponibles
      if (categoriasDispResponse.data) {
        setCategoriasDisponibles(categoriasDispResponse.data);
      }

      // Capacidades de almacenamiento
      if (capacidadesResponse.data) {
        setCapacidadesAlmacenamiento(capacidadesResponse.data);
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

  const handleSaveUmbrales = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validar umbrales: A < B < C
      if (umbrales.umbral_a >= umbrales.umbral_b || umbrales.umbral_b >= umbrales.umbral_c) {
        setError('Los umbrales deben ser secuenciales: A < B < C');
        return;
      }

      await http.put('/api/config-inventario/parametros-abc/umbrales', umbrales);

      setSuccessMessage('Umbrales de clasificación guardados correctamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error guardando:', err);
      setError('Error al guardar los umbrales');
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
      dias_cobertura_d: null,
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

  // Handlers para cobertura por categoría
  const handleAddCategoria = async () => {
    if (!nuevaCategoria) {
      setError('Selecciona una categoría');
      return;
    }

    // Verificar que no exista ya
    if (coberturaCategorias.some(c => c.categoria_normalizada === nuevaCategoria.toUpperCase())) {
      setError('Esta categoría ya tiene configuración personalizada');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await http.post('/api/config-inventario/cobertura-categoria', {
        categoria: nuevaCategoria,
        dias_cobertura_a: 7,
        dias_cobertura_b: 14,
        dias_cobertura_c: 21,
        dias_cobertura_d: 30,
        es_perecedero: false,
        descripcion: '',
      });

      setSuccessMessage(`Categoría ${nuevaCategoria} agregada`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setNuevaCategoria('');
      await loadData();
    } catch (err) {
      console.error('Error agregando categoría:', err);
      setError('Error al agregar la categoría');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCategoria = (categoriaId: string, field: keyof CoberturaCategoria, value: number | boolean | string) => {
    setCoberturaCategorias(prev => prev.map(c =>
      c.id === categoriaId ? { ...c, [field]: value } : c
    ));
  };

  const handleSaveCategoria = async (config: CoberturaCategoria) => {
    try {
      setSaving(true);
      setError(null);

      await http.put(`/api/config-inventario/cobertura-categoria/${config.id}`, {
        categoria: config.categoria,
        dias_cobertura_a: config.dias_cobertura_a,
        dias_cobertura_b: config.dias_cobertura_b,
        dias_cobertura_c: config.dias_cobertura_c,
        dias_cobertura_d: config.dias_cobertura_d,
        es_perecedero: config.es_perecedero,
        descripcion: config.descripcion,
      });

      setSuccessMessage(`Configuración de ${config.categoria} guardada`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error guardando:', err);
      setError('Error al guardar la configuración de categoría');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategoria = async (config: CoberturaCategoria) => {
    if (!confirm(`¿Eliminar configuración de ${config.categoria}?`)) return;

    try {
      setSaving(true);
      setError(null);

      await http.delete(`/api/config-inventario/cobertura-categoria/${config.id}`);

      setSuccessMessage(`Configuración de ${config.categoria} eliminada`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadData();
    } catch (err) {
      console.error('Error eliminando:', err);
      setError('Error al eliminar la configuración');
    } finally {
      setSaving(false);
    }
  };

  // =====================================================================================
  // FUNCIONES PARA CAPACIDAD DE ALMACENAMIENTO
  // =====================================================================================

  const buscarProductos = async (termino: string) => {
    if (termino.length < 2) {
      setProductosEncontrados([]);
      return;
    }

    try {
      setBuscandoProductos(true);
      const response = await http.get(`/api/config-inventario/productos/buscar?q=${encodeURIComponent(termino)}&limite=10`);
      if (response.data) {
        setProductosEncontrados(response.data.map((p: { codigo: string; descripcion: string; categoria: string }) => ({
          codigo: p.codigo,
          descripcion: p.descripcion,
          categoria: p.categoria
        })));
      }
    } catch (err) {
      console.error('Error buscando productos:', err);
      setProductosEncontrados([]);
    } finally {
      setBuscandoProductos(false);
    }
  };

  const handleCrearCapacidad = async () => {
    // Validar que al menos uno de los límites esté configurado
    const tieneCapacidadMaxima = nuevaCapacidad.capacidad_maxima_unidades !== null && nuevaCapacidad.capacidad_maxima_unidades > 0;
    const tieneMinimoExhibicion = nuevaCapacidad.minimo_exhibicion_unidades !== null && nuevaCapacidad.minimo_exhibicion_unidades > 0;

    if (!capacidadTiendaSeleccionada || !productoSeleccionado || (!tieneCapacidadMaxima && !tieneMinimoExhibicion)) {
      setError('Selecciona una tienda, un producto, y configura al menos una capacidad máxima o mínimo de exhibición');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await http.post('/api/config-inventario/capacidad-almacenamiento', {
        tienda_id: capacidadTiendaSeleccionada,
        producto_codigo: productoSeleccionado.codigo,
        capacidad_maxima_unidades: tieneCapacidadMaxima ? nuevaCapacidad.capacidad_maxima_unidades : null,
        minimo_exhibicion_unidades: tieneMinimoExhibicion ? nuevaCapacidad.minimo_exhibicion_unidades : null,
        tipo_restriccion: nuevaCapacidad.tipo_restriccion,
        notas: nuevaCapacidad.notas || null
      });

      setSuccessMessage(`Límites configurados para ${productoSeleccionado.descripcion}`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Limpiar formulario
      setProductoSeleccionado(null);
      setCapacidadBusquedaProducto('');
      setProductosEncontrados([]);
      setNuevaCapacidad({ capacidad_maxima_unidades: null, minimo_exhibicion_unidades: null, tipo_restriccion: 'congelador', notas: '' });

      await loadData();
    } catch (err) {
      console.error('Error creando capacidad:', err);
      setError('Error al crear la configuración de límites');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCapacidad = async (config: CapacidadAlmacenamiento) => {
    if (!confirm(`¿Eliminar límite de capacidad para ${config.producto_descripcion || config.producto_codigo}?`)) return;

    try {
      setSaving(true);
      setError(null);

      await http.delete(`/api/config-inventario/capacidad-almacenamiento/${config.id}`);

      setSuccessMessage('Configuración de capacidad eliminada');
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadData();
    } catch (err) {
      console.error('Error eliminando capacidad:', err);
      setError('Error al eliminar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const TIPOS_RESTRICCION = [
    { value: 'congelador', label: 'Congelador', emoji: '❄️' },
    { value: 'refrigerador', label: 'Refrigerador', emoji: '🧊' },
    { value: 'anaquel', label: 'Anaquel/Estante', emoji: '📦' },
    { value: 'piso', label: 'Piso/Paletas', emoji: '🏗️' },
    { value: 'exhibidor', label: 'Exhibidor', emoji: '🪟' },
    { value: 'espacio_fisico', label: 'Espacio Físico', emoji: '📐' },
  ];

  const tabs = [
    { id: 'global' as TabType, label: 'Parámetros Globales', icon: Settings },
    { id: 'umbrales' as TabType, label: 'Umbrales ABC', icon: Package },
    { id: 'niveles' as TabType, label: 'Niveles de Servicio', icon: TrendingUp },
    { id: 'tiendas' as TabType, label: 'Por Tienda', icon: Store },
    { id: 'categorias' as TabType, label: 'Por Categoría', icon: Leaf },
    { id: 'capacidad' as TabType, label: 'Límites Inventario', icon: Warehouse },
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

        {/* TAB: Umbrales ABC */}
        {activeTab === 'umbrales' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Package className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div>
                  <p className="text-sm text-indigo-700">
                    <strong>Umbrales de Clasificación ABC:</strong> Define los rangos de ranking por cantidad vendida
                    para clasificar los productos. Los productos se ordenan por unidades vendidas en 30 días.
                  </p>
                </div>
              </div>
            </div>

            {/* Umbrales */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Package size={20} />
                  Ranking por Cantidad Vendida
                </h3>
              </div>
              <div className="p-6 space-y-6">
                {/* Diagrama visual */}
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-700">A</div>
                    <div className="text-sm text-green-600 mt-1">Top 1 - {umbrales.umbral_a}</div>
                    <div className="text-xs text-green-500 mt-1">Más vendidos</div>
                  </div>
                  <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-700">B</div>
                    <div className="text-sm text-yellow-600 mt-1">{umbrales.umbral_a + 1} - {umbrales.umbral_b}</div>
                    <div className="text-xs text-yellow-500 mt-1">Venta media</div>
                  </div>
                  <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                    <div className="text-2xl font-bold text-orange-700">C</div>
                    <div className="text-sm text-orange-600 mt-1">{umbrales.umbral_b + 1} - {umbrales.umbral_c}</div>
                    <div className="text-xs text-orange-500 mt-1">Venta baja</div>
                  </div>
                  <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-700">D</div>
                    <div className="text-sm text-purple-600 mt-1">{umbrales.umbral_c + 1}+</div>
                    <div className="text-xs text-purple-500 mt-1">Cola larga</div>
                  </div>
                </div>

                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Umbral Clase A (Top N)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="10"
                      max="500"
                      value={umbrales.umbral_a}
                      onChange={(e) => setUmbrales(prev => ({
                        ...prev,
                        umbral_a: parseInt(e.target.value) || DEFAULTS.umbrales.umbral_a
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Productos del ranking 1 al N serán clase A. Default: 50
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Umbral Clase B (Top N)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="50"
                      max="1000"
                      value={umbrales.umbral_b}
                      onChange={(e) => setUmbrales(prev => ({
                        ...prev,
                        umbral_b: parseInt(e.target.value) || DEFAULTS.umbrales.umbral_b
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Productos del ranking {umbrales.umbral_a + 1} al N serán clase B. Default: 200
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Umbral Clase C (Top N)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="100"
                      max="2000"
                      value={umbrales.umbral_c}
                      onChange={(e) => setUmbrales(prev => ({
                        ...prev,
                        umbral_c: parseInt(e.target.value) || DEFAULTS.umbrales.umbral_c
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Productos del ranking {umbrales.umbral_b + 1} al N serán clase C. Default: 800
                    </p>
                  </div>
                </div>

                {/* Nota */}
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                  <strong>Nota:</strong> Los productos con ranking mayor a {umbrales.umbral_c} serán clasificados como <strong>Clase D</strong> (cola larga).
                  Estos productos usarán el método "Padre Prudente" para el cálculo de inventario sugerido.
                </div>

                {/* Botón Guardar */}
                <div className="flex justify-end pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSaveUmbrales}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Save size={18} />
                    {saving ? 'Guardando...' : 'Guardar Umbrales'}
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
                            nivel.clase === 'C' ? 'bg-orange-100 text-orange-800' :
                            'bg-purple-100 text-purple-800'
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
                  * Clase D usa método "Padre Prudente" (heurístico), no requiere nivel de servicio estadístico
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
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                            placeholder={`Global: ${nivelesServicio.find(n => n.clase === 'C')?.dias_cobertura_max || 21}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Cobertura D</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="90"
                            value={config.dias_cobertura_d ?? ''}
                            onChange={(e) => handleUpdateConfigTienda(
                              config.tienda_id,
                              'dias_cobertura_d',
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                            placeholder={`Global: ${nivelesServicio.find(n => n.clase === 'D')?.dias_cobertura_max || 30}`}
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

        {/* TAB: Por Categoría */}
        {activeTab === 'categorias' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Leaf className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm text-green-700">
                    <strong>Cobertura por Categoría:</strong> Define días de cobertura específicos para categorías de productos.
                    Útil para productos perecederos que requieren menor cobertura (FRUVER, Carnicería, etc.).
                  </p>
                </div>
              </div>
            </div>

            {/* Agregar Categoría */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Agregar configuración para categoría:</label>
                <select
                  value={nuevaCategoria}
                  onChange={(e) => setNuevaCategoria(e.target.value)}
                  className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar categoría...</option>
                  {categoriasDisponibles
                    .filter(cat => !coberturaCategorias.some(c => c.categoria_normalizada === cat.categoria_normalizada))
                    .map((cat, index) => (
                      <option key={`${cat.categoria_normalizada}-${index}`} value={cat.categoria}>
                        {cat.categoria} ({cat.productos} productos)
                      </option>
                    ))
                  }
                </select>
                <button
                  onClick={handleAddCategoria}
                  disabled={saving || !nuevaCategoria}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Plus size={18} />
                  Agregar
                </button>
              </div>
            </div>

            {/* Lista de Categorías Configuradas */}
            {coberturaCategorias.length === 0 ? (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <Leaf className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No hay configuraciones personalizadas por categoría.</p>
                <p className="text-sm text-gray-500 mt-1">Todas las categorías usan los días de cobertura globales por clase ABC.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {coberturaCategorias.map((config) => (
                  <div key={config.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                          <Leaf size={18} className={config.es_perecedero ? 'text-green-600' : 'text-gray-400'} />
                          {config.categoria}
                        </h4>
                        {config.es_perecedero && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                            Perecedero
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.activo}
                            onChange={(e) => handleUpdateCategoria(config.id, 'activo', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-600">Activo</span>
                        </label>
                        <button
                          onClick={() => handleDeleteCategoria(config)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Eliminar configuración"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Clase A</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            value={config.dias_cobertura_a}
                            onChange={(e) => handleUpdateCategoria(
                              config.id,
                              'dias_cobertura_a',
                              parseInt(e.target.value) || 7
                            )}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Clase B</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="30"
                            value={config.dias_cobertura_b}
                            onChange={(e) => handleUpdateCategoria(
                              config.id,
                              'dias_cobertura_b',
                              parseInt(e.target.value) || 14
                            )}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Clase C</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="60"
                            value={config.dias_cobertura_c}
                            onChange={(e) => handleUpdateCategoria(
                              config.id,
                              'dias_cobertura_c',
                              parseInt(e.target.value) || 21
                            )}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Días Clase D</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="90"
                            value={config.dias_cobertura_d}
                            onChange={(e) => handleUpdateCategoria(
                              config.id,
                              'dias_cobertura_d',
                              parseInt(e.target.value) || 30
                            )}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Perecedero</label>
                          <select
                            value={config.es_perecedero ? 'si' : 'no'}
                            onChange={(e) => handleUpdateCategoria(config.id, 'es_perecedero', e.target.value === 'si')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="no">No</option>
                            <option value="si">Sí</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => handleSaveCategoria(config)}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <Save size={14} />
                            Guardar
                          </button>
                        </div>
                      </div>
                      {/* Descripción */}
                      <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Descripción (opcional)</label>
                        <input
                          type="text"
                          value={config.descripcion || ''}
                          onChange={(e) => handleUpdateCategoria(config.id, 'descripcion', e.target.value)}
                          placeholder="Ej: Productos frescos con vida útil corta"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nota explicativa */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-600">
                    <li>Los días de cobertura por categoría tienen prioridad sobre los valores globales</li>
                    <li>Si un producto pertenece a FRUVER y tiene clase C, usará los días configurados aquí para FRUVER clase C</li>
                    <li>Las categorías no configuradas usarán los valores globales de la pestaña "Niveles de Servicio"</li>
                    <li>Marcar como "Perecedero" es solo informativo, no afecta el cálculo</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Capacidad de Almacenamiento */}
        {activeTab === 'capacidad' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Warehouse className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-700">
                    <strong>Límites de Inventario:</strong> Configura límites por producto y tienda para controlar las sugerencias de pedido.
                  </p>
                  <ul className="text-sm text-amber-600 mt-1 list-disc list-inside space-y-1">
                    <li><strong>Capacidad Máxima:</strong> Límite superior por espacio físico (congelador, anaquel). El sistema no sugerirá más de lo que cabe.</li>
                    <li><strong>Mínimo Exhibición:</strong> Cantidad mínima para que el producto se vea bien en el mostrador. El sistema elevará la sugerencia si es necesario.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Formulario para agregar nueva configuración */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Plus size={20} />
                Agregar Límite de Capacidad
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Selector de tienda */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tienda</label>
                  <select
                    value={capacidadTiendaSeleccionada}
                    onChange={(e) => setCapacidadTiendaSeleccionada(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar tienda...</option>
                    {tiendas.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Buscador de producto */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Producto</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={productoSeleccionado ? productoSeleccionado.descripcion : capacidadBusquedaProducto}
                      onChange={(e) => {
                        setCapacidadBusquedaProducto(e.target.value);
                        setProductoSeleccionado(null);
                        buscarProductos(e.target.value);
                      }}
                      placeholder="Buscar por código o nombre..."
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                  </div>
                  {/* Dropdown de resultados */}
                  {productosEncontrados.length > 0 && !productoSeleccionado && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {productosEncontrados.map((p) => (
                        <button
                          key={p.codigo}
                          onClick={() => {
                            setProductoSeleccionado(p);
                            setProductosEncontrados([]);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b last:border-b-0"
                        >
                          <span className="font-medium">{p.codigo}</span>
                          <span className="text-gray-500 ml-2">{p.descripcion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {buscandoProductos && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500">
                      Buscando...
                    </div>
                  )}
                </div>

                {/* Capacidad máxima */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacidad Máxima (unidades)
                    <span className="ml-1 text-xs text-gray-400 font-normal">opcional</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={nuevaCapacidad.capacidad_maxima_unidades ?? ''}
                    onChange={(e) => setNuevaCapacidad({ ...nuevaCapacidad, capacidad_maxima_unidades: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Ej: 200"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Límite superior (congelador, anaquel)</p>
                </div>

                {/* Mínimo de exhibición */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mínimo Exhibición (unidades)
                    <span className="ml-1 text-xs text-gray-400 font-normal">opcional</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={nuevaCapacidad.minimo_exhibicion_unidades ?? ''}
                    onChange={(e) => setNuevaCapacidad({ ...nuevaCapacidad, minimo_exhibicion_unidades: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Ej: 30"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Mínimo para que se vea bien</p>
                </div>

                {/* Tipo de restricción */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Restricción</label>
                  <select
                    value={nuevaCapacidad.tipo_restriccion}
                    onChange={(e) => setNuevaCapacidad({ ...nuevaCapacidad, tipo_restriccion: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    {TIPOS_RESTRICCION.map((t) => (
                      <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notas y botón guardar */}
              <div className="mt-4 flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                  <input
                    type="text"
                    value={nuevaCapacidad.notas}
                    onChange={(e) => setNuevaCapacidad({ ...nuevaCapacidad, notas: e.target.value })}
                    placeholder="Ej: 2 freezers de 100 unidades cada uno"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleCrearCapacidad}
                  disabled={saving || !capacidadTiendaSeleccionada || !productoSeleccionado ||
                    (!nuevaCapacidad.capacidad_maxima_unidades && !nuevaCapacidad.minimo_exhibicion_unidades)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                >
                  <Plus size={16} />
                  Agregar
                </button>
              </div>
            </div>

            {/* Lista de configuraciones existentes */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Límites Configurados ({capacidadesAlmacenamiento.length})
                </h3>
              </div>

              {capacidadesAlmacenamiento.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Warehouse className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No hay límites de capacidad configurados</p>
                  <p className="text-sm mt-1">Agrega un límite usando el formulario de arriba</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tienda</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cap. Máx.</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mín. Exhib.</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notas</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {capacidadesAlmacenamiento.map((cap) => {
                        const tipoInfo = TIPOS_RESTRICCION.find(t => t.value === cap.tipo_restriccion);
                        return (
                          <tr key={cap.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {cap.tienda_nombre || cap.tienda_id}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div>
                                <span className="font-mono text-xs text-gray-500">{cap.producto_codigo}</span>
                                <br />
                                <span>{cap.producto_descripcion || '-'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                              {cap.capacidad_maxima_unidades ? `${cap.capacidad_maxima_unidades.toLocaleString()} unid` : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                              {cap.minimo_exhibicion_unidades ? `${cap.minimo_exhibicion_unidades.toLocaleString()} unid` : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {tipoInfo ? `${tipoInfo.emoji} ${tipoInfo.label}` : cap.tipo_restriccion}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                              {cap.notas || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              <button
                                onClick={() => handleDeleteCapacidad(cap)}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Eliminar"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Nota explicativa */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">¿Cómo funcionan los límites?</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-600">
                    <li><strong>Capacidad Máxima:</strong> Si el sistema sugiere más unidades de las que caben, ajusta a la capacidad disponible</li>
                    <li><strong>Mínimo Exhibición:</strong> Si el producto necesita más stock para "verse bien", eleva la sugerencia al mínimo</li>
                    <li>Puedes configurar uno o ambos límites para cada producto</li>
                    <li>Se mostrará una advertencia en el pedido indicando qué límite se aplicó</li>
                    <li>Los productos sin configuración usarán el cálculo normal ABC</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
