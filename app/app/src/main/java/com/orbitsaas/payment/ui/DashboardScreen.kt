package com.orbitsaas.payment.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Widgets
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
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.widget.PendingPaymentsWidgetProvider
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.data.remote.WalletRotationDto
import com.orbitsaas.payment.ui.components.ApproveIntentDialog
import com.orbitsaas.payment.ui.components.PaymentIntentCard
import com.orbitsaas.payment.ui.components.ProviderDot
import com.orbitsaas.payment.ui.components.RejectIntentDialog
import com.orbitsaas.payment.ui.components.intentStatusBadgeColors
import com.orbitsaas.payment.ui.components.providerDisplayName
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    state: DashboardUiState,
    onSyncClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onToggleTheme: () -> Unit,
    onClearFeedback: () -> Unit,
    onOrderAction: (externalOrderId: String, action: String) -> Unit = { _, _ -> },
    onRefreshOrders: () -> Unit = {},
    onResolveIntent: (intentId: String, decision: String, expectedStateVersion: Int?, reason: String?) -> Unit = { _, _, _, _ -> },
    onTriggerIntentAction: (intentId: String, actionId: String, actionLabel: String) -> Unit = { _, _, _ -> },
    onRefreshIntents: () -> Unit = {},
    onClearFocusedIntent: () -> Unit = {},
    onOpenDiagnostics: () -> Unit = {}
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedFeedTab by rememberSaveable { mutableIntStateOf(0) }
    var pendingApproveIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }
    var pendingRejectIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }

    var inspectedIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }
    var inspectedOrder by remember { mutableStateOf<MerchantOrderDto?>(null) }
    var inspectedSms by remember { mutableStateOf<SmsEntity?>(null) }

    LaunchedEffect(state.focusedPaymentIntentId, state.paymentIntents) {
        val focusedId = state.focusedPaymentIntentId
        if (!focusedId.isNullOrBlank()) {
            selectedFeedTab = 0
            val matched = state.paymentIntents.firstOrNull {
                it.id == focusedId || it.externalRefId == focusedId
            }
            if (matched != null) {
                inspectedIntent = matched
            }
        }
    }

    // Keep open bottom sheets in sync with live state updates
    LaunchedEffect(state.paymentIntents) {
        inspectedIntent?.let { current ->
            inspectedIntent = state.paymentIntents.firstOrNull { it.id == current.id }
        }
    }
    LaunchedEffect(state.orders) {
        inspectedOrder?.let { current ->
            inspectedOrder = state.orders.firstOrNull { it.externalOrderId == current.externalOrderId }
        }
    }

    LaunchedEffect(state.feedbackMessage) {
        state.feedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            onClearFeedback()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClick = onOpenDiagnostics)
                            .padding(vertical = 2.dp, horizontal = 2.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            text = state.storeName.ifBlank { stringResource(R.string.app_name) },
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        QuietLiveStatusLine(
                            isOnline = state.isOnline,
                            onlineDeviceCount = state.onlineDeviceCount,
                            totalDeviceCount = state.totalDeviceCount,
                            pendingUploadCount = state.pendingUploadCount
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = onToggleTheme,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = if (state.isDarkTheme) Icons.Default.LightMode else Icons.Default.DarkMode,
                            contentDescription = stringResource(
                                if (state.isDarkTheme) R.string.cd_switch_light_theme else R.string.cd_switch_dark_theme
                            ),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    IconButton(
                        onClick = onSyncClick,
                        enabled = !state.isSyncing,
                        modifier = Modifier.size(48.dp)
                    ) {
                        if (state.isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = stringResource(R.string.action_sync_now),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = onSettingsClick,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = stringResource(R.string.cd_settings),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
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
            contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Optional quiet 1-line setup warning only when preflight requires action
            val preflight = state.preflightState
            if (preflight != null && !preflight.overallStatus.equals("READY", ignoreCase = true)) {
                item {
                    QuietSetupNoticeRow(
                        isError = preflight.overallStatus.equals("ERROR", ignoreCase = true),
                        message = preflight.recommendations.firstOrNull()?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.dashboard_preflight_attention_short),
                        onClick = onOpenDiagnostics
                    )
                }
            }

            // 0.5 Live Waiting-for-Verification Widget Card (pinned inside Overview + pin-to-home shortcut)
            item {
                val waitingIntents = remember(state.paymentIntents) {
                    state.paymentIntents.filter {
                        it.status.uppercase(Locale.US) in setOf(
                            "OPEN",
                            "WAITING_FOR_SMS",
                            "MANUAL_REVIEW_REQUIRED"
                        )
                    }
                }
                WaitingForVerificationWidgetCard(
                    waitingIntents = waitingIntents,
                    onInspectIntent = { intent -> inspectedIntent = intent },
                    onApproveIntent = { intent -> pendingApproveIntent = intent }
                )
            }

            // 1. Calm Hero Moment Card (Verified this month + Active SIM Rotation Strip)
            item {
                HeroSummaryAndSimRotationCard(
                    totalVolume = state.totalVerifiedVolume,
                    verifiedCount = state.verifiedCount,
                    unclaimedCount = state.unclaimedCount,
                    wallets = state.wallets,
                    totalDeviceCount = state.totalDeviceCount
                )
            }

            // 2. Clean Segmented Feed (Pending | Orders | SMS)
            item {
                FeedSegmentedToggle(
                    selectedTab = selectedFeedTab,
                    intentsCount = state.paymentIntents.size,
                    ordersCount = state.orders.size,
                    pendingOrderCount = state.pendingOrderCount,
                    transactionsCount = state.transactions.size,
                    onSelectTab = { tab ->
                        selectedFeedTab = tab
                        when (tab) {
                            0 -> onRefreshIntents()
                            1 -> onRefreshOrders()
                        }
                    }
                )
            }

            // 3. Compact, Scannable Feed Rows
            when (selectedFeedTab) {
                0 -> {
                    if (state.isIntentsLoading && state.paymentIntents.isEmpty()) {
                        item { IntentsLoadingCard() }
                    } else if (state.paymentIntents.isEmpty()) {
                        item { EmptyIntentsStateCard(onRefresh = onRefreshIntents) }
                    } else {
                        items(state.paymentIntents, key = { it.id }) { intent ->
                            val isFocused = state.focusedPaymentIntentId != null &&
                                (intent.id == state.focusedPaymentIntentId ||
                                    intent.externalRefId == state.focusedPaymentIntentId)
                            CompactPaymentIntentRow(
                                intent = intent,
                                fallbackAppName = state.storeName,
                                isHighlighted = isFocused,
                                onClick = {
                                    if (isFocused) onClearFocusedIntent()
                                    inspectedIntent = intent
                                }
                            )
                        }
                    }
                }

                1 -> {
                    if (state.isOrdersLoading && state.orders.isEmpty()) {
                        item { OrdersLoadingCard() }
                    } else if (state.orders.isEmpty()) {
                        item { EmptyOrdersStateCard(onRefresh = onRefreshOrders) }
                    } else {
                        items(state.orders, key = { it.externalOrderId }) { order ->
                            CompactOrderRow(
                                order = order,
                                onClick = { inspectedOrder = order }
                            )
                        }
                    }
                }

                else -> {
                    if (state.transactions.isEmpty()) {
                        item { EmptyStateCard() }
                    } else {
                        items(state.transactions, key = { it.id }) { sms ->
                            CompactSmsRow(
                                sms = sms,
                                onClick = { inspectedSms = sms }
                            )
                        }
                    }
                }
            }
        }
    }

    // Payment Intent Inspector Sheet (preserves Approve/Reject, Dynamic Actions, Receipt & Admin links)
    inspectedIntent?.let { intent ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = {
                if (state.focusedPaymentIntentId != null) onClearFocusedIntent()
                inspectedIntent = null
            },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 28.dp)
            ) {
                PaymentIntentCard(
                    intent = intent,
                    serverBaseUrl = state.serverUrl,
                    fallbackAppName = state.storeName,
                    isHighlighted = false,
                    isActionInProgress = state.actionInProgressIntentId == intent.id,
                    onApproveClick = {
                        pendingApproveIntent = intent
                    },
                    onRejectClick = {
                        pendingRejectIntent = intent
                    },
                    onDynamicActionClick = { action ->
                        onTriggerIntentAction(intent.id, action.id, action.label)
                    }
                )
            }
        }
    }

    // Order Inspector Sheet (preserves all 1-tap bi-directional order actions)
    inspectedOrder?.let { order ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { inspectedOrder = null },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            OrderDetailSheetContent(
                order = order,
                isActionInProgress = state.actionInProgressOrderId == order.externalOrderId,
                onActionClick = { action ->
                    onOrderAction(order.externalOrderId, action)
                }
            )
        }
    }

    // SMS Inspector Sheet (shows SIM slot, receiver SIM, raw SMS, TrxID)
    inspectedSms?.let { sms ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { inspectedSms = null },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            SmsDetailSheetContent(sms = sms)
        }
    }

    pendingApproveIntent?.let { intent ->
        ApproveIntentDialog(
            intent = intent,
            isSubmitting = state.actionInProgressIntentId == intent.id,
            onDismiss = { pendingApproveIntent = null },
            onConfirmApprove = {
                onResolveIntent(intent.id, "APPROVE", intent.stateVersion, null)
                pendingApproveIntent = null
            }
        )
    }

    pendingRejectIntent?.let { intent ->
        RejectIntentDialog(
            intent = intent,
            isSubmitting = state.actionInProgressIntentId == intent.id,
            onDismiss = { pendingRejectIntent = null },
            onConfirmReject = { reason ->
                onResolveIntent(intent.id, "REJECT", intent.stateVersion, reason)
                pendingRejectIntent = null
            }
        )
    }
}

@Composable
private fun WaitingForVerificationWidgetCard(
    waitingIntents: List<PaymentIntentDto>,
    onInspectIntent: (PaymentIntentDto) -> Unit,
    onApproveIntent: (PaymentIntentDto) -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(16.dp)
    val canPin = remember { PendingPaymentsWidgetProvider.canRequestPin(context) }
    var pinFeedback by remember { mutableStateOf(false) }

    val hasWaiting = waitingIntents.isNotEmpty()
    val badgeBg = if (hasWaiting) Color(0x1AF59E0B) else Color(0x1A10B981)
    val badgeFg = if (hasWaiting) OrbitSemanticColors.statusAmber else OrbitSemanticColors.statusGreen

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = if (hasWaiting) 1.5.dp else 1.dp,
                color = if (hasWaiting) StatusAmber.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outline,
                shape = cardShape
            ),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
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
                        text = stringResource(R.string.dashboard_waiting_widget_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(R.string.dashboard_waiting_widget_subtitle),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                CompactStatusChip(
                    label = stringResource(R.string.widget_pending_count_badge, waitingIntents.size),
                    foreground = badgeFg,
                    background = badgeBg
                )
            }

            if (waitingIntents.isEmpty()) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.dashboard_waiting_widget_empty),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = OrbitSemanticColors.statusGreen,
                        fontWeight = FontWeight.Medium
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    waitingIntents.take(3).forEach { intent ->
                        val title = intent.display.title?.takeIf { it.isNotBlank() }
                            ?: "#${intent.externalRefId}"
                        val meta = buildList {
                            intent.provider?.takeIf { it.isNotBlank() }?.let { add(providerDisplayName(it)) }
                            intent.senderNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
                            intent.trxId?.takeIf { it.isNotBlank() }?.let { add(it) }
                        }.joinToString(" · ")
                        val amount = formatCleanBdt(intent.paidAmount ?: intent.uniqueAmount)

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                                .clickable { onInspectIntent(intent) },
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    if (meta.isNotBlank()) {
                                        Text(
                                            text = meta,
                                            style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                                Text(
                                    text = amount,
                                    style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Button(
                                    onClick = { onApproveIntent(intent) },
                                    modifier = Modifier.heightIn(min = 38.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        text = stringResource(R.string.dashboard_waiting_widget_approve),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (canPin) {
                OutlinedButton(
                    onClick = {
                        if (PendingPaymentsWidgetProvider.requestPinWidget(context)) {
                            pinFeedback = true
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Icon(
                        imageVector = Icons.Default.Widgets,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(
                        text = if (pinFeedback) {
                            stringResource(R.string.widget_pin_added)
                        } else {
                            stringResource(R.string.dashboard_waiting_widget_pin)
                        },
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
        }
    }
}

@Composable
private fun QuietLiveStatusLine(
    isOnline: Boolean,
    onlineDeviceCount: Int,
    totalDeviceCount: Int,
    pendingUploadCount: Int
) {
    val dotColor = if (isOnline) StatusGreen else StatusAmber
    val baseStatus = when {
        !isOnline -> stringResource(R.string.dashboard_status_offline_simple)
        totalDeviceCount > 1 -> stringResource(R.string.dashboard_devices_online, onlineDeviceCount, totalDeviceCount)
        totalDeviceCount == 1 && onlineDeviceCount >= 1 -> stringResource(R.string.dashboard_single_device_online)
        totalDeviceCount == 1 -> stringResource(R.string.dashboard_devices_online, onlineDeviceCount, totalDeviceCount)
        else -> stringResource(R.string.dashboard_status_online_simple)
    }
    val fullStatus = if (pendingUploadCount > 0) {
        "$baseStatus · ${stringResource(R.string.dashboard_queued_count, pendingUploadCount)}"
    } else {
        baseStatus
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(dotColor)
        )
        Text(
            text = fullStatus,
            style = MaterialTheme.typography.labelMedium.copy(
                fontFeatureSettings = "tnum"
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun QuietSetupNoticeRow(
    isError: Boolean,
    message: String,
    onClick: () -> Unit
) {
    val fg = if (isError) OrbitSemanticColors.statusRed else OrbitSemanticColors.statusAmber
    val dot = if (isError) StatusRed else StatusAmber
    val shape = RoundedCornerShape(12.dp)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .border(1.dp, MaterialTheme.colorScheme.outline, shape)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = shape
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(dot)
            )
            Text(
                text = message,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
                color = fg,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun HeroSummaryAndSimRotationCard(
    totalVolume: Double,
    verifiedCount: Int,
    unclaimedCount: Int,
    wallets: List<WalletRotationDto>,
    totalDeviceCount: Int
) {
    val cardShape = RoundedCornerShape(16.dp)
    val activeWallets = remember(wallets) {
        val nonPlaceholder = wallets.filter { it.isActive && !it.isPlaceholder }
        if (nonPlaceholder.isNotEmpty()) nonPlaceholder else wallets.filter { it.isActive }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column {
            // Top Hero Section: Verified this month
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.dashboard_verified_this_month),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (unclaimedCount > 0) {
                        Text(
                            text = stringResource(R.string.dashboard_unclaimed_count_label, unclaimedCount),
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontFeatureSettings = "tnum"
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom
                ) {
                    Text(
                        text = formatCleanBdt(totalVolume),
                        style = MaterialTheme.typography.headlineLarge.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = stringResource(R.string.dashboard_verified_count_label, verifiedCount),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)

            // Bottom Strip: Active SIM Rotation
            Column(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.dashboard_sim_rotation_title),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = stringResource(R.string.dashboard_sim_rotation_limits_hint),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (activeWallets.isEmpty()) {
                    Text(
                        text = stringResource(R.string.dashboard_sim_rotation_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        activeWallets.forEach { wallet ->
                            SimRotationWalletRow(
                                wallet = wallet,
                                showDeviceName = totalDeviceCount > 1 && !wallet.deviceName.isNullOrBlank()
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SimRotationWalletRow(
    wallet: WalletRotationDto,
    showDeviceName: Boolean
) {
    val hardLimit = wallet.monthlyVolumeLimit.takeIf { it > 0.0 } ?: 300_000.0
    val safeLimit = wallet.safeVolumeLimit.takeIf { it > 0.0 } ?: 250_000.0
    val progress = (wallet.currentMonthVolume / hardLimit).toFloat().coerceIn(0f, 1f)

    val (stateLabel, dotColor, textColor) = when (wallet.rotationState.uppercase(Locale.US)) {
        "ACTIVE_PRIMARY" -> Triple(
            stringResource(R.string.dashboard_rotation_active),
            StatusGreen,
            OrbitSemanticColors.statusGreen
        )
        "SAFE_LIMIT_OVERFLOW" -> Triple(
            stringResource(R.string.dashboard_rotation_overflow),
            StatusAmber,
            OrbitSemanticColors.statusAmber
        )
        "HARD_LIMIT_REACHED" -> Triple(
            stringResource(R.string.dashboard_rotation_capped),
            StatusRed,
            OrbitSemanticColors.statusRed
        )
        "DEVICE_OFFLINE" -> Triple(
            stringResource(R.string.dashboard_rotation_offline),
            MaterialTheme.colorScheme.outlineVariant,
            MaterialTheme.colorScheme.onSurfaceVariant
        )
        "DISABLED" -> Triple(
            stringResource(R.string.dashboard_rotation_disabled),
            MaterialTheme.colorScheme.outlineVariant,
            MaterialTheme.colorScheme.onSurfaceVariant
        )
        else -> Triple(
            stringResource(R.string.dashboard_rotation_standby),
            StatusGreen.copy(alpha = 0.65f),
            MaterialTheme.colorScheme.onSurfaceVariant
        )
    }

    val meterColor = when (wallet.rotationState.uppercase(Locale.US)) {
        "SAFE_LIMIT_OVERFLOW" -> StatusAmber
        "HARD_LIMIT_REACHED" -> StatusRed
        "DEVICE_OFFLINE", "DISABLED" -> MaterialTheme.colorScheme.outlineVariant
        "ACTIVE_PRIMARY" -> StatusGreen
        else -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                ProviderDot(provider = wallet.provider, size = 8.dp)
                val slotTag = wallet.simSlotIndex?.let {
                    stringResource(R.string.dashboard_sim_slot_short, it)
                }
                val titleParts = buildList {
                    add(providerDisplayName(wallet.provider))
                    if (slotTag != null) add(slotTag) else add(wallet.walletNumber)
                    if (showDeviceName && !wallet.deviceName.isNullOrBlank()) add(wallet.deviceName)
                }
                Text(
                    text = titleParts.joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Text(
                    text = stateLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = textColor,
                    maxLines = 1
                )
            }
        }

        // Slim 4dp progress meter
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            if (progress > 0f) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(2.dp))
                        .background(meterColor)
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            val numberMeta = if (wallet.simSlotIndex != null && wallet.walletNumber.isNotBlank()) {
                "${formatCleanBdt(wallet.currentMonthVolume)} · ${wallet.walletNumber}"
            } else {
                formatCleanBdt(wallet.currentMonthVolume)
            }
            Text(
                text = numberMeta,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontFeatureSettings = "tnum"
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = stringResource(
                    R.string.dashboard_sim_limit_meter,
                    formatLimitShort(safeLimit),
                    formatLimitShort(hardLimit)
                ),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontFeatureSettings = "tnum"
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun FeedSegmentedToggle(
    selectedTab: Int,
    intentsCount: Int,
    ordersCount: Int,
    pendingOrderCount: Int,
    transactionsCount: Int,
    onSelectTab: (Int) -> Unit
) {
    val containerShape = RoundedCornerShape(14.dp)
    val pillShape = RoundedCornerShape(10.dp)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, containerShape),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = containerShape
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            val displayOrderCount = if (pendingOrderCount > 0) pendingOrderCount else ordersCount
            val tabs = listOf(
                stringResource(R.string.dashboard_tab_pending, intentsCount),
                stringResource(R.string.dashboard_tab_orders_clean, displayOrderCount),
                stringResource(R.string.dashboard_tab_sms_clean, transactionsCount)
            )

            tabs.forEachIndexed { index, title ->
                val isSelected = selectedTab == index
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .clip(pillShape)
                        .clickable { onSelectTab(index) },
                    shape = pillShape,
                    color = if (isSelected) {
                        MaterialTheme.colorScheme.surface
                    } else {
                        Color.Transparent
                    },
                    border = if (isSelected) {
                        BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                    } else {
                        null
                    }
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontFeatureSettings = "tnum"
                            ),
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.onSurface
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

@Composable
private fun CompactPaymentIntentRow(
    intent: PaymentIntentDto,
    fallbackAppName: String,
    isHighlighted: Boolean,
    onClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(14.dp)
    val borderColor = if (isHighlighted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
    val borderWidth = if (isHighlighted) 1.5.dp else 1.dp

    val displayTitle = intent.display.title?.takeIf { it.isNotBlank() }
        ?: "#${intent.externalRefId}"
    val displayApp = intent.display.appName?.takeIf { it.isNotBlank() }
        ?: fallbackAppName.takeIf { it.isNotBlank() }

    val (statusLabel, statusFg, statusBg) = intentStatusBadgeColors(intent.status)
    val primaryAmount = intent.paidAmount ?: intent.uniqueAmount
    val normalizedStatus = intent.status.uppercase(Locale.US)
    val cleanAmountText = formatCleanBdt(primaryAmount)

    val cleanedDisplaySubtitle = remember(intent.display.subtitle, displayTitle, cleanAmountText, primaryAmount) {
        val raw = intent.display.subtitle?.trim().orEmpty()
        if (raw.isBlank()) {
            null
        } else {
            val amountDigits = Regex("[^0-9.]")
            val compactCleanAmount = cleanAmountText.lowercase(Locale.US).replace(",", "").replace(" ", "")
            raw.split("·")
                .map { it.trim() }
                .filter { part ->
                    if (part.isBlank()) return@filter false
                    if (part.equals(displayTitle, ignoreCase = true)) return@filter false
                    val compactPart = part.lowercase(Locale.US).replace(",", "").replace(" ", "")
                    if (compactPart == compactCleanAmount) return@filter false
                    val parsedPartAmount = part.replace(",", "").replace(amountDigits, "").toDoubleOrNull()
                    if (parsedPartAmount != null && abs(parsedPartAmount - primaryAmount) < 0.01) {
                        return@filter false
                    }
                    true
                }
                .distinct()
                .joinToString(" · ")
                .takeIf { it.isNotBlank() }
        }
    }

    val subtitleParts = buildList {
        intent.provider?.takeIf { it.isNotBlank() }?.let { add(providerDisplayName(it)) }
        intent.trxId?.takeIf { it.isNotBlank() }?.let { add(it) }
        intent.senderNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
        if (isEmpty()) {
            cleanedDisplaySubtitle?.let { add(it) }
                ?: displayApp?.takeIf { !it.equals(displayTitle, ignoreCase = true) }?.let { add(it) }
                ?: if (!displayTitle.contains(intent.externalRefId)) add(intent.externalRefId) else Unit
        }
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(cardShape)
            .border(borderWidth, borderColor, cardShape)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = displayTitle,
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = cleanAmountText,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.SemiBold,
                    color = if (normalizedStatus == "VERIFIED") {
                        OrbitSemanticColors.statusGreen
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = subtitleParts.joinToString(" · "),
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                CompactStatusChip(
                    label = statusLabel,
                    foreground = statusFg,
                    background = statusBg
                )
            }
        }
    }
}

@Composable
private fun CompactOrderRow(
    order: MerchantOrderDto,
    onClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(14.dp)
    val normalizedMethod = order.paymentMethod.uppercase(Locale.US)
    val normalizedOrderStatus = order.orderStatus.uppercase(Locale.US)

    val methodLabel = when (normalizedMethod) {
        "COD" -> stringResource(R.string.payment_method_cod)
        "ORBIT_MFS" -> stringResource(R.string.payment_method_orbit_mfs)
        "CARD" -> stringResource(R.string.payment_method_card)
        else -> normalizedMethod
    }

    val localizedOrderStatus = when (normalizedOrderStatus) {
        "PENDING" -> stringResource(R.string.order_status_pending)
        "CONFIRMED" -> stringResource(R.string.order_status_confirmed)
        "READY_TO_SHIP" -> stringResource(R.string.order_status_ready_to_ship)
        "SHIPPED" -> stringResource(R.string.order_status_shipped)
        "DELIVERED" -> stringResource(R.string.order_status_delivered)
        "COMPLETED" -> stringResource(R.string.order_status_completed)
        "CANCELLED" -> stringResource(R.string.order_status_cancelled)
        "REJECTED" -> stringResource(R.string.order_status_rejected)
        else -> normalizedOrderStatus.replace("_", " ")
    }

    val (statusFg, statusBg) = when (normalizedOrderStatus) {
        "CONFIRMED", "DELIVERED", "COMPLETED" -> OrbitSemanticColors.statusGreen to Color(0x1A10B981)
        "READY_TO_SHIP", "SHIPPED" -> MaterialTheme.colorScheme.onSurface to MaterialTheme.colorScheme.surfaceVariant
        "CANCELLED", "REJECTED" -> OrbitSemanticColors.statusRed to Color(0x1AEF4444)
        else -> OrbitSemanticColors.statusAmber to Color(0x1AF59E0B)
    }

    val subtitleText = listOfNotNull(
        order.customerName?.takeIf { it.isNotBlank() },
        order.customerPhone?.takeIf { it.isNotBlank() },
        order.itemsSummary?.takeIf { it.isNotBlank() }
    ).take(2).joinToString(" · ").ifBlank { methodLabel }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "#${order.externalOrderId}",
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "· $methodLabel",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }

                Text(
                    text = formatCleanBdt(order.baseAmount),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = subtitleText,
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                CompactStatusChip(
                    label = localizedOrderStatus,
                    foreground = statusFg,
                    background = statusBg
                )
            }
        }
    }
}

@Composable
private fun CompactSmsRow(
    sms: SmsEntity,
    onClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(14.dp)
    val timeFormatter = remember { SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()) }
    val formattedTime = remember(sms.receivedAt) { timeFormatter.format(Date(sms.receivedAt)) }

    val (statusLabel, statusFg, statusBg) = when (sms.status) {
        SmsEntity.STATUS_VERIFIED -> Triple(
            stringResource(R.string.tx_status_verified),
            OrbitSemanticColors.statusGreen,
            Color(0x1A10B981)
        )
        SmsEntity.STATUS_PENDING_UPLOAD -> Triple(
            stringResource(R.string.tx_status_pending_upload),
            OrbitSemanticColors.statusAmber,
            Color(0x1AF59E0B)
        )
        else -> Triple(
            stringResource(R.string.tx_status_unclaimed),
            OrbitSemanticColors.statusGray,
            Color(0x1A71717A)
        )
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ProviderDot(provider = sms.provider, size = 8.dp)
                    Text(
                        text = buildString {
                            append(providerDisplayName(sms.provider))
                            append(" · ")
                            append(sms.trxId)
                            sms.simSlotIndex?.let {
                                append(" · SIM ")
                                append(it)
                            }
                        },
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Text(
                    text = formatCleanBdt(sms.amount),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.SemiBold,
                    color = OrbitSemanticColors.statusGreen
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                val metaLeft = buildString {
                    append(sms.senderNumber)
                    if (!sms.externalOrderId.isNullOrBlank()) {
                        append(" · #")
                        append(sms.externalOrderId)
                    }
                    append(" · ")
                    append(formattedTime)
                }
                Text(
                    text = metaLeft,
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 10.dp),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                CompactStatusChip(
                    label = statusLabel,
                    foreground = statusFg,
                    background = statusBg
                )
            }
        }
    }
}

@Composable
private fun CompactStatusChip(
    label: String,
    foreground: Color,
    background: Color
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = background
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OrderDetailSheetContent(
    order: MerchantOrderDto,
    isActionInProgress: Boolean,
    onActionClick: (String) -> Unit
) {
    val normalizedOrderStatus = order.orderStatus.uppercase(Locale.US)
    val normalizedPaymentStatus = order.paymentStatus.uppercase(Locale.US)
    val normalizedMethod = order.paymentMethod.uppercase(Locale.US)
    val redFg = OrbitSemanticColors.statusRed

    val methodLabel = when (normalizedMethod) {
        "COD" -> stringResource(R.string.payment_method_cod)
        "ORBIT_MFS" -> stringResource(R.string.payment_method_orbit_mfs)
        "CARD" -> stringResource(R.string.payment_method_card)
        else -> normalizedMethod.replace("_", " ")
    }

    val localizedOrderStatus = when (normalizedOrderStatus) {
        "PENDING" -> stringResource(R.string.order_status_pending)
        "CONFIRMED" -> stringResource(R.string.order_status_confirmed)
        "READY_TO_SHIP" -> stringResource(R.string.order_status_ready_to_ship)
        "SHIPPED" -> stringResource(R.string.order_status_shipped)
        "DELIVERED" -> stringResource(R.string.order_status_delivered)
        "COMPLETED" -> stringResource(R.string.order_status_completed)
        "CANCELLED" -> stringResource(R.string.order_status_cancelled)
        "REJECTED" -> stringResource(R.string.order_status_rejected)
        else -> normalizedOrderStatus.replace("_", " ")
    }

    val (orderStatusFg, orderStatusBg) = when (normalizedOrderStatus) {
        "CONFIRMED", "DELIVERED", "COMPLETED" -> OrbitSemanticColors.statusGreen to Color(0x1A10B981)
        "READY_TO_SHIP", "SHIPPED" -> MaterialTheme.colorScheme.onSurface to MaterialTheme.colorScheme.surfaceVariant
        "CANCELLED", "REJECTED" -> OrbitSemanticColors.statusRed to Color(0x1AEF4444)
        else -> OrbitSemanticColors.statusAmber to Color(0x1AF59E0B)
    }

    val localizedPaymentStatus = when (normalizedPaymentStatus) {
        "PENDING" -> stringResource(R.string.pay_status_pending)
        "PAID" -> stringResource(R.string.pay_status_paid)
        "VERIFIED" -> stringResource(R.string.pay_status_verified)
        "FAILED" -> stringResource(R.string.pay_status_failed)
        "REFUNDED" -> stringResource(R.string.pay_status_refunded)
        else -> normalizedPaymentStatus.replace("_", " ")
    }

    val (payStatusFg, payStatusBg) = when (normalizedPaymentStatus) {
        "PAID", "VERIFIED" -> OrbitSemanticColors.statusGreen to Color(0x1A10B981)
        "FAILED" -> OrbitSemanticColors.statusRed to Color(0x1AEF4444)
        "REFUNDED" -> OrbitSemanticColors.statusGray to Color(0x1A71717A)
        else -> OrbitSemanticColors.statusAmber to Color(0x1AF59E0B)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "#${order.externalOrderId}",
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = formatCleanBdt(order.baseAmount),
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            CompactStatusChip(
                label = methodLabel,
                foreground = MaterialTheme.colorScheme.onSurfaceVariant,
                background = MaterialTheme.colorScheme.surfaceVariant
            )
            CompactStatusChip(
                label = localizedOrderStatus,
                foreground = orderStatusFg,
                background = orderStatusBg
            )
            if (localizedPaymentStatus != localizedOrderStatus) {
                CompactStatusChip(
                    label = localizedPaymentStatus,
                    foreground = payStatusFg,
                    background = payStatusBg
                )
            }
        }

        HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)

        val customerLine = listOfNotNull(
            order.customerName?.trim()?.takeIf { it.isNotBlank() },
            order.customerPhone?.trim()?.takeIf { it.isNotBlank() }
        ).distinct().joinToString(" · ")
        if (customerLine.isNotBlank()) {
            SheetMetaRow(stringResource(R.string.dashboard_detail_customer), customerLine)
        }
        order.itemsSummary?.trim()?.takeIf { it.isNotBlank() }?.let {
            SheetMetaRow(stringResource(R.string.dashboard_detail_items), it)
        }
        order.shippingAddress?.trim()?.takeIf { it.isNotBlank() }?.let {
            SheetMetaRow(stringResource(R.string.dashboard_detail_address), it)
        }

        val isTerminal = normalizedOrderStatus in setOf("CANCELLED", "DELIVERED", "COMPLETED")
        if (!isTerminal) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val btnShape = RoundedCornerShape(12.dp)
                val isPendingConfirm = normalizedOrderStatus in setOf(
                    "PENDING", "NEW", "PLACED", "UNCONFIRMED", "AWAITING_CONFIRMATION"
                )

                if (isPendingConfirm) {
                    Button(
                        onClick = { onActionClick("CONFIRM") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary
                        )
                    ) {
                        if (isActionInProgress) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(stringResource(R.string.order_action_confirm), style = MaterialTheme.typography.labelLarge)
                    }
                }

                if (normalizedOrderStatus !in setOf("READY_TO_SHIP", "SHIPPED")) {
                    val isPrimaryStep = normalizedOrderStatus == "CONFIRMED"
                    if (isPrimaryStep) {
                        Button(
                            onClick = { onActionClick("READY_TO_SHIP") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(stringResource(R.string.order_action_ready_to_ship), style = MaterialTheme.typography.labelLarge)
                        }
                    } else {
                        OutlinedButton(
                            onClick = { onActionClick("READY_TO_SHIP") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(stringResource(R.string.order_action_ready_to_ship), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }

                if (normalizedOrderStatus != "SHIPPED") {
                    val isPrimaryShip = normalizedOrderStatus == "READY_TO_SHIP"
                    if (isPrimaryShip) {
                        Button(
                            onClick = { onActionClick("SHIP") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(stringResource(R.string.order_action_mark_shipped), style = MaterialTheme.typography.labelLarge)
                        }
                    } else {
                        OutlinedButton(
                            onClick = { onActionClick("SHIP") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(stringResource(R.string.order_action_mark_shipped), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }

                if (normalizedPaymentStatus != "PAID") {
                    Button(
                        onClick = { onActionClick("MARK_PAID") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary
                        )
                    ) {
                        Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(stringResource(R.string.order_action_mark_paid), style = MaterialTheme.typography.labelLarge)
                    }
                }

                if (normalizedOrderStatus != "SHIPPED") {
                    OutlinedButton(
                        onClick = { onActionClick("CANCEL") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape,
                        border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = redFg)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(stringResource(R.string.order_action_cancel), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun SmsDetailSheetContent(sms: SmsEntity) {
    val timeFormatter = remember { SimpleDateFormat("dd MMM yyyy, hh:mm:ss a", Locale.getDefault()) }
    val formattedTime = remember(sms.receivedAt) { timeFormatter.format(Date(sms.receivedAt)) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
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
                ProviderDot(provider = sms.provider, size = 10.dp)
                Text(
                    text = providerDisplayName(sms.provider),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Text(
                text = formatCleanBdt(sms.amount),
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                fontWeight = FontWeight.SemiBold,
                color = OrbitSemanticColors.statusGreen
            )
        }

        HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)

        SheetMetaRow(stringResource(R.string.history_detail_trx_id), sms.trxId, monospace = true)
        SheetMetaRow(stringResource(R.string.history_detail_sender), sms.senderNumber, monospace = true)
        sms.simSlotIndex?.let {
            SheetMetaRow(
                stringResource(R.string.dashboard_detail_sim_slot),
                stringResource(R.string.dashboard_sim_slot_short, it)
            )
        }
        sms.receiverNumber?.takeIf { it.isNotBlank() }?.let {
            SheetMetaRow(stringResource(R.string.dashboard_detail_receiver), it, monospace = true)
        }
        if (sms.smsSender.isNotBlank()) {
            SheetMetaRow(stringResource(R.string.history_detail_sms_sender), sms.smsSender)
        }
        SheetMetaRow(stringResource(R.string.history_detail_source), sms.source)
        SheetMetaRow(stringResource(R.string.history_detail_status), sms.status)
        sms.externalOrderId?.takeIf { it.isNotBlank() }?.let {
            SheetMetaRow(stringResource(R.string.history_detail_order_id), "#$it", monospace = true)
        }
        SheetMetaRow(stringResource(R.string.history_detail_received_at), formattedTime)

        Text(
            text = stringResource(R.string.history_detail_raw_sms),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(12.dp)
        ) {
            SelectionContainer {
                Text(
                    text = sms.rawSms,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun SheetMetaRow(
    label: String,
    value: String,
    monospace: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.85f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
            fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1.15f)
        )
    }
}

@Composable
fun IntentsLoadingCard() {
    val cardShape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.size(12.dp))
            Text(
                text = stringResource(R.string.dashboard_loading_intents),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun EmptyIntentsStateCard(onRefresh: () -> Unit) {
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Payments,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(32.dp)
            )
            Text(
                text = stringResource(R.string.dashboard_empty_intents_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = stringResource(R.string.dashboard_empty_intents_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 8.dp),
                textAlign = TextAlign.Center
            )
            OutlinedButton(
                onClick = onRefresh,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = stringResource(R.string.action_refresh_intents),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
fun OrdersLoadingCard() {
    val cardShape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.size(12.dp))
            Text(
                text = stringResource(R.string.dashboard_loading_orders),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun EmptyOrdersStateCard(onRefresh: () -> Unit) {
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.ReceiptLong,
                contentDescription = stringResource(R.string.cd_empty_orders),
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(32.dp)
            )
            Text(
                text = stringResource(R.string.dashboard_empty_orders_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = stringResource(R.string.dashboard_empty_orders_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 8.dp),
                textAlign = TextAlign.Center
            )
            OutlinedButton(
                onClick = onRefresh,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = stringResource(R.string.action_refresh_orders),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
fun EmptyStateCard() {
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Payments,
                contentDescription = stringResource(R.string.cd_empty_transactions),
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(32.dp)
            )
            Text(
                text = stringResource(R.string.dashboard_empty_tx_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = stringResource(R.string.dashboard_empty_tx_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

private fun formatCleanBdt(amount: Double): String {
    val hasFraction = abs(amount - amount.toLong().toDouble()) >= 0.005
    val formatter = NumberFormat.getNumberInstance(Locale.US).apply {
        minimumFractionDigits = if (hasFraction) 2 else 0
        maximumFractionDigits = if (hasFraction) 2 else 0
    }
    return "৳ ${formatter.format(amount)}"
}

private fun formatLimitShort(limit: Double): String {
    return when {
        limit >= 100_000.0 -> {
            val lakhs = limit / 100_000.0
            if (abs(lakhs - lakhs.toLong()) < 0.05) {
                "৳${lakhs.toLong()}.0L"
            } else {
                "৳${String.format(Locale.US, "%.1f", lakhs)}L"
            }
        }
        limit >= 1_000.0 -> "৳${(limit / 1_000.0).toInt()}k"
        else -> "৳${limit.toInt()}"
    }
}
