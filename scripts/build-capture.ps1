$ErrorActionPreference='Stop'
$captureRoot=Split-Path $PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$native=Join-Path $captureRoot 'assets\native'
& $compiler /nologo /optimize+ /target:exe /platform:x64 /codepage:65001 /reference:System.Core.dll /reference:System.Web.Extensions.dll ("/out:"+(Join-Path $native 'CaptureBridge.exe')) (Join-Path $native 'CaptureBridge.cs') (Join-Path $native 'HookTarget.cs')
if($LASTEXITCODE -ne 0){throw 'CaptureBridge compilation failed'}
foreach($bit in @('32','64')){
 $platform=if($bit -eq '32'){'x86'}else{'x64'}
 & $compiler /nologo /optimize+ /target:exe "/platform:$platform" /codepage:65001 ("/out:"+(Join-Path $native "HookInjector$bit.exe")) (Join-Path $native 'HookInjector.cs') (Join-Path $native 'HookTarget.cs')
 if($LASTEXITCODE -ne 0){throw 'HookInjector compilation failed'}
}
