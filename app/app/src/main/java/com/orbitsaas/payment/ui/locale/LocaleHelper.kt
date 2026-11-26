package com.orbitsaas.payment.ui.locale

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

/**
 * Manages per-app locale switching via AndroidX AppCompatDelegate and persists
 * the user's selected language tag ("system", "en", or "bn") in SharedPreferences.
 */
object LocaleHelper {
    const val LANG_SYSTEM = "system"
    const val LANG_ENGLISH = "en"
    const val LANG_BANGLA = "bn"

    private const val PREFS_NAME = "orbit_payment_preferences"
    private const val KEY_APP_LANGUAGE = "app_language"

    fun setLanguage(context: Context, tag: String) {
        val normalized = when (tag.trim().lowercase()) {
            LANG_BANGLA -> LANG_BANGLA
            LANG_ENGLISH -> LANG_ENGLISH
            else -> LANG_SYSTEM
        }

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_APP_LANGUAGE, normalized)
            .apply()

        val localeList = if (normalized == LANG_SYSTEM) {
            LocaleListCompat.getEmptyLocaleList()
        } else {
            LocaleListCompat.forLanguageTags(normalized)
        }
        AppCompatDelegate.setApplicationLocales(localeList)
    }

    fun currentLanguage(context: Context): String {
        val appLocales = AppCompatDelegate.getApplicationLocales()
        if (!appLocales.isEmpty) {
            val tags = appLocales.toLanguageTags().lowercase()
            return when {
                tags.startsWith(LANG_BANGLA) -> LANG_BANGLA
                tags.startsWith(LANG_ENGLISH) -> LANG_ENGLISH
                else -> LANG_SYSTEM
            }
        }

        val saved = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_APP_LANGUAGE, LANG_SYSTEM)
            ?.trim()
            ?.lowercase()
        return when (saved) {
            LANG_BANGLA -> LANG_BANGLA
            LANG_ENGLISH -> LANG_ENGLISH
            else -> LANG_SYSTEM
        }
    }
}
