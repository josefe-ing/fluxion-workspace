/**
 * Servicio centralizado de descripciones del modelo ABC activo.
 *
 * Carga las descripciones dinámicas desde GET /api/config-inventario/parametros-abc/modelo-activo
 * y las expone a toda la app mediante un React context + hook useABCModel().
 *
 * Enero 2026
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import React from 'react';
import http from './http';

// =====================================================================================
// TIPOS
// =====================================================================================

export interface DescripcionClase {
  label: string;
  descripcion: string;
  corto: string;
}

export interface DescripcionesModelo {
  nombre: string;
  tipo: 'ranking' | 'pareto';
  criterio: string;
  clases: Record<string, DescripcionClase>;
}

export interface UmbralesRanking {
  umbral_a: number;
  umbral_b: number;
  umbral_c: number;
}

export interface UmbralesPareto {
  umbral_a_pct: number;
  umbral_b_pct: number;
}

export interface ABCModelData {
  modelo_activo: string;
  descripciones_modelo: DescripcionesModelo;
  umbrales_ranking: UmbralesRanking;
  umbrales_pareto: UmbralesPareto;
  modelos_disponibles: Record<string, DescripcionesModelo>;
}

// =====================================================================================
// FALLBACK (defaults para evitar errores si la API no responde)
// =====================================================================================

const FALLBACK: ABCModelData = {
  modelo_activo: 'ranking_volumen',
  descripciones_modelo: {
    nombre: 'Ranking por Volumen',
    tipo: 'ranking',
    criterio: 'cantidad vendida (unidades)',
    clases: {
      A: { label: 'Clase A', descripcion: 'Top 1-50 (Más vendidos por unidades)', corto: 'Top 50' },
      B: { label: 'Clase B', descripcion: 'Ranking 51-200 (Venta media)', corto: '51-200' },
      C: { label: 'Clase C', descripcion: 'Ranking 201-800 (Venta baja)', corto: '201-800' },
      D: { label: 'Clase D', descripcion: 'Ranking 801+ (Cola larga)', corto: '801+' },
    },
  },
  umbrales_ranking: { umbral_a: 50, umbral_b: 200, umbral_c: 800 },
  umbrales_pareto: { umbral_a_pct: 80, umbral_b_pct: 95 },
  modelos_disponibles: {},
};

// =====================================================================================
// CACHE en memoria (singleton para evitar múltiples fetches)
// =====================================================================================

let cachedData: ABCModelData | null = null;
let fetchPromise: Promise<ABCModelData> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let cacheTimestamp = 0;

async function fetchModeloActivo(): Promise<ABCModelData> {
  try {
    const response = await http.get('/api/config-inventario/parametros-abc/modelo-activo');
    const data = response.data as ABCModelData;
    cachedData = data;
    cacheTimestamp = Date.now();
    return data;
  } catch (err) {
    console.warn('[abcModelService] Error fetching modelo activo, usando fallback:', err);
    return cachedData || FALLBACK;
  }
}

function getOrFetch(): Promise<ABCModelData> {
  const now = Date.now();
  if (cachedData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return Promise.resolve(cachedData);
  }
  if (!fetchPromise) {
    fetchPromise = fetchModeloActivo().finally(() => {
      fetchPromise = null;
    });
  }
  return fetchPromise;
}

// =====================================================================================
// FUNCIONES HELPER (pueden usarse sin React)
// =====================================================================================

export async function getModeloActivo(): Promise<string> {
  const data = await getOrFetch();
  return data.modelo_activo;
}

export async function getDescripcionClase(clase: string): Promise<string> {
  const data = await getOrFetch();
  return data.descripciones_modelo.clases[clase]?.descripcion || clase;
}

export async function getDescripcionCorta(clase: string): Promise<string> {
  const data = await getOrFetch();
  return data.descripciones_modelo.clases[clase]?.corto || clase;
}

export async function getNombreModelo(): Promise<string> {
  const data = await getOrFetch();
  return data.descripciones_modelo.nombre;
}

export async function getFilterOptions(): Promise<Array<{ value: string; label: string }>> {
  const data = await getOrFetch();
  const clases = data.descripciones_modelo.clases;
  return Object.entries(clases).map(([value, desc]) => ({
    value,
    label: `${value} - ${desc.corto}`,
  }));
}

/** Invalida el cache y fuerza un refetch en el próximo acceso */
export function invalidateCache(): void {
  cachedData = null;
  cacheTimestamp = 0;
  fetchPromise = null;
}

// =====================================================================================
// REACT CONTEXT + HOOK
// =====================================================================================

interface ABCModelContextValue {
  data: ABCModelData;
  loading: boolean;
  error: string | null;
  /** Descripciones del modelo activo */
  descripciones: DescripcionesModelo;
  /** Nombre del modelo activo (ej: "Ranking por Volumen") */
  nombreModelo: string;
  /** ID del modelo activo (ej: "ranking_volumen") */
  modeloActivo: string;
  /** Descripción larga de una clase (ej: "Top 1-50 (Más vendidos por unidades)") */
  getDescripcion: (clase: string) => string;
  /** Descripción corta de una clase (ej: "Top 50") */
  getCorta: (clase: string) => string;
  /** Opciones para filtros/dropdowns: [{ value: "A", label: "A - Top 50" }, ...] */
  filterOptions: Array<{ value: string; label: string }>;
  /** Todos los modelos disponibles con sus descripciones */
  modelosDisponibles: Record<string, DescripcionesModelo>;
  /** Fuerza recarga del modelo (después de cambiar en admin) */
  refresh: () => void;
}

const ABCModelContext = createContext<ABCModelContextValue | null>(null);

export function ABCModelProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ABCModelData>(cachedData || FALLBACK);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      invalidateCache();
      const result = await getOrFetch();
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Error cargando modelo ABC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const descripciones = data.descripciones_modelo;

  const getDescripcion = useCallback(
    (clase: string) => descripciones.clases[clase]?.descripcion || clase,
    [descripciones]
  );

  const getCorta = useCallback(
    (clase: string) => descripciones.clases[clase]?.corto || clase,
    [descripciones]
  );

  const filterOptions = Object.entries(descripciones.clases).map(([value, desc]) => ({
    value,
    label: `${value} - ${desc.corto}`,
  }));

  const value: ABCModelContextValue = {
    data,
    loading,
    error,
    descripciones,
    nombreModelo: descripciones.nombre,
    modeloActivo: data.modelo_activo,
    getDescripcion,
    getCorta,
    filterOptions,
    modelosDisponibles: data.modelos_disponibles,
    refresh: load,
  };

  return React.createElement(ABCModelContext.Provider, { value }, children);
}

export function useABCModel(): ABCModelContextValue {
  const ctx = useContext(ABCModelContext);
  if (!ctx) {
    // Fuera del provider, retornar valores fallback
    const desc = FALLBACK.descripciones_modelo;
    return {
      data: FALLBACK,
      loading: false,
      error: null,
      descripciones: desc,
      nombreModelo: desc.nombre,
      modeloActivo: FALLBACK.modelo_activo,
      getDescripcion: (clase: string) => desc.clases[clase]?.descripcion || clase,
      getCorta: (clase: string) => desc.clases[clase]?.corto || clase,
      filterOptions: Object.entries(desc.clases).map(([value, d]) => ({
        value,
        label: `${value} - ${d.corto}`,
      })),
      modelosDisponibles: {},
      refresh: () => {},
    };
  }
  return ctx;
}
