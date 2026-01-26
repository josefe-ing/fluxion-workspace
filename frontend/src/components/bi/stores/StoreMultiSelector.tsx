import { useState, useEffect } from 'react';
import { Store, X } from 'lucide-react';
import http from '../../../services/http';

interface StoreOption {
  id: string;
  nombre: string;
  region: string;
}

interface StoreMultiSelectorProps {
  selectedStores: string[];
  onStoresChange: (storeIds: string[]) => void;
  minStores?: number;
  maxStores?: number;
}

export default function StoreMultiSelector({
  selectedStores,
  onStoresChange,
  minStores = 2,
  maxStores = 5,
}: StoreMultiSelectorProps) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/ubicaciones');
      // Filter only stores (tipo = 'tienda'), excluding CEDIs
      const storesList = response.data
        .filter((u: any) => u.tipo === 'tienda' && !u.id.startsWith('cedi_'))
        .map((u: any) => ({
          id: u.id,
          nombre: u.nombre,
          region: u.region || 'SIN REGIÓN',
        }));
      setStores(storesList);
    } catch (error) {
      console.error('Error loading stores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStore = (storeId: string) => {
    if (selectedStores.includes(storeId)) {
      // Remove store
      onStoresChange(selectedStores.filter((id) => id !== storeId));
    } else {
      // Add store if under max limit
      if (selectedStores.length < maxStores) {
        onStoresChange([...selectedStores, storeId]);
      }
    }
  };

  const getStoreName = (storeId: string) => {
    return stores.find((s) => s.id === storeId)?.nombre || storeId;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-medium text-gray-700">Seleccionar Tiendas</h3>
        </div>
        <span className="text-xs text-gray-500">
          {selectedStores.length} / {maxStores} seleccionadas
        </span>
      </div>

      {/* Selected stores chips */}
      {selectedStores.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-gray-200">
          {selectedStores.map((storeId) => (
            <div
              key={storeId}
              className="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
            >
              <span>{getStoreName(storeId)}</span>
              <button
                onClick={() => handleToggleStore(storeId)}
                className="hover:bg-indigo-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Validation message */}
      {selectedStores.length < minStores && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            Selecciona al menos {minStores} tiendas para comparar
          </p>
        </div>
      )}

      {/* Store list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {stores.map((store) => {
          const isSelected = selectedStores.includes(store.id);
          const isDisabled = !isSelected && selectedStores.length >= maxStores;

          return (
            <button
              key={store.id}
              onClick={() => handleToggleStore(store.id)}
              disabled={isDisabled}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                  : isDisabled
                  ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{store.nombre}</p>
                  <p className="text-xs text-gray-500">{store.region}</p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
