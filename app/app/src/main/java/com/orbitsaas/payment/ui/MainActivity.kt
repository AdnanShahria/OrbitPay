package com.orbitsaas.payment.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.orbitsaas.payment.R
import com.orbitsaas.payment.service.DynamicPushDispatcher
import com.orbitsaas.payment.service.StickyForegroundService
import com.orbitsaas.payment.ui.diagnostics.DiagnosticsScreen
import com.orbitsaas.payment.ui.history.HistoryScreen
import com.orbitsaas.payment.ui.links.PaymentLinksScreen
import com.orbitsaas.payment.ui.orders.OrdersScreen
import com.orbitsaas.payment.ui.search.UniversalSearchScreen
import com.orbitsaas.payment.ui.theme.OrbitPaymentTheme
import com.orbitsaas.payment.ui.update.AppUpdateDialog
import com.orbitsaas.payment.ui.verify.VerifyScreen
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import com.orbitsaas.payment.ui.viewmodel.MainViewModel
import com.orbitsaas.payment.ui.wallets.SimPoolScreen
import com.orbitsaas.payment.update.AppUpdateManager
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val viewModel: MainViewModel by viewModels()

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        // Permissions handled; start foreground service if configured
        checkAndStartForegroundService()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        checkEssentialPermissions()
        handleIncomingNotificationIntent(intent)

        setContent {
            val uiState by viewModel.uiState.collectAsState()
            OrbitPaymentTheme(darkTheme = uiState.isDarkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    OrbitPaymentApp(
                        viewModel = viewModel,
                        uiState = uiState
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingNotificationIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        checkAndStartForegroundService()
        viewModel.refreshAllIfStale(force = false)
        lifecycleScope.launch {
            AppUpdateManager.checkForUpdates(
                context = this@MainActivity,
                userInitiated = false,
                autoDownload = true
            )
        }
    }

    private fun handleIncomingNotificationIntent(intent: Intent?) {
        if (intent == null) return
        val paymentIntentId = intent.getStringExtra(DynamicPushDispatcher.EXTRA_PAYMENT_INTENT_ID)
        val externalRefId = intent.getStringExtra(DynamicPushDispatcher.EXTRA_EXTERNAL_REF_ID)
        if (!paymentIntentId.isNullOrBlank() || !externalRefId.isNullOrBlank()) {
            viewModel.handleDeepLinkNotification(paymentIntentId, externalRefId)
        }
    }

    private fun checkEssentialPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.RECEIVE_SMS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.READ_SMS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            requestPermissionsLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    private fun checkAndStartForegroundService() {
        val state = viewModel.uiState.value
        if (state.isForegroundEnabled && state.merchantId.isNotBlank() && state.deviceKey.isNotBlank()) {
            try {
                StickyForegroundService.startService(this)
            } catch (e: Exception) {
                // Background start restriction may apply if app is backgrounded
            }
        }
    }
}

sealed class Screen(val route: String) {
    data object Dashboard : Screen("dashboard")
    data object Verify : Screen("verify")
    data object Links : Screen("links")
    data object Orders : Screen("orders")
    data object Wallets : Screen("wallets")
    data object History : Screen("history")
    data object Diagnostics : Screen("diagnostics")
    data object Onboarding : Screen("onboarding")
    data object Login : Screen("login")
    data object Settings : Screen("settings")
    data object Search : Screen("search")
}

private data class BottomNavDestination(
    val route: String,
    @StringRes val labelRes: Int,
    val icon: ImageVector
)

private val bottomNavDestinations = listOf(
    BottomNavDestination(Screen.Dashboard.route, R.string.nav_overview, Icons.Default.Home),
    BottomNavDestination(Screen.Verify.route, R.string.nav_payments, Icons.AutoMirrored.Filled.FactCheck),
    BottomNavDestination(Screen.Links.route, R.string.nav_links, Icons.Default.Link),
    BottomNavDestination(Screen.Orders.route, R.string.nav_orders, Icons.Default.ShoppingBag),
    BottomNavDestination(Screen.Wallets.route, R.string.nav_sim_pool, Icons.Default.AccountBalanceWallet)
)

private val loggedInRoutes = setOf(
    Screen.Dashboard.route,
    Screen.Verify.route,
    Screen.Links.route,
    Screen.Orders.route,
    Screen.Wallets.route
)

@Composable
fun OrbitPaymentApp(
    viewModel: MainViewModel,
    uiState: DashboardUiState
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val context = LocalContext.current
    val appScope = rememberCoroutineScope()
    val updateState by AppUpdateManager.state.collectAsState()

    val startDestination = remember {
        when {
            !uiState.isOnboardingCompleted -> Screen.Onboarding.route
            !uiState.isLoggedIn -> Screen.Login.route
            else -> Screen.Dashboard.route
        }
    }

    LaunchedEffect(uiState.isLoggedIn, uiState.isOnboardingCompleted) {
        if (uiState.isOnboardingCompleted && !uiState.isLoggedIn) {
            val activeRoute = navController.currentBackStackEntry?.destination?.route
            val previousRoute = navController.previousBackStackEntry?.destination?.route
            val onProtectedRoute = activeRoute in setOf(
                Screen.Dashboard.route,
                Screen.History.route,
                Screen.Verify.route,
                Screen.Links.route,
                Screen.Orders.route,
                Screen.Wallets.route,
                Screen.Diagnostics.route
            ) || (activeRoute == Screen.Settings.route && previousRoute != Screen.Login.route)

            if (onProtectedRoute) {
                navController.navigate(Screen.Login.route) {
                    popUpTo(0) { inclusive = true }
                }
            }
        }
    }

    LaunchedEffect(uiState.isLoggedIn, uiState.focusedPaymentIntentId) {
        if (uiState.isLoggedIn && !uiState.focusedPaymentIntentId.isNullOrBlank()) {
            val activeRoute = navController.currentBackStackEntry?.destination?.route
            if (activeRoute != Screen.Dashboard.route) {
                navController.navigate(Screen.Dashboard.route) {
                    popUpTo(Screen.Dashboard.route) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            }
        }
    }

    val navigateTopLevel: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(Screen.Dashboard.route) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
    }

    val navigateToDiagnostics: () -> Unit = {
        navController.navigate(Screen.Diagnostics.route) {
            launchSingleTop = true
        }
    }

    val navigateToSearch: () -> Unit = {
        navController.navigate(Screen.Search.route) {
            launchSingleTop = true
        }
    }

    val showBottomBar = uiState.isLoggedIn && currentRoute in loggedInRoutes

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (showBottomBar) {
                Column {
                    HorizontalDivider(
                        thickness = 1.dp,
                        color = MaterialTheme.colorScheme.outline
                    )
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                        tonalElevation = 0.dp
                    ) {
                        bottomNavDestinations.forEach { destination ->
                            val selected = currentRoute == destination.route
                            val label = stringResource(destination.labelRes)
                            NavigationBarItem(
                                selected = selected,
                                onClick = {
                                    if (!selected) {
                                        navigateTopLevel(destination.route)
                                    }
                                },
                                icon = {
                                    Icon(
                                        imageVector = destination.icon,
                                        contentDescription = label,
                                        modifier = Modifier.size(20.dp)
                                    )
                                },
                                label = {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                },
                                alwaysShowLabel = true,
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.onSurface,
                                    selectedTextColor = MaterialTheme.colorScheme.onSurface,
                                    indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding)
        ) {
            composable(Screen.Dashboard.route) {
                DashboardScreen(
                    state = uiState,
                    onSyncClick = { viewModel.syncNow() },
                    onSettingsClick = {
                        navController.navigate(Screen.Settings.route) {
                            launchSingleTop = true
                        }
                    },
                    onToggleTheme = { viewModel.toggleTheme() },
                    onClearFeedback = { viewModel.clearFeedbackMessage() },
                    onOrderAction = { externalOrderId, action ->
                        viewModel.performOrderAction(externalOrderId, action)
                    },
                    onRefreshOrders = { viewModel.refreshOrders() },
                    onResolveIntent = { intentId, decision, expectedStateVersion, reason ->
                        viewModel.resolvePaymentIntent(intentId, decision, expectedStateVersion, reason)
                    },
                    onTriggerIntentAction = { intentId, actionId, actionLabel ->
                        viewModel.triggerPaymentIntentAction(intentId, actionId, actionLabel)
                    },
                    onRefreshIntents = { viewModel.refreshPaymentIntents() },
                    onClearFocusedIntent = { viewModel.clearFocusedPaymentIntent() },
                    onOpenDiagnostics = navigateToDiagnostics,
                    onSearchClick = navigateToSearch
                )
            }

            composable(Screen.Verify.route) {
                VerifyScreen(onSearchClick = navigateToSearch)
            }

            composable(Screen.Links.route) {
                PaymentLinksScreen(
                    state = uiState,
                    onRefresh = {
                        viewModel.refreshPaymentLinks()
                        viewModel.refreshProjects()
                    },
                    onCreateLink = { title, desc, amountType, fixedAmt, minAmt, maxAmt, projectId, vertical, slug, verMode, maxUses, returnUrl, onDone ->
                        viewModel.createPaymentLink(
                            title = title,
                            description = desc,
                            amountType = amountType,
                            fixedAmount = fixedAmt,
                            minAmount = minAmt,
                            maxAmount = maxAmt,
                            projectId = projectId,
                            vertical = vertical,
                            slug = slug,
                            verificationMode = verMode,
                            maxUses = maxUses,
                            returnUrl = returnUrl,
                            onDone = onDone
                        )
                    },
                    onUpdateLink = { linkId, title, desc, amountType, fixedAmt, minAmt, maxAmt, projectId, vertical, slug, verMode, maxUses, returnUrl, onDone ->
                        viewModel.updatePaymentLinkDetails(
                            linkId = linkId,
                            title = title,
                            description = desc,
                            amountType = amountType,
                            fixedAmount = fixedAmt,
                            minAmount = minAmt,
                            maxAmount = maxAmt,
                            projectId = projectId,
                            vertical = vertical,
                            slug = slug,
                            verificationMode = verMode,
                            maxUses = maxUses,
                            returnUrl = returnUrl,
                            onDone = onDone
                        )
                    },
                    onToggleActive = { linkId, isActive ->
                        viewModel.togglePaymentLinkActive(linkId, isActive)
                    },
                    onDeleteLink = { linkId ->
                        viewModel.deletePaymentLink(linkId)
                    },
                    onClearFeedback = { viewModel.clearFeedbackMessage() },
                    onSearchClick = navigateToSearch
                )
            }

            composable(Screen.Orders.route) {
                OrdersScreen(
                    state = uiState,
                    onRefreshOrders = { viewModel.refreshOrders() },
                    onOrderAction = { externalOrderId, action ->
                        viewModel.performOrderAction(externalOrderId, action)
                    },
                    onClearFeedback = { viewModel.clearFeedbackMessage() },
                    onSearchClick = navigateToSearch
                )
            }

            composable(Screen.Wallets.route) {
                SimPoolScreen(
                    state = uiState,
                    onRefresh = { viewModel.refreshWalletsOverview() },
                    onCreateWallet = { provider, number, accountType, label, slotIdx, isPrimary, onDone ->
                        viewModel.createWallet(provider, number, accountType, label, slotIdx, isPrimary, onDone)
                    },
                    onUpdateWallet = { walletId, walletNumber, accountType, label, isPrimary, onDone ->
                        viewModel.updateWallet(walletId, walletNumber, accountType, label, isPrimary, onDone)
                    },
                    onToggleActive = { walletId, isActive ->
                        viewModel.toggleWalletActive(walletId, isActive)
                    },
                    onSetPrimary = { walletId ->
                        viewModel.setPrimaryWallet(walletId)
                    },
                    onDeleteWallet = { walletId ->
                        viewModel.deleteWallet(walletId)
                    },
                    onClearFeedback = { viewModel.clearFeedbackMessage() },
                    onSearchClick = navigateToSearch
                )
            }

            composable(Screen.Search.route) {
                UniversalSearchScreen(
                    dashboardState = uiState,
                    onBackClick = { navController.popBackStack() },
                    onResolveIntent = { intentId, decision, expectedStateVersion, reason ->
                        viewModel.resolvePaymentIntent(intentId, decision, expectedStateVersion, reason)
                    },
                    onTriggerIntentAction = { intentId, actionId, actionLabel ->
                        viewModel.triggerPaymentIntentAction(intentId, actionId, actionLabel)
                    },
                    onOrderAction = { externalOrderId, action ->
                        viewModel.performOrderAction(externalOrderId, action)
                    },
                    onOpenLinksTab = {
                        navController.popBackStack()
                        navigateTopLevel(Screen.Links.route)
                    },
                    onOpenSimPoolTab = {
                        navController.popBackStack()
                        navigateTopLevel(Screen.Wallets.route)
                    },
                    onClearFeedback = { viewModel.clearFeedbackMessage() }
                )
            }

            composable(Screen.History.route) {
                HistoryScreen()
            }

            composable(Screen.Diagnostics.route) {
                DiagnosticsScreen(
                    onBackClick = {
                        if (!navController.popBackStack()) {
                            navigateTopLevel(Screen.Dashboard.route)
                        }
                    },
                    onOpenSimPool = {
                        navigateTopLevel(Screen.Wallets.route)
                    }
                )
            }

            composable(Screen.Onboarding.route) {
                OnboardingScreen(
                    onComplete = {
                        viewModel.completeOnboarding()
                        val nextRoute = if (uiState.isLoggedIn) {
                            Screen.Dashboard.route
                        } else {
                            Screen.Login.route
                        }
                        navController.navigate(nextRoute) {
                            popUpTo(Screen.Onboarding.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Login.route) {
                LoginScreen(
                    state = uiState,
                    onLoginClick = { serverUrl, email, password ->
                        viewModel.loginMerchant(serverUrl, email, password) {
                            navController.navigate(Screen.Dashboard.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    },
                    onManualSetupClick = {
                        navController.navigate(Screen.Settings.route)
                    },
                    onToggleTheme = { viewModel.toggleTheme() },
                    onClearError = { viewModel.clearLoginError() }
                )
            }

            composable(Screen.Settings.route) {
                SettingsScreen(
                    state = uiState,
                    onBackClick = {
                        if (!navController.popBackStack() && uiState.isLoggedIn) {
                            navigateTopLevel(Screen.Dashboard.route)
                        }
                    },
                    onToggleTheme = { viewModel.toggleTheme() },
                    onOpenDiagnostics = navigateToDiagnostics,
                    onOpenSetupGuide = {
                        navController.navigate(Screen.Onboarding.route) {
                            launchSingleTop = true
                        }
                    },
                    onSaveSettings = { serverUrl, merchantId, deviceKey, enableForeground ->
                        val cameFromLogin = navController.previousBackStackEntry?.destination?.route == Screen.Login.route
                        viewModel.saveSettings(serverUrl, merchantId, deviceKey, enableForeground)
                        if (cameFromLogin && merchantId.isNotBlank() && deviceKey.isNotBlank()) {
                            navController.navigate(Screen.Dashboard.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        } else if (!uiState.isLoggedIn) {
                            navController.popBackStack()
                        } else {
                            navigateTopLevel(Screen.Dashboard.route)
                        }
                    },
                    onTestConnection = { serverUrl, merchantId, deviceKey, onResult ->
                        viewModel.testConnection(serverUrl, merchantId, deviceKey, onResult)
                    },
                    onLogoutClick = {
                        viewModel.logoutMerchant {
                            navController.navigate(Screen.Login.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }
                )
            }
        }
    }

    if (updateState.shouldShowDialog) {
        AppUpdateDialog(
            state = updateState,
            canInstallPackages = AppUpdateManager.canInstallPackages(context),
            onDownloadClick = {
                appScope.launch {
                    AppUpdateManager.downloadAndVerify(context)
                }
            },
            onInstallClick = {
                appScope.launch {
                    AppUpdateManager.installDownloadedUpdate(context)
                }
            },
            onOpenPermissionSettings = {
                AppUpdateManager.openInstallPermissionSettings(context)
            },
            onRetryClick = {
                appScope.launch {
                    AppUpdateManager.checkForUpdates(
                        context = context,
                        userInitiated = true,
                        autoDownload = true,
                        forceCheck = true
                    )
                }
            },
            onDismiss = {
                AppUpdateManager.dismissSoftUpdate()
            }
        )
    }
}
