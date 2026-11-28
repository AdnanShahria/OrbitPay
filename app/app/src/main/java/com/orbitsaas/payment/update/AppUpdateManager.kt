package com.orbitsaas.payment.update

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import com.orbitsaas.payment.BuildConfig
import com.orbitsaas.payment.OrbitApplication
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.data.remote.AppReleaseDto
import com.orbitsaas.payment.data.remote.OrbitApiClient
import com.orbitsaas.payment.ui.MainActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

enum class UpdateStatus {
    IDLE,
    CHECKING,
    AVAILABLE,
    DOWNLOADING,
    VERIFYING,
    READY_TO_INSTALL,
    INSTALLING,
    UP_TO_DATE,
    ERROR
}

data class AppUpdateState(
    val status: UpdateStatus = UpdateStatus.IDLE,
    val release: AppReleaseDto? = null,
    val forceUpdate: Boolean = false,
    val downloadProgress: Float = 0f,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
    val errorMessage: String? = null,
    val lastCheckedAt: Long = 0L,
    val dismissedVersionCode: Int? = null
) {
    val shouldShowDialog: Boolean
        get() {
            val activeRelease = release ?: return false
            val activeStatus = status in setOf(
                UpdateStatus.AVAILABLE,
                UpdateStatus.DOWNLOADING,
                UpdateStatus.VERIFYING,
                UpdateStatus.READY_TO_INSTALL,
                UpdateStatus.INSTALLING,
                UpdateStatus.ERROR
            )
            if (!activeStatus) return false
            return forceUpdate || dismissedVersionCode != activeRelease.versionCode
        }
}

/**
 * Self-hosted Android APK update manager backed by ORBIT Central Hub (Cloudflare R2 + D1).
 * Handles manifest checking, throttled background checks, streaming download, SHA-256 verification,
 * PackageInstaller session commits (with FileProvider fallback), and update-ready notifications.
 */
object AppUpdateManager {

    private const val TAG = "AppUpdateManager"
    private const val UPDATES_DIR_NAME = "updates"
    private const val MIN_AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000L
    private const val UPDATE_NOTIFICATION_ID = 77401

    private val checkMutex = Mutex()
    private val downloadMutex = Mutex()

    private val downloadClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private val _state = MutableStateFlow(AppUpdateState())
    val state: StateFlow<AppUpdateState> = _state.asStateFlow()

    suspend fun checkForUpdates(
        context: Context,
        userInitiated: Boolean = false,
        autoDownload: Boolean = true,
        forceCheck: Boolean = false
    ) {
        val appContext = context.applicationContext
        val prefs = PreferencesManager(appContext)
        val now = System.currentTimeMillis()
        val current = _state.value

        if (!userInitiated && !forceCheck) {
            val effectiveLastChecked = maxOf(current.lastCheckedAt, prefs.lastUpdateCheckAt)
            if (now - effectiveLastChecked < MIN_AUTO_CHECK_INTERVAL_MS) {
                return
            }
            if (current.status in setOf(
                    UpdateStatus.CHECKING,
                    UpdateStatus.DOWNLOADING,
                    UpdateStatus.VERIFYING,
                    UpdateStatus.INSTALLING
                )
            ) {
                return
            }
        }

        checkMutex.withLock {
            val latestState = _state.value
            val effectiveLastChecked = maxOf(latestState.lastCheckedAt, prefs.lastUpdateCheckAt)
            if (!userInitiated && !forceCheck &&
                System.currentTimeMillis() - effectiveLastChecked < MIN_AUTO_CHECK_INTERVAL_MS
            ) {
                return@withLock
            }

            _state.value = latestState.copy(
                status = UpdateStatus.CHECKING,
                errorMessage = null
            )

            val apiClient = OrbitApiClient(prefs)
            val result = withContext(Dispatchers.IO) {
                apiClient.fetchLatestRelease(BuildConfig.VERSION_CODE)
            }

            result.onSuccess { data ->
                val checkedAt = System.currentTimeMillis()
                prefs.lastUpdateCheckAt = checkedAt
                val release = data.release

                if (!data.hasRelease || !data.updateAvailable || release == null) {
                    _state.value = _state.value.copy(
                        status = if (userInitiated) UpdateStatus.UP_TO_DATE else UpdateStatus.IDLE,
                        release = null,
                        forceUpdate = false,
                        downloadProgress = 0f,
                        downloadedBytes = 0L,
                        totalBytes = 0L,
                        errorMessage = null,
                        lastCheckedAt = checkedAt
                    )
                    return@onSuccess
                }

                val existingApk = resolveApkFile(appContext, release.versionCode)
                val cachedValid = withContext(Dispatchers.IO) {
                    existingApk.exists() &&
                        release.sha256.isNotBlank() &&
                        computeSha256Hex(existingApk).equals(release.sha256, ignoreCase = true)
                }

                if (cachedValid) {
                    _state.value = _state.value.copy(
                        status = UpdateStatus.READY_TO_INSTALL,
                        release = release,
                        forceUpdate = data.forceUpdate,
                        downloadProgress = 1f,
                        downloadedBytes = existingApk.length(),
                        totalBytes = existingApk.length(),
                        errorMessage = null,
                        lastCheckedAt = checkedAt,
                        dismissedVersionCode = if (forceCheck) null else _state.value.dismissedVersionCode
                    )
                    if (!userInitiated) {
                        postUpdateReadyNotification(appContext, release, data.forceUpdate)
                    }
                    return@onSuccess
                }

                _state.value = _state.value.copy(
                    status = UpdateStatus.AVAILABLE,
                    release = release,
                    forceUpdate = data.forceUpdate,
                    downloadProgress = 0f,
                    downloadedBytes = 0L,
                    totalBytes = release.sizeBytes,
                    errorMessage = null,
                    lastCheckedAt = checkedAt,
                    dismissedVersionCode = if (forceCheck) null else _state.value.dismissedVersionCode
                )

                if (autoDownload) {
                    downloadAndVerify(
                        context = appContext,
                        release = release,
                        forceUpdate = data.forceUpdate,
                        postNotificationOnReady = !userInitiated
                    )
                }
            }.onFailure { err ->
                Log.w(TAG, "Update check failed: ${err.message}")
                _state.value = _state.value.copy(
                    status = if (userInitiated) UpdateStatus.ERROR else UpdateStatus.IDLE,
                    errorMessage = if (userInitiated) (err.message ?: "Failed to check updates") else null,
                    lastCheckedAt = System.currentTimeMillis()
                )
            }
        }
    }

    suspend fun downloadAndVerify(
        context: Context,
        release: AppReleaseDto? = _state.value.release,
        forceUpdate: Boolean = _state.value.forceUpdate,
        postNotificationOnReady: Boolean = false
    ) {
        val target = release ?: return
        if (target.downloadUrl.isBlank()) {
            _state.value = _state.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = "Missing APK download URL."
            )
            return
        }
        val normalizedUrl = target.downloadUrl.trim()
        val isHttps = normalizedUrl.startsWith("https://", ignoreCase = true)
        val isDevLocal = BuildConfig.DEBUG && (
            normalizedUrl.startsWith("http://10.0.2.2", ignoreCase = true) ||
                normalizedUrl.startsWith("http://localhost", ignoreCase = true) ||
                normalizedUrl.startsWith("http://127.0.0.1", ignoreCase = true)
            )
        if (!isHttps && !isDevLocal) {
            _state.value = _state.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = "Blocked insecure non-HTTPS APK update URL."
            )
            return
        }
        if (target.sha256.isBlank()) {
            _state.value = _state.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = "Missing SHA-256 checksum for OTA update verification."
            )
            return
        }

        val appContext = context.applicationContext
        downloadMutex.withLock {
            val updatesDir = File(appContext.cacheDir, UPDATES_DIR_NAME).apply { mkdirs() }
            val finalApk = resolveApkFile(appContext, target.versionCode)
            val tempApk = File(updatesDir, "${finalApk.name}.tmp")

            val alreadyValid = withContext(Dispatchers.IO) {
                finalApk.exists() &&
                    target.sha256.isNotBlank() &&
                    computeSha256Hex(finalApk).equals(target.sha256, ignoreCase = true)
            }
            if (alreadyValid) {
                _state.value = _state.value.copy(
                    status = UpdateStatus.READY_TO_INSTALL,
                    release = target,
                    forceUpdate = forceUpdate,
                    downloadProgress = 1f,
                    downloadedBytes = finalApk.length(),
                    totalBytes = finalApk.length(),
                    errorMessage = null
                )
                return@withLock
            }

            _state.value = _state.value.copy(
                status = UpdateStatus.DOWNLOADING,
                release = target,
                forceUpdate = forceUpdate,
                downloadProgress = 0f,
                downloadedBytes = 0L,
                totalBytes = target.sizeBytes,
                errorMessage = null
            )

            try {
                withContext(Dispatchers.IO) {
                    val request = Request.Builder()
                        .url(target.downloadUrl)
                        .header("User-Agent", "OrbitPay-Android/${BuildConfig.VERSION_NAME}")
                        .get()
                        .build()

                    downloadClient.newCall(request).execute().use { response ->
                        if (!response.isSuccessful) {
                            throw Exception("Download failed (HTTP ${response.code})")
                        }

                        val body = response.body ?: throw Exception("Empty APK response body")
                        val contentLength = body.contentLength().takeIf { it > 0L } ?: target.sizeBytes
                        val digest = MessageDigest.getInstance("SHA-256")
                        val buffer = ByteArray(16 * 1024)
                        var totalRead = 0L
                        var lastUiEmitAt = 0L

                        body.byteStream().use { input ->
                            FileOutputStream(tempApk).use { output ->
                                while (true) {
                                    val read = input.read(buffer)
                                    if (read == -1) break
                                    output.write(buffer, 0, read)
                                    digest.update(buffer, 0, read)
                                    totalRead += read

                                    val now = System.currentTimeMillis()
                                    if (now - lastUiEmitAt >= 120L || totalRead == contentLength) {
                                        lastUiEmitAt = now
                                        val progress = if (contentLength > 0L) {
                                            (totalRead.toFloat() / contentLength.toFloat()).coerceIn(0f, 1f)
                                        } else {
                                            0f
                                        }
                                        _state.value = _state.value.copy(
                                            status = UpdateStatus.DOWNLOADING,
                                            downloadProgress = progress,
                                            downloadedBytes = totalRead,
                                            totalBytes = contentLength
                                        )
                                    }
                                }
                                output.flush()
                            }
                        }

                        _state.value = _state.value.copy(
                            status = UpdateStatus.VERIFYING,
                            downloadProgress = 1f,
                            downloadedBytes = totalRead,
                            totalBytes = contentLength
                        )

                        val computedSha = digest.digest().joinToString("") { "%02x".format(it) }
                        if (target.sha256.isBlank() ||
                            !computedSha.equals(target.sha256.trim(), ignoreCase = true)
                        ) {
                            tempApk.delete()
                            throw Exception("APK SHA-256 checksum mismatch")
                        }

                        updatesDir.listFiles()?.forEach { child ->
                            if (child.name != tempApk.name && child.name.endsWith(".apk")) {
                                child.delete()
                            }
                        }
                        if (finalApk.exists()) {
                            finalApk.delete()
                        }
                        if (!tempApk.renameTo(finalApk)) {
                            tempApk.copyTo(finalApk, overwrite = true)
                            tempApk.delete()
                        }
                    }
                }

                _state.value = _state.value.copy(
                    status = UpdateStatus.READY_TO_INSTALL,
                    release = target,
                    forceUpdate = forceUpdate,
                    downloadProgress = 1f,
                    downloadedBytes = finalApk.length(),
                    totalBytes = finalApk.length(),
                    errorMessage = null
                )

                if (postNotificationOnReady) {
                    postUpdateReadyNotification(appContext, target, forceUpdate)
                }
            } catch (e: Exception) {
                tempApk.delete()
                Log.e(TAG, "APK download/verification failed: ${e.message}", e)
                _state.value = _state.value.copy(
                    status = UpdateStatus.ERROR,
                    errorMessage = e.message ?: "Failed to download update"
                )
            }
        }
    }

    fun canInstallPackages(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    suspend fun installDownloadedUpdate(context: Context): Boolean {
        val appContext = context.applicationContext
        val release = _state.value.release ?: return false

        if (!canInstallPackages(appContext)) {
            openInstallPermissionSettings(appContext)
            return false
        }

        val apkFile = resolveApkFile(appContext, release.versionCode)
        if (!apkFile.exists()) {
            _state.value = _state.value.copy(
                status = UpdateStatus.AVAILABLE,
                errorMessage = "Cached APK missing. Please download again."
            )
            return false
        }

        _state.value = _state.value.copy(
            status = UpdateStatus.INSTALLING,
            errorMessage = null
        )

        return try {
            withContext(Dispatchers.IO) {
                val packageInstaller = appContext.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL
                ).apply {
                    setAppPackageName(appContext.packageName)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                    }
                }

                val sessionId = packageInstaller.createSession(params)
                packageInstaller.openSession(sessionId).use { session ->
                    session.openWrite("orbit-pay-update.apk", 0, apkFile.length()).use { out ->
                        FileInputStream(apkFile).use { input ->
                            input.copyTo(out)
                        }
                        session.fsync(out)
                    }

                    val callbackIntent = Intent(appContext, UpdateInstallReceiver::class.java)
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            PendingIntent.FLAG_MUTABLE
                        } else {
                            0
                        }
                    val statusIntent = PendingIntent.getBroadcast(
                        appContext,
                        sessionId,
                        callbackIntent,
                        flags
                    )
                    session.commit(statusIntent.intentSender)
                }
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "PackageInstaller commit failed, falling back to ACTION_VIEW: ${e.message}")
            launchFileProviderInstallerFallback(appContext, apkFile)
        }
    }

    private fun launchFileProviderInstallerFallback(context: Context, apkFile: File): Boolean {
        return try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            _state.value = _state.value.copy(status = UpdateStatus.READY_TO_INSTALL)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Fallback APK installer launch failed: ${e.message}", e)
            _state.value = _state.value.copy(
                status = UpdateStatus.ERROR,
                errorMessage = e.message ?: "Unable to launch Android installer"
            )
            false
        }
    }

    fun onInstallStatusCallback(status: Int, message: String?) {
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                _state.value = _state.value.copy(
                    status = UpdateStatus.INSTALLING,
                    errorMessage = null
                )
            }

            PackageInstaller.STATUS_SUCCESS -> {
                _state.value = _state.value.copy(
                    status = UpdateStatus.IDLE,
                    errorMessage = null
                )
            }

            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                _state.value = _state.value.copy(
                    status = UpdateStatus.READY_TO_INSTALL,
                    errorMessage = null
                )
            }

            else -> {
                _state.value = _state.value.copy(
                    status = UpdateStatus.ERROR,
                    errorMessage = message?.takeIf { it.isNotBlank() }
                        ?: "Package installation failed (code=$status)"
                )
            }
        }
    }

    fun dismissSoftUpdate() {
        val current = _state.value
        if (current.forceUpdate) return
        val versionCode = current.release?.versionCode ?: return
        _state.value = current.copy(dismissedVersionCode = versionCode)
    }

    fun cleanupUpdateCache(context: Context) {
        runCatching {
            val updatesDir = File(context.applicationContext.cacheDir, UPDATES_DIR_NAME)
            if (updatesDir.exists()) {
                updatesDir.listFiles()?.forEach { it.delete() }
            }
        }
    }

    private fun resolveApkFile(context: Context, versionCode: Int): File {
        val updatesDir = File(context.cacheDir, UPDATES_DIR_NAME).apply { mkdirs() }
        return File(updatesDir, "orbit-pay-$versionCode.apk")
    }

    private fun computeSha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(16 * 1024)
        FileInputStream(file).use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun postUpdateReadyNotification(
        context: Context,
        release: AppReleaseDto,
        forceUpdate: Boolean
    ) {
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            UPDATE_NOTIFICATION_ID,
            openAppIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val title = context.getString(R.string.update_notif_ready_title, release.versionName)
        val body = if (forceUpdate) {
            context.getString(R.string.update_notif_required_body, release.versionName)
        } else {
            context.getString(R.string.update_notif_ready_body, release.versionName)
        }

        val notification = NotificationCompat.Builder(context, OrbitApplication.ORBIT_ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(UPDATE_NOTIFICATION_ID, notification)
        } catch (se: SecurityException) {
            Log.w(TAG, "Unable to post update notification: ${se.message}")
        }
    }
}
