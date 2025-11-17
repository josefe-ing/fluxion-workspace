# Refactorización: Servicio Centralizado de Ubicaciones

## Resumen
Se creó el servicio centralizado `ubicacionesService.ts` para manejar todas las llamadas al endpoint `/api/ubicaciones`. Este servicio debe reemplazar todas las listas hardcodeadas de tiendas en el frontend.

## Nuevo Servicio Creado

**Archivo:** `frontend/src/services/ubicacionesService.ts`

**Funciones disponibles:**
- `getUbicaciones(tipo?)` - Obtiene todas las ubicaciones, opcionalmente filtradas por tipo
- `getTiendas()` - Obtiene solo tiendas
- `getCedis()` - Obtiene solo CEDIs

**Interfaz:**
```typescript
interface Ubicacion {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  region: string | null;
  ciudad: string | null;
  superficie_m2: number | null;
  activo: boolean;
}
```

## Cambios Aplicados

### ✅ COMPLETADO

1. **`frontend/src/services/ubicacionesService.ts`** - CREADO
   - Servicio centralizado con funciones helper

2. **`frontend/src/services/productosService.ts`** - ACTUALIZADO
   - Removida función `getUbicaciones()` duplicada
   - Removida interfaz `Ubicacion` duplicada

3. **`frontend/src/components/productos/ABCXYZAnalysis.tsx`** - ACTUALIZADO
   - Importa `getTiendas` de `ubicacionesService`
   - Importa tipo `Ubicacion` de `ubicacionesService`
   - Usa `getTiendas()` en lugar de `getUbicaciones('tienda')`

### ⏳ PENDIENTE

Los siguientes componentes tienen listas hardcodeadas y deben ser actualizados:

4. **`frontend/src/components/sales/ProductSalesModal.tsx`**
   - Verificar si usa lista hardcodeada de tiendas

5. **`frontend/src/components/admin/ConfiguracionTienda.tsx`**
   - Probablemente usa lista hardcodeada para configuración por tienda

6. **`frontend/src/components/admin/ConfiguracionProductos.tsx`**
   - Verificar selector de tiendas

7. **`frontend/src/components/dashboard/InventoryDashboard.tsx`**
   - Verificar filtros de ubicación

8. **`frontend/src/components/orders/OrderStepOne.tsx`**
   - Selector de tienda destino

9. **`frontend/src/components/orders/OrderStepTwo.tsx`**
   - Ya fue modificado previamente (verificar)

10. **`frontend/src/components/orders/OrderStepThree.tsx`**
    - Verificar selector de tiendas

11. **`frontend/src/components/orders/PedidoApprovalView.tsx`**
    - Verificar filtros

12. **`frontend/src/components/orders/OrderWizard.tsx`**
    - Verificar flujo de pedidos

13. **`frontend/src/components/orders/SuggestedOrder.tsx`**
    - Verificar selector de tiendas

## Patrón de Actualización

Para cada componente:

1. **Importar el servicio:**
   ```typescript
   import { getTiendas, Ubicacion } from '../../services/ubicacionesService';
   ```

2. **Agregar estado:**
   ```typescript
   const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
   ```

3. **Cargar datos:**
   ```typescript
   useEffect(() => {
     const loadUbicaciones = async () => {
       try {
         const data = await getTiendas();
         setUbicaciones(data);
       } catch (error) {
         console.error('Error loading ubicaciones:', error);
       }
     };
     loadUbicaciones();
   }, []);
   ```

4. **Actualizar selector:**
   ```tsx
   <select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
     <option value="">Seleccionar...</option>
     {ubicaciones.map((ub) => (
       <option key={ub.id} value={ub.id}>
         {ub.nombre}
       </option>
     ))}
   </select>
   ```

## Beneficios

✅ **Única fuente de verdad** - Todas las tiendas vienen del backend
✅ **Mantenibilidad** - No hay que actualizar múltiples archivos al cambiar tiendas
✅ **Consistencia** - Mismos datos en toda la aplicación
✅ **Escalabilidad** - Fácil agregar/remover tiendas desde el backend
✅ **Tipado** - TypeScript asegura uso correcto de la interfaz Ubicacion

## Estado Actual

- ✅ Servicio creado y funcional
- ✅ Productos ABC-XYZ actualizado
- ⏳ 10+ componentes pendientes de actualización

## Próximos Pasos

1. Revisar cada componente listado en PENDIENTE
2. Aplicar patrón de actualización
3. Probar cada componente después de la actualización
4. Remover cualquier lista hardcodeada encontrada
