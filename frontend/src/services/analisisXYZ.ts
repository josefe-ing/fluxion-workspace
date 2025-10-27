/**
 * Servicio para Análisis XYZ - Modo Consultor IA
 * Conecta con backend para obtener análisis comparativos ABC vs XYZ
 */

import http from './http';
import type { AnalisisXYZ } from '../utils/analisisXYZDummy';

export interface AnalisisXYZResponse {
  codigo_producto: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  clasificacion_combinada: string;

  metricas: {
    venta_diaria_5d: number;
    venta_diaria_20d: number;
    desviacion_estandar: number;
    coeficiente_variacion: number;
    tendencia_tipo: string;
    tendencia_porcentaje: number;
    tendencia_confianza: number;
    estacionalidad_factor: number;
    estacionalidad_patron: string;
  };

  stock_calculado: {
    abc: {
      minimo: number;
      seguridad: number;
      maximo: number;
      punto_reorden: number;
      sugerido: number;
    };
    xyz: {
      minimo: number;
      seguridad: number;
      maximo: number;
      punto_reorden: number;
      sugerido: number;
    };
  };

  explicacion: {
    diferencia_bultos: number;
    razones: string[];
  };
}

export interface ResumenComparativoResponse {
  total_productos: number;
  coincidencias: number;
  xyz_mayor: number;
  xyz_menor: number;
  diferencia_total_bultos: number;
  diferencia_total_costo: number;
  reduccion_stockouts_estimada: number;
  productos_con_riesgo: number;
}

/**
 * Obtiene análisis XYZ de un producto
 */
export async function obtenerAnalisisXYZProducto(
  codigoProducto: string,
  ubicacionId: string
): Promise<AnalisisXYZ> {
  try {
    const response = await http.get<AnalisisXYZResponse>(
      `/api/analisis-xyz/producto/${codigoProducto}`,
      {
        params: { ubicacion_id: ubicacionId }
      }
    );

    // Transformar response del backend a formato del frontend
    return {
      codigo_producto: response.data.codigo_producto,
      clasificacion_abc: response.data.clasificacion_abc,
      clasificacion_xyz: response.data.clasificacion_xyz,
      clasificacion_combinada: response.data.clasificacion_combinada,

      metricas: {
        venta_diaria_5d: response.data.metricas.venta_diaria_5d,
        venta_diaria_20d: response.data.metricas.venta_diaria_20d,
        desviacion_estandar: response.data.metricas.desviacion_estandar,
        coeficiente_variacion: response.data.metricas.coeficiente_variacion,
        tendencia: {
          tipo: response.data.metricas.tendencia_tipo as 'creciente' | 'decreciente' | 'estable',
          porcentaje: response.data.metricas.tendencia_porcentaje,
          confianza: response.data.metricas.tendencia_confianza,
        },
        estacionalidad: {
          factor_actual: response.data.metricas.estacionalidad_factor,
          patron_detectado: response.data.metricas.estacionalidad_patron,
        },
      },

      stock_calculado: {
        abc: {
          minimo: response.data.stock_calculado.abc.minimo,
          seguridad: response.data.stock_calculado.abc.seguridad,
          maximo: response.data.stock_calculado.abc.maximo,
          punto_reorden: response.data.stock_calculado.abc.punto_reorden,
          sugerido: response.data.stock_calculado.abc.sugerido,
        },
        xyz: {
          minimo: response.data.stock_calculado.xyz.minimo,
          seguridad: response.data.stock_calculado.xyz.seguridad,
          maximo: response.data.stock_calculado.xyz.maximo,
          punto_reorden: response.data.stock_calculado.xyz.punto_reorden,
          sugerido: response.data.stock_calculado.xyz.sugerido,
        },
      },

      explicacion: {
        diferencia_bultos: response.data.explicacion.diferencia_bultos,
        razones: response.data.explicacion.razones,
      },
    };
  } catch (error) {
    console.error(`Error obteniendo análisis XYZ para ${codigoProducto}:`, error);
    throw error;
  }
}

/**
 * Obtiene análisis XYZ para múltiples productos (batch)
 */
export async function obtenerAnalisisXYZBatch(
  codigosProductos: string[],
  ubicacionId: string,
  onProgress?: (completados: number, total: number) => void
): Promise<Record<string, AnalisisXYZ>> {
  const analisisMap: Record<string, AnalisisXYZ> = {};
  const total = codigosProductos.length;
  let completados = 0;

  // Procesar en paralelo pero con límite de concurrencia
  const BATCH_SIZE = 10;
  for (let i = 0; i < codigosProductos.length; i += BATCH_SIZE) {
    const batch = codigosProductos.slice(i, i + BATCH_SIZE);

    const promesas = batch.map(async (codigo) => {
      try {
        const analisis = await obtenerAnalisisXYZProducto(codigo, ubicacionId);
        analisisMap[codigo] = analisis;
        completados++;
        if (onProgress) {
          onProgress(completados, total);
        }
      } catch (error) {
        console.error(`Error en producto ${codigo}:`, error);
        // Continuar con los demás aunque uno falle
      }
    });

    await Promise.all(promesas);
  }

  return analisisMap;
}

/**
 * Compara ABC vs XYZ para un pedido completo
 */
export async function compararABCvsXYZ(
  cediOrigen: string,
  tiendaDestino: string,
  productos?: string[]
): Promise<{
  resumen: ResumenComparativoResponse;
  productos: Array<{
    codigo_producto: string;
    descripcion_producto: string;
    abc_sugerido: number;
    xyz_sugerido: number;
    diferencia: number;
    razon_principal: string;
  }>;
}> {
  try {
    const response = await http.post('/api/analisis-xyz/comparar', {
      cedi_origen: cediOrigen,
      tienda_destino: tiendaDestino,
      productos: productos,
      dias_cobertura: 3,
    });

    return response.data;
  } catch (error) {
    console.error('Error comparando ABC vs XYZ:', error);
    throw error;
  }
}
