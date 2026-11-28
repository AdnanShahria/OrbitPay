package com.orbitsaas.payment.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.BuildConfig
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.PreferencesManager
import com.orbitsaas.payment.ui.components.FloatingToastTone
import com.orbitsaas.payment.ui.components.OrbitFloatingToast
import com.orbitsaas.payment.ui.locale.LocaleHelper
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import com.orbitsaas.payment.update.AppUpdateManager
import com.orbitsaas.payment.update.UpdateStatus
import com.orbitsaas.payment.widget.PendingPaymentsWidgetProvider
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    state: DashboardUiState,
    onBackClick: () -> Unit,
    onToggleTheme: () -> Unit,
    onSaveSettings: (serverUrl: String, merchantId: String, deviceKey: String, enableForeground: Boolean) -> Unit,
    onTestConnection: (serverUrl: String, merchantId: String, deviceKey: String, (Boolean, String) -> Unit) -> Unit,
    onLogoutClick: () -> Unit = {},
    onOpenDiagnostics: () -> Unit = {},
    onOpenSetupGuide: () -> Unit = {}
) {
    val context = LocalContext.current
    val preferencesManager = remember(context) { PreferencesManager(context) }
    val coroutineScope = rememberCoroutineScope()
    val updateState by AppUpdateManager.state.collectAsState()

    val resolvedServerUrl = state.serverUrl.ifBlank { "https://payment.orbitsaas.cloud" }
    val resolvedMerchantId = state.merchantId
    val resolvedDeviceKey = state.deviceKey
    val maskedDeviceKey = when {
        resolvedDeviceKey.isBlank() -> "—"
        resolvedDeviceKey.length <= 4 -> "••••"
        else -> "••••${resolvedDeviceKey.takeLast(4)}"
    }
    var enableForeground by remember(state.isForegroundEnabled) { mutableStateOf(state.isForegroundEnabled) }
    var selectedLanguage by remember { mutableStateOf(LocaleHelper.currentLanguage(context)) }
    var extraTrustedSenders by remember { mutableStateOf(preferencesManager.extraTrustedSenders) }

    var isTestingConnection by remember { mutableStateOf(false) }
    var testResult by remember { mutableStateOf<Pair<Boolean, String>?>(null) }

    val greenFg = OrbitSemanticColors.statusGreen
    val redFg = OrbitSemanticColors.statusRed

    val cardShape = RoundedCornerShape(16.dp)
    val fieldShape = RoundedCornerShape(12.dp)
    val textFieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        focusedLabelColor = MaterialTheme.colorScheme.onSurface,
        unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        cursorColor = MaterialTheme.colorScheme.primary
    )
    val switchColors = SwitchDefaults.colors(
        checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
        checkedTrackColor = MaterialTheme.colorScheme.primary,
        uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
        uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
        uncheckedBorderColor = MaterialTheme.colorScheme.outline
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.settings_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {

            // Devices & Diagnostics Card
            if (state.isLoggedIn) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                    shape = cardShape
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Devices,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = stringResource(R.string.settings_devices_diagnostics_title),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }

                            if (state.totalDeviceCount > 0) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(if (state.onlineDeviceCount > 0) StatusGreen else MaterialTheme.colorScheme.outlineVariant)
                                    )
                                    Text(
                                        text = stringResource(
                                            R.string.settings_devices_online_ratio,
                                            state.onlineDeviceCount,
                                            state.totalDeviceCount
                                        ),
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontFeatureSettings = "tnum"
                                        ),
                                        color = if (state.onlineDeviceCount > 0) greenFg else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        if (state.connectedDevices.isEmpty()) {
                            Text(
                                text = stringResource(R.string.settings_devices_none),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                state.connectedDevices.forEach { device ->
                                    Surface(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .border(1.dp, MaterialTheme.colorScheme.outline, fieldShape),
                                        color = MaterialTheme.colorScheme.surfaceVariant,
                                        shape = fieldShape
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(
                                                    modifier = Modifier.weight(1f),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(8.dp)
                                                            .clip(CircleShape)
                                                            .background(
                                                                if (device.isOnline) StatusGreen else MaterialTheme.colorScheme.outlineVariant
                                                            )
                                                    )
                                                    Text(
                                                        text = device.deviceName.ifBlank { stringResource(R.string.settings_default_merchant_name) },
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        fontWeight = FontWeight.Medium,
                                                        color = MaterialTheme.colorScheme.onSurface,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }

                                                val metaParts = buildList {
                                                    device.batteryLevel?.let { add(stringResource(R.string.settings_device_battery, it)) }
                                                    device.networkType?.takeIf { it.isNotBlank() }?.let { add(it) }
                                                }
                                                if (metaParts.isNotEmpty()) {
                                                    Text(
                                                        text = metaParts.joinToString(" · "),
                                                        style = MaterialTheme.typography.labelMedium.copy(
                                                            fontFeatureSettings = "tnum"
                                                        ),
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                            }

                                            if (device.simSlots.isNotEmpty()) {
                                                FlowRow(
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    device.simSlots.forEach { slot ->
                                                        val slotNum = slot.slotIndex ?: 1
                                                        val slotSummary = listOfNotNull(
                                                            stringResource(R.string.dashboard_sim_slot_short, slotNum),
                                                            slot.phoneNumber.takeIf { it.isNotBlank() }
                                                                ?: slot.carrierName?.takeIf { it.isNotBlank() }
                                                        ).joinToString(" · ")
                                                        Surface(
                                                            shape = RoundedCornerShape(8.dp),
                                                            color = MaterialTheme.colorScheme.surface,
                                                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                                                        ) {
                                                            Text(
                                                                text = slotSummary,
                                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                                                style = MaterialTheme.typography.labelSmall.copy(
                                                                    fontFeatureSettings = "tnum"
                                                                ),
                                                                fontFamily = if (slot.phoneNumber.isNotBlank()) FontFamily.Monospace else FontFamily.Default,
                                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .clip(fieldShape)
                                .clickable(onClick = onOpenDiagnostics)
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(MaterialTheme.colorScheme.surfaceVariant)
                                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.MonitorHeart,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        text = stringResource(R.string.settings_diagnostics_row_title),
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    val preflight = state.preflightState
                                    val diagSubtitle = when {
                                        preflight == null -> stringResource(R.string.settings_diagnostics_row_desc_default)
                                        preflight.overallStatus.equals("READY", ignoreCase = true) ->
                                            stringResource(R.string.settings_diagnostics_row_desc_ready, preflight.walletSummary.activeCount)
                                        else -> stringResource(R.string.settings_diagnostics_row_desc_attention)
                                    }
                                    Text(
                                        text = diagSubtitle,
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontFeatureSettings = "tnum"
                                        ),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            Icon(
                                imageVector = Icons.Default.ChevronRight,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }

            // Verification Widget Section
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                val waitingCount = remember(state.paymentIntents) {
                    state.paymentIntents.count {
                        it.status.uppercase(Locale.US) in setOf(
                            "OPEN",
                            "WAITING_FOR_SMS",
                            "MANUAL_REVIEW_REQUIRED"
                        )
                    }
                }
                val canPinWidget = remember { PendingPaymentsWidgetProvider.canRequestPin(context) }
                var widgetPinRequested by remember { mutableStateOf(false) }

                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Widgets,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = stringResource(R.string.settings_verification_widget_section),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (waitingCount > 0) StatusGrayBg else StatusGreenBg
                        ) {
                            Text(
                                text = if (waitingCount > 0) {
                                    stringResource(R.string.widget_pending_count_badge, waitingCount)
                                } else {
                                    stringResource(R.string.widget_pending_empty_title)
                                },
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontFeatureSettings = "tnum"
                                ),
                                fontWeight = FontWeight.SemiBold,
                                color = if (waitingCount > 0) {
                                    OrbitSemanticColors.statusGray
                                } else {
                                    OrbitSemanticColors.statusGreen
                                }
                            )
                        }
                    }

                    Text(
                        text = stringResource(R.string.onboarding_widget_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    if (canPinWidget) {
                        OutlinedButton(
                            onClick = {
                                if (PendingPaymentsWidgetProvider.requestPinWidget(context)) {
                                    widgetPinRequested = true
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp),
                            shape = fieldShape,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Widgets,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(
                                text = if (widgetPinRequested) {
                                    stringResource(R.string.widget_pin_added)
                                } else {
                                    stringResource(R.string.dashboard_waiting_widget_pin)
                                },
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    } else {
                        Text(
                            text = stringResource(R.string.settings_widget_pin_manual_hint),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Signed-in Merchant Account Card
            if (state.isLoggedIn || state.userEmail.isNotBlank() || state.storeName.isNotBlank() || state.merchantId.isNotBlank()) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                    shape = cardShape
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.settings_merchant_account),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AccountCircle,
                                    contentDescription = stringResource(R.string.cd_merchant_avatar),
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(24.dp)
                                )
                            }

                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = state.storeName.ifBlank { stringResource(R.string.settings_default_merchant_name) },
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                if (state.userEmail.isNotBlank()) {
                                    Text(
                                        text = state.userEmail,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                if (state.merchantId.isNotBlank()) {
                                    Text(
                                        text = state.merchantId,
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontFeatureSettings = "tnum"
                                        ),
                                        fontFamily = FontFamily.Monospace,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        OutlinedButton(
                            onClick = onLogoutClick,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp),
                            shape = fieldShape,
                            border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = redFg
                            )
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Logout,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(
                                text = stringResource(R.string.action_sign_out),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            // Appearance Card (White / Premium Black Theme Switcher)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.settings_appearance),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(fieldShape)
                            .clickable { onToggleTheme() }
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .padding(end = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (state.isDarkTheme) Icons.Default.DarkMode else Icons.Default.LightMode,
                                    contentDescription = stringResource(R.string.cd_theme_icon),
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(20.dp)
                                )
                            }

                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = stringResource(
                                        if (state.isDarkTheme) {
                                            R.string.settings_theme_dark_title
                                        } else {
                                            R.string.settings_theme_light_title
                                        }
                                    ),
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = stringResource(
                                        if (state.isDarkTheme) {
                                            R.string.settings_theme_dark_desc
                                        } else {
                                            R.string.settings_theme_light_desc
                                        }
                                    ),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Switch(
                            checked = state.isDarkTheme,
                            onCheckedChange = { onToggleTheme() },
                            colors = switchColors
                        )
                    }
                }
            }

            // Language Selector Card ("Language / ভাষা")
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Translate,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = stringResource(R.string.settings_language_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = stringResource(R.string.settings_language_subtitle),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    val languageOptions = listOf(
                        LocaleHelper.LANG_SYSTEM to stringResource(R.string.settings_language_system),
                        LocaleHelper.LANG_ENGLISH to stringResource(R.string.settings_language_english),
                        LocaleHelper.LANG_BANGLA to stringResource(R.string.settings_language_bangla)
                    )

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            languageOptions.forEach { (tag, label) ->
                                val isSelected = selectedLanguage == tag
                                val pillShape = RoundedCornerShape(10.dp)
                                Surface(
                                    modifier = Modifier
                                        .weight(1f)
                                        .heightIn(min = 48.dp)
                                        .clip(pillShape)
                                        .clickable {
                                            selectedLanguage = tag
                                            LocaleHelper.setLanguage(context, tag)
                                        },
                                    shape = pillShape,
                                    color = if (isSelected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        Color.Transparent
                                    }
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(min = 48.dp)
                                            .padding(horizontal = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = label,
                                            style = MaterialTheme.typography.labelLarge,
                                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                                            color = if (isSelected) {
                                                MaterialTheme.colorScheme.onPrimary
                                            } else {
                                                MaterialTheme.colorScheme.onSurfaceVariant
                                            },
                                            textAlign = TextAlign.Center,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Connection Configuration Card (strictly view-only)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.settings_cloud_connection),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (state.isOnline) StatusGreen else MaterialTheme.colorScheme.outlineVariant
                                    )
                            )
                            Text(
                                text = stringResource(
                                    if (state.isOnline) {
                                        R.string.dashboard_status_online_simple
                                    } else {
                                        R.string.dashboard_status_offline_simple
                                    }
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Medium,
                                color = if (state.isOnline) greenFg else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.outline, fieldShape),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = fieldShape
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            ConnectionReadOnlyRow(
                                icon = Icons.Default.Language,
                                label = stringResource(R.string.settings_server_url_label),
                                value = resolvedServerUrl
                            )
                            HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)
                            ConnectionReadOnlyRow(
                                icon = Icons.Default.Store,
                                label = stringResource(R.string.settings_merchant_id_label),
                                value = resolvedMerchantId.ifBlank { "—" },
                                monospace = true
                            )
                            HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)
                            ConnectionReadOnlyRow(
                                icon = Icons.Default.Key,
                                label = stringResource(R.string.settings_device_key_label),
                                value = maskedDeviceKey,
                                monospace = true
                            )
                        }
                    }

                    // Test Connection Button (read-only reachability check)
                    OutlinedButton(
                        onClick = {
                            isTestingConnection = true
                            testResult = null
                            onTestConnection(resolvedServerUrl, resolvedMerchantId, resolvedDeviceKey) { success, message ->
                                isTestingConnection = false
                                testResult = Pair(success, message)
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp),
                        enabled = !isTestingConnection && resolvedMerchantId.isNotBlank() && resolvedDeviceKey.isNotBlank(),
                        shape = fieldShape,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.onSurface
                        )
                    ) {
                        if (isTestingConnection) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(
                                text = stringResource(R.string.settings_testing_connection),
                                style = MaterialTheme.typography.labelLarge
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.settings_test_connection),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }
                }
            }

            // SMS Trust & Extra Trusted Senders Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = stringResource(R.string.settings_sms_trust_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    OutlinedTextField(
                        value = extraTrustedSenders,
                        onValueChange = { updated ->
                            extraTrustedSenders = updated
                            preferencesManager.extraTrustedSenders = updated
                        },
                        label = { Text(stringResource(R.string.settings_extra_senders_label)) },
                        placeholder = { Text(stringResource(R.string.settings_extra_senders_placeholder)) },
                        supportingText = {
                            Text(
                                text = stringResource(R.string.settings_extra_senders_helper),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            fontFamily = FontFamily.Monospace,
                            fontFeatureSettings = "tnum"
                        ),
                        shape = fieldShape,
                        colors = textFieldColors
                    )
                }
            }

            // Persistence & Service Settings
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.settings_resilience_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(fieldShape)
                            .clickable { enableForeground = !enableForeground }
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(end = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.settings_foreground_title),
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(R.string.settings_foreground_desc),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Switch(
                            checked = enableForeground,
                            onCheckedChange = { enableForeground = it },
                            colors = switchColors
                        )
                    }

                    HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(fieldShape)
                            .clickable(onClick = onOpenSetupGuide)
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .padding(end = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.HelpOutline,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = stringResource(R.string.settings_setup_guide_title),
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = stringResource(R.string.settings_setup_guide_desc),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        Icon(
                            imageVector = Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // App Updates & Version Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                shape = cardShape
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.SystemUpdate,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = stringResource(R.string.settings_updates_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = stringResource(
                            R.string.settings_updates_current_version,
                            BuildConfig.VERSION_NAME,
                            BuildConfig.VERSION_CODE
                        ),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontFamily = FontFamily.Monospace,
                            fontFeatureSettings = "tnum"
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    val updateStatusLine = when (updateState.status) {
                        UpdateStatus.CHECKING -> stringResource(R.string.update_status_checking)
                        UpdateStatus.DOWNLOADING -> stringResource(
                            R.string.update_status_downloading_simple,
                            (updateState.downloadProgress * 100).toInt().coerceIn(0, 100)
                        )
                        UpdateStatus.VERIFYING -> stringResource(R.string.update_status_verifying)
                        UpdateStatus.READY_TO_INSTALL -> stringResource(
                            R.string.update_status_ready_version,
                            updateState.release?.versionName.orEmpty()
                        )
                        UpdateStatus.INSTALLING -> stringResource(R.string.update_status_installing)
                        UpdateStatus.UP_TO_DATE -> stringResource(R.string.update_status_up_to_date)
                        UpdateStatus.ERROR -> updateState.errorMessage ?: stringResource(R.string.update_status_error_generic)
                        else -> stringResource(R.string.settings_updates_auto_desc)
                    }

                    Text(
                        text = updateStatusLine,
                        style = MaterialTheme.typography.labelMedium,
                        color = if (updateState.status == UpdateStatus.ERROR) redFg else MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    val isUpdateBusy = updateState.status in setOf(
                        UpdateStatus.CHECKING,
                        UpdateStatus.DOWNLOADING,
                        UpdateStatus.VERIFYING,
                        UpdateStatus.INSTALLING
                    )

                    OutlinedButton(
                        onClick = {
                            coroutineScope.launch {
                                if (updateState.status == UpdateStatus.READY_TO_INSTALL) {
                                    AppUpdateManager.installDownloadedUpdate(context)
                                } else {
                                    AppUpdateManager.checkForUpdates(
                                        context = context,
                                        userInitiated = true,
                                        autoDownload = true,
                                        forceCheck = true
                                    )
                                }
                            }
                        },
                        enabled = !isUpdateBusy,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp),
                        shape = fieldShape,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                    ) {
                        if (isUpdateBusy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.size(8.dp))
                        }
                        Text(
                            text = when (updateState.status) {
                                UpdateStatus.READY_TO_INSTALL -> stringResource(
                                    R.string.settings_updates_install_version,
                                    updateState.release?.versionName.orEmpty()
                                )
                                UpdateStatus.CHECKING -> stringResource(R.string.update_status_checking)
                                else -> stringResource(R.string.settings_updates_check_button)
                            },
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            // Save Button
            Button(
                onClick = {
                    preferencesManager.extraTrustedSenders = extraTrustedSenders.trim()
                    onSaveSettings(state.serverUrl, state.merchantId, state.deviceKey, enableForeground)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                ),
                shape = fieldShape
            ) {
                Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = stringResource(R.string.settings_save_button),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold
                )
            }

            // App Metadata
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = stringResource(R.string.settings_footer_version, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.outlineVariant
                )
                Text(
                    text = stringResource(R.string.settings_footer_stack),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.outlineVariant
                )
            }
        }

        // True floating toast overlay (never shifts layout up or down)
        OrbitFloatingToast(
            visible = testResult != null,
            message = testResult?.second.orEmpty(),
            tone = if (testResult?.first == true) FloatingToastTone.SUCCESS else FloatingToastTone.ERROR,
            onDismiss = { testResult = null },
            modifier = Modifier.align(Alignment.TopCenter)
        )
    }
    }
}

@Composable
private fun ConnectionReadOnlyRow(
    icon: ImageVector,
    label: String,
    value: String,
    monospace: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp)
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontFeatureSettings = "tnum"
                ),
                fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
