/**
 * Formatea un número con separador de miles (.) y decimales (,)
 * Formato español/europeo
 *
 * @param value - Número a formatear
 * @param decimals - Cantidad de decimales (default: 2)
 * @returns String formateado
 *
 * Ejemplos:
 * formatNumber(1234.56) => "1.234,56"
 * formatNumber(1234.567, 3) => "1.234,567"
 * formatNumber(1234) => "1.234,00"
 */
export function formatNumber(value: number | string | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {
    return '-';
  }

  // Convertir a número si es string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // Validar que sea un número válido
  if (isNaN(numValue)) {
    return '-';
  }

  // Forzar formato español manualmente
  const parts = numValue.toFixed(decimals).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimalPart = parts[1];

  // Si no hay decimales, solo devolver la parte entera
  if (decimals === 0 || !decimalPart) {
    return integerPart;
  }

  return `${integerPart},${decimalPart}`;
}

/**
 * Formatea un número sin decimales
 */
export function formatInteger(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }

  // Convertir a número si es string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // Validar que sea un número válido
  if (isNaN(numValue)) {
    return '-';
  }

  // Forzar formato español manualmente
  const integerValue = Math.round(numValue);
  return integerValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
