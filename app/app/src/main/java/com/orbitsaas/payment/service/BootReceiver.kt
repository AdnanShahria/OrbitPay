package com.orbitsaas.payment.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.orbitsaas.payment.data.local.PreferencesManager

/**
 * Automatically starts the Sticky Foreground Service when the phone boots or reboots.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.i(TAG, "Boot event detected: $action. Checking service preferences...")
            val prefs = PreferencesManager(context)
            if (prefs.isForegroundServiceEnabled && prefs.isConfigured()) {
                Log.i(TAG, "Starting StickyForegroundService after boot...")
                StickyForegroundService.startService(context)
                SyncWorker.enqueueImmediateSync(context)
            }
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
