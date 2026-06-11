@echo off
setlocal
rem Absolute path to project root
set "PROJECT_ROOT=%~dp0"

rem Set JAVA_HOME to bundled JDK21
set "JAVA_HOME=%PROJECT_ROOT%\.tools\jdk21"

rem Prepend JDK and Maven bin directories to PATH
set "PATH=%JAVA_HOME%\bin;%PROJECT_ROOT%\.tools\maven\bin;%PATH%"

rem Run Maven Spring Boot
"%PROJECT_ROOT%\.tools\maven\bin\mvn.cmd" spring-boot:run
