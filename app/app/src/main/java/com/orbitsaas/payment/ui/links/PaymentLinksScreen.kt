package com.orbitsaas.payment.ui.links

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.PaymentLinkDto
import com.orbitsaas.payment.ui.components.SegmentedPillTabs
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PaymentLinksScreen(
    state: DashboardUiState,
    onRefresh: () -> Unit,
    onCreateLink: (
        title: String,
        description: String?,
        amountType: String,
        fixedAmount: Double?,
        minAmount: Double?,
        maxAmount: Double?,
        onDone: (Boolean) -> Unit
    ) -> Unit,
    onToggleActive: (linkId: String, isActive: Boolean) -> Unit,
    onDeleteLink: (linkId: String) -> Unit,
    onClearFeedback: () -> Unit
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var showCreateDialog by remember { mutableStateOf(false) }
    var pendingDeleteLink by remember { mutableStateOf<PaymentLinkDto?>(null) }

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
                            text = stringResource(R.string.links_title),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = stringResource(R.string.links_subtitle),
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
                        enabled = !state.isLinksLoading,
                        modifier = Modifier.size(48.dp)
                    ) {
                        if (state.isLinksLoading) {
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
                onClick = { showCreateDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = stringResource(R.string.links_create_button)
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
            if (state.isLinksLoading && state.paymentLinks.isEmpty()) {
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
            } else if (state.paymentLinks.isEmpty()) {
                item {
                    EmptyLinksCard(onCreateClick = { showCreateDialog = true })
                }
            } else {
                items(state.paymentLinks, key = { it.id }) { link ->
                    val shareUrl = resolveLinkShareUrl(state.serverUrl, link)
                    PaymentLinkCard(
                        link = link,
                        shareUrl = shareUrl,
                        isMutating = state.isLinkMutating,
                        onCopy = {
                            clipboard.setText(AnnotatedString(shareUrl))
                            scope.launch {
                                snackbarHostState.showSnackbar(
                                    context.getString(R.string.links_copied_message)
                                )
                            }
                        },
                        onShare = {
                            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, link.title)
                                putExtra(Intent.EXTRA_TEXT, "${link.title}\n$shareUrl")
                            }
                            context.startActivity(
                                Intent.createChooser(
                                    sendIntent,
                                    context.getString(R.string.links_share_chooser)
                                )
                            )
                        },
                        onToggleActive = { active -> onToggleActive(link.id, active) },
                        onDeleteClick = { pendingDeleteLink = link }
                    )
                }
            }
        }
    }

    if (showCreateDialog) {
        CreatePaymentLinkDialog(
            isSubmitting = state.isLinkMutating,
            onDismiss = { showCreateDialog = false },
            onCreate = { title, desc, amountType, fixedAmt, minAmt, maxAmt ->
                onCreateLink(title, desc, amountType, fixedAmt, minAmt, maxAmt) { ok ->
                    if (ok) showCreateDialog = false
                }
            }
        )
    }

    pendingDeleteLink?.let { link ->
        AlertDialog(
            onDismissRequest = { if (!state.isLinkMutating) pendingDeleteLink = null },
            containerColor = MaterialTheme.colorScheme.surface,
            title = {
                Text(
                    text = stringResource(R.string.links_delete_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Text(
                    text = stringResource(R.string.links_delete_body, link.title),
                    style = MaterialTheme.typography.bodyMedium
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        onDeleteLink(link.id)
                        pendingDeleteLink = null
                    },
                    enabled = !state.isLinkMutating,
                    modifier = Modifier.heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = StatusRed)
                ) {
                    Text(stringResource(R.string.links_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { pendingDeleteLink = null },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }
}

private fun resolveLinkShareUrl(serverUrl: String, link: PaymentLinkDto): String {
    if (link.shareUrl.startsWith("http://") || link.shareUrl.startsWith("https://")) {
        return link.shareUrl
    }
    val base = serverUrl.trim().ifBlank { "https://payment.orbitsaas.cloud" }.removeSuffix("/")
    val path = link.sharePath.ifBlank {
        if (!link.merchantSlug.isNullOrBlank()) "/${link.merchantSlug}/${link.slug}" else "/l/${link.slug}"
    }
    return "$base$path"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PaymentLinkCard(
    link: PaymentLinkDto,
    shareUrl: String,
    isMutating: Boolean,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onToggleActive: (Boolean) -> Unit,
    onDeleteClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    val amountLabel = when (link.amountType.uppercase()) {
        "FIXED" -> link.fixedAmount?.let { formatBdtAmount(it) } ?: stringResource(R.string.links_fixed_amount)
        else -> {
            val minTxt = link.minAmount?.let { formatBdtAmount(it) }
            if (minTxt != null) stringResource(R.string.links_open_amount_min, minTxt)
            else stringResource(R.string.links_open_amount)
        }
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
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = link.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (!link.description.isNullOrBlank()) {
                        Text(
                            text = link.description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.size(8.dp))

                Switch(
                    checked = link.isActive,
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
                StatusPill(
                    label = if (link.isActive) stringResource(R.string.links_status_active) else stringResource(R.string.links_status_paused),
                    foreground = if (link.isActive) OrbitSemanticColors.statusGreen else OrbitSemanticColors.statusGray,
                    background = if (link.isActive) StatusGreenBg else StatusGrayBg
                )
                StatusPill(
                    label = amountLabel,
                    foreground = MaterialTheme.colorScheme.onSurface,
                    background = MaterialTheme.colorScheme.surfaceVariant
                )
                StatusPill(
                    label = stringResource(R.string.links_used_count, link.usedCount),
                    foreground = MaterialTheme.colorScheme.onSurfaceVariant,
                    background = MaterialTheme.colorScheme.surfaceVariant
                )
            }

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = shareUrl,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onCopy,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    )
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(stringResource(R.string.links_copy), style = MaterialTheme.typography.labelLarge)
                }

                OutlinedButton(
                    onClick = onShare,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(stringResource(R.string.links_share), style = MaterialTheme.typography.labelLarge)
                }

                IconButton(
                    onClick = onDeleteClick,
                    enabled = !isMutating,
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.DeleteOutline,
                        contentDescription = stringResource(R.string.links_delete_confirm),
                        tint = OrbitSemanticColors.statusRed
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyLinksCard(onCreateClick: () -> Unit) {
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
                imageVector = Icons.Default.Link,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(34.dp)
            )
            Text(
                text = stringResource(R.string.links_empty_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = stringResource(R.string.links_empty_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Button(
                onClick = onCreateClick,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(stringResource(R.string.links_create_button))
            }
        }
    }
}

@Composable
private fun CreatePaymentLinkDialog(
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onCreate: (
        title: String,
        description: String?,
        amountType: String,
        fixedAmount: Double?,
        minAmount: Double?,
        maxAmount: Double?
    ) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var amountTabIndex by remember { mutableStateOf(0) } // 0 = FIXED, 1 = OPEN
    var fixedAmountText by remember { mutableStateOf("500") }
    var minAmountText by remember { mutableStateOf("50") }
    var maxAmountText by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }

    val titleRequiredError = stringResource(R.string.links_error_title_required)
    val amountRequiredError = stringResource(R.string.links_error_amount_required)

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
                text = stringResource(R.string.links_create_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = {
                        title = it
                        localError = null
                    },
                    label = { Text(stringResource(R.string.links_field_title)) },
                    placeholder = { Text(stringResource(R.string.links_field_title_hint)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text(stringResource(R.string.links_field_desc)) },
                    placeholder = { Text(stringResource(R.string.links_field_desc_hint)) },
                    maxLines = 2,
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

                SegmentedPillTabs(
                    options = listOf(
                        stringResource(R.string.links_type_fixed),
                        stringResource(R.string.links_type_open)
                    ),
                    selectedIndex = amountTabIndex,
                    onSelect = {
                        amountTabIndex = it
                        localError = null
                    }
                )

                if (amountTabIndex == 0) {
                    OutlinedTextField(
                        value = fixedAmountText,
                        onValueChange = {
                            fixedAmountText = it
                            localError = null
                        },
                        label = { Text(stringResource(R.string.links_field_amount)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = minAmountText,
                            onValueChange = { minAmountText = it },
                            label = { Text(stringResource(R.string.links_field_min)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = fieldColors,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = maxAmountText,
                            onValueChange = { maxAmountText = it },
                            label = { Text(stringResource(R.string.links_field_max)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = fieldColors,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

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
                    val trimmedTitle = title.trim()
                    if (trimmedTitle.length < 2) {
                        localError = titleRequiredError
                        return@Button
                    }
                    if (amountTabIndex == 0) {
                        val amt = fixedAmountText.toDoubleOrNull()
                        if (amt == null || amt <= 0.0) {
                            localError = amountRequiredError
                            return@Button
                        }
                        onCreate(trimmedTitle, description.ifBlank { null }, "FIXED", amt, null, null)
                    } else {
                        val minAmt = minAmountText.toDoubleOrNull()
                        val maxAmt = maxAmountText.toDoubleOrNull()
                        onCreate(trimmedTitle, description.ifBlank { null }, "OPEN", null, minAmt, maxAmt)
                    }
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
                    Text(stringResource(R.string.links_create_submit))
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
