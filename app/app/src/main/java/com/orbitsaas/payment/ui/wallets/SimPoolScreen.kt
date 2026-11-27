package com.orbitsaas.payment.ui.wallets

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.WalletRotationDto
import com.orbitsaas.payment.ui.components.ProviderDot
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.components.providerDisplayName
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SimPoolScreen(
    state: DashboardUiState,
    onRefresh: () -> Unit,
    onCreateWallet: (
        provider: String,
        walletNumber: String,
        accountType: String,
        label: String?,
        simSlotIndex: Int?,
        isPrimary: Boolean,
        onDone: (Boolean) -> Unit
    ) -> Unit,
    onToggleActive: (walletId: String, isActive: Boolean) -> Unit,
    onSetPrimary: (walletId: String) -> Unit,
    onDeleteWallet: (walletId: String) -> Unit,
    onClearFeedback: () -> Unit
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var showAddDialog by remember { mutableStateOf(false) }
    var pendingDeleteWallet by remember { mutableStateOf<WalletRotationDto?>(null) }

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
                        Text(
                            text = stringResource(R.string.sim_pool_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = stringResource(R.string.sim_pool_subtitle),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = onRefresh,
                        enabled = !state.isWalletsLoading,
                        modifier = Modifier.size(48.dp)
                    ) {
                        if (state.isWalletsLoading) {
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
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = stringResource(R.string.sim_pool_add_button)
                )
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
            contentPadding = PaddingValues(top = 8.dp, bottom = 92.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                SimPoolSummaryCard(state = state)
            }

            if (state.isWalletsLoading && state.wallets.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 40.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                    }
                }
            } else if (state.wallets.isEmpty()) {
                item {
                    EmptySimPoolCard(onAddClick = { showAddDialog = true })
                }
            } else {
                items(state.wallets, key = { it.id }) { wallet ->
                    SimPoolWalletCard(
                        wallet = wallet,
                        isMutating = state.isWalletMutating,
                        onToggleActive = { active -> onToggleActive(wallet.id, active) },
                        onSetPrimary = { onSetPrimary(wallet.id) },
                        onDeleteClick = { pendingDeleteWallet = wallet }
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddSimWalletDialog(
            isSubmitting = state.isWalletMutating,
            onDismiss = { showAddDialog = false },
            onAdd = { provider, number, accountType, label, slotIdx, isPrimary ->
                onCreateWallet(provider, number, accountType, label, slotIdx, isPrimary) { ok ->
                    if (ok) showAddDialog = false
                }
            }
        )
    }

    pendingDeleteWallet?.let { wallet ->
        AlertDialog(
            onDismissRequest = { if (!state.isWalletMutating) pendingDeleteWallet = null },
            containerColor = MaterialTheme.colorScheme.surface,
            title = {
                Text(
                    text = stringResource(R.string.sim_pool_delete_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(
                    text = stringResource(R.string.sim_pool_delete_body, wallet.walletNumber),
                    style = MaterialTheme.typography.bodyMedium
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        onDeleteWallet(wallet.id)
                        pendingDeleteWallet = null
                    },
                    enabled = !state.isWalletMutating,
                    modifier = Modifier.heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = StatusRed)
                ) {
                    Text(stringResource(R.string.sim_pool_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { pendingDeleteWallet = null },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }
}

@Composable
private fun SimPoolSummaryCard(state: DashboardUiState) {
    val cardShape = RoundedCornerShape(16.dp)
    val activeCount = state.wallets.count { it.isActive && !it.isPlaceholder }
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
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.sim_pool_summary_heading),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                StatusPill(
                    label = stringResource(R.string.sim_pool_active_count, activeCount),
                    foreground = OrbitSemanticColors.statusGreen,
                    background = StatusGreenBg
                )
            }
            Text(
                text = stringResource(R.string.sim_pool_summary_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SimPoolWalletCard(
    wallet: WalletRotationDto,
    isMutating: Boolean,
    onToggleActive: (Boolean) -> Unit,
    onSetPrimary: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    val hardLimit = wallet.monthlyVolumeLimit.takeIf { it > 0.0 } ?: 300_000.0
    val safeLimit = wallet.safeVolumeLimit.takeIf { it > 0.0 } ?: 250_000.0
    val progress = (wallet.currentMonthVolume / hardLimit).toFloat().coerceIn(0f, 1f)

    val (stateLabel, stateFg, stateBg, meterColor) = when (wallet.rotationState.uppercase(Locale.US)) {
        "ACTIVE_PRIMARY" -> Quad(
            stringResource(R.string.dashboard_rotation_active),
            OrbitSemanticColors.statusGreen,
            StatusGreenBg,
            StatusGreen
        )
        "SAFE_LIMIT_OVERFLOW" -> Quad(
            stringResource(R.string.dashboard_rotation_overflow),
            OrbitSemanticColors.statusAmber,
            StatusAmberBg,
            StatusAmber
        )
        "HARD_LIMIT_REACHED" -> Quad(
            stringResource(R.string.dashboard_rotation_capped),
            OrbitSemanticColors.statusRed,
            StatusRedBg,
            StatusRed
        )
        "DEVICE_OFFLINE" -> Quad(
            stringResource(R.string.dashboard_rotation_offline),
            OrbitSemanticColors.statusAmber,
            StatusAmberBg,
            StatusAmber
        )
        "DISABLED" -> Quad(
            stringResource(R.string.dashboard_rotation_disabled),
            OrbitSemanticColors.statusGray,
            StatusGrayBg,
            MaterialTheme.colorScheme.outlineVariant
        )
        else -> Quad(
            stringResource(R.string.dashboard_rotation_standby),
            OrbitSemanticColors.statusGreen,
            StatusGreenBg,
            StatusGreen
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
                    ProviderDot(provider = wallet.provider, size = 10.dp)
                    Column {
                        Text(
                            text = "${providerDisplayName(wallet.provider)} · ${wallet.walletNumber}",
                            style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        val meta = buildList {
                            add(wallet.accountType)
                            wallet.simSlotIndex?.let { add(stringResource(R.string.dashboard_sim_slot_short, it)) }
                            wallet.label?.takeIf { it.isNotBlank() }?.let { add(it) }
                        }.joinToString(" · ")
                        Text(
                            text = meta,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Switch(
                    checked = wallet.isActive,
                    onCheckedChange = onToggleActive,
                    enabled = !isMutating,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                        checkedTrackColor = MaterialTheme.colorScheme.primary
                    )
                )
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                StatusPill(label = stateLabel, foreground = stateFg, background = stateBg)
                if (wallet.isPrimary) {
                    StatusPill(
                        label = stringResource(R.string.sim_pool_primary_badge),
                        foreground = MaterialTheme.colorScheme.primary,
                        background = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }

            // Progress bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            ) {
                if (progress > 0f) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(3.dp))
                            .background(meterColor)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(
                        R.string.sim_pool_used_this_month,
                        formatBdtAmount(wallet.currentMonthVolume)
                    ),
                    style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(
                        R.string.sim_pool_limit_pair,
                        formatBdtAmount(safeLimit),
                        formatBdtAmount(hardLimit)
                    ),
                    style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onSetPrimary,
                    enabled = !isMutating && !wallet.isPrimary && wallet.isActive,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Icon(
                        imageVector = if (wallet.isPrimary) Icons.Default.Star else Icons.Default.StarOutline,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(
                        text = if (wallet.isPrimary) {
                            stringResource(R.string.sim_pool_is_primary)
                        } else {
                            stringResource(R.string.sim_pool_make_primary)
                        },
                        style = MaterialTheme.typography.labelLarge
                    )
                }

                IconButton(
                    onClick = onDeleteClick,
                    enabled = !isMutating,
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.DeleteOutline,
                        contentDescription = stringResource(R.string.sim_pool_delete_confirm),
                        tint = OrbitSemanticColors.statusRed
                    )
                }
            }
        }
    }
}

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

@Composable
private fun EmptySimPoolCard(onAddClick: () -> Unit) {
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
                imageVector = Icons.Default.SimCard,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(34.dp)
            )
            Text(
                text = stringResource(R.string.sim_pool_empty_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = stringResource(R.string.sim_pool_empty_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Button(
                onClick = onAddClick,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(stringResource(R.string.sim_pool_add_button))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddSimWalletDialog(
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onAdd: (
        provider: String,
        walletNumber: String,
        accountType: String,
        label: String?,
        simSlotIndex: Int?,
        isPrimary: Boolean
    ) -> Unit
) {
    val providers = listOf("BKASH", "NAGAD", "ROCKET", "UPAY", "CELLFIN")
    val accountTypes = listOf("PERSONAL", "AGENT", "MERCHANT")
    var selectedProvider by remember { mutableStateOf("BKASH") }
    var selectedAccountType by remember { mutableStateOf("PERSONAL") }
    var number by remember { mutableStateOf("") }
    var label by remember { mutableStateOf("") }
    var simSlot by remember { mutableStateOf<Int?>(1) }
    var isPrimary by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }

    val invalidNumberMsg = stringResource(R.string.diag_sim_invalid_number)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
    )

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        containerColor = MaterialTheme.colorScheme.surface,
        title = {
            Text(
                text = stringResource(R.string.sim_pool_add_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = stringResource(R.string.sim_pool_field_provider),
                    style = MaterialTheme.typography.labelLarge
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    providers.forEach { p ->
                        FilterChip(
                            selected = selectedProvider == p,
                            onClick = { selectedProvider = p },
                            label = { Text(providerDisplayName(p)) }
                        )
                    }
                }

                OutlinedTextField(
                    value = number,
                    onValueChange = {
                        number = it
                        localError = null
                    },
                    label = { Text(stringResource(R.string.diag_preflight_sim_dialog_label)) },
                    placeholder = { Text(stringResource(R.string.diag_preflight_sim_dialog_placeholder)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    accountTypes.forEach { t ->
                        FilterChip(
                            selected = selectedAccountType == t,
                            onClick = { selectedAccountType = t },
                            label = { Text(t) }
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(1, 2).forEach { slot ->
                        FilterChip(
                            selected = simSlot == slot,
                            onClick = { simSlot = if (simSlot == slot) null else slot },
                            label = { Text(stringResource(R.string.dashboard_sim_slot_short, slot)) }
                        )
                    }
                    FilterChip(
                        selected = isPrimary,
                        onClick = { isPrimary = !isPrimary },
                        label = { Text(stringResource(R.string.sim_pool_primary_badge)) }
                    )
                }

                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text(stringResource(R.string.sim_pool_field_label)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

                localError?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.labelMedium,
                        color = OrbitSemanticColors.statusRed
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val clean = number.replace(Regex("[^0-9]"), "")
                    if (!clean.matches(Regex("^01[3-9]\\d{8,9}$"))) {
                        localError = invalidNumberMsg
                        return@Button
                    }
                    onAdd(selectedProvider, clean, selectedAccountType, label.ifBlank { null }, simSlot, isPrimary)
                },
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text(stringResource(R.string.sim_pool_add_submit))
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp)
            ) {
                Text(stringResource(R.string.common_cancel))
            }
        }
    )
}
