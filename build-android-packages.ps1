# WalletVibe — Android Release Build & Sign Script (v1 + v2 + v3 Schemes)

$ErrorActionPreference = "Stop"

$jdkPath = "D:\Shk_Gulfam\android_jdk\jdk-17.0.11+9"
$sdkPath = "D:\Shk_Gulfam\android_sdk"
$buildTools = "$sdkPath\build-tools\35.0.0"

$env:JAVA_HOME = $jdkPath
$env:ANDROID_HOME = $sdkPath

Write-Host "=== 1. Building WebApp Production Bundle ===" -ForegroundColor Cyan
npm run build

Write-Host "=== 2. Building Android Release (.apk & .aab) ===" -ForegroundColor Cyan
.\gradlew.bat assembleRelease bundleRelease

Write-Host "=== 3. ZipAligning APK on 4-byte boundaries ===" -ForegroundColor Cyan
Remove-Item -Path "WalletVibe-Aligned.apk" -ErrorAction SilentlyContinue
& "$buildTools\zipalign.exe" -v -p 4 "app\build\outputs\apk\release\app-release-unsigned.apk" "WalletVibe-Aligned.apk"

Write-Host "=== 4. Signing APK with v1, v2, and v3 Schemes (apksigner) ===" -ForegroundColor Cyan
& "$buildTools\apksigner.bat" sign --ks android.keystore --ks-key-alias walletvibe --ks-pass pass:walletvibe123 --key-pass pass:walletvibe123 --out WalletVibe-Direct.apk WalletVibe-Aligned.apk

Write-Host "=== 5. Signing Play Store App Bundle (.aab) (jarsigner) ===" -ForegroundColor Cyan
& "$jdkPath\bin\jarsigner.exe" -keystore android.keystore -storepass walletvibe123 -keypass walletvibe123 "app\build\outputs\bundle\release\app-release.aab" walletvibe
Copy-Item "app\build\outputs\bundle\release\app-release.aab" -Destination "WalletVibe-PlayStore.aab" -Force

Write-Host "=== 6. Verifying APK Signature Scheme ===" -ForegroundColor Cyan
& "$buildTools\apksigner.bat" verify -v WalletVibe-Direct.apk

Write-Host "`n✅ BUILD SUCCESSFUL! Both release binaries ready:" -ForegroundColor Green
Get-Item WalletVibe-Direct.apk, WalletVibe-PlayStore.aab | Select-Object Name, FullName, @{Name="Size (MB)";Expression={[math]::round($_.Length/1MB, 2)}}
