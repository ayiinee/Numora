// Read-only installation hints; usable existing localhost services remain valid.
export async function inspectWindowsSetup(root, run, platform = process.platform) {
  if (platform !== 'win32') return { applicable: false };
  const status = await run(root, 'wsl.exe', ['--status'], { timeoutMs: 5000 });
  const list = await run(root, 'wsl.exe', ['--list', '--quiet'], { timeoutMs: 5000 });
  const distributions =
    list.code === 0
      ? list.output
          .replaceAll('\0', '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const probe = await run(
    root,
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); @{ administrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); restartPending = ((Test-Path -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')) } | ConvertTo-Json -Compress",
    ],
    { timeoutMs: 5000 },
  );
  let system = { administrator: null, restartPending: null };
  if (probe.code === 0) {
    try {
      const data = JSON.parse(probe.output);
      system = {
        administrator: data.administrator === true,
        restartPending: data.restartPending === true,
      };
    } catch {
      /* Unknown is not false. */
    }
  }
  return {
    applicable: true,
    wslReady: status.code === 0,
    distributions,
    ubuntu2404Present: distributions.some((s) => /^Ubuntu-24\.04$/i.test(s)),
    ...system,
    installationNeedsAdministrator: status.code !== 0 || !distributions.length,
    note: 'Read-only hints: WSL installation may require elevation/restart. Restart signal covers Windows servicing only; false does not prove WSL onboarding complete. Existing services still require doctor connectivity/version/isolation checks. No OS changes performed.',
  };
}
