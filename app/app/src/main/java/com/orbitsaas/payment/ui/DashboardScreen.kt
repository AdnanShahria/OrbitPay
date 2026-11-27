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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.data.remote.DevicePreflightData
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.ui.components.ApproveIntentDialog
import com.orbitsaas.payment.ui.components.PaymentIntentCard
import com.orbitsaas.payment.ui.components.RejectIntentDialog
import com.orbitsaas.payment.ui.theme.ColorBkash
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGray
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    val amberTextColor = OrbitSemanticColors.statusAmber

    LaunchedEffect(state.focusedPaymentIntentId) {
        if (!state.focusedPaymentIntentId.isNullOrBlank()) {
            selectedFeedTab = 0
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
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = state.storeName.ifBlank { stringResource(R.string.app_name) },
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            val manualReviewCount = state.paymentIntents.count {
                                it.status.uppercase() in setOf("MANUAL_REVIEW_REQUIRED", "WAITING_FOR_SMS")
                            }
                            val totalPendingBadge = state.pendingOrderCount + manualReviewCount
                            if (totalPendingBadge > 0) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = StatusAmberBg,
                                    modifier = Modifier.border(
                                        width = 1.dp,
                                        color = StatusAmber.copy(alpha = 0.4f),
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                ) {
                                    Text(
                                        text = pluralStringResource(
                                            R.plurals.dashboard_pending_orders,
                                            totalPendingBadge,
                                            totalPendingBadge
                                        ),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontFeatureSettings = "tnum"
                                        ),
                                        fontWeight = FontWeight.SemiBold,
                                        color = amberTextColor,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                        if (state.merchantId.isNotBlank()) {
                            Text(
                                text = state.merchantId,
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontFeatureSettings = "tnum"
                                ),
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
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
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(
                        onClick = onSyncClick,
                        enabled = !state.isSyncing,
                        modifier = Modifier.size(48.dp)
                    ) {
                        if (state.isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = stringResource(R.string.action_sync_now),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
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
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onSyncClick,
                modifier = Modifier.heightIn(min = 48.dp),
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                shape = CircleShape
            ) {
                if (state.isSyncing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Sync,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = stringResource(R.string.action_sync_now),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Connection Status Banner / Pill
            item {
                ConnectionStatusPill(
                    isOnline = state.isOnline,
                    isSyncing = state.isSyncing,
                    pendingCount = state.pendingUploadCount
                )
            }

            // 1b. Preflight / Number Profile Banner
            state.preflightState?.let { preflight ->
                item {
                    PreflightStatusBanner(
                        preflight = preflight,
                        onClick = onOpenDiagnostics
                    )
                }
            }

            // 2. Three Metric Cards
            item {
                MetricCardsSection(
                    totalVolume = state.totalVerifiedVolume,
                    verifiedOrders = state.verifiedCount,
                    unclaimedCount = state.unclaimedCount
                )
            }

            // 3. Segmented Feed Toggle: Payments vs Orders vs Live MFS Feed
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

            // 4. Tab Content
            when (selectedFeedTab) {
                0 -> {
                    if (state.isIntentsLoading && state.paymentIntents.isEmpty()) {
                        item {
                            IntentsLoadingCard()
                        }
                    } else if (state.paymentIntents.isEmpty()) {
                        item {
                            EmptyIntentsStateCard(onRefresh = onRefreshIntents)
                        }
                    } else {
                        items(state.paymentIntents, key = { it.id }) { intent ->
                            val isFocused = state.focusedPaymentIntentId != null &&
                                (intent.id == state.focusedPaymentIntentId ||
                                    intent.externalRefId == state.focusedPaymentIntentId)
                            PaymentIntentCard(
                                intent = intent,
                                serverBaseUrl = state.serverUrl,
                                fallbackAppName = state.storeName,
                                isHighlighted = isFocused,
                                isActionInProgress = state.actionInProgressIntentId == intent.id,
                                onApproveClick = {
                                    if (isFocused) onClearFocusedIntent()
                                    pendingApproveIntent = intent
                                },
                                onRejectClick = {
                                    if (isFocused) onClearFocusedIntent()
                                    pendingRejectIntent = intent
                                },
                                onDynamicActionClick = { action ->
                                    if (isFocused) onClearFocusedIntent()
                                    onTriggerIntentAction(intent.id, action.id, action.label)
                                }
                            )
                        }
                    }
                }

                1 -> {
                    if (state.isOrdersLoading && state.orders.isEmpty()) {
                        item {
                            OrdersLoadingCard()
                        }
                    } else if (state.orders.isEmpty()) {
                        item {
                            EmptyOrdersStateCard(onRefresh = onRefreshOrders)
                        }
                    } else {
                        items(state.orders, key = { it.externalOrderId }) { order ->
                            MerchantOrderCard(
                                order = order,
                                isActionInProgress = state.actionInProgressOrderId == order.externalOrderId,
                                onActionClick = { action ->
                                    onOrderAction(order.externalOrderId, action)
                                }
                            )
                        }
                    }
                }

                else -> {
                    if (state.transactions.isEmpty()) {
                        item {
                            EmptyStateCard()
                        }
                    } else {
                        items(state.transactions, key = { it.id }) { sms ->
                            TransactionItemCard(sms = sms)
                        }
                    }
                }
            }
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
fun FeedSegmentedToggle(
    selectedTab: Int,
    intentsCount: Int,
    ordersCount: Int,
    pendingOrderCount: Int,
    transactionsCount: Int,
    onSelectTab: (Int) -> Unit
) {
    val containerShape = RoundedCornerShape(16.dp)
    val pillShape = RoundedCornerShape(12.dp)

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
                stringResource(R.string.dashboard_tab_payments, intentsCount),
                stringResource(R.string.dashboard_tab_orders_short, displayOrderCount),
                stringResource(R.string.dashboard_tab_mfs_short, transactionsCount)
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
                        MaterialTheme.colorScheme.primary
                    } else {
                        Color.Transparent
                    }
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontFeatureSettings = "tnum"
                            ),
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MerchantOrderCard(
    order: MerchantOrderDto,
    isActionInProgress: Boolean,
    onActionClick: (String) -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    val currencyFormat = remember {
        NumberFormat.getNumberInstance(Locale.US).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }
    }

    val greenFg = OrbitSemanticColors.statusGreen
    val amberFg = OrbitSemanticColors.statusAmber
    val redFg = OrbitSemanticColors.statusRed
    val bkashFg = OrbitSemanticColors.providerColor("BKASH")

    val normalizedMethod = order.paymentMethod.uppercase()
    val normalizedOrderStatus = order.orderStatus.uppercase()
    val normalizedPaymentStatus = order.paymentStatus.uppercase()

    val methodLabel = when (normalizedMethod) {
        "COD" -> stringResource(R.string.payment_method_cod)
        "ORBIT_MFS" -> stringResource(R.string.payment_method_orbit_mfs)
        "CARD" -> stringResource(R.string.payment_method_card)
        else -> normalizedMethod
    }

    val (methodBg, methodFg) = when (normalizedMethod) {
        "COD" -> StatusAmberBg to amberFg
        "ORBIT_MFS" -> ColorBkash.copy(alpha = 0.14f) to bkashFg
        "CARD" -> StatusGreenBg to greenFg
        else -> StatusGrayBg to MaterialTheme.colorScheme.onSurfaceVariant
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

    val (orderStatusBg, orderStatusFg) = when (normalizedOrderStatus) {
        "CONFIRMED", "DELIVERED", "COMPLETED" -> StatusGreenBg to greenFg
        "READY_TO_SHIP", "SHIPPED" -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurface
        "CANCELLED", "REJECTED" -> StatusRedBg to redFg
        else -> StatusAmberBg to amberFg
    }

    val localizedPaymentStatus = when (normalizedPaymentStatus) {
        "PENDING" -> stringResource(R.string.pay_status_pending)
        "PAID" -> stringResource(R.string.pay_status_paid)
        "VERIFIED" -> stringResource(R.string.pay_status_verified)
        "FAILED" -> stringResource(R.string.pay_status_failed)
        "REFUNDED" -> stringResource(R.string.pay_status_refunded)
        else -> normalizedPaymentStatus.replace("_", " ")
    }

    val (payStatusBg, payStatusFg) = when (normalizedPaymentStatus) {
        "PAID", "VERIFIED" -> StatusGreenBg to greenFg
        "FAILED", "REFUNDED" -> StatusRedBg to redFg
        else -> StatusGrayBg to MaterialTheme.colorScheme.onSurfaceVariant
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
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Top Row: Order ID + Payment Method Badge + Amount
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
                    Text(
                        text = "#${order.externalOrderId}",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = methodBg,
                        modifier = Modifier.border(
                            width = 1.dp,
                            color = methodFg.copy(alpha = 0.35f),
                            shape = RoundedCornerShape(8.dp)
                        )
                    ) {
                        Text(
                            text = methodLabel,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = methodFg,
                            maxLines = 1
                        )
                    }
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = stringResource(
                            R.string.currency_bdt_amount,
                            currencyFormat.format(order.baseAmount)
                        ),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (order.paidAmount > 0.0 && order.paidAmount < order.baseAmount) {
                        Text(
                            text = stringResource(
                                R.string.order_paid_amount,
                                currencyFormat.format(order.paidAmount)
                            ),
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontFeatureSettings = "tnum"
                            ),
                            color = greenFg
                        )
                    }
                }
            }

            // Status Badges Row: Order Status + Payment Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = orderStatusBg,
                    modifier = Modifier.border(
                        width = 1.dp,
                        color = orderStatusFg.copy(alpha = 0.35f),
                        shape = RoundedCornerShape(8.dp)
                    )
                ) {
                    Text(
                        text = stringResource(R.string.order_status_label, localizedOrderStatus),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = orderStatusFg
                    )
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = payStatusBg,
                    modifier = Modifier.border(
                        width = 1.dp,
                        color = payStatusFg.copy(alpha = 0.3f),
                        shape = RoundedCornerShape(8.dp)
                    )
                ) {
                    Text(
                        text = stringResource(R.string.payment_status_label, localizedPaymentStatus),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Medium,
                        color = payStatusFg
                    )
                }
            }

            // Customer & Items Details
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val customerLabel = listOfNotNull(
                    order.customerName?.takeIf { it.isNotBlank() },
                    order.customerPhone?.takeIf { it.isNotBlank() }
                ).joinToString(" · ")

                if (customerLabel.isNotBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = customerLabel,
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontFeatureSettings = "tnum"
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (!order.itemsSummary.isNullOrBlank()) {
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ShoppingBag,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .padding(top = 2.dp)
                                .size(16.dp)
                        )
                        Text(
                            text = order.itemsSummary,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            // 1-Tap Bi-directional Action Buttons (>= 48dp touch targets)
            val isTerminal = normalizedOrderStatus in setOf("CANCELLED", "DELIVERED", "COMPLETED")
            if (!isTerminal) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val btnShape = RoundedCornerShape(12.dp)
                    val isPendingConfirm = normalizedOrderStatus in setOf("PENDING", "NEW", "PLACED", "UNCONFIRMED", "AWAITING_CONFIRMATION")

                    if (isPendingConfirm) {
                        Button(
                            onClick = { onActionClick("CONFIRM") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
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
                            Text(
                                text = stringResource(R.string.order_action_confirm),
                                style = MaterialTheme.typography.labelLarge
                            )
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
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                )
                            ) {
                                Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.size(8.dp))
                                Text(
                                    text = stringResource(R.string.order_action_ready_to_ship),
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }
                        } else {
                            OutlinedButton(
                                onClick = { onActionClick("READY_TO_SHIP") },
                                enabled = !isActionInProgress,
                                modifier = Modifier.heightIn(min = 48.dp),
                                shape = btnShape,
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                            ) {
                                Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.size(8.dp))
                                Text(
                                    text = stringResource(R.string.order_action_ready_to_ship),
                                    style = MaterialTheme.typography.labelLarge
                                )
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
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                )
                            ) {
                                Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.size(8.dp))
                                Text(
                                    text = stringResource(R.string.order_action_mark_shipped),
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }
                        } else {
                            OutlinedButton(
                                onClick = { onActionClick("SHIP") },
                                enabled = !isActionInProgress,
                                modifier = Modifier.heightIn(min = 48.dp),
                                shape = btnShape,
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                            ) {
                                Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.size(8.dp))
                                Text(
                                    text = stringResource(R.string.order_action_mark_shipped),
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }
                        }
                    }

                    if (normalizedPaymentStatus != "PAID") {
                        Button(
                            onClick = { onActionClick("MARK_PAID") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(
                                text = stringResource(R.string.order_action_mark_paid),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }

                    if (normalizedOrderStatus != "SHIPPED") {
                        OutlinedButton(
                            onClick = { onActionClick("CANCEL") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = redFg)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(8.dp))
                            Text(
                                text = stringResource(R.string.order_action_cancel),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }
                }
            }
        }
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
                modifier = Modifier.size(36.dp)
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
                modifier = Modifier.size(36.dp)
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
fun PreflightStatusBanner(
    preflight: DevicePreflightData,
    onClick: () -> Unit
) {
    val normalizedStatus = preflight.overallStatus.uppercase(Locale.US)
    val isReady = normalizedStatus == "READY"
    val isError = normalizedStatus == "ERROR"

    val bgColor = when {
        isReady -> StatusGreenBg
        isError -> StatusRedBg
        else -> StatusAmberBg
    }
    val borderColor = when {
        isReady -> StatusGreen
        isError -> StatusRed
        else -> StatusAmber
    }
    val fgColor = when {
        isReady -> OrbitSemanticColors.statusGreen
        isError -> OrbitSemanticColors.statusRed
        else -> OrbitSemanticColors.statusAmber
    }
    val leadingIcon = when {
        isReady -> Icons.Default.VerifiedUser
        isError -> Icons.Default.Error
        else -> Icons.Default.Warning
    }
    val titleText = when {
        isReady -> stringResource(R.string.dashboard_preflight_ready_title)
        isError -> stringResource(R.string.dashboard_preflight_error_title)
        else -> stringResource(R.string.dashboard_preflight_action_title)
    }
    val subtitleText = if (isReady) {
        stringResource(R.string.dashboard_preflight_ready_desc, preflight.walletSummary.activeCount)
    } else {
        preflight.recommendations.firstOrNull()?.takeIf { it.isNotBlank() }
            ?: stringResource(R.string.dashboard_preflight_action_fallback, preflight.walletSummary.activeCount)
    }
    val actionLabel = stringResource(
        if (isReady) R.string.dashboard_preflight_tap_view else R.string.dashboard_preflight_tap_fix
    )
    val shape = RoundedCornerShape(16.dp)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .border(1.dp, borderColor.copy(alpha = 0.38f), shape)
            .clickable(onClick = onClick),
        color = bgColor,
        shape = shape
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = fgColor,
                modifier = Modifier.size(20.dp)
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = titleText,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = fgColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = subtitleText,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = actionLabel,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = fgColor
                )
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = fgColor,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
fun ConnectionStatusPill(
    isOnline: Boolean,
    isSyncing: Boolean,
    pendingCount: Int
) {
    val pillBg = if (isOnline) StatusGreenBg else StatusAmberBg
    val pillBorder = if (isOnline) StatusGreen else StatusAmber
    val dotColor = if (isOnline) StatusGreen else StatusAmber
    val textColor = if (isOnline) OrbitSemanticColors.statusGreen else OrbitSemanticColors.statusAmber

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, pillBorder.copy(alpha = 0.35f), RoundedCornerShape(16.dp)),
        color = pillBg,
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = when {
                            isSyncing -> stringResource(R.string.status_syncing_hub)
                            isOnline -> stringResource(R.string.status_online_syncing)
                            else -> stringResource(R.string.status_offline_queue)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = textColor
                    )
                    Text(
                        text = if (pendingCount > 0) {
                            pluralStringResource(R.plurals.status_pending_uploads, pendingCount, pendingCount)
                        } else {
                            stringResource(R.string.status_all_synced)
                        },
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Icon(
                imageVector = if (isOnline) Icons.Default.Wifi else Icons.Default.WifiOff,
                contentDescription = stringResource(
                    if (isOnline) R.string.cd_status_online else R.string.cd_status_offline
                ),
                tint = textColor,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
fun MetricCardsSection(
    totalVolume: Double,
    verifiedOrders: Int,
    unclaimedCount: Int
) {
    val currencyFormat = remember {
        NumberFormat.getNumberInstance(Locale.US).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Card 1: Total Verified Volume
        MetricCard(
            modifier = Modifier.weight(1.3f),
            label = stringResource(R.string.metric_total_verified),
            value = stringResource(R.string.currency_bdt_amount, currencyFormat.format(totalVolume)),
            badgeText = stringResource(R.string.metric_store_volume),
            badgeFgColor = OrbitSemanticColors.statusGreen,
            badgeBgColor = StatusGreenBg
        )

        // Card 2: Verified Orders
        MetricCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.metric_verified),
            value = verifiedOrders.toString(),
            badgeText = stringResource(R.string.metric_orders),
            badgeFgColor = MaterialTheme.colorScheme.primary,
            badgeBgColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
        )

        // Card 3: Unclaimed SMS
        MetricCard(
            modifier = Modifier.weight(1f),
            label = stringResource(R.string.metric_unclaimed),
            value = unclaimedCount.toString(),
            badgeText = stringResource(R.string.metric_personal_queue),
            badgeFgColor = OrbitSemanticColors.statusGray,
            badgeBgColor = StatusGrayBg
        )
    }
}

@Composable
fun MetricCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    badgeText: String,
    badgeFgColor: Color,
    badgeBgColor: Color = badgeFgColor.copy(alpha = 0.12f)
) {
    val cardShape = RoundedCornerShape(16.dp)

    Card(
        modifier = modifier.border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
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
                style = MaterialTheme.typography.titleMedium.copy(
                    fontFeatureSettings = "tnum"
                ),
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = badgeBgColor
            ) {
                Text(
                    text = badgeText,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = badgeFgColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
fun TransactionItemCard(sms: SmsEntity) {
    val providerColor = OrbitSemanticColors.providerColor(sms.provider)
    val greenFg = OrbitSemanticColors.statusGreen
    val amberFg = OrbitSemanticColors.statusAmber

    val timeFormatter = remember { SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()) }
    val formattedTime = remember(sms.receivedAt) { timeFormatter.format(Date(sms.receivedAt)) }
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
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Top row: Provider Chip, TrxID, and Amount
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
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = providerColor.copy(alpha = 0.14f),
                        modifier = Modifier.border(
                            width = 1.dp,
                            color = providerColor.copy(alpha = 0.35f),
                            shape = RoundedCornerShape(8.dp)
                        )
                    ) {
                        Text(
                            text = sms.provider,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = providerColor
                        )
                    }

                    Text(
                        text = sms.trxId,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Text(
                    text = stringResource(
                        R.string.currency_bdt_amount,
                        String.format(Locale.US, "%.2f", sms.amount)
                    ),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.Bold,
                    color = greenFg
                )
            }

            // Middle row: Sender Phone and Timestamp
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.tx_from_sender, sms.senderNumber),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = formattedTime,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.outlineVariant
                )
            }

            // Bottom row: Verification Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                when (sms.status) {
                    SmsEntity.STATUS_VERIFIED -> {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = StatusGreenBg,
                            modifier = Modifier.border(
                                width = 1.dp,
                                color = StatusGreen.copy(alpha = 0.35f),
                                shape = RoundedCornerShape(8.dp)
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = greenFg,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = if (sms.externalOrderId != null) {
                                        stringResource(R.string.tx_status_verified_order, sms.externalOrderId)
                                    } else {
                                        stringResource(R.string.tx_status_verified)
                                    },
                                    style = MaterialTheme.typography.labelMedium.copy(
                                        fontFeatureSettings = "tnum"
                                    ),
                                    fontWeight = FontWeight.SemiBold,
                                    color = greenFg
                                )
                            }
                        }
                    }
                    SmsEntity.STATUS_PENDING_UPLOAD -> {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = StatusAmberBg,
                            modifier = Modifier.border(
                                width = 1.dp,
                                color = StatusAmber.copy(alpha = 0.35f),
                                shape = RoundedCornerShape(8.dp)
                            )
                        ) {
                            Text(
                                text = stringResource(R.string.tx_status_pending_upload),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = amberFg
                            )
                        }
                    }
                    else -> {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = StatusGrayBg,
                            modifier = Modifier.border(
                                width = 1.dp,
                                color = StatusGray.copy(alpha = 0.3f),
                                shape = RoundedCornerShape(8.dp)
                            )
                        ) {
                            Text(
                                text = stringResource(R.string.tx_status_unclaimed),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = stringResource(R.string.cd_empty_transactions),
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(36.dp)
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
                modifier = Modifier.padding(horizontal = 12.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}
