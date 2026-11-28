package com.orbitsaas.payment.ui.search

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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SimCard
import androidx.compose.material.icons.filled.Sms
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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.MerchantProjectDto
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.data.remote.PaymentLinkDto
import com.orbitsaas.payment.data.remote.WalletRotationDto
import com.orbitsaas.payment.ui.components.ApproveIntentDialog
import com.orbitsaas.payment.ui.components.MediumTagChip
import com.orbitsaas.payment.ui.components.OrbitSnackbarHost
import com.orbitsaas.payment.ui.components.PaymentIntentCard
import com.orbitsaas.payment.ui.components.ProjectTagChip
import com.orbitsaas.payment.ui.components.ProviderBadgeChip
import com.orbitsaas.payment.ui.components.RejectIntentDialog
import com.orbitsaas.payment.ui.components.StatusPill
import com.orbitsaas.payment.ui.components.TransactionStatusBadge
import com.orbitsaas.payment.ui.components.formatBdtAmount
import com.orbitsaas.payment.ui.components.formatBusinessIntentTitle
import com.orbitsaas.payment.ui.components.formatBusinessOrderHeadline
import com.orbitsaas.payment.ui.components.formatBusinessOrderSubRef
import com.orbitsaas.payment.ui.components.formatFullTimestamp
import com.orbitsaas.payment.ui.components.formatRelativeTime
import com.orbitsaas.payment.ui.components.formatShortTimestamp
import com.orbitsaas.payment.ui.components.intentStatusBadgeColors
import com.orbitsaas.payment.ui.components.isDeliveryOrder
import com.orbitsaas.payment.ui.components.isPaymentLinkOrder
import com.orbitsaas.payment.ui.components.parseIsoEpochMs
import com.orbitsaas.payment.ui.components.resolvePaymentMediumLabel
import com.orbitsaas.payment.ui.components.resolvePaymentProjectLabel
import com.orbitsaas.payment.ui.components.verticalDisplayName
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import com.orbitsaas.payment.ui.viewmodel.GlobalSearchViewModel
import com.orbitsaas.payment.ui.viewmodel.SearchCategory
import com.orbitsaas.payment.ui.viewmodel.SearchSmsItem
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun UniversalSearchScreen(
    dashboardState: DashboardUiState,
    onBackClick: () -> Unit,
    onResolveIntent: (intentId: String, decision: String, expectedStateVersion: Int?, reason: String?) -> Unit,
    onTriggerIntentAction: (intentId: String, actionId: String, actionLabel: String) -> Unit,
    onOrderAction: (externalOrderId: String, action: String) -> Unit,
    onOpenLinksTab: () -> Unit,
    onOpenSimPoolTab: () -> Unit,
    onClearFeedback: () -> Unit,
    searchViewModel: GlobalSearchViewModel = viewModel()
) {
    val searchState by searchViewModel.uiState.collectAsState()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val focusRequester = remember { FocusRequester() }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var inspectedIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }
    var pendingApproveIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }
    var pendingRejectIntent by remember { mutableStateOf<PaymentIntentDto?>(null) }
    var inspectedOrder by remember { mutableStateOf<MerchantOrderDto?>(null) }
    var inspectedSms by remember { mutableStateOf<SearchSmsItem?>(null) }

    LaunchedEffect(dashboardState) {
        searchViewModel.bindDashboardState(dashboardState)
        inspectedIntent?.let { cur ->
            dashboardState.paymentIntents.firstOrNull { it.id == cur.id }?.let { inspectedIntent = it }
        }
        inspectedOrder?.let { cur ->
            dashboardState.orders.firstOrNull { it.externalOrderId == cur.externalOrderId }?.let { inspectedOrder = it }
        }
    }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    LaunchedEffect(dashboardState.feedbackMessage) {
        dashboardState.feedbackMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            onClearFeedback()
        }
    }

    val categoryOptions = listOf(
        Triple(SearchCategory.ALL, stringResource(R.string.search_cat_all), searchState.totalCount),
        Triple(SearchCategory.PAYMENTS, stringResource(R.string.search_cat_payments), searchState.matchedPayments.size),
        Triple(SearchCategory.ORDERS, stringResource(R.string.search_cat_orders), searchState.matchedOrders.size),
        Triple(SearchCategory.LINKS, stringResource(R.string.search_cat_links), searchState.matchedLinks.size),
        Triple(SearchCategory.SMS, stringResource(R.string.search_cat_sms), searchState.matchedSms.size),
        Triple(SearchCategory.SIMS, stringResource(R.string.search_cat_sims), searchState.matchedWallets.size),
        Triple(SearchCategory.PROJECTS, stringResource(R.string.search_cat_projects), searchState.matchedProjects.size)
    )

    val quickSuggestions = remember(dashboardState.projects) {
        buildList {
            add("Pending")
            add("Verified")
            add("Payment Link")
            add("bKash")
            add("Nagad")
            add("COD")
            dashboardState.projects.take(3).forEach { add(it.name) }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    OutlinedTextField(
                        value = searchState.query,
                        onValueChange = { searchViewModel.updateQuery(it) },
                        placeholder = {
                            Text(
                                text = stringResource(R.string.search_bar_placeholder),
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
                            if (searchState.query.isNotEmpty()) {
                                IconButton(
                                    onClick = { searchViewModel.updateQuery("") },
                                    modifier = Modifier.size(40.dp)
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
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(
                            onSearch = {
                                searchViewModel.recordRecentQuery(searchState.query)
                                keyboard?.hide()
                            }
                        ),
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(end = 8.dp)
                            .focusRequester(focusRequester)
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                            tint = MaterialTheme.colorScheme.onBackground
                        )
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
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (searchState.isSearchingServer) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary
                )
            }

            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(top = 4.dp)
            ) {
                items(categoryOptions, key = { it.first.name }) { (cat, label, count) ->
                    val selected = searchState.selectedCategory == cat
                    FilterChip(
                        selected = selected,
                        onClick = { searchViewModel.selectCategory(cat) },
                        modifier = Modifier.defaultMinSize(minHeight = 42.dp),
                        label = {
                            Text(
                                text = "$label ($count)",
                                style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum")
                            )
                        },
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

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 4.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (searchState.query.isBlank()) {
                    if (searchState.recentQueries.isNotEmpty()) {
                        item {
                            SearchSectionHeader(
                                title = stringResource(R.string.search_recent_title),
                                count = searchState.recentQueries.size
                            )
                        }
                        item {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                searchState.recentQueries.forEach { recent ->
                                    Surface(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(10.dp))
                                            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                                            .clickable { searchViewModel.updateQuery(recent) },
                                        color = MaterialTheme.colorScheme.surface
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.History,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.size(14.dp)
                                            )
                                            Text(recent, style = MaterialTheme.typography.labelLarge)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_suggestions_title),
                            count = quickSuggestions.size
                        )
                    }
                    item {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            quickSuggestions.forEach { tag ->
                                Surface(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(10.dp))
                                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                                        .clickable {
                                            searchViewModel.updateQuery(tag)
                                            searchViewModel.recordRecentQuery(tag)
                                        },
                                    color = MaterialTheme.colorScheme.surfaceVariant
                                ) {
                                    Text(
                                        text = tag,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }

                val showPayments = (searchState.selectedCategory == SearchCategory.ALL ||
                    searchState.selectedCategory == SearchCategory.PAYMENTS) &&
                    searchState.matchedPayments.isNotEmpty()
                val showOrders = (searchState.selectedCategory == SearchCategory.ALL ||
                    searchState.selectedCategory == SearchCategory.ORDERS) &&
                    searchState.matchedOrders.isNotEmpty()
                val showLinks = (searchState.selectedCategory == SearchCategory.ALL ||
                    searchState.selectedCategory == SearchCategory.LINKS) &&
                    searchState.matchedLinks.isNotEmpty()
                val showSms = (searchState.selectedCategory == SearchCategory.ALL ||
                    searchState.selectedCategory == SearchCategory.SMS) &&
                    searchState.matchedSms.isNotEmpty()
                val showSims = (searchState.selectedCategory == SearchCategory.ALL ||
                    searchState.selectedCategory == SearchCategory.SIMS) &&
                    searchState.matchedWallets.isNotEmpty()
                val showProjects = (searchState.selectedCategory == SearchCategory.ALL ||
                    searchState.selectedCategory == SearchCategory.PROJECTS) &&
                    searchState.matchedProjects.isNotEmpty()

                val hasVisibleResults = showPayments || showOrders || showLinks || showSms || showSims || showProjects

                if (!hasVisibleResults && searchState.query.isNotBlank() && !searchState.isSearchingServer) {
                    item {
                        SearchEmptyCard(query = searchState.query)
                    }
                }

                if (showPayments) {
                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_cat_payments),
                            count = searchState.matchedPayments.size
                        )
                    }
                    items(searchState.matchedPayments, key = { "pay_${it.id}" }) { intent ->
                        SearchPaymentCard(
                            intent = intent,
                            fallbackAppName = dashboardState.storeName,
                            onClick = {
                                searchViewModel.recordRecentQuery(searchState.query)
                                inspectedIntent = intent
                            }
                        )
                    }
                }

                if (showOrders) {
                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_cat_orders),
                            count = searchState.matchedOrders.size
                        )
                    }
                    items(searchState.matchedOrders, key = { "ord_${it.externalOrderId}" }) { order ->
                        SearchOrderCard(
                            order = order,
                            onClick = {
                                searchViewModel.recordRecentQuery(searchState.query)
                                inspectedOrder = order
                            }
                        )
                    }
                }

                if (showLinks) {
                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_cat_links),
                            count = searchState.matchedLinks.size
                        )
                    }
                    items(searchState.matchedLinks, key = { "lnk_${it.id}" }) { link ->
                        SearchLinkCard(
                            link = link,
                            fallbackProject = dashboardState.storeName,
                            onCopy = {
                                val url = link.shareUrl.ifBlank {
                                    dashboardState.serverUrl.trimEnd('/') + link.sharePath
                                }
                                clipboard.setText(AnnotatedString(url))
                                scope.launch {
                                    snackbarHostState.showSnackbar(context.getString(R.string.links_copied_message))
                                }
                            },
                            onOpenLinks = {
                                searchViewModel.recordRecentQuery(searchState.query)
                                onOpenLinksTab()
                            }
                        )
                    }
                }

                if (showSms) {
                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_cat_sms),
                            count = searchState.matchedSms.size
                        )
                    }
                    items(searchState.matchedSms, key = { "sms_${it.id}" }) { sms ->
                        SearchSmsCard(
                            sms = sms,
                            onClick = {
                                searchViewModel.recordRecentQuery(searchState.query)
                                inspectedSms = sms
                            }
                        )
                    }
                }

                if (showSims) {
                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_cat_sims),
                            count = searchState.matchedWallets.size
                        )
                    }
                    items(searchState.matchedWallets, key = { "sim_${it.id}" }) { wallet ->
                        SearchWalletCard(
                            wallet = wallet,
                            onClick = {
                                searchViewModel.recordRecentQuery(searchState.query)
                                onOpenSimPoolTab()
                            }
                        )
                    }
                }

                if (showProjects) {
                    item {
                        SearchSectionHeader(
                            title = stringResource(R.string.search_cat_projects),
                            count = searchState.matchedProjects.size
                        )
                    }
                    items(searchState.matchedProjects, key = { "prj_${it.id}" }) { project ->
                        SearchProjectCard(
                            project = project,
                            onClick = {
                                searchViewModel.recordRecentQuery(project.name)
                                searchViewModel.updateQuery(project.name)
                            }
                        )
                    }
                }
            }
        }
    }

    inspectedIntent?.let { intent ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { inspectedIntent = null },
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
                    serverBaseUrl = dashboardState.serverUrl,
                    fallbackAppName = dashboardState.storeName,
                    isActionInProgress = dashboardState.actionInProgressIntentId == intent.id,
                    onApproveClick = { pendingApproveIntent = intent },
                    onRejectClick = { pendingRejectIntent = intent },
                    onDynamicActionClick = { action ->
                        onTriggerIntentAction(intent.id, action.id, action.label)
                    }
                )
            }
        }
    }

    inspectedOrder?.let { order ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { inspectedOrder = null },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            SearchOrderDetailSheet(
                order = order,
                isActionInProgress = dashboardState.actionInProgressOrderId == order.externalOrderId,
                onActionClick = { action -> onOrderAction(order.externalOrderId, action) }
            )
        }
    }

    inspectedSms?.let { sms ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { inspectedSms = null },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            SearchSmsDetailSheet(
                sms = sms,
                onCopyTrxId = {
                    clipboard.setText(AnnotatedString(sms.trxId))
                    scope.launch {
                        snackbarHostState.showSnackbar(
                            context.getString(R.string.history_copied_trx, sms.trxId)
                        )
                    }
                }
            )
        }
    }

    pendingApproveIntent?.let { intent ->
        ApproveIntentDialog(
            intent = intent,
            isSubmitting = dashboardState.actionInProgressIntentId == intent.id,
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
            isSubmitting = dashboardState.actionInProgressIntentId == intent.id,
            onDismiss = { pendingRejectIntent = null },
            onConfirmReject = { reason ->
                onResolveIntent(intent.id, "REJECT", intent.stateVersion, reason)
                pendingRejectIntent = null
            }
        )
    }
}

@Composable
private fun SearchSectionHeader(title: String, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 6.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SearchPaymentCard(
    intent: PaymentIntentDto,
    fallbackAppName: String,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(16.dp)
    val projectLabel = resolvePaymentProjectLabel(intent, fallbackAppName)
    val (mediumLabel, mediumIcon) = resolvePaymentMediumLabel(intent)
    val (statusLabel, statusFg, statusBg) = intentStatusBadgeColors(intent.status)
    val amount = intent.paidAmount ?: intent.uniqueAmount

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
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
                FlowRow(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    ProjectTagChip(projectName = projectLabel)
                    MediumTagChip(label = mediumLabel, icon = mediumIcon)
                }
                Spacer(modifier = Modifier.size(8.dp))
                StatusPill(label = statusLabel, foreground = statusFg, background = statusBg)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = formatBusinessIntentTitle(context, intent),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    val sub = buildList {
                        intent.provider?.takeIf { it.isNotBlank() }?.let { add(it) }
                        intent.trxId?.takeIf { it.isNotBlank() }?.let { add(it) }
                        intent.senderNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
                        parseIsoEpochMs(intent.createdAt)?.let { add(formatShortTimestamp(it)) }
                    }.joinToString(" · ")
                    if (sub.isNotBlank()) {
                        Text(
                            text = sub,
                            style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = formatBdtAmount(amount),
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold,
                    color = if (intent.status.equals("VERIFIED", ignoreCase = true)) {
                        OrbitSemanticColors.statusGreen
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SearchOrderCard(
    order: MerchantOrderDto,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(16.dp)
    val isLink = isPaymentLinkOrder(order)
    val orderUpper = order.orderStatus.uppercase(Locale.US)
    val (fg, bg) = when (orderUpper) {
        "CONFIRMED", "SHIPPED", "DELIVERED", "COMPLETED" -> OrbitSemanticColors.statusGreen to StatusGreenBg
        "CANCELLED", "REJECTED" -> OrbitSemanticColors.statusRed to StatusRedBg
        else -> OrbitSemanticColors.statusAmber to StatusAmberBg
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                order.projectName?.takeIf { it.isNotBlank() }?.let { ProjectTagChip(it) }
                MediumTagChip(
                    label = stringResource(if (isLink) R.string.medium_payment_link else R.string.medium_storefront_checkout),
                    icon = if (isLink) Icons.Default.Link else Icons.Default.LocalShipping
                )
                StatusPill(label = orderUpper.replace("_", " "), foreground = fg, background = bg)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = formatBusinessOrderHeadline(context, order),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    val sub = listOfNotNull(
                        formatBusinessOrderSubRef(context, order),
                        order.customerPhone?.takeIf { it.isNotBlank() },
                        order.paymentMethod
                    ).joinToString(" · ")
                    if (sub.isNotBlank()) {
                        Text(
                            text = sub,
                            style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = formatBdtAmount(order.baseAmount),
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SearchLinkCard(
    link: PaymentLinkDto,
    fallbackProject: String,
    onCopy: () -> Unit,
    onOpenLinks: () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    val amountText = if (link.amountType.equals("FIXED", ignoreCase = true)) {
        link.fixedAmount?.let { formatBdtAmount(it) } ?: stringResource(R.string.links_fixed_amount)
    } else {
        stringResource(R.string.links_open_amount)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onOpenLinks),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                ProjectTagChip(link.projectName?.takeIf { it.isNotBlank() } ?: fallbackProject)
                MediumTagChip(label = verticalDisplayName(link.vertical), icon = Icons.Default.Category)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = link.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "/${link.slug} · $amountText",
                        style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = onCopy, modifier = Modifier.size(44.dp)) {
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = stringResource(R.string.links_copy),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchSmsCard(
    sms: SearchSmsItem,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
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
                    ProviderBadgeChip(provider = sms.provider)
                    Text(
                        text = sms.trxId,
                        style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = formatBdtAmount(sms.amount),
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold,
                    color = OrbitSemanticColors.statusGreen
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = listOfNotNull(
                        sms.senderNumber.takeIf { it.isNotBlank() },
                        sms.externalOrderId?.let { "#$it" },
                        formatRelativeTime(context, sms.receivedAtMs)
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.size(8.dp))
                TransactionStatusBadge(status = sms.status)
            }
        }
    }
}

@Composable
private fun SearchWalletCard(
    wallet: WalletRotationDto,
    onClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = cardShape
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ProviderBadgeChip(provider = wallet.provider)
                Column {
                    Text(
                        text = wallet.walletNumber,
                        style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = listOfNotNull(
                            wallet.accountType,
                            wallet.label?.takeIf { it.isNotBlank() },
                            wallet.deviceName?.takeIf { it.isNotBlank() }
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Icon(
                imageVector = Icons.Default.SimCard,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun SearchProjectCard(
    project: MerchantProjectDto,
    onClick: () -> Unit
) {
    val cardShape = RoundedCornerShape(16.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = cardShape
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.FolderOpen,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Column {
                    Text(
                        text = project.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "${project.slug} · ${project.walletSelectionMode} · ${project.verificationMode}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            StatusPill(
                label = if (project.isActive) stringResource(R.string.links_status_active) else stringResource(R.string.links_status_paused),
                foreground = if (project.isActive) OrbitSemanticColors.statusGreen else OrbitSemanticColors.statusGray,
                background = if (project.isActive) StatusGreenBg else StatusGrayBg
            )
        }
    }
}

@Composable
private fun SearchEmptyCard(query: String) {
    val cardShape = RoundedCornerShape(18.dp)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(36.dp)
            )
            Text(
                text = stringResource(R.string.search_empty_title, query),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center
            )
            Text(
                text = stringResource(R.string.search_empty_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SearchOrderDetailSheet(
    order: MerchantOrderDto,
    isActionInProgress: Boolean,
    onActionClick: (String) -> Unit
) {
    val context = LocalContext.current
    val normalizedOrder = order.orderStatus.uppercase(Locale.US)
    val normalizedPay = order.paymentStatus.uppercase(Locale.US)
    val showDelivery = isDeliveryOrder(order)

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
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = formatBusinessOrderHeadline(context, order),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                formatBusinessOrderSubRef(context, order)?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Text(
                text = formatBdtAmount(order.baseAmount),
                style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"),
                fontWeight = FontWeight.Bold
            )
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            order.projectName?.takeIf { it.isNotBlank() }?.let { ProjectTagChip(it) }
            StatusPill(
                label = normalizedOrder.replace("_", " "),
                foreground = OrbitSemanticColors.statusAmber,
                background = StatusAmberBg
            )
            StatusPill(
                label = normalizedPay.replace("_", " "),
                foreground = if (normalizedPay == "PAID") OrbitSemanticColors.statusGreen else OrbitSemanticColors.statusGray,
                background = if (normalizedPay == "PAID") StatusGreenBg else StatusGrayBg
            )
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        order.customerPhone?.takeIf { it.isNotBlank() }?.let {
            Text("Phone: $it", style = MaterialTheme.typography.bodyMedium)
        }
        order.itemsSummary?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        order.shippingAddress?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (normalizedOrder !in setOf("CANCELLED", "DELIVERED", "COMPLETED")) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val btnShape = RoundedCornerShape(12.dp)
                if (normalizedOrder in setOf("PENDING", "NEW", "PLACED", "AWAITING_CONFIRMATION")) {
                    Button(
                        onClick = { onActionClick("CONFIRM") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.size(6.dp))
                        Text(stringResource(R.string.order_action_confirm))
                    }
                }
                if (showDelivery && normalizedOrder !in setOf("READY_TO_SHIP", "SHIPPED")) {
                    OutlinedButton(
                        onClick = { onActionClick("READY_TO_SHIP") },
                        enabled = !isActionInProgress,
                        modifier = Modifier.heightIn(min = 48.dp),
                        shape = btnShape
                    ) {
                        Icon(Icons.Default.Inventory2, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.size(6.dp))
                        Text(stringResource(R.string.order_action_ready_to_ship))
                    }
                }
                if (normalizedPay != "PAID") {
                    Button(
                        onClick = { onActionClick("MARK_PAID") },
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
                        onClick = { onActionClick("CANCEL") },
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

@Composable
private fun SearchSmsDetailSheet(
    sms: SearchSmsItem,
    onCopyTrxId: () -> Unit
) {
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
            ProviderBadgeChip(provider = sms.provider)
            TransactionStatusBadge(status = sms.status)
        }
        Text(
            text = formatBdtAmount(sms.amount),
            style = MaterialTheme.typography.headlineLarge.copy(fontFeatureSettings = "tnum"),
            fontWeight = FontWeight.Bold,
            color = OrbitSemanticColors.statusGreen
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Text("TrxID: ${sms.trxId}", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)
        Text("Sender: ${sms.senderNumber}", fontFamily = FontFamily.Monospace)
        sms.externalOrderId?.takeIf { it.isNotBlank() }?.let {
            Text("Order: #$it", fontFamily = FontFamily.Monospace)
        }
        if (sms.receivedAtMs > 0L) {
            Text(formatFullTimestamp(sms.receivedAtMs), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
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
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
        Button(
            onClick = onCopyTrxId,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.size(6.dp))
            Text(stringResource(R.string.history_copy_trx))
        }
    }
}
