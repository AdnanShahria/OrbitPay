$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliScript = Join-Path $scriptDir "scripts\app-cli.mjs"
if (Get-Command bun -ErrorAction SilentlyContinue) {
    & bun $cliScript @args
} else {
    & node $cliScript @args
}
exit $LASTEXITCODE
