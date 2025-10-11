# Guía de Migración: EFS → EBS

## Resumen Ejecutivo

**Costo**: $2/mes (vs $5/mes actual con EFS) → **AHORRO de $3/mes**
**Performance**: 200-500ms queries (vs 5s actual) → **10x más rápido**
**Complejidad**: Media (2-3 horas de trabajo)
**Riesgo**: Bajo (con backup automático)

---

## 📊 Comparación de Costos

| Concepto | EFS (Actual) | EBS gp3 (Propuesto) | Diferencia |
|----------|--------------|---------------------|------------|
| Storage (16-20GB) | $4.80/mes | $1.60/mes | -$3.20 |
| IOPS | Incluido (burst) | 3,000 incluidas | Mejor |
| Throughput | Burst | 125 MB/s | Mejor |
| Latencia | 10-20ms | <1ms | 10-20x mejor |
| **Total** | **$5/mes** | **$2/mes** | **-$3/mes** |

---

## ⚡ Performance Esperada

### Actual (EFS):
- Query simple: ~5 segundos
- Query con filtros: ~5 segundos
- Primera carga: ~6 segundos

### Esperado (EBS gp3):
- Query simple: ~200ms
- Query con filtros: ~300ms
- Primera carga: ~400ms

**Mejora**: 10-15x más rápido

---

## 🔧 Complejidad de Migración

### Nivel: MEDIA (6/10)

### Cambios Necesarios:

#### 1. **Arquitectura CDK** (30 min)
- Cambiar de EFS a EBS volume
- Configurar attachment al task definition
- Actualizar permisos IAM

#### 2. **Task Definition** (15 min)
- Reemplazar `efsVolumeConfiguration` por `dockerVolumeConfiguration`
- Configurar volume mount en host EC2

#### 3. **Limitación: Fargate → EC2** (1-2 horas)
**IMPORTANTE**: EBS solo funciona con EC2, NO con Fargate.

Cambios necesarios:
- Crear Launch Template para EC2
- Configurar ECS Capacity Provider (EC2)
- Cambiar de `FargateService` a EC2-based service
- Configurar Auto Scaling Group (ASG)

---

## 📝 Pasos de Migración

### Fase 1: Preparación (30 min)

1. **Backup de EFS**
   ```bash
   # Ya tienes backup en S3
   s3://fluxion-backups-v2-611395766952/production_db_uncompressed_20251011.db
   ```

2. **Crear snapshot de estado actual**
   ```bash
   aws efs create-backup \
     --file-system-id fs-xxx \
     --tags Key=Purpose,Value=pre-migration-backup
   ```

### Fase 2: Infraestructura (1 hora)

3. **Actualizar CDK Stack**

   ```typescript
   // infrastructure/lib/infrastructure-stack.ts

   // ANTES (EFS):
   const fileSystem = new efs.FileSystem(this, 'FluxionEFS', {
     vpc,
     encrypted: false,
     performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
   });

   // DESPUÉS (EBS con EC2):

   // 1. Crear EBS volume
   const dataVolume = new ec2.Volume(this, 'FluxionDataVolume', {
     availabilityZone: vpc.availabilityZones[0],
     size: cdk.Size.gibibytes(20),
     volumeType: ec2.EbsDeviceVolumeType.GP3,
     iops: 3000,
     throughput: 125,
     encrypted: true,
     removalPolicy: cdk.RemovalPolicy.RETAIN,
   });

   // 2. Crear Launch Template para EC2
   const launchTemplate = new ec2.LaunchTemplate(this, 'FluxionLT', {
     machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
     instanceType: new ec2.InstanceType('t3.small'),
     userData: ec2.UserData.forLinux(),
     blockDevices: [{
       deviceName: '/dev/xvdf',
       volume: ec2.BlockDeviceVolume.ebs(20, {
         volumeType: ec2.EbsDeviceVolumeType.GP3,
         iops: 3000,
         throughput: 125,
       }),
     }],
   });

   // 3. Crear Auto Scaling Group
   const asg = new autoscaling.AutoScalingGroup(this, 'FluxionASG', {
     vpc,
     launchTemplate,
     minCapacity: 1,
     maxCapacity: 2,
     desiredCapacity: 1,
   });

   // 4. Crear Capacity Provider
   const capacityProvider = new ecs.AsgCapacityProvider(this, 'FluxionCP', {
     autoScalingGroup: asg,
     enableManagedScaling: true,
     enableManagedTerminationProtection: false,
   });

   cluster.addAsgCapacityProvider(capacityProvider);

   // 5. Actualizar Service para usar EC2
   const backendService = new ecs.Ec2Service(this, 'FluxionBackendService', {
     cluster,
     taskDefinition: backendTask,
     desiredCount: 1,
     capacityProviderStrategies: [{
       capacityProvider: capacityProvider.capacityProviderName,
       weight: 1,
     }],
   });
   ```

4. **Actualizar Task Definition**

   ```typescript
   // Cambiar volumes de EFS a Docker volume
   const backendTask = new ecs.Ec2TaskDefinition(this, 'FluxionBackendTask', {
     volumes: [{
       name: 'fluxion-data',
       dockerVolumeConfiguration: {
         scope: ecs.Scope.SHARED,
         autoprovision: true,
         driver: 'local',
         driverOpts: {
           type: 'none',
           device: '/mnt/data',
           o: 'bind',
         },
       },
     }],
   });
   ```

### Fase 3: Migración de Datos (30 min)

5. **Copiar datos de EFS a EBS**

   Opción A: Via S3 (recomendado)
   ```bash
   # En el nuevo EC2 con EBS:
   aws s3 cp s3://fluxion-backups-v2-611395766952/production_db_uncompressed_20251011.db \
     /mnt/data/fluxion_production.db
   ```

   Opción B: Rsync directo (más lento)
   ```bash
   # Desde EFS mount a EBS mount
   rsync -avz /efs-mount/fluxion_production.db /mnt/data/
   ```

6. **Verificar integridad**
   ```bash
   md5sum /mnt/data/fluxion_production.db
   duckdb /mnt/data/fluxion_production.db "SELECT COUNT(*) FROM ventas_raw"
   ```

### Fase 4: Deploy y Validación (30 min)

7. **Deploy CDK Stack**
   ```bash
   cd infrastructure
   npm run build
   cdk diff
   cdk deploy --require-approval never
   ```

8. **Probar performance**
   ```bash
   curl -w "\nTime: %{time_total}s\n" \
     https://your-backend.com/api/ventas/detail?page=1&page_size=50
   ```

9. **Rollback plan** (si hay problemas)
   - Revertir CDK stack a commit anterior
   - Backend volverá a usar EFS
   - No hay pérdida de datos (EFS se mantiene)

---

## ⚠️ Consideraciones Importantes

### Ventajas de EBS:
✅ **10x más rápido** (latencia <1ms vs 10-20ms)
✅ **Más barato** ($2/mes vs $5/mes)
✅ **Mejor para DBs** (optimizado para IOPS)
✅ **Backups automáticos** (snapshots de EBS)

### Desventajas de EBS:
❌ **No compartido** (un solo ECS task puede usarlo)
❌ **Requiere EC2** (no funciona con Fargate)
❌ **Tied to AZ** (solo disponible en una zona)

### Trade-offs:

| Aspecto | EFS (Multi-AZ) | EBS (Single-AZ) |
|---------|----------------|-----------------|
| Disponibilidad | Multi-AZ automático | Single-AZ (pero puedes usar snapshots) |
| Escalado horizontal | Múltiples tasks | 1 task (vertical scaling) |
| Costo | Mayor | Menor |
| Performance | Menor | Mayor |

### ¿Es un problema tener 1 solo task?

**NO para tu caso**, porque:
- Actualmente usas `desiredCount: 1` (1 solo task)
- No tienes alta carga que requiera múltiples instancias
- DuckDB no es thread-safe para escritura concurrente
- El cuello de botella es la BD, no el backend

---

## 🎯 Recomendación

### Implementar EBS gp3 SI:
- ✅ Necesitas mejor performance (200-500ms)
- ✅ Quieres ahorrar $3/mes
- ✅ No planeas escalar a múltiples tasks
- ✅ Puedes tolerar 2-3 horas de migración

### Mantener EFS SI:
- ❌ Performance actual (5s) es aceptable
- ❌ Necesitas compartir data entre múltiples tasks
- ❌ Requieres alta disponibilidad multi-AZ
- ❌ No puedes dedicar tiempo a migración

---

## 📋 Checklist de Migración

- [ ] Backup de BD en S3 (ya completado ✅)
- [ ] Crear snapshot de EFS
- [ ] Actualizar CDK con EBS + EC2 config
- [ ] Deploy infrastructure
- [ ] Verificar que EC2 esté corriendo
- [ ] Copiar BD de S3 a EBS mount
- [ ] Aplicar índices de optimización
- [ ] Reiniciar backend service
- [ ] Probar performance (<500ms)
- [ ] Verificar funcionamiento completo
- [ ] Monitorear por 24 horas
- [ ] (Opcional) Eliminar EFS si todo OK

---

## 💡 Alternativa: Hybrid Approach

Si no quieres migrar completamente, considera:

### Opción: EFS + Caché Redis
- Mantener EFS para persistencia
- Agregar Redis para cachear queries frecuentes
- Costo: +$15-20/mes (ElastiCache Redis)
- Performance: ~50-100ms (cached queries)
- Complejidad: Baja (1 hora de work)

Pero esto es más caro que simplemente migrar a EBS.

---

## 📞 Soporte

Si decides proceder con la migración, puedo:
1. Actualizar el CDK stack completo
2. Crear scripts de migración automatizados
3. Ayudarte durante el proceso
4. Verificar que todo funcione correctamente

¿Quieres que proceda con la migración a EBS?
