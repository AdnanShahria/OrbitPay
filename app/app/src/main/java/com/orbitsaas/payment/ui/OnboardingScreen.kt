package com.orbitsaas.payment.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryChargingFull
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.orbitsaas.payment.R
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.widget.PendingPaymentsWidgetProvider

private const val TOTAL_ONBOARDING_STEPS = 4

@Composable
fun OnboardingScreen(
    onComplete: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var currentStep by remember { mutableIntStateOf(1) }
    var refreshTick by remember { mutableIntStateOf(0) }
    var widgetPinRequested by remember { mutableStateOf(false) }

    val permissionsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        refreshTick++
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refreshTick++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val smsGranted = remember(refreshTick) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    }
    val phoneGranted = remember(refreshTick) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
    }
    val notifGranted = remember(refreshTick) {
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }
    val listenerGranted = remember(refreshTick) {
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }
    val batteryExempt = remember(refreshTick) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        pm?.isIgnoringBatteryOptimizations(context.packageName) == true
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.onboarding_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = stringResource(
                            R.string.onboarding_step_counter,
                            currentStep,
                            TOTAL_ONBOARDING_STEPS
                        ),
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    for (i in 1..TOTAL_ONBOARDING_STEPS) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(
                                    if (i <= currentStep) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.surfaceVariant
                                    }
                                )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            AnimatedContent(targetState = currentStep, label = "OnboardingStep") { step ->
                when (step) {
                    1 -> StepHowOrbitWorks()
                    2 -> StepInstallHurdlesGuide(
                        onOpenAppInfo = {
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            runCatching { context.startActivity(intent) }
                        },
                        onOpenBattery = {
                            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            runCatching { context.startActivity(intent) }
                                .onFailure {
                                    runCatching {
                                        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                                    }
                                }
                        }
                    )
                    3 -> StepPermissionsWhyWeNeed(
                        smsGranted = smsGranted,
                        phoneGranted = phoneGranted,
                        notifGranted = notifGranted,
                        listenerGranted = listenerGranted,
                        batteryExempt = batteryExempt,
                        onGrantRuntimePermissions = {
                            val perms = mutableListOf(
                                Manifest.permission.RECEIVE_SMS,
                                Manifest.permission.READ_SMS,
                                Manifest.permission.READ_PHONE_STATE
                            )
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                perms.add(Manifest.permission.READ_PHONE_NUMBERS)
                            }
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                perms.add(Manifest.permission.POST_NOTIFICATIONS)
                            }
                            permissionsLauncher.launch(perms.toTypedArray())
                        },
                        onOpenListenerSettings = {
                            runCatching {
                                context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                            }
                        },
                        onOpenBatterySettings = {
                            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            runCatching { context.startActivity(intent) }
                        }
                    )
                    else -> StepSafetyAndWidgetReady(
                        canPinWidget = PendingPaymentsWidgetProvider.canRequestPin(context),
                        widgetPinRequested = widgetPinRequested,
                        onPinWidget = {
                            if (PendingPaymentsWidgetProvider.requestPinWidget(context)) {
                                widgetPinRequested = true
                            }
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (currentStep > 1) {
                    OutlinedButton(
                        onClick = { currentStep-- },
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.onSurface
                        )
                    ) {
                        Text(
                            text = stringResource(R.string.action_back),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }

                Button(
                    onClick = {
                        if (currentStep < TOTAL_ONBOARDING_STEPS) {
                            currentStep++
                        } else {
                            onComplete()
                        }
                    },
                    modifier = Modifier
                        .weight(1.5f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    )
                ) {
                    Text(
                        text = stringResource(
                            if (currentStep == TOTAL_ONBOARDING_STEPS) {
                                R.string.onboarding_finish_launch
                            } else {
                                R.string.onboarding_next_step
                            }
                        ),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Icon(
                        imageVector = if (currentStep == TOTAL_ONBOARDING_STEPS) {
                            Icons.Default.Check
                        } else {
                            Icons.Default.ChevronRight
                        },
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun StepHowOrbitWorks() {
    StepCard(
        icon = Icons.Default.Storefront,
        title = stringResource(R.string.onboarding_how_title),
        subtitle = stringResource(R.string.onboarding_how_subtitle),
        description = stringResource(R.string.onboarding_how_desc)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            InfoBulletCard(
                number = "1",
                title = stringResource(R.string.onboarding_how_point1_title),
                body = stringResource(R.string.onboarding_how_point1_desc)
            )
            InfoBulletCard(
                number = "2",
                title = stringResource(R.string.onboarding_how_point2_title),
                body = stringResource(R.string.onboarding_how_point2_desc)
            )
            InfoBulletCard(
                number = "3",
                title = stringResource(R.string.onboarding_how_point3_title),
                body = stringResource(R.string.onboarding_how_point3_desc)
            )
        }
    }
}

@Composable
private fun StepInstallHurdlesGuide(
    onOpenAppInfo: () -> Unit,
    onOpenBattery: () -> Unit
) {
    StepCard(
        icon = Icons.Default.Security,
        title = stringResource(R.string.onboarding_hurdles_title),
        subtitle = stringResource(R.string.onboarding_hurdles_subtitle),
        description = stringResource(R.string.onboarding_hurdles_desc)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            InfoBulletCard(
                number = "1",
                title = stringResource(R.string.onboarding_hurdle_play_title),
                body = stringResource(R.string.onboarding_hurdle_play_desc)
            )
            InfoBulletCard(
                number = "2",
                title = stringResource(R.string.onboarding_hurdle_restricted_title),
                body = stringResource(R.string.onboarding_hurdle_restricted_desc)
            )
            InfoBulletCard(
                number = "3",
                title = stringResource(R.string.onboarding_hurdle_battery_title),
                body = stringResource(R.string.onboarding_hurdle_battery_desc)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onOpenAppInfo,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Text(
                        text = stringResource(R.string.onboarding_btn_app_info),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
                Button(
                    onClick = onOpenBattery,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.onboarding_btn_battery),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    }
}

@Composable
private fun StepPermissionsWhyWeNeed(
    smsGranted: Boolean,
    phoneGranted: Boolean,
    notifGranted: Boolean,
    listenerGranted: Boolean,
    batteryExempt: Boolean,
    onGrantRuntimePermissions: () -> Unit,
    onOpenListenerSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    StepCard(
        icon = Icons.Default.VerifiedUser,
        title = stringResource(R.string.onboarding_perms_title),
        subtitle = stringResource(R.string.onboarding_perms_subtitle),
        description = stringResource(R.string.onboarding_perms_desc)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PermissionReasonRow(
                icon = Icons.Default.Message,
                title = stringResource(R.string.onboarding_perm_sms_title),
                reason = stringResource(R.string.onboarding_perm_sms_reason),
                granted = smsGranted
            )
            PermissionReasonRow(
                icon = Icons.Default.NotificationsActive,
                title = stringResource(R.string.onboarding_perm_listener_title),
                reason = stringResource(R.string.onboarding_perm_listener_reason),
                granted = listenerGranted
            )
            PermissionReasonRow(
                icon = Icons.Default.PhoneAndroid,
                title = stringResource(R.string.onboarding_perm_sim_title),
                reason = stringResource(R.string.onboarding_perm_sim_reason),
                granted = phoneGranted && notifGranted
            )
            PermissionReasonRow(
                icon = Icons.Default.BatteryChargingFull,
                title = stringResource(R.string.onboarding_perm_battery_title),
                reason = stringResource(R.string.onboarding_perm_battery_reason),
                granted = batteryExempt
            )

            Spacer(modifier = Modifier.height(2.dp))

            Button(
                onClick = onGrantRuntimePermissions,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(stringResource(R.string.onboarding_step1_action))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onOpenListenerSettings,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Text(stringResource(R.string.onboarding_btn_notif_access))
                }
                OutlinedButton(
                    onClick = onOpenBatterySettings,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Text(stringResource(R.string.onboarding_btn_battery))
                }
            }
        }
    }
}

@Composable
private fun StepSafetyAndWidgetReady(
    canPinWidget: Boolean,
    widgetPinRequested: Boolean,
    onPinWidget: () -> Unit
) {
    val greenFg = OrbitSemanticColors.statusGreen
    StepCard(
        icon = Icons.Default.CheckCircle,
        title = stringResource(R.string.onboarding_step5_title),
        subtitle = stringResource(R.string.onboarding_step5_subtitle),
        description = stringResource(R.string.onboarding_step5_desc)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            InfoBulletCard(
                number = "✓",
                title = stringResource(R.string.onboarding_step5_spoof_title),
                body = stringResource(R.string.onboarding_step5_spoof_desc)
            )
            InfoBulletCard(
                number = "✓",
                title = stringResource(R.string.onboarding_step5_readsms_title),
                body = stringResource(R.string.onboarding_step5_readsms_desc)
            )

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Widgets,
                            contentDescription = null,
                            tint = greenFg,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = stringResource(R.string.onboarding_widget_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Text(
                        text = stringResource(R.string.onboarding_widget_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (canPinWidget) {
                        OutlinedButton(
                            onClick = onPinWidget,
                            enabled = !widgetPinRequested,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Text(
                                text = if (widgetPinRequested) {
                                    stringResource(R.string.widget_pin_added)
                                } else {
                                    stringResource(R.string.widget_pin_button)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoBulletCard(
    number: String,
    title: String,
    body: String
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = number,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
private fun PermissionReasonRow(
    icon: ImageVector,
    title: String,
    reason: String,
    granted: Boolean
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(20.dp)
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f)
                    )
                    StatusPill(
                        label = if (granted) {
                            stringResource(R.string.onboarding_perm_allowed)
                        } else {
                            stringResource(R.string.onboarding_perm_needed)
                        },
                        foreground = if (granted) OrbitSemanticColors.statusGreen else OrbitSemanticColors.statusAmber,
                        background = if (granted) StatusGreenBg else StatusAmberBg
                    )
                }
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
fun StepCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    description: String,
    action: @Composable () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = stringResource(R.string.cd_onboarding_step_icon),
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp)
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 20.sp
            )

            action()
        }
    }
}
