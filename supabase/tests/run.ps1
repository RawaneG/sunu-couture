# Rejoue TOUTES les migrations Phase 2 + les tests de schéma sur une base jetable.
# Aucune donnee reelle, aucun reseau distant.
#
# Usage :
#   pwsh supabase/tests/run.ps1
#   $env:PGHOST='127.0.0.1'; $env:PGPORT='5432'; $env:PGUSER='postgres'; $env:PGPASSWORD='...'; pwsh supabase/tests/run.ps1
#
# Prerequis : psql dans le PATH (ex : C:\Program Files\PostgreSQL\18\bin), droit CREATE DATABASE.
$ErrorActionPreference = 'Stop'

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$migDir = Join-Path $here '..\migrations'
$testDb = "tayoo_ci_$PID"

if (-not $env:PGHOST)     { $env:PGHOST = '127.0.0.1' }
if (-not $env:PGPORT)     { $env:PGPORT = '5432' }
if (-not $env:PGUSER)     { $env:PGUSER = 'postgres' }
if (-not $env:PGDATABASE) { $env:PGDATABASE = 'postgres' }

function Invoke-Psql([string]$db, [string[]]$extra) {
  & psql "--dbname=$db" '-v' 'ON_ERROR_STOP=1' @extra
  if ($LASTEXITCODE -ne 0) { throw "psql a echoue (db=$db)" }
}

try {
  Write-Host "> creation base jetable $testDb"
  Invoke-Psql $env:PGDATABASE @('-q', '-c', "create database ""$testDb"";")

  Write-Host "> shim auth local (test hors Supabase)"
  Invoke-Psql $testDb @('-q', '-f', (Join-Path $here '00_local_auth_shim.sql'))

  Write-Host "> migrations"
  Get-ChildItem (Join-Path $migDir '*.sql') | Sort-Object Name | ForEach-Object {
    Write-Host "  - $($_.Name)"
    Invoke-Psql $testDb @('-q', '-f', $_.FullName)
  }

  Write-Host "> tests de schema"
  Invoke-Psql $testDb @('-f', (Join-Path $here '10_schema_tests.sql'))

  Write-Host "OK - migrations + tests de schema passent" -ForegroundColor Green
}
finally {
  & psql "--dbname=$($env:PGDATABASE)" '-q' '-c' "drop database if exists ""$testDb"" with (force);" 2>$null | Out-Null
}
