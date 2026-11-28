#!/usr/bin/env node

/**
 * ORBIT Payment Hub — Android Companion Checking & `/claude-red` AppSec Suite
 *
 * Runs structured readiness, Gradle unit tests, Android Lint, Kotlin release
 * compilation checks (including deprecation warning count), `/claude-red`
 * offensive-mobile static security audits, and optional Web/Backend contract
 * verification. Designed for both local `.\app` interactive usage and GitHub Actions CI.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orbitDir = path.resolve(__dirname, '..');
const androidDir = path.join(orbitDir, 'app');
const appModuleDir = path.join(androidDir, 'app');
const srcMainDir = path.join(appModuleDir, 'src', 'main');
const manifestPath = path.join(srcMainDir, 'AndroidManifest.xml');
const netSecPath = path.join(srcMainDir, 'res', 'xml', 'network_security_config.xml');
const proguardPath = path.join(appModuleDir, 'proguard-rules.pro');
const buildGradlePath = path.join(appModuleDir, 'build.gradle.kts');
const keystorePropsPath = path.join(androidDir, 'keystore.properties');
const googleServicesPath = path.join(appModuleDir, 'google-services.json');
const gitignorePath = path.join(orbitDir, '.gitignore');
const isWindows = process.platform === 'win32';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function commandExists(cmd) {
  try {
    execFileSync(isWindows ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

function runCapture(cmd, args, cwd) {
  const needsShell = isWindows && !cmd.endsWith('.exe');
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: needsShell,
    maxBuffer: 25 * 1024 * 1024,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function runStreaming(cmd, args, cwd) {
  const needsShell = isWindows && !cmd.endsWith('.exe');
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: needsShell,
  });
  return (res.status ?? 1) === 0;
}

function printResult(status, title, detail = '') {
  const tag =
    status === 'PASS'
      ? `${c.green}[PASS]${c.reset}`
      : status === 'WARN'
        ? `${c.yellow}[WARN]${c.reset}`
        : `${c.red}[FAIL]${c.reset}`;
  console.log(`  ${tag} ${title}${detail ? ` ${c.dim}— ${detail}${c.reset}` : ''}`);
}

export function runMobileSecurityAudit() {
  console.log(`\n${c.cyan}${c.bold}Stage — /claude-red Mobile AppSec Static Audit (OWASP MASVS)${c.reset}`);
  let failures = 0;
  let warnings = 0;

  const pass = (title, detail) => printResult('PASS', title, detail);
  const warn = (title, detail) => {
    warnings++;
    printResult('WARN', title, detail);
  };
  const fail = (title, detail) => {
    failures++;
    printResult('FAIL', title, detail);
  };

  // 1. AndroidManifest.xml backup, cleartext, exported surface
  if (!fs.existsSync(manifestPath)) {
    fail('AndroidManifest.xml present', 'Missing AndroidManifest.xml');
    return { failures, warnings };
  }
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  if (/android:allowBackup\s*=\s*"false"/.test(manifest)) {
    pass('Backup disabled', 'android:allowBackup="false"');
  } else {
    fail('Backup disabled', 'Set android:allowBackup="false" to prevent adb/cloud data extraction');
  }

  if (/android:usesCleartextTraffic\s*=\s*"true"/.test(manifest)) {
    fail('No global cleartext override', 'android:usesCleartextTraffic="true" found in manifest');
  } else {
    pass('No global cleartext override', 'Strict TLS controlled by network_security_config.xml');
  }

  // Exported component audit (match strictly within each single opening tag `[^>]`)
  const exportedMatches = [...manifest.matchAll(/<(activity|receiver|service|provider)\b[^>]*\bandroid:exported\s*=\s*"true"[^>]*>/g)];
  const allowedExported = new Set([
    '.ui.MainActivity',
    '.interceptors.SmsReceiver',
    '.service.BootReceiver',
    '.interceptors.PushListener',
    '.widget.PendingPaymentsWidgetProvider',
  ]);
  const unexpectedExported = [];
  for (const m of exportedMatches) {
    const tagBody = m[0];
    const nameMatch = tagBody.match(/android:name\s*=\s*"([^"]+)"/);
    const compName = nameMatch ? nameMatch[1] : '<unknown>';
    if (!allowedExported.has(compName)) {
      unexpectedExported.push(compName);
    }
  }
  if (unexpectedExported.length === 0) {
    pass('Exported IPC surface minimized', `${exportedMatches.length} expected system/launcher entrypoints`);
  } else {
    fail('Unexpected exported components', unexpectedExported.join(', '));
  }

  // 2. Network Security Config
  if (fs.existsSync(netSecPath)) {
    const netSec = fs.readFileSync(netSecPath, 'utf8');
    if (/base-config[^>]*cleartextTrafficPermitted\s*=\s*"false"/.test(netSec)) {
      pass('Release TLS enforcement', 'cleartextTrafficPermitted="false" in main network_security_config.xml');
    } else {
      fail('Release TLS enforcement', 'Release base-config must set cleartextTrafficPermitted="false"');
    }
    if (/<certificates\s+src="user"/.test(netSec)) {
      warn('User-installed CA trust', 'Release network config trusts user CAs (MITM risk)');
    } else {
      pass('System CA trust only', 'User certificates excluded in release build');
    }
  } else {
    fail('Network Security Config present', 'Missing res/xml/network_security_config.xml');
  }

  // 3. Encrypted credential storage
  const prefsFile = path.join(srcMainDir, 'java', 'com', 'orbitsaas', 'payment', 'data', 'local', 'PreferencesManager.kt');
  if (fs.existsSync(prefsFile)) {
    const prefsCode = fs.readFileSync(prefsFile, 'utf8');
    if (prefsCode.includes('EncryptedSharedPreferences') && prefsCode.includes('securePrefs')) {
      pass('Encrypted token storage', 'authToken, deviceKey, sessionId protected via AES256 EncryptedSharedPreferences');
    } else {
      fail('Encrypted token storage', 'PreferencesManager must store secrets in EncryptedSharedPreferences');
    }
  }

  // 4. Release logging & ProGuard sanitization
  const apiClientFile = path.join(srcMainDir, 'java', 'com', 'orbitsaas', 'payment', 'data', 'remote', 'OrbitApiClient.kt');
  if (fs.existsSync(apiClientFile)) {
    const apiCode = fs.readFileSync(apiClientFile, 'utf8');
    if (apiCode.includes('LogLevel.NONE') && apiCode.includes('BuildConfig.DEBUG')) {
      pass('Release HTTP log suppression', 'Ktor Logging drops to LogLevel.NONE outside BuildConfig.DEBUG');
    } else {
      fail('Release HTTP log suppression', 'Gate Ktor HTTP Logging with BuildConfig.DEBUG (LogLevel.NONE in release)');
    }
  }

  if (fs.existsSync(proguardPath)) {
    const pg = fs.readFileSync(proguardPath, 'utf8');
    if (pg.includes('-assumenosideeffects class android.util.Log')) {
      pass('ProGuard log stripping', 'R8/ProGuard strips Log.v and Log.d in release APK');
    } else {
      warn('ProGuard log stripping', 'Consider stripping android.util.Log debug calls in proguard-rules.pro');
    }
  }

  // 5. OTA self-update verification
  const updaterFile = path.join(srcMainDir, 'java', 'com', 'orbitsaas', 'payment', 'update', 'AppUpdateManager.kt');
  if (fs.existsSync(updaterFile)) {
    const upCode = fs.readFileSync(updaterFile, 'utf8');
    const checksBlankSha = /target\.sha256\.isBlank\(\)/.test(upCode);
    const checksHttps = upCode.includes('startsWith("https://"');
    if (checksBlankSha && checksHttps) {
      pass('OTA integrity & HTTPS guard', 'Enforces HTTPS downloadUrl + mandatory non-blank SHA-256 verification');
    } else {
      fail('OTA integrity & HTTPS guard', 'AppUpdateManager must reject non-HTTPS URLs and blank SHA-256 digests');
    }
  }

  // 6. WebView / PendingIntent / Secret scan across Kotlin sources
  const ktFiles = walkFiles(path.join(appModuleDir, 'src'), ['.kt']);
  const dangerousHits = [];
  const secretHits = [];
  const secretPatterns = [
    /\bsk_(live|proj|test)_[A-Za-z0-9]{16,}\b/,
    /\borb_adm_[A-Za-z0-9]{12,}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bAIza[0-9A-Za-z\-_]{35}\b/,
  ];

  for (const file of ktFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(orbitDir, file);
    if (content.includes('addJavascriptInterface') || content.includes('setAllowFileAccessFromFileURLs(true)')) {
      dangerousHits.push(`${rel}: risky WebView bridge or file access API`);
    }
    if (/FLAG_MUTABLE/.test(content) && !file.endsWith('AppUpdateManager.kt')) {
      dangerousHits.push(`${rel}: review FLAG_MUTABLE PendingIntent for Intent hijacking`);
    }
    for (const pat of secretPatterns) {
      if (pat.test(content)) {
        secretHits.push(`${rel}: matched ${pat}`);
      }
    }
  }

  if (dangerousHits.length === 0) {
    pass('WebView & PendingIntent hygiene', `Scanned ${ktFiles.length} Kotlin files — no unsafe bridges or mutable implicit intents`);
  } else {
    warn('WebView / PendingIntent review', dangerousHits.join('; '));
  }

  if (secretHits.length === 0) {
    pass('Hardcoded secret scan', 'No embedded API/admin/Google keys in Android source');
  } else {
    fail('Hardcoded secret scan', secretHits.join('; '));
  }

  // 7. Gitignore / Git tracking hygiene for release signing & Firebase secrets
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf8');
    const requiredRules = ['keystore.properties', '*.jks', 'google-services.json'];
    const missing = requiredRules.filter((r) => !gi.includes(r));
    if (missing.length === 0) {
      pass('Secrets gitignore protection', 'keystore.properties, *.jks, google-services.json ignored');
    } else {
      fail('Secrets gitignore protection', `Missing from .gitignore: ${missing.join(', ')}`);
    }
  }

  if (commandExists('git')) {
    const trackedSecrets = [];
    for (const candidate of ['app/keystore.properties', 'app/orbit-release.jks', 'app/app/google-services.json']) {
      const check = runCapture('git', ['ls-files', '--error-unmatch', candidate], orbitDir);
      if (check.status === 0) {
        trackedSecrets.push(candidate);
      }
    }
    if (trackedSecrets.length === 0) {
      pass('Git history secret check', 'Keystore & Firebase configs are not tracked by git');
    } else {
      fail('Git history secret check', `Tracked secret files: ${trackedSecrets.join(', ')}`);
    }
  }

  return { failures, warnings };
}

export function runGradleChecks({ withLint = false, withReleaseApk = false } = {}) {
  const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
  let failures = 0;
  let warnings = 0;

  if (!commandExists('java')) {
    printResult('FAIL', 'Java / JDK 17 available', 'java not found on PATH');
    return { failures: 1, warnings: 0 };
  }

  const compileTask = withReleaseApk ? 'assembleRelease' : 'compileReleaseKotlin';
  const tasks = ['testDebugUnitTest', ...(withLint ? ['lintDebug'] : []), compileTask, '--no-daemon'];

  console.log(`\n${c.cyan}${c.bold}Stage — Android Gradle Checks (${tasks.join(' ')}) ${c.reset}`);
  const res = runCapture(gradlew, tasks, androidDir);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  const deprecationWarnings = (res.stdout + '\n' + res.stderr)
    .split(/\r?\n/)
    .filter((line) => /^w:\s+/.test(line.trim())).length;

  if (res.status === 0) {
    printResult('PASS', 'Gradle Unit Tests', 'testDebugUnitTest passed');
    if (withLint) {
      printResult('PASS', 'Android Lint', 'lintDebug passed');
    }
    if (deprecationWarnings > 0) {
      warnings += deprecationWarnings;
      printResult('WARN', `Kotlin ${compileTask}`, `Compiled cleanly with ${deprecationWarnings} compiler warning(s)`);
    } else {
      printResult('PASS', `Kotlin ${compileTask}`, '0 errors, 0 compiler warnings');
    }
  } else {
    failures++;
    printResult('FAIL', `Gradle Checks (${tasks.join(', ')})`, `Exited with code ${res.status}`);
  }

  return { failures, warnings };
}

export function runWebContractChecks() {
  console.log(`\n${c.cyan}${c.bold}Stage — Monorepo Web & Backend Typecheck (` + '`npm run build`' + `)${c.reset}`);
  const npmBin = commandExists('bun') ? 'bun' : 'npm';
  if (runStreaming(npmBin, ['run', 'build'], orbitDir)) {
    printResult('PASS', 'Web + Backend Typecheck & Build', 'Frontend tsc/vite + Backend tsc --noEmit passed');
    return { failures: 0, warnings: 0 };
  }
  printResult('FAIL', 'Web + Backend Typecheck & Build', 'Monorepo build failed');
  return { failures: 1, warnings: 0 };
}

export async function runLiveConnectivityChecks(targetUrl) {
  const cleanUrl = (targetUrl || 'https://payment.orbitsaas.cloud').replace(/\/+$/, '');
  console.log(`\n${c.cyan}${c.bold}Stage — Live Hub & OTA Endpoint Probe (${cleanUrl})${c.reset}`);
  let warnings = 0;

  for (const endpoint of ['/api/v1/health', '/api/v1/app/latest?currentVersionCode=1&platform=ANDROID']) {
    try {
      const res = await fetch(`${cleanUrl}${endpoint}`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        printResult('PASS', `GET ${endpoint}`, `HTTP ${res.status}`);
      } else {
        warnings++;
        printResult('WARN', `GET ${endpoint}`, `HTTP ${res.status}`);
      }
    } catch (err) {
      warnings++;
      printResult('WARN', `GET ${endpoint}`, `Unreachable (${err.message})`);
    }
  }
  return { failures: 0, warnings };
}

export async function runAppCheckSuite(options = {}) {
  const {
    mode = 'standard', // 'security' | 'quick' | 'standard' | 'ci' | 'full'
    targetUrl = null,
    withReleaseApk = false,
  } = options;

  console.log(`\n${c.bold}========================================================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ORBIT Payment Hub — Android App Checking System (mode: ${mode})${c.reset}`);
  console.log(`${c.bold}========================================================================${c.reset}`);

  let totalFailures = 0;
  let totalWarnings = 0;

  // Stage 0: Build config sanity check
  if (fs.existsSync(buildGradlePath)) {
    const gradleText = fs.readFileSync(buildGradlePath, 'utf8');
    const codeMatch = gradleText.match(/versionCode\s*=\s*(\d+)/);
    const nameMatch = gradleText.match(/versionName\s*=\s*"([^"]+)"/);
    printResult(
      'PASS',
      'Android Module Config',
      `v${nameMatch?.[1] || '?'} (build ${codeMatch?.[1] || '?'}) | googleServices=${fs.existsSync(googleServicesPath)} | keystoreProps=${fs.existsSync(keystorePropsPath)}`
    );
  }

  // Always run /claude-red mobile AppSec audit
  const sec = runMobileSecurityAudit();
  totalFailures += sec.failures;
  totalWarnings += sec.warnings;

  if (mode === 'standard' || mode === 'ci' || mode === 'full') {
    const gradle = runGradleChecks({
      withLint: mode === 'ci' || mode === 'full',
      withReleaseApk,
    });
    totalFailures += gradle.failures;
    totalWarnings += gradle.warnings;
  }

  if (mode === 'full') {
    const web = runWebContractChecks();
    totalFailures += web.failures;
    totalWarnings += web.warnings;
  }

  if (targetUrl) {
    const live = await runLiveConnectivityChecks(targetUrl);
    totalFailures += live.failures;
    totalWarnings += live.warnings;
  }

  console.log(`\n${c.bold}Summary:${c.reset} ${totalFailures === 0 ? `${c.green}ALL CHECKS PASSED${c.reset}` : `${c.red}${totalFailures} FAILURE(S)${c.reset}`} | ${totalWarnings} warning(s)\n`);
  return totalFailures === 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  let mode = 'standard';
  if (args.includes('--security')) mode = 'security';
  else if (args.includes('--quick')) mode = 'quick';
  else if (args.includes('--ci')) mode = 'ci';
  else if (args.includes('--full')) mode = 'full';

  const urlArg = args.find((a) => a.startsWith('--url='))?.split('=')[1] || null;
  const withReleaseApk = args.includes('--release-apk');

  runAppCheckSuite({ mode, targetUrl: urlArg, withReleaseApk })
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error(`${c.red}app-check error:${c.reset}`, err);
      process.exit(1);
    });
}
