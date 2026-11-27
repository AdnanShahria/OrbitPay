package com.orbitsaas.payment.ui.verify

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.LedgerDto
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.ui.components.ApproveIntentDialog
import com.orbitsaas.payment.ui.components.PaymentIntentCard
import com.orbitsaas.payment.ui.components.ProviderDot
import com.orbitsaas.payment.ui.components.RejectIntentDialog
import com.orbitsaas.payment.ui.components.SegmentedPillTabs
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.TrustWarningBadge
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.components.formatRelativeTime
import com.orbitsaas.payment.ui.components.parseIsoEpochMs
import com.orbitsaas.payment.ui.components.providerDisplayName
import com.orbitsaas.payment.ui.components.trustFlagDescription
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGray
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.RankedQueueCandidate
import com.orbitsaas.payment.ui.viewmodel.VerifyTab
import com.orbitsaas.payment.ui.viewmodel.VerifyViewModel
import java.util.Locale

private data class PendingMatchConfirmation(
    val sms: LedgerDto,
    val externalOrderId: String,
    val customerEmail: String?
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerifyScreen(
    viewModel: VerifyViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var pendingConfirm by remember { mutableStateOf<PendingMatchConfirmation?>(null) }
    var pendingApproveIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }
    var pendingRejectIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }

    val isActiveTabLoading = when (state.selectedTab) {
        VerifyTab.REVIEW_QUEUE -> state.isLoadingReviewIntents
        VerifyTab.UNCLAIMED_SMS -> state.isLoadingUnclaimed
        VerifyTab.ORDER_PAY -> state.isLoadingUnpaidOrders
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
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = stringResource(R.string.verify_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = stringResource(R.string.verify_subtitle),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.refreshActiveTab() },
                        enabled = !isActiveTabLoading,
                        modifier = Modifier.size(48.dp)
                    ) {
                        if (isActiveTabLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = stringResource(R.string.common_refresh),
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
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                    stringResource(R.string.verify_tab_review_queue, state.reviewIntents.size),
                    stringResource(R.string.verify_tab_unclaimed_sms, state.unclaimedItems.size),
                    stringResource(R.string.verify_tab_order_pay, state.unpaidOrders.size)
                ),
                selectedIndex = state.selectedTab.ordinal,
                onSelect = { idx ->
                    val tab = VerifyTab.entries.getOrElse(idx) { VerifyTab.REVIEW_QUEUE }
                    viewModel.selectTab(tab)
                }
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (state.selectedTab) {
                    VerifyTab.REVIEW_QUEUE -> {
                        if (state.reviewIntentsError != null && state.reviewIntents.isEmpty()) {
                            item {
                                VerifyErrorCard(
                                    message = state.reviewIntentsError.orEmpty(),
                                    onRetry = { viewModel.loadReviewIntents() }
                                )
                            }
                        } else if (state.isLoadingReviewIntents && state.reviewIntents.isEmpty()) {
                            item {
                                VerifyLoadingCard(label = stringResource(R.string.dashboard_loading_intents))
                            }
                        } else if (state.reviewIntents.isEmpty()) {
                            item {
                                VerifySectionEmptyCard(
                                    title = stringResource(R.string.verify_review_empty_title),
                                    desc = stringResource(R.string.verify_review_empty_desc),
                                    onRefresh = { viewModel.loadReviewIntents() }
                                )
                            }
                        } else {
                            items(state.reviewIntents, key = { it.id }) { intent ->
                                PaymentIntentCard(
                                    intent = intent,
                                    serverBaseUrl = state.serverUrl,
                                    fallbackAppName = state.storeName,
                                    isActionInProgress = state.actionInProgressIntentId == intent.id,
                                    onApproveClick = { pendingApproveIntent = intent },
                                    onRejectClick = { pendingRejectIntent = intent },
                                    onDynamicActionClick = { action ->
                                        viewModel.triggerIntentAction(intent.id, action.id, action.label)
                                    }
                                )
                            }
                        }
                    }

                    VerifyTab.UNCLAIMED_SMS -> {
                        if (state.unclaimedError != null && state.unclaimedItems.isEmpty()) {
                            item {
                                VerifyErrorCard(
                                    message = state.unclaimedError.orEmpty(),
                                    onRetry = { viewModel.loadUnclaimed() }
                                )
                            }
                        } else if (state.isLoadingUnclaimed && state.unclaimedItems.isEmpty()) {
                            item {
                                VerifyLoadingCard(label = stringResource(R.string.verify_loading_unclaimed))
                            }
                        } else if (state.unclaimedItems.isEmpty()) {
                            item {
                                VerifyEmptyCard(onRefresh = { viewModel.loadUnclaimed() })
                            }
                        } else {
                            items(state.unclaimedItems, key = { it.id }) { sms ->
                                UnclaimedSmsCard(
                                    sms = sms,
                                    onClick = { viewModel.selectSms(sms) }
                                )
                            }
                        }
                    }

                    VerifyTab.ORDER_PAY -> {
                        if (state.unpaidOrdersError != null && state.unpaidOrders.isEmpty()) {
                            item {
                                VerifyErrorCard(
                                    message = state.unpaidOrdersError.orEmpty(),
                                    onRetry = { viewModel.loadUnpaidOrders() }
                                )
                            }
                        } else if (state.isLoadingUnpaidOrders && state.unpaidOrders.isEmpty()) {
                            item {
                                VerifyLoadingCard(label = stringResource(R.string.dashboard_loading_orders))
                            }
                        } else if (state.unpaidOrders.isEmpty()) {
                            item {
                                VerifySectionEmptyCard(
                                    title = stringResource(R.string.verify_orders_empty_title),
                                    desc = stringResource(R.string.verify_orders_empty_desc),
                                    onRefresh = { viewModel.loadUnpaidOrders() }
                                )
                            }
                        } else {
                            items(state.unpaidOrders, key = { it.externalOrderId }) { order ->
                                VerifyOrderActionCard(
                                    order = order,
                                    isActionInProgress = state.actionInProgressOrderId == order.externalOrderId,
                                    onActionClick = { action ->
                                        viewModel.performOrderAction(order.externalOrderId, action)
                                    }
                                )
                            }
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
                viewModel.resolvePaymentIntent(intent.id, "APPROVE", intent.stateVersion, null)
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
                viewModel.resolvePaymentIntent(intent.id, "REJECT", intent.stateVersion, reason)
                pendingRejectIntent = null
            }
        )
    }

    state.selectedSms?.let { selectedSms ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = {
                if (!state.isSubmittingMatch) {
                    viewModel.dismissSelectedSms()
                }
            },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            CandidateMatchSheetContent(
                sms = selectedSms,
                candidates = state.candidates,
                isLoadingCandidates = state.isLoadingCandidates,
                candidatesError = state.candidatesError,
                onSelectCandidate = { candidate ->
                    pendingConfirm = PendingMatchConfirmation(
                        sms = selectedSms,
                        externalOrderId = candidate.externalOrderId,
                        customerEmail = candidate.customerEmail
                    )
                },
                onManualSubmit = { orderId, email ->
                    pendingConfirm = PendingMatchConfirmation(
                        sms = selectedSms,
                        externalOrderId = orderId,
                        customerEmail = email.ifBlank { null }
                    )
                }
            )
        }
    }

    pendingConfirm?.let { confirm ->
        val context = LocalContext.current
        AlertDialog(
            onDismissRequest = {
                if (!state.isSubmittingMatch) {
                    pendingConfirm = null
                }
            },
            containerColor = MaterialTheme.colorScheme.surface,
            title = {
                Text(
                    text = stringResource(R.string.verify_confirm_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = stringResource(
                            R.string.verify_confirm_body,
                            formatBdtAmount(confirm.sms.amount),
                            providerDisplayName(confirm.sms.provider),
                            confirm.sms.trxId,
                            confirm.externalOrderId
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    confirm.sms.trustFlag?.takeIf { it.isNotBlank() }?.let { flag ->
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = StatusRedBg,
                            border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f))
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Warning,
                                    contentDescription = stringResource(R.string.trust_badge_flagged),
                                    tint = StatusRed,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = stringResource(
                                        R.string.verify_confirm_trust_warning,
                                        trustFlagDescription(context, flag)
                                    ),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = StatusRed,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.confirmManualMatch(
                            sms = confirm.sms,
                            externalOrderId = confirm.externalOrderId,
                            customerEmail = confirm.customerEmail
                        ) {
                            pendingConfirm = null
                        }
                    },
                    enabled = !state.isSubmittingMatch,
                    modifier = Modifier.heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    )
                ) {
                    if (state.isSubmittingMatch) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Text(
                            text = stringResource(R.string.verify_confirm_button),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { pendingConfirm = null },
                    enabled = !state.isSubmittingMatch,
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
}

@Composable
private fun UnclaimedSmsCard(
    sms: LedgerDto,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(20.dp)
    val receivedAtMs = remember(sms.smsReceivedAt) { parseIsoEpochMs(sms.smsReceivedAt) ?: 0L }
    val relativeTime = remember(receivedAtMs) { formatRelativeTime(context, receivedAtMs) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
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
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ProviderDot(provider = sms.provider, size = 10.dp)
                    Text(
                        text = providerDisplayName(sms.provider),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = sms.trxId,
                        style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Text(
                    text = formatBdtAmount(sms.amount),
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold,
                    color = StatusGreen
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = sms.senderNumber,
                    style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = relativeTime,
                    style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusPill(
                    label = stringResource(R.string.status_unclaimed),
                    foreground = OrbitSemanticColors.statusGray,
                    background = StatusGrayBg
                )
                sms.trustFlag?.takeIf { it.isNotBlank() }?.let { flag ->
                    TrustWarningBadge(trustFlag = flag, compact = true)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VerifyOrderActionCard(
    order: MerchantOrderDto,
    isActionInProgress: Boolean,
    onActionClick: (String) -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    val orderStatusUpper = order.orderStatus.uppercase(Locale.US)
    val payStatusUpper = order.paymentStatus.uppercase(Locale.US)
    val methodUpper = order.paymentMethod.uppercase(Locale.US)

    val (orderFg, orderBg) = when (orderStatusUpper) {
        "CONFIRMED", "SHIPPED" -> OrbitSemanticColors.statusGreen to StatusGreenBg
        "CANCELLED" -> OrbitSemanticColors.statusRed to StatusRedBg
        else -> OrbitSemanticColors.statusAmber to StatusAmberBg
    }
    val (payFg, payBg) = when (payStatusUpper) {
        "PAID" -> OrbitSemanticColors.statusGreen to StatusGreenBg
        "FAILED" -> OrbitSemanticColors.statusRed to StatusRedBg
        else -> OrbitSemanticColors.statusAmber to StatusAmberBg
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
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "#${order.externalOrderId}",
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = formatBdtAmount(order.baseAmount),
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                StatusPill(
                    label = methodUpper,
                    foreground = MaterialTheme.colorScheme.onSurfaceVariant,
                    background = StatusGrayBg
                )
                StatusPill(
                    label = stringResource(R.string.order_status_label, orderStatusUpper.replace("_", " ")),
                    foreground = orderFg,
                    background = orderBg
                )
                StatusPill(
                    label = stringResource(R.string.payment_status_label, payStatusUpper.replace("_", " ")),
                    foreground = payFg,
                    background = payBg
                )
            }

            val customerLine = listOfNotNull(
                order.customerName?.takeIf { it.isNotBlank() },
                order.customerPhone?.takeIf { it.isNotBlank() }
            ).joinToString(" · ")
            if (customerLine.isNotBlank()) {
                Text(
                    text = customerLine,
                    style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val btnShape = RoundedCornerShape(12.dp)

                if (payStatusUpper != "PAID") {
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
                        if (isActionInProgress) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                        Spacer(modifier = Modifier.size(6.dp))
                        Text(
                            text = stringResource(R.string.order_action_mark_paid),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }

                if (orderStatusUpper in setOf("NEW", "PENDING", "AWAITING_CONFIRMATION")) {
                    OutlinedButton(
                        onClick = { onActionClick("CONFIRM") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape,
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.size(6.dp))
                        Text(
                            text = stringResource(R.string.order_action_confirm),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }

                if (orderStatusUpper != "SHIPPED" && orderStatusUpper != "CANCELLED") {
                    OutlinedButton(
                        onClick = { onActionClick("CANCEL") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape,
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                        border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = OrbitSemanticColors.statusRed)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.size(6.dp))
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

@Composable
private fun VerifySectionEmptyCard(
    title: String,
    desc: String,
    onRefresh: () -> Unit
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
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.VerifiedUser,
                contentDescription = null,
                tint = StatusGreen,
                modifier = Modifier.size(36.dp)
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            Text(
                text = desc,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            OutlinedButton(
                onClick = onRefresh,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(
                    text = stringResource(R.string.common_refresh),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
private fun CandidateMatchSheetContent(
    sms: LedgerDto,
    candidates: List<RankedQueueCandidate>,
    isLoadingCandidates: Boolean,
    candidatesError: String?,
    onSelectCandidate: (RankedQueueCandidate) -> Unit,
    onManualSubmit: (orderId: String, customerEmail: String) -> Unit
) {
    var manualOrderId by remember(sms.id) { mutableStateOf("") }
    var manualCustomerEmail by remember(sms.id) { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            text = stringResource(R.string.verify_sheet_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )

        // Selected SMS summary card
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp)),
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
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
                            text = "${providerDisplayName(sms.provider)} · ${sms.trxId}",
                            style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = formatBdtAmount(sms.amount),
                        style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                        fontWeight = FontWeight.Bold,
                        color = StatusGreen
                    )
                }
                Text(
                    text = sms.senderNumber,
                    style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                sms.trustFlag?.takeIf { it.isNotBlank() }?.let { flag ->
                    TrustWarningBadge(trustFlag = flag, compact = false)
                }
            }
        }

        Text(
            text = stringResource(R.string.verify_candidates_header),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )

        when {
            isLoadingCandidates -> {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.size(10.dp))
                    Text(
                        text = stringResource(R.string.verify_loading_candidates),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            candidatesError != null -> {
                Text(
                    text = candidatesError,
                    style = MaterialTheme.typography.bodyMedium,
                    color = StatusRed
                )
            }
            candidates.isEmpty() -> {
                Text(
                    text = stringResource(R.string.verify_candidates_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            else -> {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    candidates.forEach { candidate ->
                        CandidateRowCard(
                            candidate = candidate,
                            onClick = { onSelectCandidate(candidate) }
                        )
                    }
                }
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        // Manual Order ID fallback
        Text(
            text = stringResource(R.string.verify_manual_section_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )

        val fieldShape = RoundedCornerShape(14.dp)
        val fieldColors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
        )

        OutlinedTextField(
            value = manualOrderId,
            onValueChange = { manualOrderId = it },
            label = { Text(stringResource(R.string.verify_manual_order_label)) },
            singleLine = true,
            shape = fieldShape,
            colors = fieldColors,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = manualCustomerEmail,
            onValueChange = { manualCustomerEmail = it },
            label = { Text(stringResource(R.string.verify_manual_email_label)) },
            singleLine = true,
            shape = fieldShape,
            colors = fieldColors,
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = { onManualSubmit(manualOrderId.trim(), manualCustomerEmail.trim()) },
            enabled = manualOrderId.isNotBlank(),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = fieldShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text(
                text = stringResource(R.string.verify_manual_match_button),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CandidateRowCard(
    candidate: RankedQueueCandidate,
    onClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    val displayAmount = candidate.uniqueAmount ?: candidate.baseAmount ?: candidate.expectedAmount
    val scoreColor = when {
        candidate.score >= 70 -> StatusGreen
        candidate.score >= 40 -> StatusAmber
        else -> StatusGray
    }
    val scoreBg = when {
        candidate.score >= 70 -> StatusGreenBg
        candidate.score >= 40 -> StatusAmberBg
        else -> StatusGrayBg
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
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
                    ProviderDot(provider = candidate.provider, size = 9.dp)
                    Text(
                        text = "#${candidate.externalOrderId}",
                        style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                StatusPill(
                    label = stringResource(R.string.verify_candidate_score, candidate.score),
                    foreground = scoreColor,
                    background = scoreBg
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.verify_candidate_submitted_trx, candidate.submittedTrxId),
                    style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = stringResource(R.string.verify_candidate_expected, formatBdtAmount(displayAmount)),
                    style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
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
                    text = candidate.submittedSender,
                    style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                candidate.customerEmail?.takeIf { it.isNotBlank() }?.let { email ->
                    Text(
                        text = email,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (candidate.sameProvider || candidate.trxEditDistance != null || candidate.amountWithinTolerance || candidate.sameSender) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    if (candidate.sameProvider) {
                        ReasonTag(stringResource(R.string.verify_reason_provider))
                    }
                    candidate.trxEditDistance?.let { dist ->
                        ReasonTag(
                            if (dist == 0) {
                                stringResource(R.string.verify_reason_trx_exact)
                            } else {
                                stringResource(R.string.verify_reason_trx_near, dist)
                            }
                        )
                    }
                    if (candidate.amountWithinTolerance) {
                        ReasonTag(stringResource(R.string.verify_reason_amount))
                    }
                    if (candidate.sameSender) {
                        ReasonTag(stringResource(R.string.verify_reason_sender))
                    }
                }
            }
        }
    }
}

@Composable
private fun ReasonTag(label: String) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun VerifyLoadingCard(label: String) {
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
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            Spacer(modifier = Modifier.size(12.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun VerifyErrorCard(
    message: String,
    onRetry: () -> Unit
) {
    val cardShape = RoundedCornerShape(20.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, StatusRed.copy(alpha = 0.45f), cardShape),
        colors = CardDefaults.cardColors(containerColor = StatusRedBg),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Error,
                contentDescription = null,
                tint = StatusRed,
                modifier = Modifier.size(28.dp)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = StatusRed,
                textAlign = TextAlign.Center
            )
            OutlinedButton(
                onClick = onRetry,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f))
            ) {
                Text(
                    text = stringResource(R.string.common_retry),
                    color = StatusRed,
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
private fun VerifyEmptyCard(onRefresh: () -> Unit) {
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
                imageVector = Icons.Default.VerifiedUser,
                contentDescription = null,
                tint = StatusGreen,
                modifier = Modifier.size(36.dp)
            )
            Text(
                text = stringResource(R.string.verify_empty_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            Text(
                text = stringResource(R.string.verify_empty_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            OutlinedButton(
                onClick = onRefresh,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(
                    text = stringResource(R.string.common_refresh),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}
