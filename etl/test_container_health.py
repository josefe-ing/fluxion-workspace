#!/usr/bin/env python3
"""
Test de salud del container ETL
Verifica que todas las dependencias estén instaladas correctamente
"""

import sys

def test_imports():
    """Test que todos los imports necesarios funcionan"""
    print("🧪 Testing Python imports...")

    try:
        import pyodbc
        print("  ✅ pyodbc imported successfully")
        print(f"     Available drivers: {pyodbc.drivers()}")
    except ImportError as e:
        print(f"  ❌ pyodbc import failed: {e}")
        return False

    try:
        import duckdb
        print(f"  ✅ duckdb imported successfully (version: {duckdb.__version__})")
    except ImportError as e:
        print(f"  ❌ duckdb import failed: {e}")
        return False

    try:
        import boto3
        print(f"  ✅ boto3 imported successfully")
    except ImportError as e:
        print(f"  ❌ boto3 import failed: {e}")
        return False

    try:
        import pandas
        print(f"  ✅ pandas imported successfully")
    except ImportError as e:
        print(f"  ❌ pandas import failed: {e}")
        return False

    return True

def test_filesystem():
    """Test que los directorios necesarios existan"""
    print("\n📁 Testing filesystem...")

    import os

    dirs_to_check = ['/app', '/app/core', '/app/logs', '/data']

    all_good = True
    for dir_path in dirs_to_check:
        if os.path.exists(dir_path):
            writable = os.access(dir_path, os.W_OK)
            if writable:
                print(f"  ✅ {dir_path} exists and is writable")
            else:
                print(f"  ⚠️  {dir_path} exists but is NOT writable")
                all_good = False
        else:
            print(f"  ❌ {dir_path} does NOT exist")
            all_good = False

    return all_good

def test_etl_scripts():
    """Test que los scripts ETL existan"""
    print("\n📜 Testing ETL scripts...")

    import os

    scripts_to_check = [
        '/app/etl_inventario.py',
        '/app/startup-etl.sh',
        '/app/core/tiendas_config.py',
        '/app/core/config.py'
    ]

    all_good = True
    for script in scripts_to_check:
        if os.path.exists(script):
            print(f"  ✅ {script} exists")
        else:
            print(f"  ❌ {script} does NOT exist")
            all_good = False

    return all_good

def test_odbc_config():
    """Test configuración ODBC"""
    print("\n🔌 Testing ODBC configuration...")

    import os

    if os.path.exists('/etc/odbc.ini'):
        print("  ✅ /etc/odbc.ini exists")
    else:
        print("  ⚠️  /etc/odbc.ini not found (might be ok)")

    if os.path.exists('/etc/odbcinst.ini'):
        print("  ✅ /etc/odbcinst.ini exists")
        # Show configured drivers
        try:
            with open('/etc/odbcinst.ini', 'r') as f:
                content = f.read()
                if 'FreeTDS' in content or 'ODBC Driver' in content:
                    print("  ✅ SQL Server drivers configured")
                else:
                    print("  ⚠️  No SQL Server drivers found in odbcinst.ini")
        except Exception as e:
            print(f"  ⚠️  Could not read odbcinst.ini: {e}")
    else:
        print("  ❌ /etc/odbcinst.ini not found")
        return False

    return True

def main():
    """Run all tests"""
    print("=" * 60)
    print("🏥 ETL Container Health Check")
    print("=" * 60)
    print("")

    results = []

    results.append(("Python Imports", test_imports()))
    results.append(("Filesystem", test_filesystem()))
    results.append(("ETL Scripts", test_etl_scripts()))
    results.append(("ODBC Config", test_odbc_config()))

    print("\n" + "=" * 60)
    print("📊 Test Results Summary")
    print("=" * 60)

    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if not passed:
            all_passed = False

    print("=" * 60)

    if all_passed:
        print("\n🎉 All tests passed! Container is healthy.")
        return 0
    else:
        print("\n❌ Some tests failed. Check the output above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
