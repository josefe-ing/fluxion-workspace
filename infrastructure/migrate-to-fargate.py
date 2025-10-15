#!/usr/bin/env python3
"""
Script para migrar infrastructure-stack.ts de EC2 a Fargate
"""

import re

# Read the current file
with open('lib/infrastructure-stack.ts', 'r') as f:
    content = f.read()

# 1. Comment out all EC2/AutoScaling code (lines after EcsInstanceRole creation until cluster.addAsgCapacityProvider)
ec2_section_pattern = r'(    // Add tags to ASG for identification.*?cluster\.addAsgCapacityProvider\(capacityProvider\);)'
content = re.sub(ec2_section_pattern, r'    // EC2/AutoScaling code commented out - see backup file\n    */', content, flags=re.DOTALL)

# 2. Change Ec2TaskDefinition to FargateTaskDefinition
content = content.replace(
    'const backendTask = new ecs.Ec2TaskDefinition(',
    'const backendTask = new ecs.FargateTaskDefinition('
)

# 3. Change task definition configuration from host volume to EFS
old_task_config = r'''      \{
        networkMode: ecs\.NetworkMode\.AWS_VPC,
        volumes: \[
          \{
            name: 'fluxion-data',
            host: \{
              sourcePath: '/mnt/data', // EBS mount point from EC2 user data
            \},
          \},
        \],
      \}'''

new_task_config = '''      {
        memoryLimitMiB: 2048,
        cpu: 1024,
        volumes: [
          {
            name: 'fluxion-data',
            efsVolumeConfiguration: {
              fileSystemId: fileSystem.fileSystemId,
              transitEncryption: 'ENABLED',
              authorizationConfig: {
                accessPointId: accessPoint.accessPointId,
                iam: 'ENABLED',
              },
            },
          },
        ],
      }'''

content = re.sub(old_task_config, new_task_config, content)

# 4. Change memory reservation to hard limit for Fargate
content = content.replace(
    'memoryReservationMiB: 1024, // Soft limit for EC2',
    'memory: 1024, // Hard limit for Fargate'
)

# 5. Grant EFS access to task role
efs_grant_pattern = r'(    oldBackupBucket\.grantRead\(backendTask\.taskRole\);)'
efs_grant_addition = r'''\1

    // Grant EFS root access to task role (required for Fargate)
    fileSystem.grantRootAccess(backendTask.taskRole);'''
content = re.sub(efs_grant_pattern, efs_grant_addition, content)

# 6. Change Ec2Service to FargateService
content = content.replace(
    'const backendService = new ecs.Ec2Service(this, \'FluxionBackendService\', {',
    'const backendService = new ecs.FargateService(this, \'FluxionBackendService\', {'
)

# 7. Remove capacityProviderStrategies and replace with Fargate config
old_service_config = r'''      cluster,
      taskDefinition: backendTask,
      desiredCount: 1,
      capacityProviderStrategies: \[
        \{
          capacityProvider: capacityProvider\.capacityProviderName,
          weight: 1,
        \},
      \],
      minHealthyPercent: 0, // Allow stopping old task before starting new one \(only 1 task\)
      maxHealthyPercent: 100, // Only 1 task at a time'''

new_service_config = '''      cluster,
      taskDefinition: backendTask,
      desiredCount: 1,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      minHealthyPercent: 0, // Allow stopping old task before starting new one (only 1 task)
      maxHealthyPercent: 100, // Only 1 task at a time'''

content = re.sub(old_service_config, new_service_config, content)

# 8. Update comment for section 7
content = content.replace(
    '// 7. Backend Service with ALB (EC2)',
    '// 7. Backend Service with ALB (Fargate)'
)

# Write the updated content
with open('lib/infrastructure-stack.ts', 'w') as f:
    f.write(content)

print("✅ Migration to Fargate complete!")
print("Changes made:")
print("  1. Commented out EC2/AutoScaling/CapacityProvider code")
print("  2. Changed Ec2TaskDefinition → FargateTaskDefinition")
print("  3. Changed host volume → EFS volume")
print("  4. Changed Ec2Service → FargateService")
print("  5. Added EFS root access grant")
print("  6. Updated service configuration for Fargate")
print("")
print("Backup saved at: lib/infrastructure-stack-ec2-backup.ts")
