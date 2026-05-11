@echo off
cd /d E:\claude\inventory-system\client\android
set ANDROID_HOME=E:\android-sdk
set JAVA_HOME=E:\java21\jdk21
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%
echo ANDROID_HOME=%ANDROID_HOME%
echo JAVA_HOME=%JAVA_HOME%
%JAVA_HOME%\bin\java -version
call gradlew.bat assembleDebug
