package com.orbitsaas.payment.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.update.AppUpdateManager

/**
 * Automatically cleans up cached APK installers and restarts StickyForegroundService
 * immediately after ORBIT Pay finishes self-updating (ACTION_MY_PACKAGE_REPLACED).
 */
class PackageReplacedReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        Log.i(TAG, "App updated (MY_PACKAGE_REPLACED). Cleaning update cache and resuming sync...")
        AppUpdateManager.cleanupUpdateCache(context)

        val prefs = PreferencesManager(context)
        if (prefs.isForegroundServiceEnabled && prefs.isConfigured()) {
            runCatching {
                StickyForegroundService.startService(context)
            }.onFailure { err ->
                Log.w(TAG, "Unable to restart StickyForegroundService after update: ${err.message}")
            }
            SyncWorker.enqueueImmediateSync(context)
        }
    }

    companion object {
        private const val TAG = "PackageReplacedReceiver"
    }
}
