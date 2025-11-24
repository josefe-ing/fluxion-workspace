/**
 * Feature Flags para controlar funcionalidades del sistema
 *
 * Permite habilitar/deshabilitar features sin eliminar código
 */

export const FEATURE_FLAGS = {
  /**
   * Habilita el análisis XYZ (variabilidad de demanda)
   *
   * Cuando está en false:
   * - Se oculta la sección XYZ en ABCXYZAnalysis
   * - Se oculta la matriz 3x3 (solo se muestra ABC)
   * - Se ocultan filtros XYZ en el wizard de pedidos
   * - Los badges muestran solo la clasificación ABC
   *
   * El código XYZ permanece intacto para reactivarlo cuando sea necesario.
   */
  ENABLE_XYZ_ANALYSIS: false,

  /**
   * Muestra la matriz completa ABC-XYZ (9 cuadrantes)
   * Solo tiene efecto si ENABLE_XYZ_ANALYSIS es true
   */
  SHOW_FULL_MATRIX: false,
};

/**
 * Helper para verificar si XYZ está habilitado
 */
export function isXYZEnabled(): boolean {
  return FEATURE_FLAGS.ENABLE_XYZ_ANALYSIS;
}

/**
 * Helper para verificar si se debe mostrar la matriz completa
 */
export function showFullMatrix(): boolean {
  return FEATURE_FLAGS.ENABLE_XYZ_ANALYSIS && FEATURE_FLAGS.SHOW_FULL_MATRIX;
}
