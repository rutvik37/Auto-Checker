@echo off
setlocal
set "PROJECT_ROOT=%~dp0"

where mvn >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Detected system Maven. Using system Maven for Spring Boot...
    call mvn spring-boot:run
) else (
    echo System Maven not found. Using bundled Maven...
    set "JAVA_HOME=%PROJECT_ROOT%.tools\jdk21"
    set "PATH=%JAVA_HOME%\bin;%PROJECT_ROOT%.tools\maven\bin;%PATH%"
    call "%PROJECT_ROOT%.tools\maven\bin\mvn.cmd" spring-boot:run
)

