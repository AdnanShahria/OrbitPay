package com.orbitsaas.payment.ui.links

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.MerchantProjectDto
import com.orbitsaas.payment.data.remote.PaymentLinkDto
import com.orbitsaas.payment.ui.components.MediumTagChip
import com.orbitsaas.payment.ui.components.OrbitSnackbarHost
import com.orbitsaas.payment.ui.components.ProjectTagChip
import com.orbitsaas.payment.ui.components.SegmentedPillTabs
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.components.verticalDisplayName
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import kotlinx.coroutines.launch
import java.util.Locale

private val LINK_VERTICAL_KEYS = listOf(
    "custom",
    "invoice_b2b",
    "ecommerce",
    "lms_course",
    "saas_subscription",
    "booking_appointment",
    "donation",
    "digital_topup"
)

private val LINK_VERIFICATION_MODES = listOf(
    "DEFAULT",
    "AUTO",
    "PURE_MANUAL"
)

private const val PROJECT_FILTER_ALL = "__ALL__"
private const val PROJECT_FILTER_DEFAULT = "__DEFAULT__"

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
        projectId: String?,
        vertical: String,
        slug: String?,
        verificationMode: String?,
        maxUses: Int?,
        returnUrl: String?,
        onDone: (Boolean) -> Unit
    ) -> Unit,
    onUpdateLink: (
        linkId: String,
        title: String,
        description: String?,
        amountType: String,
        fixedAmount: Double?,
        minAmount: Double?,
        maxAmount: Double?,
        projectId: String?,
        vertical: String,
        slug: String?,
        verificationMode: String?,
        maxUses: Int?,
        returnUrl: String?,
        onDone: (Boolean) -> Unit
    ) -> Unit = { _, _, _, _, _, _, _, _, _, _, _, _, _, onDone -> onDone(false) },
    onToggleActive: (linkId: String, isActive: Boolean) -> Unit,
    onDeleteLink: (linkId: String) -> Unit,
    onClearFeedback: () -> Unit,
    onSearchClick: () -> Unit = {}
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var showCreateSheet by remember { mutableStateOf(false) }
    var editingLink by remember { mutableStateOf<PaymentLinkDto?>(null) }
    var pendingDeleteLink by remember { mutableStateOf<PaymentLinkDto?>(null) }
    var selectedProjectFilter by remember { mutableStateOf(PROJECT_FILTER_ALL) }

    LaunchedEffect(state.feedbackMessage) {
        state.feedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            onClearFeedback()
        }
    }

    val filteredLinks = remember(state.paymentLinks, selectedProjectFilter) {
        when (selectedProjectFilter) {
            PROJECT_FILTER_ALL -> state.paymentLinks
            PROJECT_FILTER_DEFAULT -> state.paymentLinks.filter { it.projectId.isNullOrBlank() }
            else -> state.paymentLinks.filter { it.projectId == selectedProjectFilter }
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
                onClick = { showCreateSheet = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = stringResource(R.string.links_create_button)
                )
            }
        },
        snackbarHost = { OrbitSnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (state.projects.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(top = 4.dp)
                ) {
                    item(key = PROJECT_FILTER_ALL) {
                        val selected = selectedProjectFilter == PROJECT_FILTER_ALL
                        FilterChip(
                            selected = selected,
                            onClick = { selectedProjectFilter = PROJECT_FILTER_ALL },
                            modifier = Modifier.defaultMinSize(minHeight = 42.dp),
                            label = { Text(stringResource(R.string.links_filter_all_projects)) },
                            shape = RoundedCornerShape(12.dp),
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                containerColor = MaterialTheme.colorScheme.surface,
                                labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                    item(key = PROJECT_FILTER_DEFAULT) {
                        val selected = selectedProjectFilter == PROJECT_FILTER_DEFAULT
                        FilterChip(
                            selected = selected,
                            onClick = { selectedProjectFilter = PROJECT_FILTER_DEFAULT },
                            modifier = Modifier.defaultMinSize(minHeight = 42.dp),
                            label = { Text(stringResource(R.string.links_project_merchant_default_short)) },
                            shape = RoundedCornerShape(12.dp),
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                containerColor = MaterialTheme.colorScheme.surface,
                                labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                    items(state.projects, key = { it.id }) { project ->
                        val selected = selectedProjectFilter == project.id
                        FilterChip(
                            selected = selected,
                            onClick = { selectedProjectFilter = project.id },
                            modifier = Modifier.defaultMinSize(minHeight = 42.dp),
                            label = { Text(project.name) },
                            shape = RoundedCornerShape(12.dp),
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                                containerColor = MaterialTheme.colorScheme.surface,
                                labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 4.dp, bottom = 92.dp),
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
                } else if (filteredLinks.isEmpty()) {
                    item {
                        EmptyLinksCard(onCreateClick = { showCreateSheet = true })
                    }
                } else {
                    items(filteredLinks, key = { it.id }) { link ->
                        val shareUrl = resolveLinkShareUrl(state.serverUrl, link)
                        PaymentLinkCard(
                            link = link,
                            fallbackProjectName = state.storeName.ifBlank { stringResource(R.string.app_name) },
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
                            onEditClick = { editingLink = link },
                            onToggleActive = { active -> onToggleActive(link.id, active) },
                            onDeleteClick = { pendingDeleteLink = link }
                        )
                    }
                }
            }
        }
    }

    if (showCreateSheet || editingLink != null) {
        val currentEditing = editingLink
        val initialProject = if (currentEditing != null) {
            currentEditing.projectId
        } else if (selectedProjectFilter != PROJECT_FILTER_ALL && selectedProjectFilter != PROJECT_FILTER_DEFAULT) {
            selectedProjectFilter
        } else {
            null
        }
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = {
                if (!state.isLinkMutating) {
                    showCreateSheet = false
                    editingLink = null
                }
            },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            PaymentLinkFormSheet(
                existingLink = currentEditing,
                initialProjectId = initialProject,
                projects = state.projects,
                storeName = state.storeName,
                serverUrl = state.serverUrl,
                isSubmitting = state.isLinkMutating,
                onDismiss = {
                    showCreateSheet = false
                    editingLink = null
                },
                onSubmit = { title, desc, amountType, fixedAmt, minAmt, maxAmt, projectId, vertical, slug, verMode, maxUses, returnUrl ->
                    if (currentEditing == null) {
                        onCreateLink(
                            title,
                            desc,
                            amountType,
                            fixedAmt,
                            minAmt,
                            maxAmt,
                            projectId,
                            vertical,
                            slug,
                            verMode,
                            maxUses,
                            returnUrl
                        ) { ok ->
                            if (ok) showCreateSheet = false
                        }
                    } else {
                        onUpdateLink(
                            currentEditing.id,
                            title,
                            desc,
                            amountType,
                            fixedAmt,
                            minAmt,
                            maxAmt,
                            projectId ?: "",
                            vertical,
                            slug,
                            verMode,
                            maxUses,
                            returnUrl
                        ) { ok ->
                            if (ok) editingLink = null
                        }
                    }
                }
            )
        }
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
    fallbackProjectName: String,
    shareUrl: String,
    isMutating: Boolean,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onEditClick: () -> Unit,
    onToggleActive: (Boolean) -> Unit,
    onDeleteClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(18.dp)
    val amountLabel = when (link.amountType.uppercase(Locale.US)) {
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
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = cardShape
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                FlowRow(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    ProjectTagChip(
                        projectName = link.projectName?.takeIf { it.isNotBlank() } ?: fallbackProjectName
                    )
                    MediumTagChip(
                        label = verticalDisplayName(link.vertical),
                        icon = Icons.Default.Category
                    )
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
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
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

                    Spacer(modifier = Modifier.size(10.dp))

                    Text(
                        text = amountLabel,
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
                        label = if (link.isActive) stringResource(R.string.links_status_active) else stringResource(R.string.links_status_paused),
                        foreground = if (link.isActive) OrbitSemanticColors.statusGreen else OrbitSemanticColors.statusGray,
                        background = if (link.isActive) StatusGreenBg else StatusGrayBg
                    )
                    StatusPill(
                        label = stringResource(R.string.links_used_count, link.usedCount),
                        foreground = MaterialTheme.colorScheme.onSurfaceVariant,
                        background = MaterialTheme.colorScheme.surfaceVariant
                    )
                    link.verificationMode?.takeIf { it.isNotBlank() }?.let { mode ->
                        StatusPill(
                            label = mode.replace("_", " "),
                            foreground = MaterialTheme.colorScheme.onSurface,
                            background = MaterialTheme.colorScheme.surfaceVariant
                        )
                    }
                }

                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                        .clickable(onClick = onCopy),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = shareUrl,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelMedium,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.size(8.dp))
                        Icon(
                            imageVector = Icons.Default.ContentCopy,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
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
                        onClick = onEditClick,
                        enabled = !isMutating,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = stringResource(R.string.sim_pool_edit_button),
                            tint = MaterialTheme.colorScheme.onSurface
                        )
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
}

@Composable
private fun EmptyLinksCard(onCreateClick: () -> Unit) {
    val cardShape = RoundedCornerShape(18.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PaymentLinkFormSheet(
    existingLink: PaymentLinkDto?,
    initialProjectId: String?,
    projects: List<MerchantProjectDto>,
    storeName: String,
    serverUrl: String,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (
        title: String,
        description: String?,
        amountType: String,
        fixedAmount: Double?,
        minAmount: Double?,
        maxAmount: Double?,
        projectId: String?,
        vertical: String,
        slug: String?,
        verificationMode: String?,
        maxUses: Int?,
        returnUrl: String?
    ) -> Unit
) {
    var selectedProjectId by remember(existingLink?.id, initialProjectId) {
        mutableStateOf(existingLink?.projectId ?: initialProjectId)
    }
    var selectedVertical by remember(existingLink?.id) {
        mutableStateOf(existingLink?.vertical?.ifBlank { "custom" } ?: "custom")
    }
    var title by remember(existingLink?.id) { mutableStateOf(existingLink?.title.orEmpty()) }
    var description by remember(existingLink?.id) { mutableStateOf(existingLink?.description.orEmpty()) }
    var amountTabIndex by remember(existingLink?.id) {
        mutableIntStateOf(if (existingLink?.amountType.equals("OPEN", ignoreCase = true)) 1 else 0)
    }
    var fixedAmountText by remember(existingLink?.id) {
        mutableStateOf(existingLink?.fixedAmount?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "500")
    }
    var minAmountText by remember(existingLink?.id) {
        mutableStateOf(existingLink?.minAmount?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "50")
    }
    var maxAmountText by remember(existingLink?.id) {
        mutableStateOf(existingLink?.maxAmount?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "")
    }
    var slugText by remember(existingLink?.id) { mutableStateOf(existingLink?.slug.orEmpty()) }
    var selectedVerificationMode by remember(existingLink?.id) {
        mutableStateOf(existingLink?.verificationMode?.ifBlank { "DEFAULT" } ?: "DEFAULT")
    }
    var maxUsesText by remember(existingLink?.id) {
        mutableStateOf(existingLink?.maxUses?.toString().orEmpty())
    }
    var returnUrlText by remember(existingLink?.id) { mutableStateOf(existingLink?.returnUrl.orEmpty()) }
    var showMoreOptions by remember(existingLink?.id) { mutableStateOf(false) }

    var projectDropdownExpanded by remember { mutableStateOf(false) }
    var verticalDropdownExpanded by remember { mutableStateOf(false) }
    var verModeDropdownExpanded by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }

    val titleRequiredError = stringResource(R.string.links_error_title_required)
    val amountRequiredError = stringResource(R.string.links_error_amount_required)
    val maxLessThanMinError = stringResource(R.string.links_error_max_lt_min)

    val fieldShape = RoundedCornerShape(12.dp)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
    )

    val selectedProject = remember(selectedProjectId, projects) {
        projects.firstOrNull { it.id == selectedProjectId }
    }
    val merchantDefaultLabel = stringResource(R.string.links_project_merchant_default)
    val selectedProjectLabel = selectedProject?.let { proj ->
        val simHint = if (proj.walletSelectionMode.equals("SPECIFIC", ignoreCase = true)) {
            stringResource(R.string.links_project_specific_sims, proj.walletIds.size)
        } else {
            stringResource(R.string.links_project_common_sims)
        }
        "${proj.name} · $simHint"
    } ?: merchantDefaultLabel

    val baseOrigin = serverUrl.trim().ifBlank { "https://payment.orbitsaas.cloud" }.removeSuffix("/")
    val previewSlug = slugText.trim().ifBlank {
        title.trim().lowercase(Locale.US).replace(Regex("[^a-z0-9]+"), "-").trim('-').ifBlank { "your-slug" }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = stringResource(if (existingLink == null) R.string.links_create_title else R.string.links_edit_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, fieldShape),
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = fieldShape
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Link,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = "$baseOrigin/${storeName.ifBlank { "store" }.lowercase(Locale.US).replace(Regex("[^a-z0-9]+"), "-")}/$previewSlug",
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        // 1. Project Dropdown (Receive Payment Under Project)
        ExposedDropdownMenuBox(
            expanded = projectDropdownExpanded,
            onExpandedChange = { projectDropdownExpanded = !projectDropdownExpanded },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = selectedProjectLabel,
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(R.string.links_field_project)) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.FolderOpen,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = projectDropdownExpanded)
                },
                shape = fieldShape,
                colors = fieldColors,
                singleLine = true,
                modifier = Modifier
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    .fillMaxWidth()
            )

            ExposedDropdownMenu(
                expanded = projectDropdownExpanded,
                onDismissRequest = { projectDropdownExpanded = false },
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                DropdownMenuItem(
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = merchantDefaultLabel,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = storeName.ifBlank { stringResource(R.string.app_name) },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    onClick = {
                        selectedProjectId = null
                        projectDropdownExpanded = false
                    }
                )
                projects.forEach { proj ->
                    val simHint = if (proj.walletSelectionMode.equals("SPECIFIC", ignoreCase = true)) {
                        stringResource(R.string.links_project_specific_sims, proj.walletIds.size)
                    } else {
                        stringResource(R.string.links_project_common_sims)
                    }
                    val modeHint = if (proj.accountMode.equals("STANDALONE", ignoreCase = true)) {
                        stringResource(R.string.links_project_mode_standalone)
                    } else {
                        stringResource(R.string.links_project_mode_connected)
                    }
                    DropdownMenuItem(
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = proj.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "$simHint · $modeHint",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        },
                        onClick = {
                            selectedProjectId = proj.id
                            projectDropdownExpanded = false
                        }
                    )
                }
            }
        }

        // 2. Payment Type / Category Dropdown (Personal/Custom, Corporate/B2B, E-Commerce, Course, etc.)
        ExposedDropdownMenuBox(
            expanded = verticalDropdownExpanded,
            onExpandedChange = { verticalDropdownExpanded = !verticalDropdownExpanded },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = verticalDisplayName(selectedVertical),
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(R.string.links_field_category)) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Category,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                trailingIcon = {
                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = verticalDropdownExpanded)
                },
                shape = fieldShape,
                colors = fieldColors,
                singleLine = true,
                modifier = Modifier
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    .fillMaxWidth()
            )

            ExposedDropdownMenu(
                expanded = verticalDropdownExpanded,
                onDismissRequest = { verticalDropdownExpanded = false },
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                LINK_VERTICAL_KEYS.forEach { key ->
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = verticalDisplayName(key),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (selectedVertical == key) FontWeight.SemiBold else FontWeight.Normal
                            )
                        },
                        onClick = {
                            selectedVertical = key
                            verticalDropdownExpanded = false
                        }
                    )
                }
            }
        }

        OutlinedTextField(
            value = title,
            onValueChange = {
                title = it
                localError = null
            },
            label = { Text(stringResource(R.string.links_field_title)) },
            placeholder = { Text(stringResource(R.string.links_field_title_hint)) },
            singleLine = true,
            shape = fieldShape,
            colors = fieldColors,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text(stringResource(R.string.links_field_desc)) },
            placeholder = { Text(stringResource(R.string.links_field_desc_hint)) },
            maxLines = 2,
            shape = fieldShape,
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
                shape = fieldShape,
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
                    shape = fieldShape,
                    colors = fieldColors,
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = maxAmountText,
                    onValueChange = { maxAmountText = it },
                    label = { Text(stringResource(R.string.links_field_max)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    shape = fieldShape,
                    colors = fieldColors,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Collapsible More Options (Verification Mode, Custom Slug, Max Uses, Return URL)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, fieldShape),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            shape = fieldShape
        ) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable { showMoreOptions = !showMoreOptions }
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.links_more_options),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Icon(
                        imageVector = if (showMoreOptions) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                AnimatedVisibility(visible = showMoreOptions) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        ExposedDropdownMenuBox(
                            expanded = verModeDropdownExpanded,
                            onExpandedChange = { verModeDropdownExpanded = !verModeDropdownExpanded },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val verModeLabel = when (selectedVerificationMode) {
                                "AUTO" -> stringResource(R.string.links_ver_mode_auto)
                                "PURE_MANUAL" -> stringResource(R.string.links_ver_mode_manual)
                                else -> stringResource(R.string.links_ver_mode_default)
                            }
                            OutlinedTextField(
                                value = verModeLabel,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text(stringResource(R.string.links_field_verification_mode)) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = verModeDropdownExpanded)
                                },
                                shape = fieldShape,
                                colors = fieldColors,
                                singleLine = true,
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .fillMaxWidth()
                            )
                            ExposedDropdownMenu(
                                expanded = verModeDropdownExpanded,
                                onDismissRequest = { verModeDropdownExpanded = false },
                                containerColor = MaterialTheme.colorScheme.surface
                            ) {
                                LINK_VERIFICATION_MODES.forEach { mode ->
                                    val label = when (mode) {
                                        "AUTO" -> stringResource(R.string.links_ver_mode_auto)
                                        "PURE_MANUAL" -> stringResource(R.string.links_ver_mode_manual)
                                        else -> stringResource(R.string.links_ver_mode_default)
                                    }
                                    DropdownMenuItem(
                                        text = { Text(label) },
                                        onClick = {
                                            selectedVerificationMode = mode
                                            verModeDropdownExpanded = false
                                        }
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = slugText,
                                onValueChange = {
                                    slugText = it.lowercase(Locale.US).replace(Regex("[^a-z0-9-]"), "-")
                                },
                                label = { Text(stringResource(R.string.links_field_slug)) },
                                placeholder = { Text("course-fee") },
                                singleLine = true,
                                shape = fieldShape,
                                colors = fieldColors,
                                modifier = Modifier.weight(1.3f)
                            )
                            OutlinedTextField(
                                value = maxUsesText,
                                onValueChange = { maxUsesText = it.filter { ch -> ch.isDigit() } },
                                label = { Text(stringResource(R.string.links_field_max_uses)) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                shape = fieldShape,
                                colors = fieldColors,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        OutlinedTextField(
                            value = returnUrlText,
                            onValueChange = { returnUrlText = it },
                            label = { Text(stringResource(R.string.links_field_return_url)) },
                            placeholder = { Text("https://yoursite.com/thank-you") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }

        localError?.let { err ->
            Text(
                text = err,
                style = MaterialTheme.typography.labelMedium,
                color = OrbitSemanticColors.statusRed
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedButton(
                onClick = onDismiss,
                enabled = !isSubmitting,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                shape = fieldShape,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                Text(stringResource(R.string.common_cancel))
            }

            Button(
                onClick = {
                    val trimmedTitle = title.trim()
                    if (trimmedTitle.length < 2) {
                        localError = titleRequiredError
                        return@Button
                    }
                    val verModeParam = if (selectedVerificationMode == "DEFAULT") null else selectedVerificationMode
                    val slugParam = slugText.trim().ifBlank { null }
                    val maxUsesParam = maxUsesText.trim().toIntOrNull()?.takeIf { it > 0 }
                    val returnUrlParam = returnUrlText.trim().ifBlank { null }

                    if (amountTabIndex == 0) {
                        val amt = fixedAmountText.toDoubleOrNull()
                        if (amt == null || amt <= 0.0) {
                            localError = amountRequiredError
                            return@Button
                        }
                        onSubmit(
                            trimmedTitle,
                            description.trim().ifBlank { null },
                            "FIXED",
                            amt,
                            null,
                            null,
                            selectedProjectId,
                            selectedVertical,
                            slugParam,
                            verModeParam,
                            maxUsesParam,
                            returnUrlParam
                        )
                    } else {
                        val minAmt = minAmountText.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()
                        val maxAmt = maxAmountText.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()
                        if (minAmountText.isNotBlank() && (minAmt == null || minAmt <= 0.0)) {
                            localError = amountRequiredError
                            return@Button
                        }
                        if (maxAmountText.isNotBlank() && (maxAmt == null || maxAmt <= 0.0)) {
                            localError = amountRequiredError
                            return@Button
                        }
                        if (minAmt != null && maxAmt != null && minAmt > maxAmt) {
                            localError = maxLessThanMinError
                            return@Button
                        }
                        onSubmit(
                            trimmedTitle,
                            description.trim().ifBlank { null },
                            "OPEN",
                            null,
                            minAmt,
                            maxAmt,
                            selectedProjectId,
                            selectedVertical,
                            slugParam,
                            verModeParam,
                            maxUsesParam,
                            returnUrlParam
                        )
                    }
                },
                enabled = !isSubmitting,
                modifier = Modifier
                    .weight(1.4f)
                    .heightIn(min = 48.dp),
                shape = fieldShape
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text(
                        text = stringResource(
                            if (existingLink == null) R.string.links_create_submit else R.string.links_save_submit
                        )
                    )
                }
            }
        }
    }
}
