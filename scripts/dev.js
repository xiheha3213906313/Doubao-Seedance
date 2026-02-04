const { spawn } = require("node:child_process");
const net = require("node:net");

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.on("error", (err) => {
        server.close();
        if (err && err.code === "EADDRINUSE") {
          tryPort(port + 1);
          return;
        }
        reject(err);
      });
      server.listen({ port, host: "127.0.0.1" }, () => {
        const picked = server.address().port;
        server.close(() => resolve(picked));
      });
    };
    tryPort(startPort);
  });
}

function waitForBackendUrl(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buf = "";

    const finish = (err, url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.off("data", onOut);
      child.stderr?.off("data", onErr);
      child.off("exit", onExit);
      if (err) reject(err);
      else resolve(url);
    };

    const onLine = (line) => {
      const m = /Server running at http:\/\/localhost:(\d+)\//.exec(line);
      if (!m) return;
      finish(null, `http://localhost:${m[1]}`);
    };

    const onChunk = (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) onLine(line);
      }
    };

    const onOut = (chunk) => {
      process.stdout.write(chunk);
      onChunk(chunk);
    };
    const onErr = (chunk) => {
      process.stderr.write(chunk);
      onChunk(chunk);
    };
    const onExit = (code) => {
      finish(new Error(`Backend exited (code ${code ?? "unknown"})`));
    };

    child.stdout?.on("data", onOut);
    child.stderr?.on("data", onErr);
    child.on("exit", onExit);

    const timer = setTimeout(() => {
      finish(new Error("Timed out waiting for backend to start"));
    }, timeoutMs);
  });
}

async function main() {
  const backendPort = await findFreePort(Number(process.env.BACKEND_PORT || 3000));
  const desiredVitePort = Number(process.env.VITE_PORT || 5173);

  const backend = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(backendPort) },
    stdio: ["inherit", "pipe", "pipe"]
  });

  const backendUrl = await waitForBackendUrl(backend);

  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(desiredVitePort), "--open"], {
    env: { ...process.env, VITE_BACKEND_URL: backendUrl },
    stdio: "inherit"
  });

  const shutdown = () => {
    try {
      vite.kill();
    } catch {}
    try {
      backend.kill();
    } catch {}
  };

  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());
  process.on("exit", () => shutdown());

  vite.on("exit", (code) => {
    shutdown();
    process.exit(typeof code === "number" ? code : 1);
  });

  backend.on("exit", (code) => {
    shutdown();
    process.exit(typeof code === "number" ? code : 1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
