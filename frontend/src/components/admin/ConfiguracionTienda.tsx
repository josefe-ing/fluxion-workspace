import { useState, useEffect } from 'react';
import http from '../../services/http';

interface ConfigTienda {
  id: string;
  tienda_id: string;
  tienda_nombre?: string;
  categoria_producto: 'seco' | 'frio' | 'verde';
  clasificacion_abc: string;
  stock_min_multiplicador: number;
  stock_seg_multiplicador: number;
  stock_max_multiplicador: number;
  lead_time_dias: number;
}

interface Tienda {
  ubicacion_id: string;
  ubicacion_nombre: string;
}

export default function ConfiguracionTienda() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [selectedTienda, setSelectedTienda] = useState<string>('');
  const [selectedCategoria, setSelectedCategoria] = useState<'seco' | 'frio' | 'verde'>('seco');
  const [configs, setConfigs] = useState<ConfigTienda[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ConfigTienda>>({});

  useEffect(() => {
    loadTiendas();
  }, []);

  useEffect(() => {
    if (selectedTienda) {
      loadConfigs();
    }
  }, [selectedTienda, selectedCategoria]);

  const loadTiendas = async () => {
    try {
      const response = await http.get('/api/ubicaciones');
      const tiendasFiltradas = response.data.filter(
        (u: any) => u.tipo === 'tienda' && !u.id.startsWith('cedi_')
      );
      // Mapear a la estructura esperada
      const tiendasMapeadas = tiendasFiltradas.map((t: any) => ({
        ubicacion_id: t.id,
        ubicacion_nombre: t.nombre
      }));
      setTiendas(tiendasMapeadas);
      if (tiendasMapeadas.length > 0) {
        setSelectedTienda(tiendasMapeadas[0].ubicacion_id);
      }
    } catch (error) {
      console.error('Error cargando tiendas:', error);
    }
  };

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/config-inventario/tienda', {
        params: {
          tienda_id: selectedTienda,
          categoria: selectedCategoria,
        },
      });
      setConfigs(response.data);
    } catch (error) {
      console.error('Error cargando configuración:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (config: ConfigTienda) => {
    setEditingId(config.id);
    setEditValues({
      stock_min_multiplicador: config.stock_min_multiplicador,
      stock_seg_multiplicador: config.stock_seg_multiplicador,
      stock_max_multiplicador: config.stock_max_multiplicador,
      lead_time_dias: config.lead_time_dias,
    });
  };

  const handleSave = async (configId: string) => {
    try {
      setSaving(true);
      await http.put(`/api/config-inventario/tienda/${configId}`, editValues);
      setEditingId(null);
      await loadConfigs();
    } catch (error) {
      console.error('Error guardando configuración:', error);
      alert('Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const getCategoriaIcon = (categoria: string) => {
    const icons = {
      seco: '📦',
      frio: '❄️',
      verde: '🥬',
    };
    return icons[categoria as keyof typeof icons] || '📦';
  };

  const getCategoriaLabel = (categoria: string) => {
    const labels = {
      seco: 'Seco',
      frio: 'Frío',
      verde: 'Verde',
    };
    return labels[categoria as keyof typeof labels] || categoria;
  };

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
              <strong>Configuración por Tienda:</strong> Personaliza los multiplicadores de stock para cada tienda y categoría de producto. Estos valores sobrescriben la configuración global.
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tienda
            </label>
            <select
              value={selectedTienda}
              onChange={(e) => setSelectedTienda(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {tiendas.map((tienda) => (
                <option key={tienda.ubicacion_id} value={tienda.ubicacion_id}>
                  {tienda.ubicacion_nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría de Producto
            </label>
            <select
              value={selectedCategoria}
              onChange={(e) => setSelectedCategoria(e.target.value as 'seco' | 'frio' | 'verde')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="seco">📦 Seco (mayoría de productos)</option>
              <option value="frio">❄️ Frío (Carnicería, Charcutería, etc.)</option>
              <option value="verde">🥬 Verde (Fruver, Víveres)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de Configuración */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Cargando configuración...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">
              <span className="mr-2">{getCategoriaIcon(selectedCategoria)}</span>
              Multiplicadores - {getCategoriaLabel(selectedCategoria)}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clasificación ABC
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock Mínimo
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock Seguridad
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock Máximo
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lead Time (días)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {configs.map((config) => (
                  <tr key={config.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 text-sm font-semibold text-gray-900 bg-gray-100 rounded">
                        {config.clasificacion_abc}
                      </span>
                    </td>
                    {editingId === config.id ? (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="number"
                            step="0.1"
                            value={editValues.stock_min_multiplicador}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                stock_min_multiplicador: parseFloat(e.target.value),
                              })
                            }
                            className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="number"
                            step="0.1"
                            value={editValues.stock_seg_multiplicador}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                stock_seg_multiplicador: parseFloat(e.target.value),
                              })
                            }
                            className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="number"
                            step="0.1"
                            value={editValues.stock_max_multiplicador}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                stock_max_multiplicador: parseFloat(e.target.value),
                              })
                            }
                            className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="number"
                            step="1"
                            value={editValues.lead_time_dias}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                lead_time_dias: parseInt(e.target.value),
                              })
                            }
                            className="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleSave(config.id)}
                              disabled={saving}
                              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button
                              onClick={handleCancel}
                              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                          {config.stock_min_multiplicador}x
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                          {config.stock_seg_multiplicador}x
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                          {config.stock_max_multiplicador}x
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                          {config.lead_time_dias}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleEdit(config)}
                            className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                          >
                            Editar
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
