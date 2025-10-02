# 📊 ETL Progreso - Extracción Histórica de Ventas

## 📅 Estado por Mes (2025 → 2024)

### 2025

#### ✅ Septiembre 2025
- **Estado**: COMPLETADO
- **Tiendas**: 16/17 (falta tienda_10 por conectividad)
- **Registros**: 6,602,348
- **Fecha completado**: 26-28/09/2025

#### ✅ Agosto 2025
- **Estado**: COMPLETADO
- **Tiendas**: 15/17 (sin mayorista_01, tienda_10)
- **Registros**: 7,075,050
- **Fecha completado**: 26-28/09/2025

#### ✅ Julio 2025
- **Estado**: COMPLETADO
- **Tiendas**: 10/17 (sin 08,12,13,15,16,mayorista_01,10)
- **Registros**: 6,941,105
- **Fecha completado**: 28/09/2025

#### ⏳ Junio 2025
- **Estado**: PENDIENTE
- **Tiendas**: Todas excepto tienda_10 y mayorista_01
- **Comando**: Ver abajo

#### ⏳ Mayo 2025
- **Estado**: PENDIENTE

#### ⏳ Abril 2025
- **Estado**: PENDIENTE

#### ⏳ Marzo 2025
- **Estado**: PENDIENTE

#### ⏳ Febrero 2025
- **Estado**: PENDIENTE

#### ⏳ Enero 2025
- **Estado**: PENDIENTE

### 2024

#### ⏳ Diciembre 2024
- **Estado**: PENDIENTE

#### ⏳ Noviembre 2024
- **Estado**: PENDIENTE

#### ⏳ Octubre 2024
- **Estado**: PENDIENTE

#### ⏳ Septiembre 2024
- **Estado**: PENDIENTE

#### ⏳ Agosto 2024
- **Estado**: PENDIENTE

#### ⏳ Julio 2024
- **Estado**: PENDIENTE

#### ⏳ Junio 2024
- **Estado**: PENDIENTE

#### ⏳ Mayo 2024
- **Estado**: PENDIENTE

#### ⏳ Abril 2024
- **Estado**: PENDIENTE

#### ⏳ Marzo 2024
- **Estado**: PENDIENTE

#### ⏳ Febrero 2024
- **Estado**: PENDIENTE

#### ⏳ Enero 2024
- **Estado**: PENDIENTE

---

## 📊 Resumen por Tienda

| Tienda | Jul-25 | Ago-25 | Sep-25 | Total | Estado |
|--------|--------|--------|--------|-------|---------|
| tienda_01 | ✅ | ✅ | ✅ | 2,846,674 | Completo |
| tienda_02 | ✅ | ✅ | ✅ | 1,352,206 | Completo |
| tienda_03 | ✅ | ✅ | ✅ | 1,235,372 | Completo |
| tienda_04 | ✅ | ✅ | ✅ | 1,641,287 | Completo |
| tienda_05 | ✅ | ✅ | ✅ | 1,396,926 | Completo |
| tienda_06 | ✅ | ✅ | ✅ | 1,044,408 | Completo |
| tienda_07 | ✅ | ✅ | ✅ | 1,087,497 | Completo |
| tienda_08 | ❌ | ✅ | ✅ | 960,115 | Sin julio |
| tienda_09 | ✅ | ✅ | ✅ | 1,582,427 | Completo |
| tienda_10 | ❌ | ❌ | ❌ | 0 | Sin conectividad |
| tienda_11 | ✅ | ✅ | ✅ | 2,440,821 | Completo |
| tienda_12 | ❌ | ✅ | ✅ | 1,003,510 | Sin julio |
| tienda_13 | ❌ | ✅ | ✅ | 542,872 | Sin julio |
| tienda_15 | ❌ | ✅ | ✅ | 950,726 | Sin julio |
| tienda_16 | ❌ | ✅ | ✅ | 1,240,476 | Sin julio |
| tienda_19 | 32 | ✅ | ✅ | 830,048 | Completo |
| mayorista_01 | ❌ | ❌ | ✅ | 463,138 | Solo sep |

**Total BD**: 20,618,503 registros

---

## 🎯 Comandos Pendientes

### Junio 2025
```bash
# Todas las tiendas excepto tienda_10 y mayorista_01
python3 etl_ventas_historico.py --fecha-inicio 2025-06-01 --fecha-fin 2025-06-30 --tiendas tienda_01 tienda_02 tienda_03 tienda_04 tienda_05 tienda_06 tienda_07 tienda_08 tienda_09 tienda_11 tienda_12 tienda_13 tienda_15 tienda_16 tienda_19 --secuencial
```

### Script automático para meses anteriores
```bash
# Usar el script automático para ir mes a mes
python3 extraer_historico_mensual.py
```

---

## 📝 Notas

- **tienda_10**: Sin conectividad, omitir en todas las extracciones
- **mayorista_01**: Solo tiene datos desde septiembre 2025, omitir en meses anteriores
- **Tiendas sin julio**: 08, 12, 13, 15, 16 (no hay datos disponibles)
- Algunas tiendas pueden no tener datos para todos los meses históricos

---

## ✅ Checklist de Validación por Sesión

- [ ] Ejecutar `python3 ver_estado_ventas.py` al inicio
- [ ] Actualizar este documento con resultados
- [ ] Marcar meses completados
- [ ] Anotar cualquier problema encontrado
- [ ] Verificar total de registros en BD