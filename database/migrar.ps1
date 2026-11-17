# =====================================================================
# Aplica migraciones y semillas pendientes (Windows / PowerShell)
# Uso:  $env:DATABASE_URL_OWNER="postgres://sierraflow_owner:clave@127.0.0.1:5432/sierraflow"
#       .\database\migrar.ps1
# Requiere psql en el PATH (C:\Program Files\PostgreSQL\<ver>\bin)
# =====================================================================
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = if ($env:DATABASE_URL_OWNER) { $env:DATABASE_URL_OWNER } else { $env:DATABASE_URL }
if (-not $url) { throw "Defina DATABASE_URL_OWNER" }

$init = @"
CREATE SCHEMA IF NOT EXISTS gestion;
CREATE TABLE IF NOT EXISTS gestion.migraciones_aplicadas(
  archivo varchar(200) PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now());
"@
$init | psql $url -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw "No se pudo inicializar el control de migraciones" }

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
