@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "JAVA_HOME=%PROJECT_ROOT%.tools\jdk21"
set "PATH=%JAVA_HOME%\bin;%PROJECT_ROOT%.tools\maven\bin;C:\Windows\system32;C:\Windows;C:\Windows\System32\Wbem"
set "USERPROFILE=C:\Users\suppo\Auto-Checker"
set "HOMEDRIVE=C:"
set "HOMEPATH=\Users\suppo\Auto-Checker"
set "APPDATA=C:\Users\suppo\Auto-Checker\tmp"
set "LOCALAPPDATA=C:\Users\suppo\Auto-Checker\tmp"
set "MAVEN_OPTS=-Djava.io.tmpdir=C:\Users\suppo\Auto-Checker\tmp -Duser.home=C:\Users\suppo\Auto-Checker"
call "%PROJECT_ROOT%.tools\maven\bin\mvn.cmd" -Dmaven.repo.local="%PROJECT_ROOT%.m2\repository" clean compile
