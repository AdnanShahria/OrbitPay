package com.orbitsaas.payment.ui

import android.content.Context
import android.content.Intent
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
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.VerifiedUser
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import com.orbitsaas.payment.R
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors

private const val TOTAL_ONBOARDING_STEPS = 5

@Composable
fun OnboardingScreen(
    onComplete: () -> Unit
) {
    val context = LocalContext.current
    var currentStep by remember { mutableIntStateOf(1) }

    // Multi-permission launcher for SMS & Notifications
    val permissionsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        if (currentStep == 1) currentStep = 2
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
            // Header: Step Progress Bars
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
                        color = MaterialTheme.colorScheme.onBackground
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

            Spacer(modifier = Modifier.height(24.dp))

            // Step Content
            AnimatedContent(targetState = currentStep, label = "OnboardingStep") { step ->
                when (step) {
                    1 -> StepSmsPermissions(
                        onRequestPermissions = {
                            val perms = mutableListOf(
                                android.Manifest.permission.RECEIVE_SMS,
                                android.Manifest.permission.READ_SMS
                            )
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                perms.add(android.Manifest.permission.POST_NOTIFICATIONS)
                            }
                            permissionsLauncher.launch(perms.toTypedArray())
                        }
                    )
                    2 -> StepNotificationAccess(
                        onOpenSettings = {
                            context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        }
                    )
                    3 -> StepBatteryExemption(
                        onOpenBattery = {
                            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                                !powerManager.isIgnoringBatteryOptimizations(context.packageName)
                            ) {
                                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                    data = Uri.parse("package:${context.packageName}")
                                }
                                context.startActivity(intent)
                            }
                        }
                    )
                    4 -> StepRestrictedSettings(
                        onOpenAppInfo = {
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            context.startActivity(intent)
                        }
                    )
                    5 -> StepSpoofProtectionAndReadSms()
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Footer Navigation Buttons
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
fun StepSmsPermissions(onRequestPermissions: () -> Unit) {
    StepCard(
        icon = Icons.Default.Message,
        title = stringResource(R.string.onboarding_step1_title),
        subtitle = stringResource(R.string.onboarding_step1_subtitle),
        description = stringResource(R.string.onboarding_step1_desc)
    ) {
        Button(
            onClick = onRequestPermissions,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text(
                text = stringResource(R.string.onboarding_step1_action),
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@Composable
fun StepNotificationAccess(onOpenSettings: () -> Unit) {
    StepCard(
        icon = Icons.Default.Notifications,
        title = stringResource(R.string.onboarding_step2_title),
        subtitle = stringResource(R.string.onboarding_step2_subtitle),
        description = stringResource(R.string.onboarding_step2_desc)
    ) {
        Button(
            onClick = onOpenSettings,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text(
                text = stringResource(R.string.onboarding_step2_action),
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@Composable
fun StepBatteryExemption(onOpenBattery: () -> Unit) {
    StepCard(
        icon = Icons.Default.BatteryAlert,
        title = stringResource(R.string.onboarding_step3_title),
        subtitle = stringResource(R.string.onboarding_step3_subtitle),
        description = stringResource(R.string.onboarding_step3_desc)
    ) {
        Button(
            onClick = onOpenBattery,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text(
                text = stringResource(R.string.onboarding_step3_action),
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@Composable
fun StepRestrictedSettings(onOpenAppInfo: () -> Unit) {
    StepCard(
        icon = Icons.Default.Security,
        title = stringResource(R.string.onboarding_step4_title),
        subtitle = stringResource(R.string.onboarding_step4_subtitle),
        description = stringResource(R.string.onboarding_step4_desc)
    ) {
        Button(
            onClick = onOpenAppInfo,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text(
                text = stringResource(R.string.onboarding_step4_action),
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@Composable
fun StepSpoofProtectionAndReadSms() {
    val greenFg = OrbitSemanticColors.statusGreen
    StepCard(
        icon = Icons.Default.VerifiedUser,
        title = stringResource(R.string.onboarding_step5_title),
        subtitle = stringResource(R.string.onboarding_step5_subtitle),
        description = stringResource(R.string.onboarding_step5_desc)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = null,
                        tint = greenFg,
                        modifier = Modifier
                            .padding(top = 2.dp)
                            .size(20.dp)
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = stringResource(R.string.onboarding_step5_spoof_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(R.string.onboarding_step5_spoof_desc),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            lineHeight = 20.sp
                        )
                    }
                }
            }

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        imageVector = Icons.Default.Message,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .padding(top = 2.dp)
                            .size(20.dp)
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = stringResource(R.string.onboarding_step5_readsms_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(R.string.onboarding_step5_readsms_desc),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            lineHeight = 20.sp
                        )
                    }
                }
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
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = stringResource(R.string.cd_onboarding_step_icon),
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp)
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
