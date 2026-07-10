# run-app.ps1
# Helper script to run the Website QA Scanner application on Windows

$ErrorActionPreference = "Stop"

if (Get-Command mvn -ErrorAction SilentlyContinue) {
    Write-Output "Detected system Maven. Starting Website QA Scanner Server..."
    mvn spring-boot:run
} else {
    Write-Output "System Maven not found. Using bundled JDK 21 and Maven..."
    $env:JAVA_HOME = "c:\Users\suppo\Auto-Checker\.tools\jdk21"
    $env:PATH = "c:\Users\suppo\Auto-Checker\.tools\jdk21\bin;c:\Users\suppo\Auto-Checker\.tools\maven\bin;" + $env:PATH
    mvn spring-boot:run
}

