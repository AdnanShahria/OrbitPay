package com.orbitsaas.payment.service

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.orbitsaas.payment.data.local.PreferencesManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Handles Firebase Cloud Messaging data-only and notification payloads sent from ORBIT Central Hub.
 * Delegates universal server-driven push routing, channel selection, and notification actions to
 * [DynamicPushDispatcher].
 */
class FcmService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Token received.")
        val prefs = PreferencesManager(applicationContext)
        prefs.fcmToken = token

        // Enqueue sync to report new token to backend
        SyncWorker.enqueueImmediateSync(applicationContext)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "FCM Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val eventType = data["event"] ?: data["eventType"] ?: data["type"]
        val notifTitle = remoteMessage.notification?.title ?: data["title"]?.takeIf { it.isNotBlank() }
        val notifBody = remoteMessage.notification?.body ?: data["body"]?.takeIf { it.isNotBlank() }

        serviceScope.launch {
            DynamicPushDispatcher.handlePush(
                context = applicationContext,
                id = remoteMessage.messageId.orEmpty(),
                event = eventType,
                title = notifTitle,
                body = notifBody,
                data = data
            )
        }
    }

    companion object {
        private const val TAG = "FcmService"
    }
}
