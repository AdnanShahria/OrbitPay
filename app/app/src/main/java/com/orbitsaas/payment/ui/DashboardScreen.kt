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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DarkMode
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.ui.theme.ColorBkash
import com.orbitsaas.payment.ui.theme.ColorCellfin
import com.orbitsaas.payment.ui.theme.ColorNagad
import com.orbitsaas.payment.ui.theme.ColorRocket
import com.orbitsaas.payment.ui.theme.ColorUpay
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
    onRefreshOrders: () -> Unit = {}
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedFeedTab by rememberSaveable { mutableIntStateOf(0) }

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
                                text = state.storeName.ifBlank { "ORBIT Pay" },
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (state.pendingOrderCount > 0) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = StatusAmberBg,
                                    modifier = Modifier.border(
                                        width = 1.dp,
                                        color = StatusAmber.copy(alpha = 0.4f),
                                        shape = RoundedCornerShape(10.dp)
                                    )
                                ) {
                                    Text(
                                        text = "${state.pendingOrderCount} pending",
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontFeatureSettings = "tnum"
                                        ),
                                        fontWeight = FontWeight.SemiBold,
                                        color = StatusAmber,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                        if (state.merchantId.isNotBlank()) {
                            Text(
                                text = state.merchantId,
                                style = MaterialTheme.typography.labelMedium,
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
                            contentDescription = if (state.isDarkTheme) "Switch to White theme" else "Switch to Black theme",
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
                                contentDescription = "Sync now",
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
                            contentDescription = "Settings",
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
                        modifier = Modifier.padding(horizontal = 18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Sync,
                            contentDescription = "Sync now",
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = "Sync now",
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
            contentPadding = PaddingValues(top = 4.dp, bottom = 96.dp),
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

            // 2. Three Metric Cards
            item {
                MetricCardsSection(
                    totalVolume = state.totalVerifiedVolume,
                    verifiedOrders = state.verifiedCount,
                    unclaimedCount = state.unclaimedCount
                )
            }

            // 3. Segmented Feed Toggle: Orders & Alerts vs Live MFS Feed
            item {
                FeedSegmentedToggle(
                    selectedTab = selectedFeedTab,
                    ordersCount = state.orders.size,
                    pendingOrderCount = state.pendingOrderCount,
                    transactionsCount = state.transactions.size,
                    onSelectTab = { tab ->
                        selectedFeedTab = tab
                        if (tab == 0) {
                            onRefreshOrders()
                        }
                    }
                )
            }

            // 4. Tab Content
            if (selectedFeedTab == 0) {
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
            } else {
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

@Composable
fun FeedSegmentedToggle(
    selectedTab: Int,
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
            val ordersLabel = if (pendingOrderCount > 0) {
                "Orders & Alerts ($pendingOrderCount)"
            } else {
                "Orders & Alerts ($ordersCount)"
            }
            val tabs = listOf(
                ordersLabel,
                "Live MFS Feed ($transactionsCount)"
            )

            tabs.forEachIndexed { index, title ->
                val isSelected = selectedTab == index
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .clip(pillShape)
                        .clickable { onSelectTab(index) },
                    shape = pillShape,
                    color = if (isSelected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        Color.Transparent
                    }
                ) {
                    Text(
                        text = title,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 10.dp),
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MerchantOrderCard(
    order: MerchantOrderDto,
    isActionInProgress: Boolean,
    onActionClick: (String) -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    val currencyFormat = remember {
        NumberFormat.getNumberInstance(Locale.US).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }
    }

    val normalizedMethod = order.paymentMethod.uppercase()
    val normalizedOrderStatus = order.orderStatus.uppercase()
    val normalizedPaymentStatus = order.paymentStatus.uppercase()

    val (methodBg, methodFg) = when (normalizedMethod) {
        "COD" -> StatusAmberBg to StatusAmber
        "ORBIT_MFS" -> ColorBkash.copy(alpha = 0.14f) to ColorBkash
        "CARD" -> StatusGreenBg to StatusGreen
        else -> StatusGrayBg to MaterialTheme.colorScheme.onSurfaceVariant
    }

    val (orderStatusBg, orderStatusFg) = when (normalizedOrderStatus) {
        "CONFIRMED", "DELIVERED", "COMPLETED" -> StatusGreenBg to StatusGreen
        "READY_TO_SHIP", "SHIPPED" -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurface
        "CANCELLED", "REJECTED" -> StatusRedBg to StatusRed
        else -> StatusAmberBg to StatusAmber
    }

    val (payStatusBg, payStatusFg) = when (normalizedPaymentStatus) {
        "PAID", "VERIFIED" -> StatusGreenBg to StatusGreen
        "FAILED", "REFUNDED" -> StatusRedBg to StatusRed
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
                            text = normalizedMethod,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = methodFg,
                            maxLines = 1
                        )
                    }
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "৳ ${currencyFormat.format(order.baseAmount)}",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (order.paidAmount > 0.0 && order.paidAmount < order.baseAmount) {
                        Text(
                            text = "Paid ৳ ${currencyFormat.format(order.paidAmount)}",
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontFeatureSettings = "tnum"
                            ),
                            color = StatusGreen
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
                        text = "Order: ${normalizedOrderStatus.replace("_", " ")}",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
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
                        text = "Pay: ${normalizedPaymentStatus.replace("_", " ")}",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
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
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = customerLabel,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (!order.itemsSummary.isNullOrBlank()) {
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ShoppingBag,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .padding(top = 2.dp)
                                .size(14.dp)
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

            // 1-Tap Bi-directional Action Buttons
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
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            if (isActionInProgress) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(14.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                            } else {
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(15.dp))
                            }
                            Spacer(modifier = Modifier.size(5.dp))
                            Text("Confirm", style = MaterialTheme.typography.labelLarge)
                        }
                    }

                    if (normalizedOrderStatus !in setOf("READY_TO_SHIP", "SHIPPED")) {
                        val isPrimaryStep = normalizedOrderStatus == "CONFIRMED"
                        if (isPrimaryStep) {
                            Button(
                                onClick = { onActionClick("READY_TO_SHIP") },
                                enabled = !isActionInProgress,
                                shape = btnShape,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                )
                            ) {
                                Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.size(5.dp))
                                Text("Ready to Ship", style = MaterialTheme.typography.labelLarge)
                            }
                        } else {
                            OutlinedButton(
                                onClick = { onActionClick("READY_TO_SHIP") },
                                enabled = !isActionInProgress,
                                shape = btnShape,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                            ) {
                                Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.size(5.dp))
                                Text("Ready to Ship", style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    }

                    if (normalizedOrderStatus != "SHIPPED") {
                        val isPrimaryShip = normalizedOrderStatus == "READY_TO_SHIP"
                        if (isPrimaryShip) {
                            Button(
                                onClick = { onActionClick("SHIP") },
                                enabled = !isActionInProgress,
                                shape = btnShape,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary
                                )
                            ) {
                                Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.size(5.dp))
                                Text("Mark Shipped", style = MaterialTheme.typography.labelLarge)
                            }
                        } else {
                            OutlinedButton(
                                onClick = { onActionClick("SHIP") },
                                enabled = !isActionInProgress,
                                shape = btnShape,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                            ) {
                                Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(15.dp))
                                Spacer(modifier = Modifier.size(5.dp))
                                Text("Mark Shipped", style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    }

                    if (normalizedOrderStatus == "SHIPPED" && normalizedPaymentStatus != "PAID") {
                        Button(
                            onClick = { onActionClick("MARK_PAID") },
                            enabled = !isActionInProgress,
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.size(5.dp))
                            Text("Mark Paid", style = MaterialTheme.typography.labelLarge)
                        }
                    }

                    if (normalizedOrderStatus != "SHIPPED") {
                        OutlinedButton(
                            onClick = { onActionClick("CANCEL") },
                            enabled = !isActionInProgress,
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                            border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusRed)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.size(5.dp))
                            Text("Cancel", style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun OrdersLoadingCard() {
    val cardShape = RoundedCornerShape(20.dp)
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
                text = "Loading store orders...",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun EmptyOrdersStateCard(onRefresh: () -> Unit) {
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.ReceiptLong,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f),
                modifier = Modifier.size(36.dp)
            )
            Text(
                text = "No store orders queued",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = "Incoming COD and MFS orders from your storefront will appear here for 1-tap confirmation and dispatch.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 8.dp),
                textAlign = TextAlign.Center
            )
            OutlinedButton(
                onClick = onRefresh,
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text("Refresh orders", style = MaterialTheme.typography.labelLarge)
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
    val textColor = if (isOnline) StatusGreen else StatusAmber

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, pillBorder.copy(alpha = 0.35f), RoundedCornerShape(20.dp)),
        color = pillBg,
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(if (isOnline) StatusGreen else StatusAmber)
                )
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = when {
                            isSyncing -> "Syncing with ORBIT Hub..."
                            isOnline -> "Online & syncing"
                            else -> "Offline · Local queue active"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = textColor
                    )
                    Text(
                        text = if (pendingCount > 0) "$pendingCount pending upload" else "All MFS messages synchronized",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Icon(
                imageVector = if (isOnline) Icons.Default.Wifi else Icons.Default.WifiOff,
                contentDescription = null,
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
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Card 1: Total Verified Volume
        MetricCard(
            modifier = Modifier.weight(1.3f),
            label = "Total verified",
            value = "৳ ${currencyFormat.format(totalVolume)}",
            badgeText = "Store volume",
            badgeColor = StatusGreen
        )

        // Card 2: Verified Orders
        MetricCard(
            modifier = Modifier.weight(1f),
            label = "Verified",
            value = verifiedOrders.toString(),
            badgeText = "Orders",
            badgeColor = MaterialTheme.colorScheme.primary
        )

        // Card 3: Unclaimed SMS
        MetricCard(
            modifier = Modifier.weight(1f),
            label = "Unclaimed",
            value = unclaimedCount.toString(),
            badgeText = "Personal/Queue",
            badgeColor = StatusGray
        )
    }
}

@Composable
fun MetricCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    badgeText: String,
    badgeColor: Color
) {
    val cardShape = RoundedCornerShape(20.dp)

    Card(
        modifier = modifier.border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
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
                shape = RoundedCornerShape(6.dp),
                color = badgeColor.copy(alpha = 0.12f)
            ) {
                Text(
                    text = badgeText,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelMedium.copy(fontSize = 10.sp),
                    color = badgeColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
fun TransactionItemCard(sms: SmsEntity) {
    val providerColor = when (sms.provider.uppercase()) {
        "BKASH" -> ColorBkash
        "NAGAD" -> ColorNagad
        "ROCKET" -> ColorRocket
        "UPAY" -> ColorUpay
        "CELLFIN" -> ColorCellfin
        else -> MaterialTheme.colorScheme.primary
    }

    val timeFormatter = remember { SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()) }
    val formattedTime = remember(sms.receivedAt) { timeFormatter.format(Date(sms.receivedAt)) }
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
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Top row: Provider Chip, TrxID, and Amount
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
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
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
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
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Text(
                    text = "৳ ${String.format(Locale.US, "%.2f", sms.amount)}",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.Bold,
                    color = StatusGreen
                )
            }

            // Middle row: Sender Phone and Timestamp
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "From: ${sms.senderNumber}",
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
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f)
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
                                    tint = StatusGreen,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = if (sms.externalOrderId != null) {
                                        "Verified (${sms.externalOrderId})"
                                    } else {
                                        "Verified"
                                    },
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = StatusGreen
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
                                text = "Pending upload",
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = StatusAmber
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
                                text = "Unclaimed",
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f),
                modifier = Modifier.size(36.dp)
            )
            Text(
                text = "No MFS transactions yet",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = "When incoming bKash or Nagad payments arrive on this phone, they will be captured and verified automatically in real time.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 12.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}
