import { useState, useEffect } from 'react';
import http from '../../services/http';

interface ConfigGlobalItem {
  id: string;
  categoria: string;
  parametro: string;
  valor_numerico: number | null;
  valor_texto: string | null;
  descripcion: string;
  unidad: string;
}

interface ConfigGlobalAgrupada {
  abc_umbrales: ConfigGlobalItem[];
  xyz_umbrales: ConfigGlobalItem[];
  niveles_servicio: ConfigGlobalItem[];
  ajustes_xyz: ConfigGlobalItem[];
}

export default function ConfiguracionGlobal() {
  const [config, setConfig] = useState<ConfigGlobalAgrupada>({
    abc_umbrales: [],
    xyz_umbrales: [],
    niveles_servicio: [],
    ajustes_xyz: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/config-inventario/global');

      // Agrupar por categoría
      const agrupada: ConfigGlobalAgrupada = {
        abc_umbrales: [],
        xyz_umbrales: [],
        niveles_servicio: [],
        ajustes_xyz: [],
      };

      response.data.forEach((item: ConfigGlobalItem) => {
        if (item.categoria in agrupada) {
          agrupada[item.categoria as keyof ConfigGlobalAgrupada].push(item);
        }
      });

      setConfig(agrupada);
    } catch (error) {
      console.error('Error cargando configuración global:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: ConfigGlobalItem) => {
    setEditingId(item.id);
    setEditValue(String(item.valor_numerico || item.valor_texto || ''));
  };

  const handleSave = async (item: ConfigGlobalItem) => {
    try {
      setSaving(true);
      await http.put(`/api/config-inventario/global/${item.id}`, {
        valor_numerico: item.unidad !== 'texto' ? parseFloat(editValue) : null,
        valor_texto: item.unidad === 'texto' ? editValue : null,
      });

      setEditingId(null);
      await loadConfig();
    } catch (error) {
      console.error('Error guardando configuración:', error);
      alert('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const renderSection = (title: string, icon: string, items: ConfigGlobalItem[]) => (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">
          <span className="mr-2">{icon}</span>
          {title}
        </h3>
      </div>
      <div className="divide-y divide-gray-200">
        {items.map((item) => (
          <div key={item.id} className="px-6 py-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-900">
                    {item.parametro.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {item.unidad && (
                    <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded">
                      {item.unidad}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{item.descripcion}</p>
              </div>
              <div className="flex items-center space-x-3">
                {editingId === item.id ? (
                  <>
                    <input
                      type={item.unidad === 'texto' ? 'text' : 'number'}
                      step={item.unidad === 'zscore' ? '0.01' : '0.1'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSave(item)}
                      disabled={saving}
                      className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-semibold text-gray-900">
                      {item.valor_numerico !== null ? item.valor_numerico : item.valor_texto}
                    </span>
                    <button
                      onClick={() => handleEdit(item)}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Editar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando configuración global...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-blue-700">
              <strong>Configuración Global:</strong> Estos parámetros se aplican a todo el sistema y sirven como valores por defecto cuando no existe configuración específica por tienda o producto.
            </p>
          </div>
        </div>
      </div>

      {/* Umbrales ABC */}
      {renderSection(
        'Umbrales de Clasificación ABC',
        '🔤',
        config.abc_umbrales
      )}

      {/* Umbrales XYZ */}
      {renderSection(
        'Umbrales de Clasificación XYZ',
        '📊',
        config.xyz_umbrales
      )}

      {/* Niveles de Servicio */}
      {renderSection(
        'Niveles de Servicio (Z-scores)',
        '🎯',
        config.niveles_servicio
      )}

      {/* Ajustes XYZ */}
      {renderSection(
        'Ajustes por Variabilidad XYZ',
        '⚙️',
        config.ajustes_xyz
      )}
    </div>
  );
}
