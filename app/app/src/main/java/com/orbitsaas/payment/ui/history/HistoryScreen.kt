package com.orbitsaas.payment.ui.history

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
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
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.ui.components.OrbitSnackbarHost
import com.orbitsaas.payment.ui.components.ProviderBadgeChip
import com.orbitsaas.payment.ui.components.ProviderDot
import com.orbitsaas.payment.ui.components.SegmentedPillTabs
import com.orbitsaas.payment.ui.components.TransactionStatusBadge
import com.orbitsaas.payment.ui.components.TrustWarningBadge
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.components.formatFullTimestamp
import com.orbitsaas.payment.ui.components.formatRelativeTime
import com.orbitsaas.payment.ui.components.providerDisplayName
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.HistoryItem
import com.orbitsaas.payment.ui.viewmodel.HistoryTab
import com.orbitsaas.payment.ui.viewmodel.HistoryViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    viewModel: HistoryViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var selectedItem by remember { mutableStateOf<HistoryItem?>(null) }

    val statusOptions = remember(state.selectedTab) {
        if (state.selectedTab == HistoryTab.LOCAL) {
            listOf(
                null to R.string.common_all,
                SmsEntity.STATUS_VERIFIED to R.string.status_verified,
                SmsEntity.STATUS_UPLOADED to R.string.status_uploaded,
                SmsEntity.STATUS_PENDING_UPLOAD to R.string.status_pending_upload
            )
        } else {
            listOf(
                null to R.string.common_all,
                "VERIFIED" to R.string.status_verified,
                "MANUAL_VERIFIED" to R.string.status_manual_verified,
                "UNCLAIMED" to R.string.status_unclaimed
            )
        }
    }

    val providerOptions = remember {
        listOf(
            null to R.string.common_all,
            SmsEntity.PROVIDER_BKASH to R.string.provider_bkash,
            SmsEntity.PROVIDER_NAGAD to R.string.provider_nagad,
            SmsEntity.PROVIDER_ROCKET to R.string.provider_rocket,
            SmsEntity.PROVIDER_UPAY to R.string.provider_upay,
            SmsEntity.PROVIDER_CELLFIN to R.string.provider_cellfin
        )
    }

    val items = if (state.selectedTab == HistoryTab.LOCAL) state.localItems else state.serverItems

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.history_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                },
                actions = {
                    if (state.selectedTab == HistoryTab.SERVER) {
                        IconButton(
                            onClick = { viewModel.refreshServer() },
                            enabled = !state.isServerLoading,
                            modifier = Modifier.size(48.dp)
                        ) {
                            if (state.isServerLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Refresh,
                                    contentDescription = stringResource(R.string.common_refresh),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
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
                    stringResource(R.string.history_tab_phone),
                    stringResource(R.string.history_tab_server)
                ),
                selectedIndex = if (state.selectedTab == HistoryTab.LOCAL) 0 else 1,
                onSelect = { idx ->
                    viewModel.selectTab(if (idx == 0) HistoryTab.LOCAL else HistoryTab.SERVER)
                }
            )

            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = { viewModel.updateSearchQuery(it) },
                placeholder = {
                    Text(
                        text = stringResource(R.string.history_search_hint),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                trailingIcon = {
                    if (state.searchQuery.isNotEmpty()) {
                        IconButton(
                            onClick = { viewModel.updateSearchQuery("") },
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = stringResource(R.string.common_clear),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                modifier = Modifier.fillMaxWidth()
            )

            // Status filter chips
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(statusOptions, key = { it.first ?: "ALL_STATUS" }) { (value, labelRes) ->
                    val selected = state.statusFilter == value
                    FilterChip(
                        selected = selected,
                        onClick = { viewModel.selectStatusFilter(value) },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        label = {
                            Text(
                                text = stringResource(labelRes),
                                style = MaterialTheme.typography.labelLarge
                            )
                        },
                        shape = RoundedCornerShape(12.dp),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            containerColor = MaterialTheme.colorScheme.surface,
                            labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selected,
                            borderColor = MaterialTheme.colorScheme.outline,
                            selectedBorderColor = MaterialTheme.colorScheme.primary
                        )
                    )
                }
            }

            // Provider filter chips
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(providerOptions, key = { it.first ?: "ALL_PROVIDER" }) { (value, labelRes) ->
                    val selected = state.providerFilter == value
                    FilterChip(
                        selected = selected,
                        onClick = { viewModel.selectProviderFilter(value) },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        leadingIcon = if (value != null) {
                            { ProviderDot(provider = value, size = 8.dp) }
                        } else {
                            null
                        },
                        label = {
                            Text(
                                text = stringResource(labelRes),
                                style = MaterialTheme.typography.labelLarge
                            )
                        },
                        shape = RoundedCornerShape(12.dp),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            containerColor = MaterialTheme.colorScheme.surface,
                            labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selected,
                            borderColor = MaterialTheme.colorScheme.outline,
                            selectedBorderColor = MaterialTheme.colorScheme.primary
                        )
                    )
                }
            }

            // Content list
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (state.selectedTab == HistoryTab.SERVER && state.serverError != null && items.isEmpty()) {
                    item {
                        HistoryErrorCard(
                            message = state.serverError.orEmpty(),
                            onRetry = { viewModel.refreshServer() }
                        )
                    }
                } else if (state.selectedTab == HistoryTab.SERVER && state.isServerLoading && items.isEmpty()) {
                    item {
                        HistoryLoadingCard()
                    }
                } else if (items.isEmpty()) {
                    item {
                        HistoryEmptyCard(isLocal = state.selectedTab == HistoryTab.LOCAL)
                    }
                } else {
                    items(items, key = { it.id }) { item ->
                        HistoryTransactionRow(
                            item = item,
                            onClick = { selectedItem = item }
                        )
                    }

                    if (state.selectedTab == HistoryTab.SERVER && state.hasMoreServer) {
                        item {
                            OutlinedButton(
                                onClick = { viewModel.loadMoreServer() },
                                enabled = !state.isLoadingMore,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp),
                                shape = RoundedCornerShape(14.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                            ) {
                                if (state.isLoadingMore) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(18.dp),
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text(
                                        text = stringResource(R.string.history_load_more),
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    selectedItem?.let { item ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { selectedItem = null },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            HistoryDetailSheetContent(
                item = item,
                onCopyTrxId = {
                    clipboard.setText(AnnotatedString(item.trxId))
                    val copiedMsg = context.getString(R.string.history_copied_trx, item.trxId)
                    scope.launch { snackbarHostState.showSnackbar(copiedMsg) }
                },
                onClose = { selectedItem = null }
            )
        }
    }
}

@Composable
private fun HistoryTransactionRow(
    item: HistoryItem,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(20.dp)
    val relativeTime = remember(item.receivedAtMs) {
        formatRelativeTime(context, item.receivedAtMs)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
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
                    ProviderBadgeChip(provider = item.provider)
                    Text(
                        text = item.trxId,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Text(
                    text = formatBdtAmount(item.amount),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
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
                    text = item.senderNumber,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = relativeTime,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontFeatureSettings = "tnum"
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TransactionStatusBadge(status = item.status)

                if (!item.externalOrderId.isNullOrBlank()) {
                    Text(
                        text = "#${item.externalOrderId}",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontFeatureSettings = "tnum"
                        ),
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.weight(1f))

                item.trustFlag?.takeIf { it.isNotBlank() }?.let { flag ->
                    TrustWarningBadge(trustFlag = flag, compact = true)
                }
            }
        }
    }
}

@Composable
private fun HistoryDetailSheetContent(
    item: HistoryItem,
    onCopyTrxId: () -> Unit,
    onClose: () -> Unit
) {
    val unknownLabel = stringResource(R.string.history_detail_unknown)

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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ProviderDot(provider = item.provider, size = 12.dp)
                Text(
                    text = stringResource(R.string.history_detail_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            TransactionStatusBadge(status = item.status)
        }

        Text(
            text = formatBdtAmount(item.amount),
            style = MaterialTheme.typography.headlineLarge.copy(
                fontFeatureSettings = "tnum"
            ),
            fontWeight = FontWeight.Bold,
            color = StatusGreen
        )

        item.trustFlag?.takeIf { it.isNotBlank() }?.let { flag ->
            TrustWarningBadge(trustFlag = flag, compact = false)
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        DetailFieldRow(
            label = stringResource(R.string.history_detail_trx_id),
            value = item.trxId,
            monospace = true
        )
        DetailFieldRow(
            label = stringResource(R.string.history_detail_sender),
            value = item.senderNumber,
            monospace = true
        )
        DetailFieldRow(
            label = stringResource(R.string.history_detail_sms_sender),
            value = item.smsSender ?: unknownLabel
        )
        DetailFieldRow(
            label = stringResource(R.string.history_detail_source),
            value = item.source
        )
        DetailFieldRow(
            label = stringResource(R.string.history_detail_status),
            value = item.status
        )
        if (!item.matchType.isNullOrBlank()) {
            DetailFieldRow(
                label = stringResource(R.string.history_detail_match_type),
                value = item.matchType
            )
        }
        DetailFieldRow(
            label = stringResource(R.string.history_detail_order_id),
            value = item.externalOrderId?.let { "#$it" } ?: unknownLabel,
            monospace = !item.externalOrderId.isNullOrBlank()
        )
        DetailFieldRow(
            label = stringResource(R.string.history_detail_received_at),
            value = if (item.receivedAtMs > 0L) formatFullTimestamp(item.receivedAtMs) else unknownLabel
        )
        if (item.verifiedAtMs != null && item.verifiedAtMs > 0L) {
            DetailFieldRow(
                label = stringResource(R.string.history_detail_verified_at),
                value = formatFullTimestamp(item.verifiedAtMs)
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = stringResource(R.string.history_detail_raw_sms),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(14.dp)
            ) {
                SelectionContainer {
                    Text(
                        text = item.rawSms,
                        modifier = Modifier.padding(14.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = onClose,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                Text(
                    text = stringResource(R.string.common_close),
                    style = MaterialTheme.typography.labelLarge
                )
            }

            Button(
                onClick = onCopyTrxId,
                modifier = Modifier
                    .weight(1.4f)
                    .heightIn(min = 48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            ) {
                Icon(
                    imageVector = Icons.Default.ContentCopy,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = stringResource(R.string.history_copy_trx),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
private fun DetailFieldRow(
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
            modifier = Modifier.weight(0.9f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFeatureSettings = "tnum"
            ),
            fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1.1f)
        )
    }
}

@Composable
private fun HistoryLoadingCard() {
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
                text = stringResource(R.string.history_loading_server),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun HistoryErrorCard(
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
private fun HistoryEmptyCard(isLocal: Boolean) {
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
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ReceiptLong,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(34.dp)
            )
            Text(
                text = stringResource(
                    if (isLocal) R.string.history_empty_phone_title else R.string.history_empty_server_title
                ),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            Text(
                text = stringResource(
                    if (isLocal) R.string.history_empty_phone_desc else R.string.history_empty_server_desc
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}
