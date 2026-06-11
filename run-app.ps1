# run-app.ps1
# Helper script to run the Website QA Scanner application on Windows

$ErrorActionPreference = "Stop"
$env:JAVA_HOME = "c:\Users\suppo\Auto-Checker\.tools\jdk21"
$env:PATH = "c:\Users\suppo\Auto-Checker\.tools\jdk21\bin;c:\Users\suppo\Auto-Checker\.tools\maven\bin;" + $env:PATH

Write-Output "Starting Website QA Scanner Server using JDK 21 and Maven..."
mvn spring-boot:run
