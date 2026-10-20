$ErrorActionPreference = 'Stop'
$previousJavaHome = $env:JAVA_HOME
$exitCode = 1

try {
    $nodeExecutable = $env:APPUNPACK_NODE
    if (-not $nodeExecutable) {
        $localNode = Join-Path $PSScriptRoot '.tools\node.exe'
        if (Test-Path -LiteralPath $localNode -PathType Leaf) {
            $nodeExecutable = $localNode
        } else {
            $nodeExecutable = (Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
        }
    }
    if (-not $nodeExecutable) {
        throw 'Node.js 24.11 or newer is required. Install it or set APPUNPACK_NODE to node.exe.'
    }
    $nodeVersion = & $nodeExecutable --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+\.\d+\.\d+)$' -or [version]$Matches[1] -lt [version]'24.11.0') {
        throw "Node.js 24.11 or newer is required; selected runtime reported: $nodeVersion. Set APPUNPACK_NODE to a supported node.exe."
    }

    if (-not $env:JAVA_HOME -and -not (Get-Command java -CommandType Application -ErrorAction SilentlyContinue) -and $env:ProgramFiles) {
        $androidJava = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
        if (Test-Path -LiteralPath (Join-Path $androidJava 'bin\java.exe') -PathType Leaf) {
            $env:JAVA_HOME = $androidJava
        }
    }

    & $nodeExecutable (Join-Path $PSScriptRoot 'bin\appunpack.mjs') @args
    $exitCode = $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
} finally {
    $env:JAVA_HOME = $previousJavaHome
}

exit $exitCode
