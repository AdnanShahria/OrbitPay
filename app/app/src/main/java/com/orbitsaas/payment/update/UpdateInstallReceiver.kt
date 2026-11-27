package com.orbitsaas.payment.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log
import androidx.core.content.IntentCompat

/**
 * Receives Android PackageInstaller session commit callbacks and launches the
 * system confirmation intent when user approval is required.
 */
class UpdateInstallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE
        )
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)

        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmIntent = IntentCompat.getParcelableExtra(
                    intent,
                    Intent.EXTRA_INTENT,
                    Intent::class.java
                )
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching {
                        context.startActivity(confirmIntent)
                    }.onFailure { err ->
                        Log.e(TAG, "Failed to launch install confirmation: ${err.message}", err)
                        AppUpdateManager.onInstallStatusCallback(
                            PackageInstaller.STATUS_FAILURE,
                            err.message
                        )
                        return
                    }
                }
                AppUpdateManager.onInstallStatusCallback(status, message)
            }

            else -> {
                Log.i(TAG, "PackageInstaller status=$status message=$message")
                AppUpdateManager.onInstallStatusCallback(status, message)
            }
        }
    }

    companion object {
        private const val TAG = "UpdateInstallReceiver"
    }
}
