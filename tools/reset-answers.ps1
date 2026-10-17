#Requires -Version 5.1
<#
    reset-answers.ps1  --  workaround patch for "answers survive an application restart".

    What it does
      1. refuses to touch the databases while the EPSE backend (javaw + epse-electron-2.0.0.jar) is running
      2. makes a one-time initial backup of electron-service.db
      3. clears persisted answers in electron-service.db and admin-service.db
         (examinee_question) and blanks the answer traces of examinee_progress while
         KEEPING the row itself - that row carries the login credential / exam binding
      4. deletes the encrypted answer archives produced by ExamAnswerArchiveServiceImpl
         (<upload.path>\exam-answer-archive\...\saveBatchExamAnswer_*.json.enc)

    Technique: no third-party tools. It talks to the SQLite engine that ships with
    Windows (winsqlite3.dll) through P/Invoke. If that is unavailable it falls back
    to Node.js (node:sqlite, Node >= 22.5).

    Exit codes
      0 = cleaned (or nothing to clean)
      2 = backend still running, nothing touched
      3 = database file not found
      9 = cleanup failed (details in tools\reset-answers.log)
#>
[CmdletBinding()]
param(
    [switch]$Quiet,
    [switch]$Force,
    [switch]$IncludeElectronStorage
)

$ErrorActionPreference = 'Stop'

$script:Root         = Split-Path -Parent $PSScriptRoot
$script:ConfigDir    = Join-Path $script:Root 'epse\config'
$script:EpseDb       = Join-Path $script:ConfigDir 'electron-service.db'
$script:AdminDb      = Join-Path $script:ConfigDir 'admin-service.db'
$script:LogPath      = Join-Path $PSScriptRoot 'reset-answers.log'
$script:BackupDir    = Join-Path $PSScriptRoot 'backup'
$script:Status       = 0
$script:Summary      = New-Object System.Collections.Generic.List[string]
$script:WinSqliteOk  = $false
$script:ScalarValue  = $null

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if (-not $Quiet) { Write-Host $line }
    try {
        if ((Test-Path -LiteralPath $script:LogPath) -and ((Get-Item -LiteralPath $script:LogPath).Length -gt 1048576)) {
            Move-Item -LiteralPath $script:LogPath -Destination ($script:LogPath + '.1') -Force
        }
        Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
    } catch { }
}

# ---------------------------------------------------------------- native sqlite
function Initialize-WinSqlite {
    if ($script:WinSqliteOk) { return $true }
    $source = @'
using System;
using System.Runtime.InteropServices;

public delegate int SqliteExecCallback(IntPtr ctx, int argc, IntPtr argv, IntPtr colNames);

public static class WinSqlite
{
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int sqlite3_open_v2(string filename, out IntPtr db, int flags, IntPtr vfs);

    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int sqlite3_exec(IntPtr db, string sql, SqliteExecCallback callback, IntPtr arg, out IntPtr errmsg);

    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr sqlite3_errmsg(IntPtr db);

    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void sqlite3_free(IntPtr p);

    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int sqlite3_close(IntPtr db);
}
'@
    try {
        if (-not ('WinSqlite' -as [type])) {
            Add-Type -TypeDefinition $source -ErrorAction Stop
        }
        $script:WinSqliteOk = $true
        return $true
    } catch {
        Write-Log -Level WARN -Message ("winsqlite3.dll unavailable ({0}); will fall back to Node.js" -f $_.Exception.Message)
        return $false
    }
}

function Open-SqliteDatabase {
    param([Parameter(Mandatory = $true)][string]$Path)
    $handle = [IntPtr]::Zero
    # SQLITE_OPEN_READWRITE = 0x02 (no CREATE flag on purpose: never create a missing db)
    $rc = [WinSqlite]::sqlite3_open_v2($Path, [ref]$handle, 2, [IntPtr]::Zero)
    if ($rc -ne 0) {
        if ($handle -ne [IntPtr]::Zero) { [void][WinSqlite]::sqlite3_close($handle) }
        throw ("cannot open database {0} (sqlite rc={1})" -f $Path, $rc)
    }
    return $handle
}

function Invoke-Sqlite {
    param(
        [Parameter(Mandatory = $true)][IntPtr]$Handle,
        [Parameter(Mandatory = $true)][string]$Sql
    )
    $err = [IntPtr]::Zero
    $rc = [WinSqlite]::sqlite3_exec($Handle, $Sql, $null, [IntPtr]::Zero, [ref]$err)
    if ($rc -eq 0) { return $true }
    $message = ''
    if ($err -ne [IntPtr]::Zero) {
        $message = [System.Runtime.InteropServices.Marshal]::PtrToStringAnsi($err)
        [WinSqlite]::sqlite3_free($err)
    } else {
        $ptr = [WinSqlite]::sqlite3_errmsg($Handle)
        if ($ptr -ne [IntPtr]::Zero) { $message = [System.Runtime.InteropServices.Marshal]::PtrToStringAnsi($ptr) }
    }
    Write-Log -Level WARN -Message ("sql failed: {0} -> {1}" -f $Sql, ($message -replace '\s+', ' ').Trim())
    return $false
}

function Get-SqliteScalar {
    param(
        [Parameter(Mandatory = $true)][IntPtr]$Handle,
        [Parameter(Mandatory = $true)][string]$Sql
    )
    $script:ScalarValue = $null
    $callback = [SqliteExecCallback] {
        param([IntPtr]$ctx, [int]$argc, [IntPtr]$argv, [IntPtr]$colNames)
        if ($argc -ge 1) {
            $cell = [System.Runtime.InteropServices.Marshal]::ReadIntPtr($argv, 0)
            if ($cell -ne [IntPtr]::Zero) {
                $script:ScalarValue = [System.Runtime.InteropServices.Marshal]::PtrToStringAnsi($cell)
            }
        }
        return 0
    }
    $err = [IntPtr]::Zero
    [void][WinSqlite]::sqlite3_exec($Handle, $Sql, $callback, [IntPtr]::Zero, [ref]$err)
    if ($err -ne [IntPtr]::Zero) { [WinSqlite]::sqlite3_free($err) }
    return $script:ScalarValue
}

# ---------------------------------------------------------------- preconditions
function Test-BackendRunning {
    try {
        $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'javaw.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*epse-electron-2.0.0.jar*' })
        return ($procs.Count -gt 0)
    } catch {
        return $false
    }
}

function Backup-Database {
    if (-not (Test-Path -LiteralPath $script:EpseDb)) { return }
    $target = Join-Path $script:BackupDir 'electron-service.initial.db'
    if ((Test-Path -LiteralPath $target) -and (-not $Force)) { return }
    try {
        New-Item -ItemType Directory -Path $script:BackupDir -Force | Out-Null
        Copy-Item -LiteralPath $script:EpseDb -Destination $target -Force
        Write-Log -Message ("initial database snapshot written: {0}" -f $target)
    } catch {
        Write-Log -Level WARN -Message ("database backup failed: {0}" -f $_.Exception.Message)
    }
}

# ------------------------------------------------------------------ db cleaning
function Reset-Database {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Log -Level WARN -Message ("database not found, skipped: {0}" -f $Path)
        return
    }

    Write-Log -Message ("cleaning {0}" -f $Path)
    $handle = [IntPtr]::Zero
    try {
        $handle = Open-SqliteDatabase -Path $Path
    } catch {
        Write-Log -Level ERROR -Message $_.Exception.Message
        $script:Status = 9
        return
    }

    try {
        $statements = @(
            'PRAGMA busy_timeout=5000',
            'BEGIN IMMEDIATE',
            # examinee_question rows are the paper skeleton: reset them, never delete them.
            'UPDATE examinee_question SET is_answer = 2, answer_result = NULL, answer_content = NULL, answer_image = NULL, answer_result_content = NULL, op_process = NULL, result_score = NULL, check_status = NULL',
            # 成绩也清掉，避免上一轮分数残留
            'UPDATE exam_info SET grade = NULL',
            # examinee_progress is the login credential + exam binding: KEEP the row, only blank the answer traces.
            'UPDATE examinee_progress SET answer_time = NULL, submit_time = NULL, op_process = NULL, exam_situation_desc = NULL, exam_progress = 1, exam_status = 1, exam_index = 1',
            'DELETE FROM exam_lockscreen',
            'DELETE FROM circuit_board_result',
            'DELETE FROM examinee_question_1',
            'COMMIT'
        )
        foreach ($sql in $statements) {
            [void](Invoke-Sqlite -Handle $handle -Sql $sql)
        }

        $progress = Get-SqliteScalar -Handle $handle -Sql 'SELECT count(*) FROM examinee_progress'
        $answered = Get-SqliteScalar -Handle $handle -Sql 'SELECT count(*) FROM examinee_question WHERE is_answer = 1'
        $total = Get-SqliteScalar -Handle $handle -Sql 'SELECT count(*) FROM examinee_question'
        $line = '{0}: exam records kept={1}, answered remaining={2}, questions={3}' -f (Split-Path -Leaf $Path), $progress, $answered, $total
        $script:Summary.Add($line)
        Write-Log -Message $line
    } finally {
        if ($handle -ne [IntPtr]::Zero) { [void][WinSqlite]::sqlite3_close($handle) }
    }
}

function Reset-DatabaseViaNode {
    param([Parameter(Mandatory = $true)][string]$Path)
    $nodeScript = Join-Path $PSScriptRoot 'reset-answers.mjs'
    if (-not (Test-Path -LiteralPath $nodeScript)) { return $false }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    Write-Log -Message ("using Node fallback for {0}" -f $Path)
    $output = & $node.Source $nodeScript --db $Path 2>&1
    $code = $LASTEXITCODE
    foreach ($l in @($output)) { if ($l) { Write-Log -Message ("node: {0}" -f $l) } }
    return ($code -eq 0)
}

# ------------------------------------------------------------- archive cleaning
function Get-ArchiveDirectories {
    $dirs = New-Object System.Collections.Generic.List[string]
    $dirs.Add((Join-Path $script:Root 'upload\exam-answer-archive'))
    $dirs.Add((Join-Path $script:Root 'epse\upload\exam-answer-archive'))

    foreach ($yml in @((Join-Path $script:ConfigDir 'application-sqllite.yml'), (Join-Path $script:ConfigDir 'application-base-sqllite.yml'))) {
        if (-not (Test-Path -LiteralPath $yml)) { continue }
        $match = Select-String -LiteralPath $yml -Pattern '^\s*path:\s*(\S+)' -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $match) { continue }
        $configured = $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
        if (-not $configured) { continue }
        $normalized = $configured -replace '/', '\'
        if ($normalized -match '^\\') {
            $drive = Split-Path -Qualifier $script:Root   # e.g. "C:"
            $base = $drive + $normalized
        } else {
            $base = Join-Path $script:Root $normalized
        }
        $dirs.Add((Join-Path $base 'exam-answer-archive'))
    }
    return ($dirs | Select-Object -Unique)
}

function Remove-AnswerArchives {
    $removed = 0
    foreach ($dir in Get-ArchiveDirectories) {
        # safety: only ever touch a directory literally named exam-answer-archive
        if ((Split-Path -Leaf $dir) -ne 'exam-answer-archive') { continue }
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        try {
            $files = @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue)
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            $removed += $files.Count
            Write-Log -Message ("answer archive cleaned: {0} ({1} file(s))" -f $dir, $files.Count)
        } catch {
            Write-Log -Level WARN -Message ("cannot clean {0}: {1}" -f $dir, $_.Exception.Message)
        }
    }
    if ($removed -eq 0) { Write-Log -Message 'answer archive: nothing to clean' }
    $script:Summary.Add(('answer archives deleted: {0} file(s)' -f $removed))
}

function Remove-ElectronStorage {
    $storage = Join-Path $env:APPDATA 'epse-desktop\Session Storage'
    if (-not (Test-Path -LiteralPath $storage)) { return }
    try {
        Remove-Item -LiteralPath $storage -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log -Message ("electron session storage cleaned: {0}" -f $storage)
    } catch {
        Write-Log -Level WARN -Message ("cannot clean {0}: {1}" -f $storage, $_.Exception.Message)
    }
}

# ------------------------------------------------------------------------ main
Write-Log -Message '=== reset-answers start ==='

if (Test-BackendRunning) {
    Write-Log -Message 'EPSE backend is running - nothing cleaned (exit 2)'
    if (-not $Quiet) { Write-Host 'reset-answers: backend is running, skipped.' }
    exit 2
}

if (-not (Test-Path -LiteralPath $script:EpseDb)) {
    Write-Log -Level ERROR -Message ("database not found: {0}" -f $script:EpseDb)
    exit 3
}

Backup-Database

if (Initialize-WinSqlite) {
    Reset-Database -Path $script:EpseDb
    if (Test-Path -LiteralPath $script:AdminDb) { Reset-Database -Path $script:AdminDb }
} else {
    $okEpse = Reset-DatabaseViaNode -Path $script:EpseDb
    if (Test-Path -LiteralPath $script:AdminDb) { [void](Reset-DatabaseViaNode -Path $script:AdminDb) }
    if (-not $okEpse) {
        Write-Log -Level ERROR -Message 'no usable SQLite engine (winsqlite3.dll and Node.js both unavailable)'
        $script:Status = 9
    }
}

Remove-AnswerArchives

if ($IncludeElectronStorage) { Remove-ElectronStorage }

foreach ($line in $script:Summary) { Write-Log -Message ("summary: {0}" -f $line) }
Write-Log -Message ("=== reset-answers done (exit {0}) ===" -f $script:Status)

if (-not $Quiet) {
    Write-Host 'reset-answers finished.'
    foreach ($line in $script:Summary) { Write-Host ('  ' + $line) }
}
exit $script:Status
