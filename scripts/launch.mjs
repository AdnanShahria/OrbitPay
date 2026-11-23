#!/usr/bin/env node

/**
 * ORBIT Payment Hub - Unified Local App & Browser Launcher
 * Usage:
 *   bun run web        -> Open Merchant Dashboard (http://localhost:3000)
 *   bun run admin      -> Open Stealth Admin Dashboard (http://localhost:3000/admin)
 *   bun run checkout   -> Open Embedded Checkout Demo (http://localhost:3000/checkout)
 *   bun run app        -> Connect Android device/emulator (adb reverse + launch + scrcpy) or open Studio
 *   bun run app:studio -> Open Android app project in Android Studio
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const androidDir = path.resolve(rootDir, 'app');

const ANDROID_PACKAGE = 'com.orbitsaas.payment';
const DEBUG_APK_PATH = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('-')) || 'android';
const showHelp = args.includes('--help') || args.includes('-h');
const noMirror = args.includes('--no-mirror');
const noStudio = args.includes('--no-studio');
const noEmulator = args.includes('--no-emulator');
const forceEmulator = args.includes('--emulator');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function printHelp() {
  console.log(`
${c.cyan}${c.bold}ORBIT Payment Hub — Local Development Launcher${c.reset}

${c.bold}Servers & Simulators:${c.reset}
  ${c.green}bun run dev${c.reset}           Start Backend (port 8787) + Frontend (port 3000)
  ${c.green}bun run server${c.reset}        Alias for bun run dev
  ${c.green}bun run dev:open${c.reset}      Start servers and automatically open browser
  ${c.green}bun run dev:realtime${c.reset}  Start servers + auto-simulate live MFS SMS every 10s
  ${c.green}bun run simulate${c.reset}      Send simulated bKash/Nagad/Rocket SMS to local backend

${c.bold}Quick Openers (run after starting server):${c.reset}
  ${c.cyan}bun run web${c.reset}           Open Merchant Dashboard (http://localhost:3000)
  ${c.cyan}bun run admin${c.reset}         Open Admin Dashboard (http://localhost:3000/admin)
  ${c.cyan}bun run checkout${c.reset}      Open Checkout Widget Demo (http://localhost:3000/checkout)
  ${c.cyan}bun run app${c.reset}           Bridge ports & launch Android app (auto-starts emulator if needed)
  ${c.cyan}bun run app:emu${c.reset}       Launch standalone Virtual Device (without Android Studio)
  ${c.cyan}bun run app:studio${c.reset}    Open Android app/ project directly in Android Studio

${c.bold}Flags for bun run app:${c.reset}
  --emulator              Force-launch standalone Android Emulator (without Studio)
  --no-emulator           Do not auto-start an Android Emulator if no device is online
  --no-mirror             Skip launching scrcpy screen mirror
  --no-studio             Skip launching Android Studio if no device/APK is found
  --help, -h              Show this help reference
`);
}

function checkServerReachable(urlStr) {
  return new Promise((resolve) => {
    const req = http.get(urlStr, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openBrowser(url) {
  let child;
  if (process.platform === 'win32') {
    child = spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
    });
  } else if (process.platform === 'darwin') {
    child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }
  child.unref();
}

function commandExists(cmd) {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findAdb() {
  if (commandExists('adb')) {
    return 'adb';
  }
  if (process.platform === 'win32') {
    const sdkAdb = path.join(
      process.env.LOCALAPPDATA || '',
      'Android',
      'Sdk',
      'platform-tools',
      'adb.exe'
    );
    if (fs.existsSync(sdkAdb)) {
      return sdkAdb;
    }
  } else {
    const home = process.env.HOME || '';
    const candidates = [
      path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
      path.join(home, 'Android', 'Sdk', 'platform-tools', 'adb'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function findAndroidStudio() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }
  if (process.platform === 'darwin') {
    const macApp = '/Applications/Android Studio.app/Contents/MacOS/studio';
    return fs.existsSync(macApp) ? macApp : null;
  }
  if (commandExists('studio')) return 'studio';
  if (commandExists('android-studio')) return 'android-studio';
  return null;
}

function findEmulator() {
  if (commandExists('emulator')) {
    return 'emulator';
  }
  if (process.platform === 'win32') {
    const sdkEmu = path.join(
      process.env.LOCALAPPDATA || '',
      'Android',
      'Sdk',
      'emulator',
      'emulator.exe'
    );
    if (fs.existsSync(sdkEmu)) {
      return sdkEmu;
    }
  } else {
    const home = process.env.HOME || '';
    const candidates = [
      path.join(home, 'Library', 'Android', 'sdk', 'emulator', 'emulator'),
      path.join(home, 'Android', 'Sdk', 'emulator', 'emulator'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function listAvds(emuBin) {
  try {
    const out = execFileSync(emuBin, ['-list-avds'], { encoding: 'utf8' });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startStandaloneEmulator(adbBin, emuBin, avdName) {
  console.log(
    `${c.cyan}[EMULATOR]${c.reset} Starting standalone virtual device ${c.bold}${avdName}${c.reset} (without Android Studio)...`
  );
  const emuProc = spawn(emuBin, ['-avd', avdName], {
    detached: true,
    stdio: 'ignore',
  });
  emuProc.unref();

  console.log(`${c.dim}[EMULATOR] Waiting for Android OS to finish booting...${c.reset}`);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const online = getOnlineDevices(adbBin);
    const emuSerial = online.find((d) => d.startsWith('emulator-'));
    if (emuSerial) {
      try {
        const booted = execFileSync(adbBin, ['-s', emuSerial, 'shell', 'getprop', 'sys.boot_completed'], {
          encoding: 'utf8',
        }).trim();
        if (booted === '1') {
          console.log(`${c.green}[EMULATOR]${c.reset} ${emuSerial} is booted and ready!`);
          return emuSerial;
        }
      } catch {
        // Still booting
      }
    }
    await sleep(2000);
  }
  return null;
}

function launchAndroidStudio() {
  const studioPath = findAndroidStudio();
  if (!studioPath) {
    console.log(
      `${c.yellow}[STUDIO]${c.reset} Android Studio executable not found automatically. Please open ${c.bold}${androidDir}${c.reset} manually in Android Studio.`
    );
    return false;
  }

  console.log(`${c.cyan}[STUDIO]${c.reset} Opening ${c.bold}${androidDir}${c.reset} in Android Studio...`);
  const child = spawn(studioPath, [androidDir], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}

function getOnlineDevices(adbBin) {
  const out = execFileSync(adbBin, ['devices'], { encoding: 'utf8' });
  const devices = [];
  for (const rawLine of out.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^(\S+)\s+device$/);
    if (match) {
      devices.push(match[1]);
    }
  }
  return devices;
}

async function handleWebMode(targetUrl, label) {
  const reachable = await checkServerReachable('http://localhost:3000');
  if (!reachable) {
    console.log(
      `${c.yellow}[HINT]${c.reset} Local dev server does not appear to be running on http://localhost:3000.`
    );
    console.log(
      `       Run ${c.bold}bun run dev${c.reset} (or ${c.bold}bun run server${c.reset}) in another terminal first.\n`
    );
  }
  console.log(`${c.green}[OPEN]${c.reset} Opening ${label}: ${c.cyan}${targetUrl}${c.reset}`);
  openBrowser(targetUrl);
}

async function handleAndroidMode() {
  const adbBin = findAdb();
  if (!adbBin) {
    console.log(`${c.red}[ADB]${c.reset} adb was not found on PATH or in standard Android SDK locations.`);
    if (!noStudio) {
      launchAndroidStudio();
    }
    return;
  }

  let devices = [];
  try {
    devices = getOnlineDevices(adbBin);
  } catch (err) {
    console.log(`${c.red}[ADB]${c.reset} Failed to query adb devices: ${err.message}`);
    return;
  }

  let serial = forceEmulator ? devices.find((d) => d.startsWith('emulator-')) : devices[0];

  if (!serial && !noEmulator) {
    const emuBin = findEmulator();
    const avds = emuBin ? listAvds(emuBin) : [];
    if (avds.length > 0) {
      serial = await startStandaloneEmulator(adbBin, emuBin, avds[0]);
      if (!serial) {
        console.log(
          `${c.yellow}[EMULATOR]${c.reset} Emulator is still booting in the background. Re-run ${c.green}bun run app${c.reset} in a few seconds once the home screen appears.`
        );
        return;
      }
    }
  }

  if (!serial) {
    console.log(`${c.yellow}[ANDROID]${c.reset} No connected Android phone, running emulator, or AVD image detected.\n`);
    console.log(`How to run the Android app locally:`);
    console.log(
      `  ${c.bold}Option A (Physical Phone via USB):${c.reset} Enable ${c.cyan}USB Debugging${c.reset} on your phone, connect via USB cable, and re-run ${c.green}bun run app${c.reset} for instant launch + ${c.cyan}scrcpy${c.reset} screen mirror.`
    );
    console.log(
      `  ${c.bold}Option B (Android Emulator):${c.reset} Create an AVD once in ${c.cyan}Android Studio -> Device Manager${c.reset}, then ${c.green}bun run app${c.reset} will auto-launch it without Studio.`
    );
    console.log(
      `  ${c.bold}Option C (No Phone Needed):${c.reset} Test MFS SMS ingestion & SSE live on your laptop using ${c.green}bun run dev:realtime${c.reset} or ${c.green}bun run simulate${c.reset}.\n`
    );

    if (!noStudio) {
      launchAndroidStudio();
    }
    return;
  }

  console.log(`${c.green}[ADB]${c.reset} Using device: ${c.bold}${serial}${c.reset}`);

  // Bridge backend (8787) and frontend (3000) ports so Android app can reach http://localhost:8787
  try {
    execFileSync(adbBin, ['-s', serial, 'reverse', 'tcp:8787', 'tcp:8787'], { stdio: 'ignore' });
    execFileSync(adbBin, ['-s', serial, 'reverse', 'tcp:3000', 'tcp:3000'], { stdio: 'ignore' });
    console.log(
      `${c.cyan}[BRIDGE]${c.reset} Port forwarding active: device ${c.bold}localhost:8787${c.reset} -> laptop ${c.bold}localhost:8787${c.reset} (and :3000)`
    );
  } catch (err) {
    console.log(`${c.yellow}[BRIDGE]${c.reset} Warning: adb reverse failed (${err.message})`);
  }

  // Check if app is installed
  let isInstalled = false;
  try {
    const pmOut = execFileSync(adbBin, ['-s', serial, 'shell', 'pm', 'path', ANDROID_PACKAGE], {
      encoding: 'utf8',
    });
    isInstalled = pmOut.includes('package:');
  } catch {
    isInstalled = false;
  }

  if (!isInstalled) {
    if (fs.existsSync(DEBUG_APK_PATH)) {
      console.log(`${c.cyan}[INSTALL]${c.reset} Installing debug APK from ${DEBUG_APK_PATH}...`);
      execFileSync(adbBin, ['-s', serial, 'install', '-r', DEBUG_APK_PATH], { stdio: 'inherit' });
      isInstalled = true;
    } else {
      console.log(
        `${c.yellow}[BUILD NEEDED]${c.reset} ${ANDROID_PACKAGE} is not installed yet, and no debug APK exists at:`
      );
      console.log(`  ${DEBUG_APK_PATH}`);
      console.log(
        `Please open ${c.bold}app/${c.reset} in Android Studio once, let Gradle sync, and click Run (▶) to build & install.`
      );
      if (!noStudio) {
        launchAndroidStudio();
      }
      return;
    }
  }

  // Launch the app
  try {
    console.log(`${c.green}[LAUNCH]${c.reset} Starting ${c.bold}${ANDROID_PACKAGE}${c.reset} on ${serial}...`);
    execFileSync(
      adbBin,
      ['-s', serial, 'shell', 'monkey', '-p', ANDROID_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'],
      { stdio: 'ignore' }
    );
  } catch (err) {
    console.log(`${c.red}[LAUNCH]${c.reset} Failed to launch app: ${err.message}`);
  }

  // Mirror physical phone screen with scrcpy if available (emulators already have their own window)
  if (!noMirror && !serial.startsWith('emulator-') && commandExists('scrcpy')) {
    console.log(`${c.magenta}[MIRROR]${c.reset} Opening scrcpy screen mirror window...`);
    const scrcpyArgs = ['-s', serial, '--window-title', 'ORBIT Payment Android'];
    const mirrorProc = spawn('scrcpy', scrcpyArgs, {
      detached: true,
      stdio: 'ignore',
    });
    mirrorProc.unref();
  }
}

async function main() {
  if (showHelp || mode === 'help') {
    printHelp();
    return;
  }

  switch (mode) {
    case 'web':
      await handleWebMode('http://localhost:3000', 'Merchant Dashboard');
      break;
    case 'admin':
      await handleWebMode('http://localhost:3000/admin', 'Admin Dashboard');
      break;
    case 'checkout':
      await handleWebMode('http://localhost:3000/checkout', 'Checkout Widget Demo');
      break;
    case 'studio':
      launchAndroidStudio();
      break;
    case 'android':
    case 'app':
      await handleAndroidMode();
      break;
    default:
      console.log(`${c.red}[ERROR]${c.reset} Unknown launcher mode: ${mode}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`${c.red}[ERROR]${c.reset}`, err);
  process.exit(1);
});
