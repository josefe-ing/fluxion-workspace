# Comando para Ejecutar Schema SQL en Producción

**Deploy en progreso**: https://github.com/josefe-ing/fluxion-workspace/actions/runs/19646429940

## Paso 1: Esperar a que el deploy complete (~10 minutos)

Monitorear: https://github.com/josefe-ing/fluxion-workspace/actions

## Paso 2: Ejecutar el endpoint temporal

```bash
curl -X POST https://d1tgnaj74tv17v.cloudfront.net/admin/apply-etl-tracking-schema \
  -H "admin-token: temp-deploy-2025-11-24" \
  -H "Content-Type: application/json" | jq
```

**Respuesta esperada**:
```json
{
  "success": true,
  "message": "Schema ETL tracking aplicado exitosamente",
  "statements_executed": 35,
  "statements_with_errors": 0,
  "table_count": 0,
  "results": [...]
}
```

## Paso 3: Verificar que los endpoints de tracking funcionen

```bash
# Verificar cron status (ya no debería dar error de tabla faltante)
curl https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/cron/status | jq

# Verificar ejecuciones (array vacío es correcto)
curl 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/ejecuciones?limite=5' | jq

# Verificar gaps (array vacío es correcto)
curl 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/tracking/gaps' | jq
```

## Paso 4: Remover el endpoint temporal

Una vez verificado que todo funciona:

```bash
# Editar backend/main.py y eliminar las líneas del endpoint temporal
# (líneas 5410-5515)

git add backend/main.py
git commit -m "temp: remove schema apply endpoint (successfully executed)"
git push origin main
```

---

## Monitoreo del Deploy Actual

**Workflow ID**: 19646429940
**URL**: https://github.com/josefe-ing/fluxion-workspace/actions/runs/19646429940

**Comando para monitorear**:
```bash
watch -n 10 'gh run view 19646429940 --json status,conclusion,jobs | jq'
```

---

## Notas de Seguridad

- El endpoint require header `admin-token: temp-deploy-2025-11-24`
- Solo es accesible vía HTTPS
- CloudFront + ALB proporcionan protección DDoS
- El endpoint debe ser removido inmediatamente después de uso
- Los logs de ejecución quedan en CloudWatch

---

## Timeline Estimado

- **15:19** - Push iniciado
- **15:20** - Workflow comenzó
- **15:30** (estimado) - Deploy completa
- **15:31** - Ejecutar curl comando
- **15:32** - Verificar endpoints
- **15:35** - Remover endpoint temporal
- **15:45** - Deploy de remoción completo

**Total**: ~26 minutos desde push hasta completar todo
