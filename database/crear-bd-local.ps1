# =====================================================================
# Crea la base de datos local de desarrollo (una sola vez), en Windows.
#
# Uso:
#   .\database\crear-bd-local.ps1
#
# Pide la clave del superusuario "postgres" (la que definiste al instalar PostgreSQL),
# crea el rol sierraflow_owner y la base sierraflow, aplica las migraciones, crea los
# roles de la aplicacion y escribe las cadenas de conexion en el archivo .env.
# =====================================================================
param(
  [string]$ClaveOwner     = "sierraflow_owner_dev",
  [string]$ClaveApp       = "sierraflow_app_dev",
  [string]$ClaveAnalitica = "sierraflow_analitica_dev",
  [string]$Servidor       = "localhost",
  [int]$Puerto            = 5432
)
$ErrorActionPreference = "Stop"
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $dir
$env:PGCLIENTENCODING = "UTF8"

# --- psql ----------------------------------------------------------------------
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  $candidato = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
               Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending |
               Select-Object -First 1
  if (-not $candidato) {
    throw "No se encontro psql. Instala PostgreSQL (winget install PostgreSQL.PostgreSQL.17) y vuelve a ejecutar."
  }
  $env:Path = "$($candidato.DirectoryName);$env:Path"
}

# --- clave de postgres ---------------------------------------------------------
$seguro = Read-Host "Clave del usuario postgres" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))

function Psql-Postgres([string]$baseDatos, [string]$sql) {
  $r = psql -h $Servidor -p $Puerto -U postgres -d $baseDatos -v ON_ERROR_STOP=1 -tAc $sql
  if ($LASTEXITCODE -ne 0) { throw "Error ejecutando: $sql" }
  return $r
}

try {
  Write-Host "> Verificando conexion..."
  Psql-Postgres "postgres" "SELECT version()" | Out-Null

  if ((Psql-Postgres "postgres" "SELECT 1 FROM pg_roles WHERE rolname='sierraflow_owner'") -ne "1") {
    Write-Host "> Creando rol sierraflow_owner"
    Psql-Postgres "postgres" "CREATE ROLE sierraflow_owner LOGIN PASSWORD '$ClaveOwner'" | Out-Null
  }
  if ((Psql-Postgres "postgres" "SELECT 1 FROM pg_database WHERE datname='sierraflow'") -ne "1") {
    Write-Host "> Creando base de datos sierraflow"
    Psql-Postgres "postgres" "CREATE DATABASE sierraflow OWNER sierraflow_owner ENCODING 'UTF8' TEMPLATE template0" | Out-Null
  }

  # --- .env ----------------------------------------------------------------------
  $urlOwner     = "postgres://sierraflow_owner:$ClaveOwner@${Servidor}:$Puerto/sierraflow"
  $urlApp       = "postgres://sierraflow_app:$ClaveApp@${Servidor}:$Puerto/sierraflow"
  $urlAnalitica = "postgres://sierraflow_analitica:$ClaveAnalitica@${Servidor}:$Puerto/sierraflow"
  $archivoEnv = "$raiz\.env"
  if (-not (Test-Path $archivoEnv)) { Copy-Item "$raiz\.env.example" $archivoEnv }
  $contenido = Get-Content $archivoEnv
  $contenido = $contenido -replace '^DATABASE_URL_OWNER=.*', "DATABASE_URL_OWNER=$urlOwner"
  $contenido = $contenido -replace '^DATABASE_URL=.*', "DATABASE_URL=$urlApp"
  $contenido = $contenido -replace '^DATABASE_URL_ANALITICA=.*', "DATABASE_URL_ANALITICA=$urlAnalitica"
  [IO.File]::WriteAllLines($archivoEnv, $contenido)   # UTF-8 sin BOM
  Write-Host "> .env actualizado con las cadenas de conexion"

  # --- migraciones (como sierraflow_owner) ---------------------------------------
  $env:DATABASE_URL_OWNER = $urlOwner
  & "$dir\migrar.ps1"

  # --- roles de la aplicacion (como postgres) -------------------------------------
  Write-Host "> Creando roles de la aplicacion"
  psql -h $Servidor -p $Puerto -U postgres -d sierraflow -q -v ON_ERROR_STOP=1 `
       -v "clave_app=$ClaveApp" -v "clave_analitica=$ClaveAnalitica" -f "$dir\seguridad\roles_seguridad.sql"
  if ($LASTEXITCODE -ne 0) { throw "Fallo roles_seguridad.sql" }

  Write-Host ""
  Write-Host "Listo. Base de datos 'sierraflow' creada y migrada." -ForegroundColor Green
  Write-Host "Datos de prueba (opcional):  psql `"$urlOwner`" -f database\demo\datos_demo.sql"
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
