import React from 'react';
import { Box, Container, Typography, Paper, LinearProgress } from '@mui/material';
import { Construction, Schedule, TrendingUp } from '@mui/icons-material';

interface MaintenancePageProps {
  estimatedEndTime?: string;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({
  estimatedEndTime = "6:00 AM"
}) => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={8}
          sx={{
            padding: 4,
            textAlign: 'center',
            borderRadius: 3
          }}
        >
          {/* Icon de construcción */}
          <Construction
            sx={{
              fontSize: 80,
              color: '#667eea',
              marginBottom: 2
            }}
          />

          {/* Título principal */}
          <Typography
            variant="h4"
            gutterBottom
            sx={{
              fontWeight: 700,
              color: '#2d3748'
            }}
          >
            Estamos Recolectando la Data
          </Typography>

          {/* Mensaje informativo */}
          <Typography
            variant="h6"
            sx={{
              color: '#4a5568',
              marginBottom: 3,
              lineHeight: 1.6
            }}
          >
            Fluxion AI está procesando los datos del día para ofrecerte
            insights precisos y actualizados.
          </Typography>

          {/* Barra de progreso */}
          <LinearProgress
            sx={{
              marginY: 3,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#e2e8f0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#667eea'
              }
            }}
          />

          {/* Hora estimada */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              marginBottom: 3
            }}
          >
            <Schedule sx={{ color: '#667eea' }} />
            <Typography
              variant="body1"
              sx={{
                color: '#2d3748',
                fontWeight: 600
              }}
            >
              Sistema disponible después de las {estimatedEndTime}
            </Typography>
          </Box>

          {/* Información adicional */}
          <Paper
            variant="outlined"
            sx={{
              padding: 2,
              backgroundColor: '#f7fafc',
              borderColor: '#e2e8f0'
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                marginBottom: 1
              }}
            >
              <TrendingUp sx={{ color: '#48bb78', fontSize: 20 }} />
              <Typography
                variant="body2"
                sx={{
                  color: '#2d3748',
                  fontWeight: 600
                }}
              >
                ¿Por qué este mantenimiento?
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: '#4a5568',
                lineHeight: 1.6
              }}
            >
              Cada noche, Fluxion AI extrae y procesa datos de ventas,
              inventario y productos de todas las tiendas para mantener
              tus dashboards actualizados con información precisa.
            </Typography>
          </Paper>

          {/* Pie de página */}
          <Typography
            variant="caption"
            sx={{
              color: '#718096',
              display: 'block',
              marginTop: 3
            }}
          >
            Ventana de mantenimiento: 1:00 AM - 6:00 AM (diaria)
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default MaintenancePage;
