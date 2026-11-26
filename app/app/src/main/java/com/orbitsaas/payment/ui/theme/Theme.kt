package com.orbitsaas.payment.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val LocalOrbitDarkTheme = staticCompositionLocalOf { false }

object OrbitSemanticColors {
    val statusGreen: Color
        @Composable
        get() = if (LocalOrbitDarkTheme.current) StatusGreenDark else StatusGreenLight

    val statusAmber: Color
        @Composable
        get() = if (LocalOrbitDarkTheme.current) StatusAmberDark else StatusAmberLight

    val statusRed: Color
        @Composable
        get() = if (LocalOrbitDarkTheme.current) StatusRedDark else StatusRedLight

    val statusGray: Color
        @Composable
        get() = if (LocalOrbitDarkTheme.current) StatusGrayDark else StatusGrayLight

    @Composable
    fun providerColor(provider: String): Color {
        val isDark = LocalOrbitDarkTheme.current
        return when (provider.uppercase()) {
            "BKASH" -> if (isDark) ColorBkashDark else ColorBkashLight
            "NAGAD" -> if (isDark) ColorNagadDark else ColorNagadLight
            "ROCKET" -> if (isDark) ColorRocketDark else ColorRocketLight
            "UPAY" -> if (isDark) ColorUpayDark else ColorUpayLight
            "CELLFIN" -> if (isDark) ColorCellfinDark else ColorCellfinLight
            else -> MaterialTheme.colorScheme.primary
        }
    }
}

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimary,
    onPrimary = DarkOnPrimary,
    primaryContainer = DarkSurfaceVariant,
    onPrimaryContainer = TextPrimaryDark,
    secondary = TextSecondaryDark,
    onSecondary = DarkBg,
    background = DarkBg,
    onBackground = TextPrimaryDark,
    surface = DarkSurface,
    onSurface = TextPrimaryDark,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = TextSecondaryDark,
    outline = DarkBorder,
    outlineVariant = TextMutedDark,
    error = StatusRedDark,
    onError = DarkBg
)

private val LightColorScheme = lightColorScheme(
    primary = LightPrimary,
    onPrimary = LightOnPrimary,
    primaryContainer = LightSurfaceVariant,
    onPrimaryContainer = TextPrimaryLight,
    secondary = TextSecondaryLight,
    onSecondary = LightSurface,
    background = LightBg,
    onBackground = TextPrimaryLight,
    surface = LightSurface,
    onSurface = TextPrimaryLight,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = TextSecondaryLight,
    outline = LightBorder,
    outlineVariant = TextMutedLight,
    error = StatusRedLight,
    onError = Color.White
)

@Composable
fun OrbitPaymentTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                window.statusBarColor = colorScheme.background.toArgb()
                window.navigationBarColor = colorScheme.background.toArgb()
                val insetsController = WindowCompat.getInsetsController(window, view)
                insetsController.isAppearanceLightStatusBars = !darkTheme
                insetsController.isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    CompositionLocalProvider(LocalOrbitDarkTheme provides darkTheme) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
