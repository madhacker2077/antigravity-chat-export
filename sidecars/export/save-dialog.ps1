$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.SaveFileDialog
$owner = New-Object System.Windows.Forms.Form
try {
    $dialog.Title = '另存为 Markdown'
    $dialog.Filter = 'Markdown (*.md)|*.md'
    $dialog.DefaultExt = 'md'
    $dialog.AddExtension = $true
    $dialog.OverwritePrompt = $true
    $dialog.CheckPathExists = $true
    $dialog.RestoreDirectory = $true
    $dialog.FileName = $env:AGY_EXPORT_SUGGESTED_NAME

    $directory = $env:AGY_EXPORT_INITIAL_DIRECTORY
    if (!$directory -or ![IO.Directory]::Exists($directory)) {
        $directory = [Environment]::GetFolderPath('DesktopDirectory')
    }
    $dialog.InitialDirectory = $directory

    $owner.ShowInTaskbar = $false
    $owner.FormBorderStyle = 'None'
    $owner.Opacity = 0
    $owner.TopMost = $true
    $owner.Show()
    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.FileName)))
    }
} finally {
    $dialog.Dispose()
    $owner.Dispose()
}
