@echo off
echo ============================================================
echo  Auto-Checker - Start Server + Push to GitHub
echo ============================================================

rem === Absolute tool paths ===
set "JAVA_HOME=C:\Users\suppo\Auto-Checker\.tools\jdk21"
set "PATH=C:\Users\suppo\Auto-Checker\.tools\jdk21\bin;C:\Users\suppo\Auto-Checker\.tools\maven\bin;%PATH%"

echo.
echo [1/2] Committing and pushing latest code to GitHub...
git -C "C:\Users\suppo\Auto-Checker" add -A
git -C "C:\Users\suppo\Auto-Checker" commit -m "fix: resolve all errors - async/transaction, DB paths, spelling detection, delete cascade"
git -C "C:\Users\suppo\Auto-Checker" push origin main

echo.
echo [2/2] Starting Spring Boot server...
echo Server will be available at: http://localhost:8080
echo.
"C:\Users\suppo\Auto-Checker\.tools\maven\bin\mvn.cmd" -f "C:\Users\suppo\Auto-Checker\pom.xml" spring-boot:run
