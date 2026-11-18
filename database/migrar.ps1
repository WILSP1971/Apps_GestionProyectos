# =====================================================================
# Aplica migraciones y semillas pendientes (Windows / PowerShell)
#
# Uso:  .\database\migrar.ps1
#   - Toma DATABASE_URL_OWNER de la variable de entorno o, si no existe, del archivo .env de la raiz.
#   - Si psql no esta en el PATH, lo busca en C:\Program Files\PostgreSQL\<version>\bin.
# =====================================================================
$ErrorActionPreference = "Stop"
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $dir

# Los .sql estan en UTF-8 (tildes, enies): sin esto psql en Windows los lee como WIN1252
$env:PGCLIENTENCODING = "UTF8"

# --- 1. Localizar psql ---------------------------------------------------------
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  $candidato = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
               Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending |
               Select-Object -First 1
  if (-not $candidato) {
    throw "No se encontro psql. Instala PostgreSQL (winget install PostgreSQL.PostgreSQL.17) o agrega su carpeta bin al PATH."
  }
  $env:Path = "$($candidato.DirectoryName);$env:Path"
  Write-Host "Usando $($candidato.FullName)" -ForegroundColor DarkGray
}

# --- 2. Cadena de conexion -----------------------------------------------------
$url = $env:DATABASE_URL_OWNER
if (-not $url -and (Test-Path "$raiz\.env")) {
  $linea = Get-Content "$raiz\.env" | Where-Object { $_ -match '^\s*DATABASE_URL_OWNER\s*=' } | Select-Object -First 1
  if ($linea) { $url = ($linea -split '=', 2)[1].Trim().Trim('"') }
}
if (-not $url) {
  throw "Defina DATABASE_URL_OWNER en el archivo .env de la raiz (copie .env.example a .env) o como variable de entorno."
}

# --- 3. Control de migraciones -------------------------------------------------
$init = @"
CREATE SCHEMA IF NOT EXISTS gestion;
CREATE TABLE IF NOT EXISTS gestion.migraciones_aplicadas(
  archivo varchar(200) PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now());
"@
$init | psql $url -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw "No se pudo conectar o inicializar el control de migraciones. Revise DATABASE_URL_OWNER." }

$archivos = @(Get-ChildItem "$dir\migraciones\*.sql" | Sort-Object Name) +
            @(Get-ChildItem "$dir\semillas\*.sql"    | Sort-Object Name)

foreach ($f in $archivos) {
  $nombre = "$($f.Directory.Name)/$($f.Name)"
  $ya = psql $url -tAc "SELECT 1 FROM gestion.migraciones_aplicadas WHERE archivo='$nombre'"
  if ($ya -ne "1") {
    Write-Host "> Aplicando $nombre"
    psql $url -v ON_ERROR_STOP=1 -q -1 -f $f.FullName
    if ($LASTEXITCODE -ne 0) { throw "Fallo en $nombre" }
    psql $url -qc "INSERT INTO gestion.migraciones_aplicadas(archivo) VALUES ('$nombre')"
  }
}
Write-Host "Base de datos al dia" -ForegroundColor Green
