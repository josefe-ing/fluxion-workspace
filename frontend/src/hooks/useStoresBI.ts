import { useState, useEffect, useCallback } from 'react';
import { biService, NetworkKPIsResponse } from '../services/biService';

export type ComparisonType = 'anterior' | 'ano_anterior';

interface UseStoresBIParams {
  fechaInicio: string;
  fechaFin: string;
  comparacion: ComparisonType;
  region?: string | null;
  autoLoad?: boolean;
}

export function useStoresBI({
  fechaInicio,
  fechaFin,
  comparacion,
  region,
  autoLoad = true,
}: UseStoresBIParams) {
  const [data, setData] = useState<NetworkKPIsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await biService.getNetworkKPIs({
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        comparar_con: comparacion,
        region: region || undefined,
      });

      setData(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error cargando datos';
      setError(message);
      console.error('Error loading stores BI data:', err);
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin, comparacion, region]);

  useEffect(() => {
    if (autoLoad) {
      loadData();
    }
  }, [autoLoad, loadData]);

  return {
    data,
    loading,
    error,
    reload: loadData,
  };
}
