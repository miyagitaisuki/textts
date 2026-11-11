const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const {
  resolveEngineExe,
  portFromUrl,
  startEngine,
  stopEngine,
  DEFAULT_PORT,
} = require("../electron/voicevox-engine.cjs");

const URL_ = "http://127.0.0.1:50021";
const noSleep = async () => {};

function fakeChild(pid = 4321) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.killed = true;
    return true;
  };
  return child;
}

test("resolveEngineExe finds run.exe under resources/voicevox", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vv-res-"));
  try {
    assert.equal(resolveEngineExe(dir), null);
    fs.mkdirSync(path.join(dir, "voicevox"));
    fs.writeFileSync(path.join(dir, "voicevox", "run.exe"), "");
    assert.equal(resolveEngineExe(dir), path.join(dir, "voicevox", "run.exe"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("portFromUrl uses the URL port and falls back to 50021", () => {
  assert.equal(portFromUrl(URL_), 50021);
  assert.equal(portFromUrl("http://127.0.0.1:60000"), 60000);
  assert.equal(portFromUrl("not a url"), DEFAULT_PORT);
});

test("does not spawn when VOICEVOX already answers, and marks it unmanaged", async () => {
  let spawned = false;
  const logs = [];
  const engine = await startEngine({
    url: URL_,
    exe: "C:/app/voicevox/run.exe",
    ping: async () => true,
    spawn: () => {
      spawned = true;
    },
    log: (l, m) => logs.push(m),
  });
  assert.equal(spawned, false);
  assert.equal(engine.ready, true);
  assert.equal(engine.managed, false);
});

test("returns not-ready without spawning when no bundled engine exists", async () => {
  let spawned = false;
  const engine = await startEngine({
    url: URL_,
    exe: null,
    ping: async () => false,
    spawn: () => {
      spawned = true;
    },
    log: () => {},
  });
  assert.equal(spawned, false);
  assert.equal(engine.ready, false);
  assert.equal(engine.managed, false);
});

test("spawns run.exe hidden on the URL port and waits until /version answers", async () => {
  const child = fakeChild();
  let calls = 0;
  const spawnArgs = [];
  const onSpawnChildren = [];
  const engine = await startEngine({
    url: URL_,
    exe: "C:/app/resources/voicevox/run.exe",
    // Lần ping đầu (kiểm tra engine đã chạy sẵn) thất bại; ba lần sau là khi /version đã phản hồi.
    ping: async () => {
      calls += 1;
      return calls >= 4;
    },
    spawn: (exe, args, opts) => {
      spawnArgs.push({ exe, args, opts });
      return child;
    },
    onSpawn: (c) => onSpawnChildren.push(c),
    log: () => {},
    sleep: noSleep,
    timeoutMs: 60_000,
    intervalMs: 1000,
  });

  assert.equal(engine.ready, true);
  assert.equal(engine.managed, true);
  assert.equal(engine.child, child);
  assert.deepEqual(onSpawnChildren, [child]);
  assert.equal(spawnArgs.length, 1);
  assert.deepEqual(spawnArgs[0].args, ["--host", "127.0.0.1", "--port", "50021"]);
  assert.equal(spawnArgs[0].opts.windowsHide, true);
  assert.equal(spawnArgs[0].opts.cwd, path.dirname("C:/app/resources/voicevox/run.exe"));
});

test("gives up after the timeout and keeps the child so quitting can still stop it", async () => {
  const child = fakeChild();
  const logs = [];
  const engine = await startEngine({
    url: URL_,
    exe: "C:/app/resources/voicevox/run.exe",
    ping: async () => false,
    spawn: () => child,
    log: (level, msg) => logs.push([level, msg]),
    sleep: noSleep,
    timeoutMs: 3000,
    intervalMs: 1000,
  });
  assert.equal(engine.ready, false);
  assert.equal(engine.managed, true);
  assert.equal(engine.child, child);
  assert.ok(logs.some(([l, m]) => l === "ERROR" && m.includes("chưa phản hồi")));
});

test("stops early when the engine process exits before becoming ready", async () => {
  const child = fakeChild();
  let pings = 0;
  const engine = await startEngine({
    url: URL_,
    exe: "C:/app/resources/voicevox/run.exe",
    ping: async () => {
      pings += 1;
      return false;
    },
    spawn: () => {
      // Tiến trình thoát ngay sau khi khởi động (ví dụ thiếu DLL).
      queueMicrotask(() => child.emit("exit", 1));
      return child;
    },
    log: () => {},
    sleep: async () => {
      await new Promise((r) => setImmediate(r));
    },
    timeoutMs: 60_000,
    intervalMs: 1000,
  });
  assert.equal(engine.ready, false);
  assert.ok(pings < 5, `không nên ping liên tục sau khi tiến trình thoát (ping=${pings})`);
});

test("stopEngine uses taskkill /T /F on Windows for managed engines", () => {
  const child = fakeChild(999);
  const calls = [];
  stopEngine({ managed: true, child }, {
    platform: "win32",
    exec: (cmd, args) => calls.push([cmd, args]),
  });
  assert.deepEqual(calls, [["taskkill", ["/pid", "999", "/T", "/F"]]]);
});

test("stopEngine never touches an engine textts did not start", () => {
  const child = fakeChild();
  const calls = [];
  stopEngine({ managed: false, child: null }, { platform: "win32", exec: (...a) => calls.push(a) });
  stopEngine({ managed: false, child }, { platform: "linux", exec: (...a) => calls.push(a) });
  assert.equal(child.killed, undefined);
  assert.equal(calls.length, 0);
});

test("stopEngine skips a child that already exited", () => {
  const child = fakeChild();
  child.exitCode = 0;
  const calls = [];
  stopEngine({ managed: true, child }, { platform: "win32", exec: (...a) => calls.push(a) });
  assert.equal(calls.length, 0);
});

test("startEngine reports the exit code and the engine's last output when it dies early", async () => {
  const child = fakeChild();
  const logs = [];
  const result = await startEngine({
    url: "http://127.0.0.1:10101",
    exe: "C:/aivis/run.exe",
    name: "AivisSpeech",
    ping: async () => false,
    spawn: () => {
      setImmediate(() => {
        child.stderr.emit("data", Buffer.from("OSError: [Errno 10048] address already in use\n"));
        child.exitCode = 1;
        child.emit("exit", 1);
      });
      return child;
    },
    log: (level, msg) => logs.push(msg),
    sleep: () => new Promise((r) => setImmediate(r)),
    timeoutMs: 5_000,
  });
  assert.equal(result.ready, false);
  assert.equal(result.alive, false);
  assert.match(result.error, /AivisSpeech đã thoát \(mã 1\)/);
  assert.deepEqual(result.lastLines, ["OSError: [Errno 10048] address already in use"]);
  assert.ok(logs.some((m) => m.startsWith("[AivisSpeech]")));
});

test("startEngine says the engine is still starting when it outlives the timeout", async () => {
  const child = fakeChild();
  const result = await startEngine({
    url: URL_,
    exe: "C:/vv/run.exe",
    ping: async () => false,
    spawn: () => child,
    log: () => {},
    sleep: noSleep,
    timeoutMs: 0,
  });
  assert.equal(result.ready, false);
  assert.equal(result.alive, true);
  assert.match(result.error, /chưa phản hồi sau 0 giây \(vẫn đang khởi động\)/);
});
