Add-Type -AssemblyName System.Windows.Forms
$path = "$env:TEMP\claude_screenshot.png"

if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Write-Output $path
} else {
    Write-Output ""
}
