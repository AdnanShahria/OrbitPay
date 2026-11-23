package com.orbitsaas.payment.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.orbitsaas.payment.service.StickyForegroundService
import com.orbitsaas.payment.ui.theme.OrbitPaymentTheme
import com.orbitsaas.payment.ui.viewmodel.DashboardUiState
import com.orbitsaas.payment.ui.viewmodel.MainViewModel

class MainActivity : ComponentActivity() {

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

    override fun onResume() {
        super.onResume()
        checkAndStartForegroundService()
        viewModel.refreshStatsFromServer()
        viewModel.refreshOrders()
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
    data object Onboarding : Screen("onboarding")
    data object Login : Screen("login")
    data object Settings : Screen("settings")
}

@Composable
fun OrbitPaymentApp(
    viewModel: MainViewModel,
    uiState: DashboardUiState
) {
    val navController = rememberNavController()

    val startDestination = remember {
        when {
            !uiState.isOnboardingCompleted -> Screen.Onboarding.route
            !uiState.isLoggedIn -> Screen.Login.route
            else -> Screen.Dashboard.route
        }
    }

    LaunchedEffect(uiState.isLoggedIn, uiState.isOnboardingCompleted) {
        if (uiState.isOnboardingCompleted && !uiState.isLoggedIn) {
            val currentRoute = navController.currentBackStackEntry?.destination?.route
            val previousRoute = navController.previousBackStackEntry?.destination?.route
            if (currentRoute == Screen.Dashboard.route ||
                (currentRoute == Screen.Settings.route && previousRoute != Screen.Login.route)
            ) {
                navController.navigate(Screen.Login.route) {
                    popUpTo(0) { inclusive = true }
                }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Dashboard.route) {
            DashboardScreen(
                state = uiState,
                onSyncClick = { viewModel.syncNow() },
                onSettingsClick = { navController.navigate(Screen.Settings.route) },
                onToggleTheme = { viewModel.toggleTheme() },
                onClearFeedback = { viewModel.clearFeedbackMessage() },
                onOrderAction = { externalOrderId, action ->
                    viewModel.performOrderAction(externalOrderId, action)
                },
                onRefreshOrders = { viewModel.refreshOrders() }
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
                            popUpTo(Screen.Login.route) { inclusive = true }
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
                onBackClick = { navController.popBackStack() },
                onToggleTheme = { viewModel.toggleTheme() },
                onSaveSettings = { serverUrl, merchantId, deviceKey, enableForeground ->
                    val cameFromLogin = navController.previousBackStackEntry?.destination?.route == Screen.Login.route
                    viewModel.saveSettings(serverUrl, merchantId, deviceKey, enableForeground)
                    if (cameFromLogin && merchantId.isNotBlank() && deviceKey.isNotBlank()) {
                        navController.navigate(Screen.Dashboard.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    } else {
                        navController.popBackStack()
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
