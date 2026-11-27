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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Settings
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
import com.orbitsaas.payment.ui.theme.OrbitPaymentTheme
import com.orbitsaas.payment.ui.update.AppUpdateDialog
import com.orbitsaas.payment.ui.verify.VerifyScreen
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import com.orbitsaas.payment.ui.viewmodel.MainViewModel
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
        viewModel.refreshStatsFromServer()
        viewModel.refreshOrders()
        viewModel.refreshPaymentIntents()
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
    data object History : Screen("history")
    data object Verify : Screen("verify")
    data object Diagnostics : Screen("diagnostics")
    data object Onboarding : Screen("onboarding")
    data object Login : Screen("login")
    data object Settings : Screen("settings")
}

private data class BottomNavDestination(
    val route: String,
    @StringRes val labelRes: Int,
    val icon: ImageVector
)

private val bottomNavDestinations = listOf(
    BottomNavDestination(Screen.Dashboard.route, R.string.nav_home, Icons.Default.Home),
    BottomNavDestination(Screen.History.route, R.string.nav_history, Icons.Default.History),
    BottomNavDestination(Screen.Verify.route, R.string.nav_verify, Icons.Default.FactCheck),
    BottomNavDestination(Screen.Diagnostics.route, R.string.nav_diagnostics, Icons.Default.MonitorHeart),
    BottomNavDestination(Screen.Settings.route, R.string.nav_settings, Icons.Default.Settings)
)

private val loggedInRoutes = setOf(
    Screen.Dashboard.route,
    Screen.History.route,
    Screen.Verify.route,
    Screen.Diagnostics.route,
    Screen.Settings.route
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
                                        contentDescription = label
                                    )
                                },
                                label = {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                },
                                alwaysShowLabel = true,
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    selectedTextColor = MaterialTheme.colorScheme.primary,
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
                    onSettingsClick = { navigateTopLevel(Screen.Settings.route) },
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
                    onClearFocusedIntent = { viewModel.clearFocusedPaymentIntent() }
                )
            }

            composable(Screen.History.route) {
                HistoryScreen()
            }

            composable(Screen.Verify.route) {
                VerifyScreen()
            }

            composable(Screen.Diagnostics.route) {
                DiagnosticsScreen()
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
