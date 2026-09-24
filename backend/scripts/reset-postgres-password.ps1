# Restablece la contraseña del usuario "postgres" de PostgreSQL 17 y la guarda en backend/.env.
# EJECUTAR COMO ADMINISTRADOR (clic derecho en PowerShell -> "Ejecutar como administrador").
#
# Qué hace, en orden:
#   1. Respalda pg_hba.conf
#   2. Lo cambia a "trust" solo para conexiones locales y reinicia el servicio
#   3. Ejecuta ALTER USER postgres con la contraseña que tú escribas
#   4. Restaura pg_hba.conf original y reinicia el servicio
#   5. Escribe DB_PASSWORD en backend/.env

$ErrorActionPreference = 'Stop'

$servicio = 'postgresql-x64-17'
$pgBin    = 'C:\Program Files\PostgreSQL\17\bin'
$hba      = 'C:\Program Files\PostgreSQL\17\data\pg_hba.conf'
$respaldo = "$hba.bak"
$envFile  = Join-Path $PSScriptRoot '..\.env'

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { throw 'Abre PowerShell como Administrador y vuelve a ejecutar este script.' }

$segura = Read-Host 'Escribe la NUEVA contraseña para el usuario postgres' -AsSecureString
$nueva  = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
if ($nueva.Length -lt 6) { throw 'Usa al menos 6 caracteres.' }
if ($nueva -match "['`"\\]") { throw "Evita comillas y barras invertidas en la contraseña." }

Copy-Item $hba $respaldo -Force
try {
    (Get-Content $hba) -replace 'scram-sha-256', 'trust' | Set-Content $hba -Encoding ASCII
    Restart-Service $servicio
    Start-Sleep -Seconds 3

    & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -w -c "ALTER USER postgres PASSWORD '$nueva';"
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo cambiar la contraseña.' }
}
finally {
    Copy-Item $respaldo $hba -Force
    Remove-Item $respaldo -Force
    Restart-Service $servicio
}

$contenido = Get-Content $envFile -Raw
if ($contenido -match '(?m)^DB_PASSWORD=.*$') {
    $contenido = $contenido -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$nueva"
} else {
    $contenido += "`nDB_PASSWORD=$nueva`n"
}
Set-Content $envFile $contenido -NoNewline -Encoding ASCII

Write-Host 'Listo: contraseña cambiada, pg_hba.conf restaurado y backend/.env actualizado.' -ForegroundColor Green
