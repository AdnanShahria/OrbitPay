package com.orbitsaas.payment.ui.diagnostics

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.BlockedMessageEntity
import com.orbitsaas.payment.data.remote.PreflightProfileMatchDto
import com.orbitsaas.payment.interceptors.parsers.ParseOutcome
import com.orbitsaas.payment.service.WsPushState
import com.orbitsaas.payment.ui.components.ProviderDot
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.formatNumberAmount
import com.orbitsaas.payment.ui.components.formatRelativeTime
import com.orbitsaas.payment.ui.components.providerDisplayName
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGray
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.DiagnosticsUiState
import com.orbitsaas.payment.ui.viewmodel.DiagnosticsViewModel
import com.orbitsaas.payment.util.SimNumberSource
import com.orbitsaas.payment.util.SimSlotInfo
import java.util.Locale

private data class SimDialogTarget(
    val slotIndex: Int,
    val carrierName: String,
    val initialNumber: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiagnosticsScreen(
    viewModel: DiagnosticsViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val snackbarHostState = remember { SnackbarHostState() }
    var blockedExpanded by rememberSaveable { mutableStateOf(false) }
    var simDialogTarget by remember { mutableStateOf<SimDialogTarget?>(null) }

    val permissionsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        viewModel.runFullSystemCheck()
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refreshStatus()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(state.feedbackMessage) {
        state.feedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearFeedback()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.diag_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.runFullSystemCheck() },
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.common_refresh),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 0. System & Number Profile Check
            item {
                SystemAndNumberProfileCard(
                    state = state,
                    onGrantSimPermission = {
                        permissionsLauncher.launch(
                            arrayOf(
                                Manifest.permission.READ_PHONE_NUMBERS,
                                Manifest.permission.READ_PHONE_STATE
                            )
                        )
                    },
                    onConfirmSimClick = { slotIndex, carrierName, existingNumber ->
                        simDialogTarget = SimDialogTarget(
                            slotIndex = slotIndex,
                            carrierName = carrierName,
                            initialNumber = existingNumber.orEmpty()
                        )
                    },
                    onRunFullCheck = { viewModel.runFullSystemCheck() }
                )
            }

            // 1. Live Health & Permission Checklist
            item {
                HealthChecklistCard(
                    state = state,
                    onGrantSms = {
                        permissionsLauncher.launch(
                            arrayOf(
                                Manifest.permission.RECEIVE_SMS,
                                Manifest.permission.READ_SMS
                            )
                        )
                    },
                    onGrantNotifications = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            permissionsLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                        }
                    },
                    onOpenListenerSettings = {
                        runCatching {
                            context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        }
                    },
                    onRequestBatteryExemption = {
                        val directIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                            data = Uri.parse("package:${context.packageName}")
                        }
                        runCatching { context.startActivity(directIntent) }
                            .onFailure {
                                runCatching {
                                    context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                                }
                            }
                    },
                    onStartForegroundService = { viewModel.startForegroundService() },
                    onReconnectWebSocket = { viewModel.reconnectPushWebSocket() },
                    onRefreshFcmToken = { viewModel.refreshFcmToken() }
                )
            }

            // 2. Sync Telemetry & Inbox Recovery (72h Rescan)
            item {
                TelemetryAndRescanCard(
                    state = state,
                    onRescan = { viewModel.rescanInbox72h() }
                )
            }

            // 3. Blocked Messages Log
            item {
                BlockedMessagesCard(
                    blockedCount = state.blockedCount,
                    blockedMessages = state.blockedMessages,
                    expanded = blockedExpanded,
                    onToggleExpand = { blockedExpanded = !blockedExpanded }
                )
            }

            // 4. Interactive Parser Self-Test
            item {
                ParserSelfTestCard(
                    senderInput = state.testSenderInput,
                    smsInput = state.testSmsInput,
                    parseOutcome = state.testParseOutcome,
                    onSenderChange = { viewModel.updateTestSender(it) },
                    onSmsChange = { viewModel.updateTestSms(it) },
                    onClear = { viewModel.clearParserTest() }
                )
            }
        }
    }

    simDialogTarget?.let { target ->
        ConfirmSimNumberDialog(
            target = target,
            onDismiss = { simDialogTarget = null },
            onConfirm = { number ->
                viewModel.confirmSimNumber(target.slotIndex, number, target.carrierName)
                simDialogTarget = null
            }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SystemAndNumberProfileCard(
    state: DiagnosticsUiState,
    onGrantSimPermission: () -> Unit,
    onConfirmSimClick: (slotIndex: Int, carrierName: String, existingNumber: String?) -> Unit,
    onRunFullCheck: () -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    val preflight = state.preflight
    val overallStatus = preflight?.overallStatus?.uppercase(Locale.US)

    val (statusLabel, statusFg, statusBg) = when (overallStatus) {
        "READY" -> Triple(
            stringResource(R.string.diag_preflight_status_ready),
            OrbitSemanticColors.statusGreen,
            StatusGreenBg
        )
        "ACTION_REQUIRED" -> Triple(
            stringResource(R.string.diag_preflight_status_action_required),
            OrbitSemanticColors.statusAmber,
            StatusAmberBg
        )
        "ERROR" -> Triple(
            stringResource(R.string.diag_preflight_status_error),
            OrbitSemanticColors.statusRed,
            StatusRedBg
        )
        else -> Triple(
            stringResource(R.string.diag_preflight_status_unchecked),
            OrbitSemanticColors.statusGray,
            StatusGrayBg
        )
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header + Overall Status Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = stringResource(R.string.diag_preflight_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (preflight != null && preflight.merchant.storeName.isNotBlank()) {
                            stringResource(
                                R.string.diag_preflight_subtitle_store,
                                preflight.merchant.storeName,
                                stringResource(
                                    R.string.diag_preflight_wallets_summary,
                                    preflight.walletSummary.activeCount,
                                    preflight.walletSummary.totalCount
                                )
                            )
                        } else {
                            stringResource(R.string.diag_preflight_subtitle_default)
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                StatusPill(
                    label = statusLabel,
                    foreground = statusFg,
                    background = statusBg
                )
            }

            // Verification Mode + Storefront Webhook Badges
            if (preflight != null) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val isAutoMode = !preflight.merchant.verificationMode.equals("PURE_MANUAL", ignoreCase = true)
                    StatusPill(
                        label = stringResource(
                            if (isAutoMode) R.string.diag_preflight_mode_auto else R.string.diag_preflight_mode_manual
                        ),
                        foreground = if (isAutoMode) MaterialTheme.colorScheme.primary else OrbitSemanticColors.statusAmber,
                        background = if (isAutoMode) MaterialTheme.colorScheme.surfaceVariant else StatusAmberBg
                    )

                    StatusPill(
                        label = stringResource(
                            if (preflight.merchant.webhookConfigured) {
                                R.string.diag_preflight_webhook_ok
                            } else {
                                R.string.diag_preflight_webhook_missing
                            }
                        ),
                        foreground = if (preflight.merchant.webhookConfigured) {
                            OrbitSemanticColors.statusGreen
                        } else {
                            OrbitSemanticColors.statusAmber
                        },
                        background = if (preflight.merchant.webhookConfigured) StatusGreenBg else StatusAmberBg
                    )
                }

                if (!preflight.merchant.webhookUrl.isNullOrBlank()) {
                    Text(
                        text = preflight.merchant.webhookUrl,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                if (preflight.walletSummary.hasPlaceholderWallets || preflight.walletSummary.placeholderOnly) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, StatusAmber.copy(alpha = 0.45f), RoundedCornerShape(12.dp)),
                        color = StatusAmberBg,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = OrbitSemanticColors.statusAmber,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = stringResource(R.string.diag_preflight_placeholder_warning),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Medium,
                                color = OrbitSemanticColors.statusAmber
                            )
                        }
                    }
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            // Detected / Confirmed Phone SIMs
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.SimCard,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = stringResource(R.string.diag_preflight_sims_title),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                if (!state.phonePermissionGranted) {
                    OutlinedButton(
                        onClick = onGrantSimPermission,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                    ) {
                        Text(
                            text = stringResource(R.string.diag_preflight_grant_sim_perm),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            }

            if (state.detectedSimSlots.isEmpty()) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(R.string.diag_preflight_sim_none_detected),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .weight(1f)
                                .padding(end = 10.dp)
                        )
                        OutlinedButton(
                            onClick = { onConfirmSimClick(1, "SIM 1", null) },
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Text(
                                text = stringResource(R.string.diag_preflight_sim_set_sim1),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.detectedSimSlots.forEach { slot ->
                        SimSlotRow(
                            slot = slot,
                            onConfirmClick = {
                                onConfirmSimClick(slot.slotIndex, slot.carrierName, slot.phoneNumber)
                            }
                        )
                    }
                }
            }

            // Number Profile Match Rows
            if (preflight != null) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = stringResource(R.string.diag_preflight_matches_title),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                if (preflight.profileMatches.isEmpty()) {
                    Text(
                        text = stringResource(R.string.diag_preflight_matches_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        preflight.profileMatches.forEach { match ->
                            ProfileMatchRow(match = match)
                        }
                    }
                }

                if (preflight.recommendations.isNotEmpty()) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, StatusAmber.copy(alpha = 0.35f), RoundedCornerShape(14.dp)),
                        color = StatusAmberBg,
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.diag_preflight_recommendations_title),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                                color = OrbitSemanticColors.statusAmber
                            )
                            preflight.recommendations.forEach { rec ->
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Text(
                                        text = "•",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = OrbitSemanticColors.statusAmber
                                    )
                                    Text(
                                        text = rec,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }
            }

            state.preflightError?.let { errorMsg ->
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, StatusRed.copy(alpha = 0.45f), RoundedCornerShape(12.dp)),
                    color = StatusRedBg,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = errorMsg,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = OrbitSemanticColors.statusRed
                    )
                }
            }

            Button(
                onClick = onRunFullCheck,
                enabled = !state.isCheckingPreflight,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            ) {
                if (state.isCheckingPreflight) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        text = stringResource(R.string.diag_preflight_running_button),
                        style = MaterialTheme.typography.labelLarge
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.VerifiedUser,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        text = stringResource(R.string.diag_preflight_run_button),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun SimSlotRow(
    slot: SimSlotInfo,
    onConfirmClick: () -> Unit
) {
    val sourceLabel = when (slot.source) {
        SimNumberSource.HARDWARE -> stringResource(R.string.diag_preflight_sim_source_hardware)
        SimNumberSource.CONFIRMED -> stringResource(R.string.diag_preflight_sim_source_confirmed)
        SimNumberSource.HIDDEN -> stringResource(R.string.diag_preflight_sim_source_hidden)
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 8.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(
                    text = stringResource(R.string.diag_preflight_sim_slot_label, slot.slotIndex, slot.carrierName),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = slot.phoneNumber ?: stringResource(R.string.diag_preflight_sim_hidden),
                        style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                        fontFamily = if (slot.phoneNumber != null) FontFamily.Monospace else FontFamily.Default,
                        color = if (slot.phoneNumber != null) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            OrbitSemanticColors.statusAmber
                        }
                    )
                    StatusPill(
                        label = sourceLabel,
                        foreground = when (slot.source) {
                            SimNumberSource.HARDWARE -> OrbitSemanticColors.statusGreen
                            SimNumberSource.CONFIRMED -> MaterialTheme.colorScheme.primary
                            SimNumberSource.HIDDEN -> OrbitSemanticColors.statusAmber
                        },
                        background = when (slot.source) {
                            SimNumberSource.HARDWARE -> StatusGreenBg
                            SimNumberSource.CONFIRMED -> MaterialTheme.colorScheme.surface
                            SimNumberSource.HIDDEN -> StatusAmberBg
                        }
                    )
                }
            }

            if (slot.phoneNumber == null || slot.source == SimNumberSource.CONFIRMED) {
                OutlinedButton(
                    onClick = onConfirmClick,
                    modifier = Modifier.heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    if (slot.source == SimNumberSource.CONFIRMED) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.size(4.dp))
                    }
                    Text(
                        text = stringResource(
                            if (slot.phoneNumber == null) {
                                R.string.diag_preflight_sim_set_number
                            } else {
                                R.string.diag_preflight_sim_edit_number
                            }
                        ),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileMatchRow(match: PreflightProfileMatchDto) {
    val normalizedStatus = match.status.uppercase(Locale.US)
    val (pillLabel, pillFg, pillBg) = when (normalizedStatus) {
        "MATCHED" -> Triple(
            if (match.matchedSimSlot != null) {
                stringResource(R.string.diag_preflight_match_matched_slot, match.matchedSimSlot)
            } else {
                stringResource(R.string.diag_preflight_match_matched)
            },
            OrbitSemanticColors.statusGreen,
            StatusGreenBg
        )
        "MISMATCH" -> Triple(
            stringResource(R.string.diag_preflight_match_mismatch),
            OrbitSemanticColors.statusRed,
            StatusRedBg
        )
        "PLACEHOLDER_NUMBER" -> Triple(
            stringResource(R.string.diag_preflight_match_placeholder),
            OrbitSemanticColors.statusRed,
            StatusRedBg
        )
        "SIM_NUMBER_UNAVAILABLE" -> Triple(
            stringResource(R.string.diag_preflight_match_sim_hidden),
            OrbitSemanticColors.statusAmber,
            StatusAmberBg
        )
        else -> Triple(
            normalizedStatus.replace("_", " "),
            OrbitSemanticColors.statusGray,
            StatusGrayBg
        )
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ProviderDot(provider = match.provider, size = 9.dp)
                    Text(
                        text = providerDisplayName(match.provider),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = match.walletNumber,
                        style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                StatusPill(
                    label = pillLabel,
                    foreground = pillFg,
                    background = pillBg
                )
            }

            if (match.message.isNotBlank()) {
                Text(
                    text = match.message,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ConfirmSimNumberDialog(
    target: SimDialogTarget,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var numberInput by remember(target.slotIndex) { mutableStateOf(target.initialNumber) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        title = {
            Text(
                text = stringResource(R.string.diag_preflight_sim_dialog_title, target.slotIndex),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = stringResource(R.string.diag_preflight_sim_dialog_desc, target.carrierName),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = numberInput,
                    onValueChange = { numberInput = it },
                    label = { Text(stringResource(R.string.diag_preflight_sim_dialog_label)) },
                    placeholder = { Text(stringResource(R.string.diag_preflight_sim_dialog_placeholder)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(numberInput) },
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            ) {
                Text(
                    text = stringResource(R.string.diag_preflight_sim_dialog_save),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.heightIn(min = 48.dp)
            ) {
                Text(
                    text = stringResource(R.string.common_cancel),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    )
}

@Composable
private fun HealthChecklistCard(
    state: DiagnosticsUiState,
    onGrantSms: () -> Unit,
    onGrantNotifications: () -> Unit,
    onOpenListenerSettings: () -> Unit,
    onRequestBatteryExemption: () -> Unit,
    onStartForegroundService: () -> Unit,
    onReconnectWebSocket: () -> Unit,
    onRefreshFcmToken: () -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = stringResource(R.string.diag_checklist_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )

            ChecklistRow(
                title = stringResource(R.string.diag_check_sms_perms),
                subtitle = stringResource(
                    if (state.smsPermissionsGranted) R.string.diag_check_sms_perms_ok else R.string.diag_check_sms_perms_missing
                ),
                healthy = state.smsPermissionsGranted,
                isWarning = false,
                actionLabel = if (!state.smsPermissionsGranted) stringResource(R.string.diag_action_grant) else null,
                onAction = onGrantSms
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            ChecklistRow(
                title = stringResource(R.string.diag_check_notifications),
                subtitle = stringResource(
                    if (state.postNotificationsGranted) R.string.diag_check_notifications_ok else R.string.diag_check_notifications_missing
                ),
                healthy = state.postNotificationsGranted,
                isWarning = true,
                actionLabel = if (!state.postNotificationsGranted) stringResource(R.string.diag_action_grant) else null,
                onAction = onGrantNotifications
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            ChecklistRow(
                title = stringResource(R.string.diag_check_listener),
                subtitle = stringResource(
                    if (state.notificationListenerEnabled) R.string.diag_check_listener_ok else R.string.diag_check_listener_missing
                ),
                healthy = state.notificationListenerEnabled,
                isWarning = true,
                actionLabel = if (!state.notificationListenerEnabled) stringResource(R.string.diag_action_enable) else null,
                onAction = onOpenListenerSettings
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            ChecklistRow(
                title = stringResource(R.string.diag_check_battery),
                subtitle = stringResource(
                    if (state.batteryOptimizationIgnored) R.string.diag_check_battery_ok else R.string.diag_check_battery_missing
                ),
                healthy = state.batteryOptimizationIgnored,
                isWarning = true,
                actionLabel = if (!state.batteryOptimizationIgnored) stringResource(R.string.diag_action_exempt) else null,
                onAction = onRequestBatteryExemption
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            ChecklistRow(
                title = stringResource(R.string.diag_check_fg_service),
                subtitle = stringResource(
                    if (state.foregroundServiceRunning) R.string.diag_check_fg_running else R.string.diag_check_fg_stopped
                ),
                healthy = state.foregroundServiceRunning,
                isWarning = true,
                actionLabel = if (!state.foregroundServiceRunning && state.isConfigured) {
                    stringResource(R.string.diag_action_start)
                } else {
                    null
                },
                onAction = onStartForegroundService
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            val wsSubtitle = when (state.wsPushState) {
                WsPushState.CONNECTED -> stringResource(R.string.diag_check_ws_connected)
                WsPushState.CONNECTING -> stringResource(R.string.diag_check_ws_connecting)
                WsPushState.DISCONNECTED -> stringResource(R.string.diag_check_ws_disconnected)
                WsPushState.UNAUTHORIZED -> stringResource(R.string.diag_check_ws_unauthorized)
            }
            val wsCanReconnect = state.wsPushState == WsPushState.DISCONNECTED ||
                state.wsPushState == WsPushState.UNAUTHORIZED
            ChecklistRow(
                title = stringResource(R.string.diag_check_ws),
                subtitle = wsSubtitle,
                healthy = state.wsPushState == WsPushState.CONNECTED,
                isWarning = true,
                actionLabel = if (wsCanReconnect) stringResource(R.string.diag_action_reconnect) else null,
                onAction = onReconnectWebSocket
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))

            val fcmSubtitle = when {
                !state.firebaseAvailable -> stringResource(R.string.diag_check_fcm_unavailable)
                state.fcmTokenPresent -> stringResource(R.string.diag_check_fcm_active)
                else -> stringResource(R.string.diag_check_fcm_missing_token)
            }
            ChecklistRow(
                title = stringResource(R.string.diag_check_fcm),
                subtitle = fcmSubtitle,
                healthy = state.firebaseAvailable && state.fcmTokenPresent,
                isWarning = true,
                neutral = !state.firebaseAvailable,
                actionLabel = if (state.firebaseAvailable) stringResource(R.string.diag_action_refresh_token) else null,
                actionLoading = state.isRefreshingToken,
                onAction = onRefreshFcmToken
            )
        }
    }
}

@Composable
private fun ChecklistRow(
    title: String,
    subtitle: String,
    healthy: Boolean,
    isWarning: Boolean,
    neutral: Boolean = false,
    actionLabel: String? = null,
    actionLoading: Boolean = false,
    onAction: () -> Unit = {}
) {
    val statusColor: Color
    val statusIcon = when {
        healthy -> {
            statusColor = StatusGreen
            Icons.Default.CheckCircle
        }
        neutral -> {
            statusColor = StatusGray
            Icons.Default.Info
        }
        isWarning -> {
            statusColor = StatusAmber
            Icons.Default.Warning
        }
        else -> {
            statusColor = StatusRed
            Icons.Default.Error
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = statusIcon,
            contentDescription = null,
            tint = statusColor,
            modifier = Modifier.size(20.dp)
        )

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (actionLabel != null) {
            OutlinedButton(
                onClick = onAction,
                enabled = !actionLoading,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                if (actionLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text(
                        text = actionLabel,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    }
}

@Composable
private fun TelemetryAndRescanCard(
    state: DiagnosticsUiState,
    onRescan: () -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(20.dp)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = stringResource(R.string.diag_telemetry_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )

            TelemetryRow(
                label = stringResource(R.string.diag_last_heartbeat),
                value = formatRelativeTime(context, state.lastHeartbeatAt)
            )
            TelemetryRow(
                label = stringResource(R.string.diag_last_sync),
                value = formatRelativeTime(context, state.lastSyncAt)
            )
            TelemetryRow(
                label = stringResource(R.string.diag_last_push),
                value = formatRelativeTime(context, state.lastPushReceivedAt)
            )
            TelemetryRow(
                label = stringResource(R.string.diag_last_inbox_scan),
                value = formatRelativeTime(context, state.lastInboxScanAt)
            )
            TelemetryRow(
                label = stringResource(R.string.diag_pending_uploads),
                value = state.pendingUploadCount.toString()
            )

            Button(
                onClick = onRescan,
                enabled = !state.isRescanning,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            ) {
                if (state.isRescanning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        text = stringResource(R.string.diag_rescan_running),
                        style = MaterialTheme.typography.labelLarge
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Sync,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        text = stringResource(R.string.diag_rescan_button),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun TelemetryRow(
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            modifier = Modifier
                .weight(1f)
                .padding(end = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun BlockedMessagesCard(
    blockedCount: Int,
    blockedMessages: List<BlockedMessageEntity>,
    expanded: Boolean,
    onToggleExpand: () -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onToggleExpand),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Block,
                        contentDescription = null,
                        tint = if (blockedCount > 0) StatusRed else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = stringResource(R.string.diag_blocked_title, blockedCount),
                            style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(R.string.diag_blocked_subtitle),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Icon(
                    imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = stringResource(
                        if (expanded) R.string.diag_blocked_collapse else R.string.diag_blocked_expand
                    ),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier.padding(top = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (blockedMessages.isEmpty()) {
                        Text(
                            text = stringResource(R.string.diag_blocked_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        blockedMessages.forEach { msg ->
                            BlockedMessageRow(msg)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BlockedMessageRow(msg: BlockedMessageEntity) {
    val context = LocalContext.current
    val relativeTime = remember(msg.receivedAt) { formatRelativeTime(context, msg.receivedAt) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = msg.sender,
                    style = MaterialTheme.typography.labelLarge,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = "${msg.source} · $relativeTime",
                    style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            StatusPill(
                label = msg.reason,
                foreground = StatusRed,
                background = StatusRedBg
            )

            Text(
                text = msg.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun ParserSelfTestCard(
    senderInput: String,
    smsInput: String,
    parseOutcome: ParseOutcome?,
    onSenderChange: (String) -> Unit,
    onSmsChange: (String) -> Unit,
    onClear: () -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    val fieldShape = RoundedCornerShape(14.dp)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = stringResource(R.string.diag_parser_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(R.string.diag_parser_subtitle),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (senderInput.isNotEmpty() || smsInput.isNotEmpty()) {
                    OutlinedButton(
                        onClick = onClear,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                    ) {
                        Text(
                            text = stringResource(R.string.common_clear),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            }

            OutlinedTextField(
                value = senderInput,
                onValueChange = onSenderChange,
                label = { Text(stringResource(R.string.diag_parser_sender_label)) },
                singleLine = true,
                shape = fieldShape,
                colors = fieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = smsInput,
                onValueChange = onSmsChange,
                label = { Text(stringResource(R.string.diag_parser_sms_label)) },
                minLines = 3,
                maxLines = 5,
                shape = fieldShape,
                colors = fieldColors,
                modifier = Modifier.fillMaxWidth()
            )

            when (parseOutcome) {
                null -> {
                    Text(
                        text = stringResource(R.string.diag_parser_hint_enter),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                is ParseOutcome.Accepted -> {
                    val tx = parseOutcome.transaction
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, StatusGreen.copy(alpha = 0.45f), fieldShape),
                        color = StatusGreenBg,
                        shape = fieldShape
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = stringResource(
                                    R.string.diag_parser_result_accepted,
                                    providerDisplayName(tx.provider)
                                ),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = StatusGreen
                            )
                            Text(
                                text = stringResource(
                                    R.string.diag_parser_result_accepted_details,
                                    tx.trxId,
                                    formatNumberAmount(tx.amount),
                                    tx.senderNumber
                                ),
                                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
                is ParseOutcome.Rejected -> {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, StatusRed.copy(alpha = 0.45f), fieldShape),
                        color = StatusRedBg,
                        shape = fieldShape
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.diag_parser_result_rejected, parseOutcome.reason),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = StatusRed
                            )
                            parseOutcome.provider?.let { prov ->
                                Text(
                                    text = stringResource(
                                        R.string.diag_parser_result_rejected_provider,
                                        providerDisplayName(prov)
                                    ),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
                ParseOutcome.NotPayment -> {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, StatusGray.copy(alpha = 0.4f), fieldShape),
                        color = StatusGrayBg,
                        shape = fieldShape
                    ) {
                        Text(
                            text = stringResource(R.string.diag_parser_result_not_payment),
                            modifier = Modifier.padding(14.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
