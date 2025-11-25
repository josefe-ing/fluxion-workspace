#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FluxionStackV3 } from '../lib/postgres-stack';

/**
 * Fluxion Stack V3 - PostgreSQL v2.0 Deployment
 *
 * Stack completamente nuevo con SOLO PostgreSQL RDS.
 *
 * Ventajas sobre FluxionStackV2:
 * - Stack limpio sin historial de errores/rollback
 * - No afecta servicios existentes (Backend/ETL/Frontend siguen en V2)
 * - Configuración optimizada (GP3 100GB, sin IOPS custom)
 * - Fácil rollback si algo falla
 * - Deploy rápido (~10-15 minutos)
 */

const app = new cdk.App();

new FluxionStackV3(app, 'FluxionStackV3', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'Fluxion AI V3 - PostgreSQL v2.0 Database',
});
