import type { ProductoPedido } from '../components/orders/OrderWizard';

export interface AnalisisXYZ {
  codigo_producto: string;
  clasificacion_abc: string;
  clasificacion_xyz: string;
  clasificacion_combinada: string;

  metricas: {
    venta_diaria_5d: number;
    venta_diaria_20d: number;
    desviacion_estandar: number;
    coeficiente_variacion: number;
    tendencia: {
      tipo: 'creciente' | 'decreciente' | 'estable';
      porcentaje: number;
      confianza: number;
    };
    estacionalidad: {
      factor_actual: number;
      patron_detectado: string;
    };
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

/**
 * Genera análisis XYZ dummy para demostración
 * En producción, esto vendría del backend
 */
export function generarAnalisisXYZDummy(
  producto: ProductoPedido,
  clasificacionABC: string,
  stockParams: any
): AnalisisXYZ {
  const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const ventaDiaria5d = producto.prom_ventas_5dias_unid / producto.cantidad_bultos;

  // Simular desviación estándar (20-40% del promedio)
  const desviacionEstandar = ventaDiariaBultos * (0.2 + Math.random() * 0.2);
  const coeficienteVariacion = desviacionEstandar / ventaDiariaBultos;

  // Clasificar XYZ por coeficiente de variación
  let clasificacionXYZ: string;
  if (coeficienteVariacion < 0.5) {
    clasificacionXYZ = 'X'; // Predecible
  } else if (coeficienteVariacion <= 1.0) {
    clasificacionXYZ = 'Y'; // Variable
  } else {
    clasificacionXYZ = 'Z'; // Errático
  }

  // Detectar tendencia (comparando 5d vs 20d)
  const cambio = (ventaDiaria5d - ventaDiariaBultos) / ventaDiariaBultos;
  let tipoTendencia: 'creciente' | 'decreciente' | 'estable';
  let porcentajeTendencia: number;

  if (cambio > 0.2) {
    tipoTendencia = 'creciente';
    porcentajeTendencia = cambio * 100;
  } else if (cambio < -0.2) {
    tipoTendencia = 'decreciente';
    porcentajeTendencia = cambio * 100;
  } else {
    tipoTendencia = 'estable';
    porcentajeTendencia = cambio * 100;
  }

  // Factor estacional (simular fin de semana o quincena)
  const esFinDeSemana = Math.random() > 0.7; // 30% probabilidad
  const esQuincena = Math.random() > 0.5; // 50% probabilidad
  let factorEstacional = 1.0;
  let patronEstacional = 'normal';

  if (esFinDeSemana) {
    factorEstacional *= 1.4;
    patronEstacional = 'fin de semana';
  }
  if (esQuincena) {
    factorEstacional *= 1.2;
    patronEstacional = esFinDeSemana ? 'fin de semana + quincena' : 'quincena';
  }

  // ========== CÁLCULOS ABC (actuales) ==========
  const calcularStockMinimoABC = (): number => {
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_min_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_min_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_min_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_min_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_min_mult_c;
    return ventaDiariaBultos * multiplicador;
  };

  const calcularStockSeguridadABC = (): number => {
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_seg_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_seg_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_seg_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_seg_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_seg_mult_c;
    return ventaDiariaBultos * multiplicador;
  };

  const calcularStockMaximoABC = (): number => {
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_max_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_max_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_max_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_max_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_max_mult_c;
    return ventaDiariaBultos * multiplicador;
  };

  const stockMinimoABC = calcularStockMinimoABC();
  const stockSeguridadABC = calcularStockSeguridadABC();
  const stockMaximoABC = calcularStockMaximoABC();
  const puntoReordenABC = stockMinimoABC + stockSeguridadABC + (1.25 * ventaDiariaBultos);

  const stockTotalBultos = (producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos;
  const stockTotalDias = (producto.stock_tienda + producto.stock_en_transito) / producto.prom_ventas_20dias_unid;
  const puntoReordenDias = puntoReordenABC / ventaDiariaBultos;

  let sugeridoABC = 0;
  if (stockTotalDias <= puntoReordenDias) {
    const sugeridoSinLimite = stockMaximoABC - stockTotalBultos;
    const stockCediBultos = producto.stock_cedi_origen / producto.cantidad_bultos;
    sugeridoABC = Math.max(0, Math.round(Math.min(sugeridoSinLimite, stockCediBultos)));
  }

  // ========== CÁLCULOS XYZ (mejorados) ==========
  // 1. Stock de Seguridad Científico: SS = Z × σ × √(LT)
  const zScores: Record<string, number> = {
    'A': 2.33,   // 99%
    'AB': 2.05,  // 98%
    'B': 1.65,   // 95%
    'BC': 1.28,  // 90%
    'C': 0.84,   // 80%
  };

  const ajustesXYZ: Record<string, number> = {
    'X': 0.8,   // Reducir para predecibles
    'Y': 1.0,   // Normal
    'Z': 1.3,   // Aumentar para erráticos
  };

  const leadTimeDias = 3; // Asumir 3 días de lead time
  const zScore = (zScores[clasificacionABC] || 1.65) * (ajustesXYZ[clasificacionXYZ] || 1.0);
  const stockSeguridadXYZ = zScore * desviacionEstandar * Math.sqrt(leadTimeDias);

  // 2. Ajustar por tendencia
  let ventaProyectada = ventaDiariaBultos;
  if (tipoTendencia === 'creciente') {
    ventaProyectada *= (1 + porcentajeTendencia / 100);
  } else if (tipoTendencia === 'decreciente') {
    ventaProyectada *= (1 + porcentajeTendencia / 100); // Ya es negativo
  }

  // 3. Ajustar por estacionalidad
  ventaProyectada *= factorEstacional;

  // 4. Recalcular stocks con método XYZ
  const stockMinimoXYZ = ventaProyectada * 3; // 3 días (más científico)
  const stockMaximoXYZ = ventaProyectada * 6; // 6 días
  const puntoReordenXYZ = stockMinimoXYZ + stockSeguridadXYZ + (1.25 * ventaProyectada);

  const puntoReordenDiasXYZ = puntoReordenXYZ / ventaProyectada;
  let sugeridoXYZ = 0;
  if (stockTotalDias <= puntoReordenDiasXYZ) {
    const sugeridoSinLimite = stockMaximoXYZ - stockTotalBultos;
    const stockCediBultos = producto.stock_cedi_origen / producto.cantidad_bultos;
    sugeridoXYZ = Math.max(0, Math.round(Math.min(sugeridoSinLimite, stockCediBultos)));
  }

  // ========== EXPLICACIÓN DE DIFERENCIAS ==========
  const diferencia = sugeridoXYZ - sugeridoABC;
  const razones: string[] = [];

  if (Math.abs(porcentajeTendencia) > 10) {
    razones.push(
      `Tendencia ${tipoTendencia} detectada (${porcentajeTendencia > 0 ? '+' : ''}${porcentajeTendencia.toFixed(0)}% últimas 2 semanas) → Ajuste: ${porcentajeTendencia > 0 ? '+' : ''}${porcentajeTendencia.toFixed(0)}% en forecast`
    );
  }

  if (clasificacionXYZ === 'Y') {
    razones.push(
      `Variabilidad media detectada (CV=${coeficienteVariacion.toFixed(2)}) → Stock seguridad científico: ${((stockSeguridadXYZ / stockSeguridadABC - 1) * 100).toFixed(0)}% mayor que ABC`
    );
  } else if (clasificacionXYZ === 'Z') {
    razones.push(
      `Alta variabilidad (CV=${coeficienteVariacion.toFixed(2)}) → Stock seguridad +30% vs. ABC para proteger contra fluctuaciones`
    );
  }

  if (factorEstacional > 1.1) {
    razones.push(
      `Patrón estacional detectado: ${patronEstacional} → Factor estacional: +${((factorEstacional - 1) * 100).toFixed(0)}% demanda`
    );
  }

  if (razones.length === 0) {
    razones.push('Producto estable y predecible - métodos ABC y XYZ convergen');
  }

  if (diferencia > 0) {
    razones.push(`🎯 Resultado: +${diferencia} bultos para evitar stockout`);
  } else if (diferencia < 0) {
    razones.push(`🎯 Resultado: ${diferencia} bultos (producto predecible, optimizar inventario)`);
  } else {
    razones.push('🎯 ABC y XYZ coinciden - producto bien gestionado');
  }

  return {
    codigo_producto: producto.codigo_producto,
    clasificacion_abc: clasificacionABC,
    clasificacion_xyz: clasificacionXYZ,
    clasificacion_combinada: `${clasificacionABC}-${clasificacionXYZ}`,

    metricas: {
      venta_diaria_5d: ventaDiaria5d,
      venta_diaria_20d: ventaDiariaBultos,
      desviacion_estandar: desviacionEstandar,
      coeficiente_variacion: coeficienteVariacion,
      tendencia: {
        tipo: tipoTendencia,
        porcentaje: porcentajeTendencia,
        confianza: Math.min(Math.abs(cambio), 1.0),
      },
      estacionalidad: {
        factor_actual: factorEstacional,
        patron_detectado: patronEstacional,
      },
    },

    stock_calculado: {
      abc: {
        minimo: stockMinimoABC,
        seguridad: stockSeguridadABC,
        maximo: stockMaximoABC,
        punto_reorden: puntoReordenABC,
        sugerido: sugeridoABC,
      },
      xyz: {
        minimo: stockMinimoXYZ,
        seguridad: stockSeguridadXYZ,
        maximo: stockMaximoXYZ,
        punto_reorden: puntoReordenXYZ,
        sugerido: sugeridoXYZ,
      },
    },

    explicacion: {
      diferencia_bultos: diferencia,
      razones: razones,
    },
  };
}

/**
 * Genera resumen de comparación para todos los productos
 */
export function generarResumenComparativo(analisisLista: AnalisisXYZ[]) {
  let coincidencias = 0;
  let xyz_mayor = 0;
  let xyz_menor = 0;
  let diferencia_total_bultos = 0;

  analisisLista.forEach(analisis => {
    const diff = analisis.explicacion.diferencia_bultos;

    if (Math.abs(diff) <= 2) {
      coincidencias++;
    } else if (diff > 0) {
      xyz_mayor++;
      diferencia_total_bultos += diff;
    } else {
      xyz_menor++;
    }
  });

  return {
    total_productos: analisisLista.length,
    coincidencias,
    xyz_mayor,
    xyz_menor,
    diferencia_total_bultos,
    diferencia_total_costo: diferencia_total_bultos * 52.5, // Precio promedio estimado
    reduccion_stockouts_estimada: 35, // Basado en histórico (dummy)
    productos_con_riesgo: analisisLista.filter(a => a.metricas.tendencia.tipo === 'creciente' && a.clasificacion_xyz === 'Y').length,
  };
}
