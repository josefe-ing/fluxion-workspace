#!/bin/bash

# Script de instalación de dependencias ETL
# La Granja Mercado - Sistema de Inventarios

echo "📦 INSTALACIÓN DE DEPENDENCIAS ETL"
echo "=================================="
echo

# Detectar sistema operativo
OS_TYPE=$(uname -s)
echo "🖥️  Sistema operativo: $OS_TYPE"

# Instalar ODBC Driver para SQL Server según el sistema
if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS
    echo "🍎 Instalando ODBC Driver para macOS..."

    # Verificar si Homebrew está instalado
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew no encontrado. Instálalo desde: https://brew.sh"
        exit 1
    fi

    # Instalar Microsoft ODBC Driver
    echo "📥 Instalando Microsoft ODBC Driver 17 para SQL Server..."
    brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
    brew update
    brew install msodbcsql17 mssql-tools

elif [[ "$OS_TYPE" == "Linux" ]]; then
    # Linux (Ubuntu/Debian)
    echo "🐧 Instalando ODBC Driver para Linux..."

    # Detectar distribución
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        echo "📥 Instalando para Ubuntu/Debian..."

        curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
        curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list | sudo tee /etc/apt/sources.list.d/msprod.list

        sudo apt-get update
        sudo ACCEPT_EULA=Y apt-get install -y msodbcsql17 unixodbc-dev

    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        echo "📥 Instalando para CentOS/RHEL..."

        sudo curl https://packages.microsoft.com/config/rhel/8/prod.repo > /etc/yum.repos.d/msprod.repo
        sudo yum remove -y unixODBC-utf16 unixODBC-utf16-devel
        sudo ACCEPT_EULA=Y yum install -y msodbcsql17 unixODBC-devel
    fi

else
    echo "❌ Sistema operativo no soportado: $OS_TYPE"
    echo "Por favor instala manualmente Microsoft ODBC Driver 17 para SQL Server"
    exit 1
fi

echo
echo "🐍 Instalando dependencias Python..."

# Verificar que estamos en el directorio correcto
if [ ! -f "requirements.txt" ]; then
    echo "❌ Archivo requirements.txt no encontrado"
    echo "Ejecuta este script desde el directorio etl/"
    exit 1
fi

# Actualizar pip
python3 -m pip install --upgrade pip

# Instalar dependencias
python3 -m pip install -r requirements.txt

echo
echo "🧪 Verificando instalación..."

# Probar importaciones críticas
python3 -c "
import sys
try:
    import pyodbc
    print('   ✅ pyodbc instalado correctamente')

    # Verificar drivers disponibles
    drivers = [x for x in pyodbc.drivers() if 'SQL Server' in x or 'ODBC Driver' in x]
    if drivers:
        print(f'   ✅ Drivers ODBC disponibles: {drivers}')
    else:
        print('   ⚠️  No se encontraron drivers SQL Server ODBC')

except ImportError as e:
    print('   ❌ Error importando pyodbc:', e)
    sys.exit(1)

try:
    import psycopg2
    print('   ✅ psycopg2 instalado correctamente')
except ImportError:
    print('   ❌ Error importando psycopg2')
    sys.exit(1)

try:
    import pandas
    print('   ✅ pandas instalado correctamente')
except ImportError:
    print('   ❌ Error importando pandas')
    sys.exit(1)

print('   🎉 Todas las dependencias están correctas')
"

PYTHON_EXIT_CODE=$?

echo
if [ $PYTHON_EXIT_CODE -eq 0 ]; then
    echo "✅ INSTALACIÓN COMPLETADA EXITOSAMENTE"
    echo
    echo "🚀 PRÓXIMOS PASOS:"
    echo "1. Ejecuta: python3 setup_etl.py"
    echo "2. Configura las credenciales y ubicaciones"
    echo "3. Prueba las conexiones: python3 etl_orchestrator.py --action test-connections"
else
    echo "❌ INSTALACIÓN FALLÓ"
    echo "Revisa los errores arriba y vuelve a intentar"
fi

echo
echo "📋 INFORMACIÓN ADICIONAL:"
echo "- Logs del sistema: logs/"
echo "- Configuración: .env (después de ejecutar setup_etl.py)"
echo "- Documentación completa: README.md"