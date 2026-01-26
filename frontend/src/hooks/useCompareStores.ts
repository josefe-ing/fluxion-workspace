import { useState, useEffect, useCallback } from 'react';
import { biService, CompareMultiStoresResponse } from '../services/biService';

interface UseCompareStoresParams {
  storeIds: string[];
  fechaInicio: string;
  fechaFin: string;
  autoLoad?: boolean;
}

export function useCompareStores({
  storeIds,
  fechaInicio,
  fechaFin,
  autoLoad = true,
}: UseCompareStoresParams) {
  const [data, setData] = useState<CompareMultiStoresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (storeIds.length < 2) {
      setError('Selecciona al menos 2 tiendas para comparar');
      setData(null);
      return;
    }

    if (storeIds.length > 5) {
      setError('Máximo 5 tiendas para comparar');
      setData(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await biService.compareMultiStores({
        store_ids: storeIds,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      });

      setData(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error cargando comparación';
      setError(message);
      console.error('Error loading stores comparison:', err);
    } finally {
      setLoading(false);
    }
  }, [storeIds, fechaInicio, fechaFin]);

  useEffect(() => {
    if (autoLoad && storeIds.length >= 2) {
      loadData();
    }
  }, [autoLoad, loadData, storeIds.length]);

  return {
    data,
    loading,
    error,
    reload: loadData,
  };
}
