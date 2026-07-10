@echo off
echo ============================================================
echo  Auto-Checker - Push Code to new 'Test' branch
echo ============================================================
echo.

:: 1. Navigate to the script's directory to ensure correct path context
cd /d "%~dp0"

:: 2. Check if git is installed
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    echo Please install Git and try again.
    pause
    exit /b 1
)

:: 3. Create and switch to the new branch 'Test'
echo [1/4] Creating and switching to new branch 'Test'...
git checkout -b Test
if %ERRORLEVEL% neq 0 (
    echo [INFO] Branch 'Test' might already exist. Trying to switch to it...
    git checkout Test
)

:: 4. Stage all changes (including the .vscode configuration)
echo.
echo [2/4] Staging all files...
git add -A

:: 5. Commit changes
echo.
echo [3/4] Committing changes...
git commit -m "chore: configure IDE workspace to resolve project errors and configure local maven"

:: 6. Push to origin 'Test'
echo.
echo [4/4] Pushing 'Test' branch to GitHub...
git push -u origin Test

echo.
echo ============================================================
echo  Done! The code has been pushed to branch 'Test' on GitHub.
echo ============================================================
pause
