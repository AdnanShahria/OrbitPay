package com.orbitsaas.payment.service

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.orbitsaas.payment.data.local.PreferencesManager
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Safely manages optional Firebase Cloud Messaging initialization and token registration.
 * Falls back cleanly when google-services.json is not bundled in the APK.
 */
object FcmTokenRegistrar {

    private const val TAG = "FcmTokenRegistrar"

    fun isFirebaseAvailable(ctx: Context): Boolean = runCatching {
        FirebaseApp.getApps(ctx).isNotEmpty()
    }.getOrDefault(false)

    suspend fun refreshToken(ctx: Context): String? {
        return try {
            if (!isFirebaseAvailable(ctx)) {
                Log.d(TAG, "FirebaseApp unavailable; polling fallback will be used.")
                return null
            }

            val token = suspendCancellableCoroutine<String?> { cont ->
                try {
                    FirebaseMessaging.getInstance().token
                        .addOnSuccessListener { result ->
                            if (cont.isActive) cont.resume(result?.takeIf { it.isNotBlank() })
                        }
                        .addOnFailureListener { err ->
                            Log.w(TAG, "Failed to obtain FCM token: ${err.message}")
                            if (cont.isActive) cont.resume(null)
                        }
                        .addOnCanceledListener {
                            if (cont.isActive) cont.resume(null)
                        }
                } catch (e: Exception) {
                    Log.w(TAG, "FirebaseMessaging.getInstance() threw: ${e.message}")
                    if (cont.isActive) cont.resume(null)
                }
            }

            if (!token.isNullOrBlank()) {
                PreferencesManager(ctx).fcmToken = token
                Log.i(TAG, "FCM token refreshed and cached.")
            }
            token
        } catch (t: Throwable) {
            Log.w(TAG, "Unable to refresh FCM token: ${t.message}")
            null
        }
    }
}
