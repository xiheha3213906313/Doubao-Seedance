const { execFileSync } = require("node:child_process");

function uniq(nums) {
  return Array.from(new Set(nums)).filter((n) => Number.isFinite(n) && n > 0);
}

function range(from, to) {
  const out = [];
  for (let p = from; p <= to; p++) out.push(p);
  return out;
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    dryRun: args.has("--dry-run") || args.has("-n"),
  };
}

function getListeningPidsWindows(port) {
  const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  const lines = out.split(/\r?\n/);
  const pids = [];
  const portSuffix = `:${port}`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("TCP")) continue;
    if (!trimmed.includes("LISTENING")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const localAddr = parts[1];
    const state = parts[3];
    const pidText = parts[4];
    if (state !== "LISTENING") continue;
    if (!localAddr.endsWith(portSuffix)) continue;
    const pid = Number(pidText);
    if (Number.isFinite(pid) && pid > 0) pids.push(pid);
  }
  return uniq(pids);
}

function getListeningPidsPosix(port) {
  try {
    const out = execFileSync("lsof", ["-ti", `TCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    const pids = out
      .split(/\r?\n/)
      .map((s) => Number(String(s || "").trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return uniq(pids);
  } catch {
    return [];
  }
}

function getListeningPids(port) {
  if (process.platform === "win32") return getListeningPidsWindows(port);
  return getListeningPidsPosix(port);
}

function killPid(pid, dryRun) {
  if (dryRun) return { pid, killed: false, reason: "dry-run" };
  try {
    process.kill(pid, "SIGTERM");
    return { pid, killed: true };
  } catch (e) {
    return { pid, killed: false, reason: e && e.message ? e.message : String(e) };
  }
}

function main() {
  const { dryRun } = parseArgs(process.argv);

  const ports = uniq([
    ...range(3000, 3020),
    ...range(5173, 5190),
  ]);

  const pidByPort = new Map();
  for (const port of ports) {
    const pids = getListeningPids(port);
    if (pids.length) pidByPort.set(port, pids);
  }

  const allPids = uniq(Array.from(pidByPort.values()).flat());
  if (!allPids.length) {
    process.stdout.write("No Doubao services detected on default ports.\n");
    return;
  }

  process.stdout.write(
    `Found listening processes (ports: ${Array.from(pidByPort.keys()).join(", ")}).\n`
  );
  process.stdout.write(`PIDs: ${allPids.join(", ")}\n`);
  if (dryRun) process.stdout.write("Dry run enabled: no process will be killed.\n");

  for (const pid of allPids) {
    const r = killPid(pid, dryRun);
    if (r.killed) process.stdout.write(`Stopped PID ${pid}\n`);
    else process.stdout.write(`Skip PID ${pid}: ${r.reason || "unknown"}\n`);
  }
}

main();

