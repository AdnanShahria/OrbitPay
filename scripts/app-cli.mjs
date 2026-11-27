#!/usr/bin/env node

/**
 * ORBIT Payment Hub — Interactive `app` Command Center
 *
 * Activated by running `app` in the terminal (via app.cmd / app.ps1 / app).
 * Supports saving a default mode (e.g. Local Development), Local Preview,
 * Production-Ready APK Build (with signing, version bump, unit tests, SHA-256),
 * OTA Release Publish & Push Broadcast, Android Device/Emulator Launcher,
 * FCM & Environment Readiness Diagnostics, and Edge Deployment.
 */

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orbitDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(orbitDir, '..');
const ecommDir = path.join(workspaceRoot, 'Ecomm-Demo');
const androidDir = path.join(orbitDir, 'app');
const appModuleDir = path.join(androidDir, 'app');
const buildGradlePath = path.join(appModuleDir, 'build.gradle.kts');
const keystorePropsPath = path.join(androidDir, 'keystore.properties');
const googleServicesPath = path.join(appModuleDir, 'google-services.json');
const devVarsPath = path.join(orbitDir, '.dev.vars');
const wranglerTomlPath = path.join(orbitDir, 'wrangler.toml');
const configPath = path.join(orbitDir, '.orbit-app-cli.local');
const apkDistDir = path.join(orbitDir, 'dist', 'apk');

const isWindows = process.platform === 'win32';
const isBun = typeof process.versions.bun !== 'undefined';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

const ACTION_LABELS = {
  dev: 'Local Development (Backend + Frontend)',
  'dev:realtime': 'Local Development + Realtime SMS Simulator',
  'dev:ecomm': 'Local Development (ORBIT + Ecomm-Demo)',
  preview: 'Local Preview (Production Build + Wrangler Preview)',
  apk: 'Build Production-Ready Android APK',
  ota: 'OTA Release Upload & Push Update',
  android: 'Launch Android App (Phone / Emulator)',
  check: 'System Readiness Check (FCM, Keystore, Tools)',
  deploy: 'Deploy Backend & Web to Cloudflare',
};

const DEFAULT_CONFIG = {
  defaultAction: 'dev',
  serverTarget: 'local', // 'local' | 'production' | custom URL
  localUrl: 'http://localhost:8787',
  productionUrl: 'https://payment.orbitsaas.cloud',
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // Fall back to defaults
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function parseDotEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function parsePropertiesFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    result[key] = val;
  }
  return result;
}

function readGradleVersions() {
  if (!fs.existsSync(buildGradlePath)) {
    return { versionCode: 1, versionName: '1.0.0' };
  }
  const content = fs.readFileSync(buildGradlePath, 'utf8');
  const codeMatch = content.match(/versionCode\s*=\s*(\d+)/);
  const nameMatch = content.match(/versionName\s*=\s*"([^"]+)"/);
  return {
    versionCode: codeMatch ? Number.parseInt(codeMatch[1], 10) : 1,
    versionName: nameMatch ? nameMatch[1] : '1.0.0',
  };
}

function writeGradleVersions(versionCode, versionName) {
  const content = fs.readFileSync(buildGradlePath, 'utf8');
  const updated = content
    .replace(/versionCode\s*=\s*\d+/, `versionCode = ${versionCode}`)
    .replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${versionName}"`);
  fs.writeFileSync(buildGradlePath, updated, 'utf8');
}

function commandExists(cmd) {
  try {
    const checker = isWindows ? 'where' : 'which';
    execFileSync(checker, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findAdb() {
  if (commandExists('adb')) return 'adb';
  if (isWindows) {
    const sdkAdb = path.join(
      process.env.LOCALAPPDATA || '',
      'Android',
      'Sdk',
      'platform-tools',
      'adb.exe'
    );
    if (fs.existsSync(sdkAdb)) return sdkAdb;
  } else {
    const home = process.env.HOME || '';
    for (const candidate of [
      path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
      path.join(home, 'Android', 'Sdk', 'platform-tools', 'adb'),
    ]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function runCommandSync(cmd, args, cwd, extraEnv = {}, useShell = null) {
  const needsShell =
    useShell !== null
      ? useShell
      : isWindows && !cmd.endsWith('.exe') && !cmd.endsWith('.bat') && !cmd.endsWith('.cmd');
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: needsShell,
    env: { ...process.env, ...extraEnv },
  });
  return res.status === 0;
}

function runNodeScript(scriptRelPath, extraArgs = [], cwd = orbitDir) {
  const scriptAbs = path.join(orbitDir, scriptRelPath);
  const runtime = isBun ? 'bun' : process.execPath;
  return new Promise((resolve) => {
    const child = spawn(runtime, [scriptAbs, ...extraArgs], {
      cwd,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', (err) => {
      console.error(`${c.red}Failed to start ${scriptRelPath}: ${err.message}${c.reset}`);
      resolve(false);
    });
  });
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getPreferredServerUrl(cfg) {
  if (cfg.serverTarget === 'production') return cfg.productionUrl;
  if (cfg.serverTarget === 'local') return cfg.localUrl;
  if (typeof cfg.serverTarget === 'string' && cfg.serverTarget.startsWith('http')) {
    return cfg.serverTarget;
  }
  return cfg.localUrl;
}

function inspectEnvironment() {
  const gradleVersions = readGradleVersions();
  const hasGoogleServices = fs.existsSync(googleServicesPath);
  let fcmClientProjectId = null;
  let fcmPackageMatch = false;
  if (hasGoogleServices) {
    try {
      const gs = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
      fcmClientProjectId = gs?.project_info?.project_id || null;
      const pkg = gs?.client?.[0]?.client_info?.android_client_info?.package_name;
      fcmPackageMatch = pkg === 'com.orbitsaas.payment';
    } catch {
      // Ignore parse error
    }
  }

  const devVars = parseDotEnvFile(devVarsPath);
  const fcmServiceAccountPresent = Boolean(devVars.FCM_SERVICE_ACCOUNT_JSON?.trim());
  const masterAdminKeyPresent = Boolean(devVars.MASTER_ADMIN_KEY?.trim());

  const hasKeystoreProps = fs.existsSync(keystorePropsPath);
  let keystoreFileExists = false;
  let keystoreStorePath = '';
  if (hasKeystoreProps) {
    const props = parsePropertiesFile(keystorePropsPath);
    keystoreStorePath = props.storeFile || '';
    if (keystoreStorePath) {
      const resolvedStore = path.isAbsolute(keystoreStorePath)
        ? keystoreStorePath
        : path.resolve(androidDir, keystoreStorePath);
      keystoreFileExists = fs.existsSync(resolvedStore);
    }
  }

  const wranglerText = fs.existsSync(wranglerTomlPath)
    ? fs.readFileSync(wranglerTomlPath, 'utf8')
    : '';
  const hasR2Binding = wranglerText.includes('R2_BUCKET');
  const hasPushHub = wranglerText.includes('PUSH_HUB');

  return {
    gradleVersions,
    hasGoogleServices,
    fcmClientProjectId,
    fcmPackageMatch,
    fcmServiceAccountPresent,
    fcmProjectIdBackend: devVars.FCM_PROJECT_ID || null,
    masterAdminKeyPresent,
    masterAdminKeyLocal: devVars.MASTER_ADMIN_KEY || '',
    hasKeystoreProps,
    keystoreFileExists,
    keystoreStorePath,
    hasR2Binding,
    hasPushHub,
    hasJava: commandExists('java'),
    hasKeytool: commandExists('keytool'),
    adbPath: findAdb(),
    hasScrcpy: commandExists('scrcpy'),
    hasBun: commandExists('bun'),
    hasWrangler: commandExists('wrangler') || commandExists('npx') || commandExists('bunx'),
    hasEcommDemo: fs.existsSync(path.join(ecommDir, 'package.json')),
  };
}

function printBanner(cfg, status) {
  const defaultLabel = ACTION_LABELS[cfg.defaultAction] || cfg.defaultAction;
  const fcmAppTag = status.hasGoogleServices && status.fcmPackageMatch
    ? `${c.green}Bundled (${status.fcmClientProjectId})${c.reset}`
    : `${c.yellow}Not bundled${c.reset}`;
  const fcmServerTag = status.fcmServiceAccountPresent
    ? `${c.green}Configured (.dev.vars)${c.reset}`
    : `${c.yellow}Missing FCM_SERVICE_ACCOUNT_JSON (WS+Polling active)${c.reset}`;
  const signingTag = status.hasKeystoreProps && status.keystoreFileExists
    ? `${c.green}Signed Release Ready${c.reset}`
    : status.hasKeystoreProps
      ? `${c.red}keystore.properties storeFile missing${c.reset}`
      : `${c.yellow}Unsigned (no keystore.properties)${c.reset}`;

  console.log(`
${c.cyan}${c.bold}╔════════════════════════════════════════════════════════════════════════════╗
║                  ORBIT Payment Hub — \`app\` Command Center                  ║
╠════════════════════════════════════════════════════════════════════════════╣${c.reset}
  ${c.bold}Default Action:${c.reset}  ${c.green}${defaultLabel}${c.reset} ${c.dim}(press Enter to run)${c.reset}
  ${c.bold}Android Build:${c.reset}   v${status.gradleVersions.versionName} (versionCode ${status.gradleVersions.versionCode}) | Signing: ${signingTag}
  ${c.bold}FCM Push:${c.reset}        App: ${fcmAppTag} | Local Backend: ${fcmServerTag}
  ${c.bold}OTA Target:${c.reset}      ${c.cyan}${getPreferredServerUrl(cfg)}${c.reset}
${c.cyan}${c.bold}╚════════════════════════════════════════════════════════════════════════════╝${c.reset}
`);
}

function printMenu(cfg) {
  const defaultLabel = ACTION_LABELS[cfg.defaultAction] || cfg.defaultAction;
  console.log(`${c.bold}Select an option:${c.reset}
  ${c.green}[Enter]${c.reset} Run Default: ${c.bold}${defaultLabel}${c.reset}
  ${c.cyan}[1]${c.reset}     Local Development (Backend :8787 + Frontend :3000 + optional Simulator/Ecomm)
  ${c.cyan}[2]${c.reset}     Local Preview (Build production bundle + run local Cloudflare/Vite preview)
  ${c.cyan}[3]${c.reset}     APK Build (Production-ready release APK, signing check, version bump, SHA-256)
  ${c.cyan}[4]${c.reset}     OTA Release & Push Update (Upload APK to R2/D1 + broadcast WebSocket/FCM)
  ${c.cyan}[5]${c.reset}     Android Device / Emulator / Studio Launcher
  ${c.cyan}[6]${c.reset}     Open Web Dashboards (Merchant / Admin / Checkout Demo)
  ${c.cyan}[7]${c.reset}     System Readiness Check (FCM, Keystore, ADB, Java, R2, Backend Health)
  ${c.cyan}[8]${c.reset}     Deploy Web & Cloudflare Worker (npm run deploy)
  ${c.cyan}[9]${c.reset}     Settings (Set Default Mode, Server Target, Install Global \`app\` Command)
  ${c.dim}[0]${c.reset}     Exit
`);
}

async function ask(rl, promptText, defaultVal = '') {
  const suffix = defaultVal ? ` ${c.dim}[${defaultVal}]${c.reset}` : '';
  const ans = (await rl.question(`${promptText}${suffix}: `)).trim();
  return ans || defaultVal;
}

async function askYesNo(rl, promptText, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const ans = (await rl.question(`${promptText} (${hint}): `)).trim().toLowerCase();
  if (!ans) return defaultYes;
  return ans === 'y' || ans === 'yes';
}

async function handleLocalDev(rl, presetMode = null) {
  let mode = presetMode;
  if (!mode && rl) {
    console.log(`\n${c.bold}Local Development Modes:${c.reset}
  1) Standard Fullstack (Backend :8787 + Frontend :3000)
  2) Fullstack + Open Browser
  3) Fullstack + Realtime SMS Auto-Simulator (every 10s)
  4) ORBIT Payment + Ecomm-Demo Storefront (both stacks)`);
    mode = await ask(rl, 'Choose dev mode', '1');
  }

  if (mode === '4' || mode === 'ecomm') {
    if (!fs.existsSync(path.join(ecommDir, 'package.json'))) {
      console.log(`${c.red}Ecomm-Demo folder not found at ${ecommDir}${c.reset}`);
      return;
    }
    console.log(`${c.cyan}Starting ORBIT Payment + Ecomm-Demo fullstack servers...${c.reset}`);
    const runtime = isBun ? 'bun' : 'npm';
    const orbitProc = spawn(runtime, ['run', 'dev'], { cwd: orbitDir, stdio: 'inherit', shell: isWindows });
    const ecommProc = spawn(runtime, ['run', 'dev'], { cwd: ecommDir, stdio: 'inherit', shell: isWindows });
    await new Promise((resolve) => {
      const done = () => resolve();
      orbitProc.on('exit', done);
      ecommProc.on('exit', done);
    });
    return;
  }

  const args = [];
  if (mode === '2' || mode === 'open') args.push('--open');
  if (mode === '3' || mode === 'realtime') args.push('--realtime');
  await runNodeScript('scripts/dev.mjs', args, orbitDir);
}

async function handleLocalPreview(rl) {
  console.log(`\n${c.bold}Local Preview Options:${c.reset}
  1) Full Production Preview (Build Frontend + Backend, then serve via Wrangler on :8787)
  2) Frontend Vite Preview only (Build Frontend + \`vite preview\` on :4173)
  3) Ecomm-Demo Cloudflare Preview (\`preview:cf\` on :6901)`);
  const choice = rl ? await ask(rl, 'Choose preview mode', '1') : '1';

  const runner = isBun ? 'bun' : 'npm';
  if (choice === '2') {
    console.log(`${c.cyan}Building Orbit Payment frontend...${c.reset}`);
    if (!runCommandSync(runner, ['run', 'build:frontend'], orbitDir)) return;
    runCommandSync(runner, ['--workspace=frontend', 'run', 'preview'], orbitDir);
    return;
  }
  if (choice === '3') {
    if (!fs.existsSync(path.join(ecommDir, 'package.json'))) {
      console.log(`${c.red}Ecomm-Demo folder not found.${c.reset}`);
      return;
    }
    runCommandSync(isBun ? 'bun' : 'npm', ['run', 'preview:cf'], ecommDir);
    return;
  }

  console.log(`${c.cyan}Building production bundle (frontend + backend typecheck)...${c.reset}`);
  if (!runCommandSync(runner, ['run', 'build'], orbitDir)) {
    console.log(`${c.red}Build failed. Preview aborted.${c.reset}`);
    return;
  }
  console.log(`${c.green}Build succeeded! Starting Wrangler local production preview on http://localhost:8787 ...${c.reset}`);
  const wranglerBin = isBun ? 'bunx' : 'npx';
  runCommandSync(wranglerBin, ['wrangler', 'dev', '--port', '8787'], orbitDir);
}

async function setupReleaseKeystoreWizard(rl) {
  console.log(`\n${c.yellow}${c.bold}Release Keystore Setup Wizard${c.reset}`);
  if (!commandExists('keytool')) {
    console.log(`${c.red}keytool (JDK 17) not found on PATH. Install JDK 17 first.${c.reset}`);
    return false;
  }

  const keystoreName = await ask(rl, 'Keystore file name (inside app/)', 'orbit-release.jks');
  const alias = await ask(rl, 'Key alias', 'orbit-release');
  const storePassword = await ask(rl, 'Keystore password (min 6 chars)');
  const keyPassword = await ask(rl, 'Key password', storePassword);

  if (storePassword.length < 6 || keyPassword.length < 6) {
    console.log(`${c.red}Passwords must be at least 6 characters.${c.reset}`);
    return false;
  }

  const keystoreAbs = path.join(androidDir, keystoreName);
  if (!fs.existsSync(keystoreAbs)) {
    const ok = runCommandSync(
      'keytool',
      [
        '-genkeypair',
        '-v',
        '-keystore',
        keystoreAbs,
        '-alias',
        alias,
        '-keyalg',
        'RSA',
        '-keysize',
        '2048',
        '-validity',
        '10000',
        '-storepass',
        storePassword,
        '-keypass',
        keyPassword,
        '-dname',
        'CN=ORBIT Payment Hub, OU=Mobile, O=ORBIT SaaS, L=Dhaka, S=Dhaka, C=BD',
      ],
      androidDir,
      {},
      false
    );
    if (!ok) {
      console.log(`${c.red}Failed to generate keystore.${c.reset}`);
      return false;
    }
  }

  const propsBody = [
    `storeFile=${keystoreName}`,
    `storePassword=${storePassword}`,
    `keyAlias=${alias}`,
    `keyPassword=${keyPassword}`,
    '',
  ].join('\n');
  fs.writeFileSync(keystorePropsPath, propsBody, 'utf8');
  console.log(`${c.green}Saved ${keystorePropsPath} (git-ignored).${c.reset}`);
  console.log(`${c.yellow}Keep ${keystoreName} backed up safely — every future OTA APK must use this exact key!${c.reset}`);
  return true;
}

async function handleApkBuild(rl, cfg, nonInteractive = false) {
  const status = inspectEnvironment();
  console.log(`\n${c.bold}Production-Ready Android APK Builder${c.reset}`);
  console.log(`  App Module:   ${appModuleDir}`);
  console.log(`  FCM Config:   ${status.hasGoogleServices ? `${c.green}google-services.json present (${status.fcmClientProjectId})${c.reset}` : `${c.yellow}missing google-services.json${c.reset}`}`);

  if (!status.hasJava) {
    console.log(`${c.red}[ERROR] 'java' (JDK 17) is not on PATH. Install JDK 17 or configure JAVA_HOME.${c.reset}`);
    return null;
  }

  if (!status.hasKeystoreProps || !status.keystoreFileExists) {
    console.log(`${c.yellow}[WARNING] Release keystore is not configured (${keystorePropsPath}).${c.reset}`);
    console.log(`  Without keystore.properties, Gradle builds an UNSIGNED release APK that Android phones cannot auto-update.`);
    if (rl && !nonInteractive) {
      const wantSetup = await askYesNo(rl, 'Generate a new release keystore & keystore.properties now?', false);
      if (wantSetup) {
        await setupReleaseKeystoreWizard(rl);
      }
    }
  }

  const currentVersions = readGradleVersions();
  let targetCode = currentVersions.versionCode;
  let targetName = currentVersions.versionName;

  if (rl && !nonInteractive) {
    const bump = await askYesNo(
      rl,
      `Current version is v${currentVersions.versionName} (versionCode ${currentVersions.versionCode}). Bump version before build?`,
      false
    );
    if (bump) {
      const nextCodeStr = await ask(rl, 'New versionCode', String(currentVersions.versionCode + 1));
      const parsedCode = Number.parseInt(nextCodeStr, 10);
      if (!Number.isInteger(parsedCode) || parsedCode < 1) {
        console.log(`${c.red}Invalid versionCode.${c.reset}`);
        return null;
      }
      const parts = currentVersions.versionName.split('.').map((n) => Number.parseInt(n, 10));
      const suggestedName =
        parts.length === 3 && parts.every((n) => Number.isInteger(n))
          ? `${parts[0]}.${parts[1]}.${parts[2] + 1}`
          : currentVersions.versionName;
      targetName = await ask(rl, 'New versionName', suggestedName);
      targetCode = parsedCode;
      writeGradleVersions(targetCode, targetName);
      console.log(`${c.green}Updated build.gradle.kts -> v${targetName} (versionCode ${targetCode})${c.reset}`);
    }
  }

  const runTests = rl && !nonInteractive
    ? await askYesNo(rl, 'Run Gradle unit tests (testDebugUnitTest) before assembling APK?', true)
    : false;
  const alsoBuildDebug = rl && !nonInteractive
    ? await askYesNo(rl, 'Also build debug APK (assembleDebug) alongside release APK?', false)
    : false;

  const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
  if (runTests) {
    console.log(`${c.cyan}Running ./gradlew testDebugUnitTest...${c.reset}`);
    if (!runCommandSync(gradlew, ['testDebugUnitTest'], androidDir, {}, isWindows)) {
      console.log(`${c.red}Unit tests failed. Aborting release APK build.${c.reset}`);
      return null;
    }
  }

  console.log(`${c.cyan}Running ./gradlew assembleRelease (R8 minification + resource shrinking)...${c.reset}`);
  if (!runCommandSync(gradlew, ['assembleRelease'], androidDir, {}, isWindows)) {
    console.log(`${c.red}assembleRelease failed.${c.reset}`);
    return null;
  }

  if (alsoBuildDebug) {
    console.log(`${c.cyan}Running ./gradlew assembleDebug...${c.reset}`);
    runCommandSync(gradlew, ['assembleDebug'], androidDir, {}, isWindows);
  }

  const releaseOutDir = path.join(appModuleDir, 'build', 'outputs', 'apk', 'release');
  const signedCandidate = path.join(releaseOutDir, 'app-release.apk');
  const unsignedCandidate = path.join(releaseOutDir, 'app-release-unsigned.apk');
  const builtApk = fs.existsSync(signedCandidate)
    ? signedCandidate
    : fs.existsSync(unsignedCandidate)
      ? unsignedCandidate
      : null;

  if (!builtApk) {
    console.log(`${c.red}Could not find built APK in ${releaseOutDir}.${c.reset}`);
    return null;
  }

  const isSigned = builtApk === signedCandidate && fs.existsSync(keystorePropsPath);
  const sha256 = computeFileSha256(builtApk);
  const stat = fs.statSync(builtApk);

  fs.mkdirSync(apkDistDir, { recursive: true });
  const exportName = isSigned
    ? `orbit-pay-v${targetName}-b${targetCode}.apk`
    : `orbit-pay-v${targetName}-b${targetCode}-UNSIGNED.apk`;
  const exportedApkPath = path.join(apkDistDir, exportName);
  fs.copyFileSync(builtApk, exportedApkPath);

  const manifest = {
    appId: 'com.orbitsaas.payment',
    versionCode: targetCode,
    versionName: targetName,
    signed: isSigned,
    fcmBundled: status.hasGoogleServices && status.fcmPackageMatch,
    fcmProjectId: status.fcmClientProjectId,
    sizeBytes: stat.size,
    sizeFormatted: formatBytes(stat.size),
    sha256,
    gradleOutput: builtApk,
    exportedApk: exportedApkPath,
    builtAt: new Date().toISOString(),
  };

  const manifestPath = path.join(apkDistDir, 'latest-build.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`
${c.green}${c.bold}Production APK Ready!${c.reset}
  Exported APK:  ${c.bold}${exportedApkPath}${c.reset}
  Manifest JSON: ${manifestPath}
  Version:       v${targetName} (versionCode ${targetCode})
  Size:          ${formatBytes(stat.size)} (${stat.size} bytes)
  Signed:        ${isSigned ? `${c.green}YES (Release Keystore)${c.reset}` : `${c.yellow}NO (Unsigned — configure keystore.properties for OTA)${c.reset}`}
  FCM Bundled:   ${manifest.fcmBundled ? `${c.green}YES (${manifest.fcmProjectId})${c.reset}` : `${c.yellow}NO${c.reset}`}
  SHA-256:       ${c.dim}${sha256}${c.reset}
`);

  if (rl && !nonInteractive) {
    const pushOtaNow = await askYesNo(rl, 'Publish this APK as an OTA release now?', false);
    if (pushOtaNow) {
      await handleOtaMenu(rl, cfg, exportedApkPath, targetCode, targetName);
    }
  }

  return manifest;
}

async function resolveAdminCredentials(rl, cfg) {
  const status = inspectEnvironment();
  const preferredUrl = getPreferredServerUrl(cfg);
  console.log(`\n${c.bold}Target Server:${c.reset}
  1) Local Backend (${cfg.localUrl})
  2) Production (${cfg.productionUrl})
  3) Custom URL`);
  const defaultChoice = preferredUrl === cfg.productionUrl ? '2' : '1';
  const targetChoice = await ask(rl, 'Select server', defaultChoice);
  let baseUrl = cfg.localUrl;
  if (targetChoice === '2') baseUrl = cfg.productionUrl;
  else if (targetChoice === '3') baseUrl = await ask(rl, 'Enter base URL', preferredUrl);
  baseUrl = baseUrl.replace(/\/+$/, '');

  const defaultAdminKey =
    baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
      ? status.masterAdminKeyLocal
      : process.env.ORBIT_ADMIN_KEY || '';
  const adminKey = await ask(rl, 'X-Admin-Key (MASTER_ADMIN_KEY)', defaultAdminKey);
  return { baseUrl, adminKey };
}

function findDefaultApkForOta() {
  const manifestPath = path.join(apkDistDir, 'latest-build.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (m.exportedApk && fs.existsSync(m.exportedApk)) {
        return {
          path: m.exportedApk,
          versionCode: m.versionCode,
          versionName: m.versionName,
        };
      }
    } catch {
      // Ignore
    }
  }
  const releaseApk = path.join(appModuleDir, 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (fs.existsSync(releaseApk)) {
    const v = readGradleVersions();
    return { path: releaseApk, versionCode: v.versionCode, versionName: v.versionName };
  }
  return null;
}

async function handleOtaMenu(rl, cfg, preselectedApk = null, preCode = null, preName = null) {
  let subChoice = '1';
  if (!preselectedApk) {
    console.log(`\n${c.bold}OTA Release & Push Update Options:${c.reset}
  1) Upload & Publish APK to R2 + D1 (and optionally push to devices)
  2) Broadcast Push Update for an existing release (WebSocket + FCM)
  3) Check Latest Live Release Manifest (/api/v1/app/latest)
  4) List All Published Releases (/api/v1/admin/releases)`);
    subChoice = await ask(rl, 'Choose OTA action', '1');
  }

  if (subChoice === '3') {
    const baseUrl = (await ask(rl, 'Server URL', getPreferredServerUrl(cfg))).replace(/\/+$/, '');
    const v = readGradleVersions();
    const currentCode = await ask(rl, 'Simulate client currentVersionCode', String(v.versionCode));
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/app/latest?currentVersionCode=${encodeURIComponent(currentCode)}&platform=ANDROID`
      );
      const body = await res.json();
      console.log(JSON.stringify(body, null, 2));
    } catch (err) {
      console.log(`${c.red}Failed to query /api/v1/app/latest: ${err.message}${c.reset}`);
    }
    return;
  }

  const { baseUrl, adminKey } = await resolveAdminCredentials(rl, cfg);
  if (!adminKey) {
    console.log(`${c.red}MASTER_ADMIN_KEY is required for admin OTA endpoints.${c.reset}`);
    return;
  }

  if (subChoice === '4') {
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/releases`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      const body = await res.json();
      console.log(JSON.stringify(body, null, 2));
    } catch (err) {
      console.log(`${c.red}Request failed: ${err.message}${c.reset}`);
    }
    return;
  }

  if (subChoice === '2') {
    const releaseId = await ask(rl, 'Release ID (or "latest")', 'latest');
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/releases/${encodeURIComponent(releaseId)}/broadcast`, {
        method: 'POST',
        headers: { 'X-Admin-Key': adminKey },
      });
      const body = await res.json();
      console.log(JSON.stringify(body, null, 2));
    } catch (err) {
      console.log(`${c.red}Broadcast failed: ${err.message}${c.reset}`);
    }
    return;
  }

  // Option 1: Upload & Publish APK
  const detected = preselectedApk
    ? { path: preselectedApk, versionCode: preCode, versionName: preName }
    : findDefaultApkForOta();

  const apkPath = await ask(rl, 'Path to signed .apk file', detected?.path || '');
  if (!apkPath || !fs.existsSync(apkPath)) {
    console.log(`${c.red}APK file not found: ${apkPath}${c.reset}`);
    return;
  }
  if (apkPath.toUpperCase().includes('UNSIGNED')) {
    const proceed = await askYesNo(
      rl,
      `${c.yellow}This APK looks unsigned. Android clients may reject OTA install. Continue anyway?${c.reset}`,
      false
    );
    if (!proceed) return;
  }

  const fallbackVersions = readGradleVersions();
  const versionCode = await ask(
    rl,
    'versionCode (must exceed installed client versionCode)',
    String(detected?.versionCode ?? fallbackVersions.versionCode)
  );
  const versionName = await ask(
    rl,
    'versionName',
    String(detected?.versionName ?? fallbackVersions.versionName)
  );
  const minSupported = await ask(rl, 'minSupportedVersionCode', '1');
  const mandatory = await askYesNo(rl, 'Mandatory force update (blocks dismiss)?', false);
  const notifyDevices = await askYesNo(rl, 'Broadcast instant push (WebSocket + FCM) right after upload?', true);
  const releaseNotes = await ask(rl, 'Release notes', `ORBIT Pay v${versionName}`);

  const fileBytes = fs.readFileSync(apkPath);
  const form = new FormData();
  form.append(
    'apk',
    new Blob([fileBytes], { type: 'application/vnd.android.package-archive' }),
    path.basename(apkPath)
  );
  form.append('versionCode', String(versionCode));
  form.append('versionName', String(versionName));
  form.append('minSupportedVersionCode', String(minSupported));
  form.append('mandatory', String(mandatory));
  form.append('notifyDevices', String(notifyDevices));
  form.append('releaseNotes', releaseNotes);

  console.log(`${c.cyan}Uploading ${path.basename(apkPath)} (${formatBytes(fileBytes.length)}) to ${baseUrl}...${c.reset}`);
  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/releases`, {
      method: 'POST',
      headers: { 'X-Admin-Key': adminKey },
      body: form,
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      console.log(`${c.red}OTA publish failed (HTTP ${res.status}):${c.reset}`);
      console.log(JSON.stringify(body, null, 2));
      return;
    }
    console.log(`${c.green}${c.bold}OTA Release Published!${c.reset}`);
    console.log(JSON.stringify(body.data, null, 2));
  } catch (err) {
    console.log(`${c.red}Upload error: ${err.message}${c.reset}`);
  }
}

async function handleAndroidLauncher(rl) {
  console.log(`\n${c.bold}Android Companion Launcher:${c.reset}
  1) Connect Phone / Auto Emulator (adb reverse + install debug APK + launch + scrcpy)
  2) Force Standalone Emulator (without Android Studio)
  3) Open app/ in Android Studio`);
  const choice = rl ? await ask(rl, 'Choose launcher mode', '1') : '1';
  if (choice === '2') {
    await runNodeScript('scripts/launch.mjs', ['android', '--emulator'], orbitDir);
  } else if (choice === '3') {
    await runNodeScript('scripts/launch.mjs', ['studio'], orbitDir);
  } else {
    await runNodeScript('scripts/launch.mjs', ['android'], orbitDir);
  }
}

async function handleWebOpeners(rl) {
  console.log(`\n${c.bold}Web Dashboards:${c.reset}
  1) Merchant Dashboard (http://localhost:3000)
  2) Admin Dashboard & OTA Releases (http://localhost:3000/admin)
  3) Checkout Widget Demo (http://localhost:3000/checkout)`);
  const choice = rl ? await ask(rl, 'Open page', '2') : '2';
  const mode = choice === '1' ? 'web' : choice === '3' ? 'checkout' : 'admin';
  await runNodeScript('scripts/launch.mjs', [mode], orbitDir);
}

async function handleReadinessCheck(rl, cfg) {
  const s = inspectEnvironment();
  const okTag = `${c.green}PASS${c.reset}`;
  const warnTag = `${c.yellow}WARN${c.reset}`;
  const failTag = `${c.red}MISS${c.reset}`;

  console.log(`\n${c.bold}ORBIT System & FCM Readiness Audit:${c.reset}`);
  console.log(`  [${s.hasJava ? okTag : failTag}] JDK / java on PATH`);
  console.log(`  [${s.adbPath ? okTag : warnTag}] Android ADB ${s.adbPath ? `(${s.adbPath})` : '(not found)'}`);
  console.log(`  [${s.hasScrcpy ? okTag : warnTag}] scrcpy screen mirror`);
  console.log(`  [${s.hasBun ? okTag : warnTag}] Bun runtime (${isBun ? 'active' : s.hasBun ? 'installed' : 'using Node.js'})`);
  console.log(`  [${s.hasR2Binding ? okTag : failTag}] Cloudflare R2 binding (R2_BUCKET in wrangler.toml)`);
  console.log(`  [${s.hasPushHub ? okTag : failTag}] Cloudflare Durable Object (PUSH_HUB in wrangler.toml)`);
  console.log(
    `  [${s.hasGoogleServices && s.fcmPackageMatch ? okTag : failTag}] Android FCM google-services.json (${s.fcmClientProjectId || 'missing'}, pkg match=${s.fcmPackageMatch})`
  );
  console.log(
    `  [${s.fcmServiceAccountPresent ? okTag : warnTag}] Backend .dev.vars FCM_SERVICE_ACCOUNT_JSON ${s.fcmServiceAccountPresent ? '(set)' : '(empty — WebSocket + 60s polling still work, FCM backup disabled)'}`
  );
  console.log(
    `  [${s.hasKeystoreProps && s.keystoreFileExists ? okTag : warnTag}] Android release signing (keystore.properties=${s.hasKeystoreProps}, storeFileExists=${s.keystoreFileExists})`
  );

  if (rl) {
    const pingServer = await askYesNo(rl, 'Check live backend /api/v1/health and /api/v1/app/latest now?', true);
    if (pingServer) {
      const targetUrl = getPreferredServerUrl(cfg).replace(/\/+$/, '');
      try {
        const hRes = await fetch(`${targetUrl}/api/v1/health`);
        const hJson = await hRes.json();
        console.log(`  ${c.green}Health (${targetUrl}):${c.reset} ${JSON.stringify(hJson)}`);
      } catch (err) {
        console.log(`  ${c.yellow}Health (${targetUrl}): unreachable (${err.message})${c.reset}`);
      }
      try {
        const aRes = await fetch(`${targetUrl}/api/v1/app/latest?currentVersionCode=1&platform=ANDROID`);
        const aJson = await aRes.json();
        console.log(`  ${c.green}Latest OTA (${targetUrl}):${c.reset} ${JSON.stringify(aJson)}`);
      } catch (err) {
        console.log(`  ${c.yellow}Latest OTA (${targetUrl}): unreachable (${err.message})${c.reset}`);
      }
    }
  }
}

async function handleDeploy(rl) {
  console.log(`\n${c.bold}Cloudflare Production Deployment:${c.reset}`);
  const runMigrate = rl
    ? await askYesNo(rl, 'Apply remote D1 migrations first (db:migrate:remote)?', false)
    : false;
  const runner = isBun ? 'bun' : 'npm';
  if (runMigrate) {
    if (!runCommandSync(runner, ['--workspace=backend', 'run', 'db:migrate:remote'], orbitDir)) {
      return;
    }
  }
  runCommandSync(runner, ['run', 'deploy'], orbitDir);
}

async function installGlobalAppCommand(rl) {
  if (!isWindows) {
    console.log(`\nTo run \`app\` from anywhere in bash/zsh, add this to ~/.bashrc or ~/.zshrc:`);
    console.log(`  ${c.cyan}export PATH="${orbitDir}:$PATH"${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}Install Global \`app\` Terminal Command (Windows):${c.reset}
  This lets you type ${c.green}app${c.reset} from ANY folder in PowerShell / CMD / Windows Terminal.
  1) Add ${c.cyan}${orbitDir}${c.reset} to your User PATH (recommended)
  2) Show PowerShell \`$PROFILE\` snippet only`);
  const choice = await ask(rl, 'Choose option', '1');

  if (choice === '2') {
    console.log(`\nAdd this line to your PowerShell profile (\`notepad $PROFILE\`):`);
    console.log(`  ${c.cyan}function app { & "${path.join(orbitDir, 'app.ps1')}" @args }${c.reset}\n`);
    return;
  }

  try {
    const psScript = [
      `$dir = '${orbitDir.replace(/'/g, "''")}'`,
      `$cur = [Environment]::GetEnvironmentVariable('Path', 'User')`,
      `$parts = @(); if ($cur) { $parts = $cur -split ';' | Where-Object { $_ -ne '' } }`,
      `if ($parts -notcontains $dir) {`,
      `  $newPath = ($parts + $dir) -join ';'`,
      `  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')`,
      `  Write-Output 'ADDED'`,
      `} else {`,
      `  Write-Output 'EXISTS'`,
      `}`,
    ].join('; ');
    const out = execFileSync('powershell', ['-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
    }).trim();
    if (out === 'ADDED') {
      console.log(`${c.green}Added ${orbitDir} to your Windows User PATH! Restart your terminal, then type \`app\` anywhere.${c.reset}`);
    } else {
      console.log(`${c.green}${orbitDir} is already in your Windows User PATH.${c.reset}`);
    }
  } catch (err) {
    console.log(`${c.red}Failed to update User PATH automatically: ${err.message}${c.reset}`);
    console.log(`You can manually add ${orbitDir} to User PATH or run .\\app in this folder.`);
  }
}

async function handleSettings(rl, cfg) {
  console.log(`\n${c.bold}CLI Settings:${c.reset}
  1) Set Default Action (currently: ${ACTION_LABELS[cfg.defaultAction] || cfg.defaultAction})
  2) Set Default OTA / Health Server Target (currently: ${getPreferredServerUrl(cfg)})
  3) Install global \`app\` command (work from any directory)
  4) Back`);
  const choice = await ask(rl, 'Choose setting', '1');

  if (choice === '1') {
    const keys = Object.keys(ACTION_LABELS);
    console.log('');
    keys.forEach((k, idx) => {
      const marker = k === cfg.defaultAction ? `${c.green}*${c.reset}` : ' ';
      console.log(`  ${marker} ${idx + 1}) ${k.padEnd(14)} — ${ACTION_LABELS[k]}`);
    });
    const pick = await ask(rl, 'Select default number', '1');
    const idx = Number.parseInt(pick, 10) - 1;
    if (idx >= 0 && idx < keys.length) {
      cfg.defaultAction = keys[idx];
      saveConfig(cfg);
      console.log(`${c.green}Saved default action: ${ACTION_LABELS[cfg.defaultAction]}${c.reset}`);
    }
  } else if (choice === '2') {
    console.log(`  1) Local (${cfg.localUrl})\n  2) Production (${cfg.productionUrl})\n  3) Custom URL`);
    const pick = await ask(rl, 'Select target', '1');
    if (pick === '1') cfg.serverTarget = 'local';
    else if (pick === '2') cfg.serverTarget = 'production';
    else if (pick === '3') cfg.serverTarget = await ask(rl, 'Custom URL', getPreferredServerUrl(cfg));
    saveConfig(cfg);
    console.log(`${c.green}Saved server target: ${getPreferredServerUrl(cfg)}${c.reset}`);
  } else if (choice === '3') {
    await installGlobalAppCommand(rl);
  }
}

async function dispatchAction(actionKey, rl, cfg) {
  switch (actionKey) {
    case 'dev':
      await handleLocalDev(rl, '1');
      break;
    case 'dev:realtime':
      await handleLocalDev(rl, '3');
      break;
    case 'dev:ecomm':
      await handleLocalDev(rl, '4');
      break;
    case 'preview':
      await handleLocalPreview(rl);
      break;
    case 'apk':
      await handleApkBuild(rl, cfg, rl === null);
      break;
    case 'ota':
      await handleOtaMenu(rl, cfg);
      break;
    case 'android':
      await handleAndroidLauncher(rl);
      break;
    case 'check':
      await handleReadinessCheck(rl, cfg);
      break;
    case 'deploy':
      await handleDeploy(rl);
      break;
    default:
      console.log(`${c.red}Unknown action: ${actionKey}${c.reset}`);
  }
}

function printCliHelp() {
  console.log(`
${c.cyan}${c.bold}ORBIT \`app\` CLI${c.reset}
Usage:
  app                 Open interactive menu (press Enter to run your saved default)
  app --default       Run your saved default action immediately
  app dev             Start local development servers
  app preview         Build & run local production preview
  app apk             Build production-ready Android APK
  app ota             Open OTA release & push menu
  app android         Launch Android app on phone / emulator
  app check           Run FCM / keystore / tooling readiness check
  app deploy          Deploy Web + Cloudflare Worker
  app --help          Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  const cfg = loadConfig();

  if (args.includes('--help') || args.includes('-h')) {
    printCliHelp();
    return;
  }

  const firstArg = args.find((a) => !a.startsWith('-'));
  if (args.includes('--default') || args.includes('-d')) {
    await dispatchAction(cfg.defaultAction, null, cfg);
    return;
  }

  if (firstArg && ACTION_LABELS[firstArg]) {
    const rl = readline.createInterface({ input, output });
    try {
      await dispatchAction(firstArg, rl, cfg);
    } finally {
      rl.close();
    }
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    let keepRunning = true;
    while (keepRunning) {
      const status = inspectEnvironment();
      printBanner(cfg, status);
      printMenu(cfg);

      const choice = (await rl.question(`${c.bold}app>${c.reset} `)).trim();
      switch (choice) {
        case '':
          await dispatchAction(cfg.defaultAction, rl, cfg);
          break;
        case '1':
          await handleLocalDev(rl);
          break;
        case '2':
          await handleLocalPreview(rl);
          break;
        case '3':
          await handleApkBuild(rl, cfg);
          break;
        case '4':
          await handleOtaMenu(rl, cfg);
          break;
        case '5':
          await handleAndroidLauncher(rl);
          break;
        case '6':
          await handleWebOpeners(rl);
          break;
        case '7':
          await handleReadinessCheck(rl, cfg);
          break;
        case '8':
          await handleDeploy(rl);
          break;
        case '9':
          await handleSettings(rl, cfg);
          break;
        case '0':
        case 'q':
        case 'exit':
          keepRunning = false;
          break;
        default:
          console.log(`${c.yellow}Unknown option "${choice}". Enter 0-9 or press Enter for default.${c.reset}`);
      }

      if (keepRunning && choice !== '9') {
        console.log('');
        keepRunning = await askYesNo(rl, 'Return to `app` menu?', true);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`${c.red}[app CLI error]${c.reset}`, err);
  process.exit(1);
});
