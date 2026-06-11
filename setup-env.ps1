# setup-env.ps1
# This script downloads and configures a local, self-contained JDK 21 and Maven environment.

$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $PSScriptRoot ".tools"
$jdkZip = Join-Path $toolsDir "jdk21.zip"
$mvnZip = Join-Path $toolsDir "maven.zip"

$jdkDir = Join-Path $toolsDir "jdk21"
$mvnDir = Join-Path $toolsDir "maven"

if (-not (Test-Path $toolsDir)) {
    Write-Host "Creating tools directory: $toolsDir"
    New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

# 1. Download JDK 21
if (-not (Test-Path $jdkDir)) {
    Write-Host "Downloading Eclipse Temurin JDK 21..."
    $jdkUrl = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $jdkUrl -OutFile $jdkZip
    
    Write-Host "Extracting JDK 21..."
    Expand-Archive -Path $jdkZip -DestinationPath $toolsDir
    
    # Adoptium zip extracts to a subdirectory (e.g. jdk-21.0.11+10). Let's rename it to 'jdk21'.
    $extractedFolder = Get-ChildItem -Path $toolsDir -Directory | Where-Object { $_.Name -like "jdk-21*" }
    if ($extractedFolder) {
        Rename-Item -Path $extractedFolder.FullName -NewName "jdk21"
        Write-Host "JDK 21 installed at $jdkDir"
    } else {
        Write-Warning "Could not find extracted JDK folder to rename. Checking contents..."
    }
    
    if (Test-Path $jdkZip) { Remove-Item $jdkZip }
} else {
    Write-Host "JDK 21 already exists at $jdkDir"
}

# 2. Download Maven 3.9.6
if (-not (Test-Path $mvnDir)) {
    Write-Host "Downloading Apache Maven 3.9.6..."
    $mvnUrl = "https://archive.apache.org/dist/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip"
    Invoke-WebRequest -Uri $mvnUrl -OutFile $mvnZip
    
    Write-Host "Extracting Maven..."
    Expand-Archive -Path $mvnZip -DestinationPath $toolsDir
    
    $extractedFolder = Get-ChildItem -Path $toolsDir -Directory | Where-Object { $_.Name -like "apache-maven-3.9.6*" }
    if ($extractedFolder) {
        Rename-Item -Path $extractedFolder.FullName -NewName "maven"
        Write-Host "Maven installed at $mvnDir"
    } else {
        Write-Warning "Could not find extracted Maven folder to rename."
    }
    
    if (Test-Path $mvnZip) { Remove-Item $mvnZip }
} else {
    Write-Host "Maven already exists at $mvnDir"
}

# 3. Verification
$javaPath = Join-Path $jdkDir "bin\java.exe"
$mvnPath = Join-Path $mvnDir "bin\mvn.cmd"

Write-Host "----------------------------------------"
Write-Host "Verifying installations:"
Write-Host "----------------------------------------"

if (Test-Path $javaPath) {
    & $javaPath -version
} else {
    Write-Error "java.exe not found at $javaPath"
}

if (Test-Path $mvnPath) {
    & $mvnPath -version
} else {
    Write-Error "mvn.cmd not found at $mvnPath"
}

Write-Host "----------------------------------------"
Write-Host "Environment bootstrapping complete!"
Write-Host "----------------------------------------"
