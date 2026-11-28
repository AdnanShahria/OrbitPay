package com.orbitsaas.payment.ui.orders

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingBag
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.ui.EmptyOrdersStateCard
import com.orbitsaas.payment.ui.OrdersLoadingCard
import com.orbitsaas.payment.ui.components.MediumTagChip
import com.orbitsaas.payment.ui.components.OrbitSnackbarHost
import com.orbitsaas.payment.ui.components.ProjectTagChip
import com.orbitsaas.payment.ui.components.SegmentedPillTabs
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.components.formatBusinessOrderHeadline
import com.orbitsaas.payment.ui.components.formatBusinessOrderSubRef
import com.orbitsaas.payment.ui.components.formatShortTimestamp
import com.orbitsaas.payment.ui.components.isDeliveryOrder
import com.orbitsaas.payment.ui.components.isPaymentLinkOrder
import com.orbitsaas.payment.ui.components.parseIsoEpochMs
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(
    state: DashboardUiState,
    onRefreshOrders: () -> Unit,
    onOrderAction: (externalOrderId: String, action: String) -> Unit,
    onClearFeedback: () -> Unit,
    onSearchClick: () -> Unit = {}
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var filterTab by rememberSaveable { mutableIntStateOf(0) } // 0 = All, 1 = Needs Action, 2 = COD

    LaunchedEffect(state.feedbackMessage) {
        state.feedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            onClearFeedback()
        }
    }

    val filteredOrders = remember(state.orders, filterTab) {
        when (filterTab) {
            1 -> state.orders.filter {
                it.orderStatus.uppercase(Locale.US) in setOf(
                    "NEW", "PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "READY_TO_SHIP"
                )
            }
            2 -> state.orders.filter { it.paymentMethod.equals("COD", ignoreCase = true) }
            else -> state.orders
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = stringResource(R.string.orders_screen_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = stringResource(R.string.orders_screen_subtitle),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = onSearchClick,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = stringResource(R.string.search_action_cd),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(
                        onClick = onRefreshOrders,
                        enabled = !state.isOrdersLoading,
                        modifier = Modifier.size(48.dp)
                    ) {
                        if (state.isOrdersLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = stringResource(R.string.action_refresh_orders),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        snackbarHost = { OrbitSnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SegmentedPillTabs(
                options = listOf(
                    stringResource(R.string.orders_filter_all, state.orders.size),
                    stringResource(R.string.orders_filter_active),
                    stringResource(R.string.orders_filter_cod)
                ),
                selectedIndex = filterTab,
                onSelect = { filterTab = it }
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (state.isOrdersLoading && state.orders.isEmpty()) {
                    item { OrdersLoadingCard() }
                } else if (filteredOrders.isEmpty()) {
                    item { EmptyOrdersStateCard(onRefresh = onRefreshOrders) }
                } else {
                    items(filteredOrders, key = { it.externalOrderId }) { order ->
                        MerchantOrderCard(
                            order = order,
                            isActionInProgress = state.actionInProgressOrderId == order.externalOrderId,
                            onAction = { action -> onOrderAction(order.externalOrderId, action) }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MerchantOrderCard(
    order: MerchantOrderDto,
    isActionInProgress: Boolean,
    onAction: (String) -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(18.dp)
    val normalizedOrder = order.orderStatus.uppercase(Locale.US)
    val normalizedPay = order.paymentStatus.uppercase(Locale.US)
    val normalizedMethod = order.paymentMethod.uppercase(Locale.US)
    val headline = remember(order) { formatBusinessOrderHeadline(context, order) }
    val subRef = remember(order) { formatBusinessOrderSubRef(context, order) }
    val showDeliveryActions = remember(order) { isDeliveryOrder(order) }
    val placedTimeText = remember(order.createdAt) {
        parseIsoEpochMs(order.createdAt)?.let { formatShortTimestamp(it) }
    }

    val methodLabel = when (normalizedMethod) {
        "COD" -> stringResource(R.string.payment_method_cod)
        "ORBIT_MFS" -> stringResource(R.string.payment_method_orbit_mfs)
        "CARD" -> stringResource(R.string.payment_method_card)
        else -> normalizedMethod.replace("_", " ")
    }

    val localizedOrderStatus = when (normalizedOrder) {
        "PENDING", "NEW", "AWAITING_CONFIRMATION" -> stringResource(R.string.order_status_pending)
        "CONFIRMED" -> stringResource(R.string.order_status_confirmed)
        "READY_TO_SHIP" -> stringResource(R.string.order_status_ready_to_ship)
        "SHIPPED" -> stringResource(R.string.order_status_shipped)
        "DELIVERED" -> stringResource(R.string.order_status_delivered)
        "COMPLETED" -> stringResource(R.string.order_status_completed)
        "CANCELLED" -> stringResource(R.string.order_status_cancelled)
        "REJECTED" -> stringResource(R.string.order_status_rejected)
        else -> normalizedOrder.replace("_", " ")
    }

    val (orderFg, orderBg) = when (normalizedOrder) {
        "CONFIRMED", "DELIVERED", "COMPLETED" -> OrbitSemanticColors.statusGreen to StatusGreenBg
        "CANCELLED", "REJECTED" -> OrbitSemanticColors.statusRed to StatusRedBg
        "READY_TO_SHIP", "SHIPPED" -> MaterialTheme.colorScheme.onSurface to MaterialTheme.colorScheme.surfaceVariant
        else -> OrbitSemanticColors.statusAmber to StatusAmberBg
    }

    val localizedPayStatus = when (normalizedPay) {
        "PAID" -> stringResource(R.string.pay_status_paid)
        "VERIFIED" -> stringResource(R.string.pay_status_verified)
        "FAILED" -> stringResource(R.string.pay_status_failed)
        else -> stringResource(R.string.pay_status_pending)
    }

    val (payFg, payBg) = when (normalizedPay) {
        "PAID", "VERIFIED" -> OrbitSemanticColors.statusGreen to StatusGreenBg
        "FAILED" -> OrbitSemanticColors.statusRed to StatusRedBg
        else -> OrbitSemanticColors.statusAmber to StatusAmberBg
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = cardShape
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            val isLink = isPaymentLinkOrder(order)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                order.projectName?.takeIf { it.isNotBlank() }?.let { proj ->
                    ProjectTagChip(projectName = proj)
                }
                MediumTagChip(
                    label = stringResource(if (isLink) R.string.medium_payment_link else R.string.medium_storefront_checkout),
                    icon = if (isLink) Icons.Default.Link else Icons.Default.ShoppingBag
                )
            }
            HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f))
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = headline,
                        style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    val metaSubLine = listOfNotNull(subRef, placedTimeText).joinToString(" · ")
                    if (metaSubLine.isNotBlank()) {
                        Text(
                            text = metaSubLine,
                            style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Text(
                    text = formatBdtAmount(order.baseAmount),
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1
                )
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                StatusPill(
                    label = methodLabel,
                    foreground = MaterialTheme.colorScheme.onSurface,
                    background = MaterialTheme.colorScheme.surfaceVariant
                )
                StatusPill(label = localizedOrderStatus, foreground = orderFg, background = orderBg)
                StatusPill(label = localizedPayStatus, foreground = payFg, background = payBg)
            }

            val customerSummary = listOfNotNull(
                order.customerName?.takeIf { it.isNotBlank() && !it.trim().equals(headline, ignoreCase = true) },
                order.customerPhone?.takeIf { it.isNotBlank() && !it.trim().equals(headline, ignoreCase = true) }
            ).joinToString(" · ")
            if (customerSummary.isNotBlank()) {
                Text(
                    text = customerSummary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            order.itemsSummary?.takeIf { it.isNotBlank() }?.let { items ->
                Text(
                    text = items,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            order.shippingAddress?.takeIf { it.isNotBlank() }?.let { addr ->
                Text(
                    text = addr,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            val isTerminal = normalizedOrder in setOf("CANCELLED", "DELIVERED", "COMPLETED")
            if (!isTerminal) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val btnShape = RoundedCornerShape(12.dp)
                    val isPending = normalizedOrder in setOf(
                        "PENDING", "NEW", "PLACED", "UNCONFIRMED", "AWAITING_CONFIRMATION"
                    )
                    if (isPending) {
                        Button(
                            onClick = { onAction("CONFIRM") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(stringResource(R.string.order_action_confirm))
                        }
                    }
                    if (showDeliveryActions && normalizedOrder !in setOf("READY_TO_SHIP", "SHIPPED")) {
                        OutlinedButton(
                            onClick = { onAction("READY_TO_SHIP") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(stringResource(R.string.order_action_ready_to_ship))
                        }
                    }
                    if (showDeliveryActions && normalizedOrder != "SHIPPED") {
                        OutlinedButton(
                            onClick = { onAction("SHIP") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(stringResource(R.string.order_action_mark_shipped))
                        }
                    }
                    if (normalizedPay != "PAID") {
                        Button(
                            onClick = { onAction("MARK_PAID") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape
                        ) {
                            Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(stringResource(R.string.order_action_mark_paid))
                        }
                    }
                    if (normalizedOrder != "SHIPPED") {
                        OutlinedButton(
                            onClick = { onAction("CANCEL") },
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = OrbitSemanticColors.statusRed)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(stringResource(R.string.order_action_cancel))
                        }
                    }
                }
            }
            }
        }
    }
}
