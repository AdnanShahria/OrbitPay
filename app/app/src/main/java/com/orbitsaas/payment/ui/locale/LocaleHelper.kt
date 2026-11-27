package com.orbitsaas.payment.ui.locale

import android.content.Context
import android.telephony.TelephonyManager
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale
import java.util.TimeZone

/**
 * Manages per-app locale switching via AndroidX AppCompatDelegate and persists
 * the user's selected language tag ("system", "en", or "bn") in SharedPreferences.
 * Automatically defaults to Bengali ("bn") for Bangladesh devices and English ("en")
 * elsewhere unless the user explicitly overrides the language in Settings.
 */
object LocaleHelper {
    const val LANG_SYSTEM = "system"
    const val LANG_ENGLISH = "en"
    const val LANG_BANGLA = "bn"

    private const val PREFS_NAME = "orbit_payment_preferences"
    private const val KEY_APP_LANGUAGE = "app_language"
    private const val KEY_EXPLICIT_LANGUAGE = "app_language_explicit"

    fun applyAutoCountryLocaleIfUnset(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val hasExplicitChoice = prefs.getBoolean(KEY_EXPLICIT_LANGUAGE, false)
        val saved = prefs.getString(KEY_APP_LANGUAGE, null)?.trim()?.lowercase(Locale.US)

        val targetTag = if (hasExplicitChoice && (saved == LANG_BANGLA || saved == LANG_ENGLISH || saved == LANG_SYSTEM)) {
            saved
        } else {
            detectPreferredCountryLanguage(context)
        }

        if (targetTag != LANG_SYSTEM) {
            prefs.edit().putString(KEY_APP_LANGUAGE, targetTag).apply()
            val currentLocales = AppCompatDelegate.getApplicationLocales()
            val currentTags = currentLocales.toLanguageTags().lowercase(Locale.US)
            if (!currentTags.startsWith(targetTag)) {
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(targetTag))
            }
        }
    }

    fun detectPreferredCountryLanguage(context: Context): String {
        val deviceLang = Locale.getDefault().language.lowercase(Locale.US)
        val deviceCountry = Locale.getDefault().country.uppercase(Locale.US)
        val timeZoneId = TimeZone.getDefault().id

        val telephony = runCatching {
            context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        }.getOrNull()

        val simCountry = telephony?.simCountryIso?.trim()?.uppercase(Locale.US).orEmpty()
        val netCountry = telephony?.networkCountryIso?.trim()?.uppercase(Locale.US).orEmpty()

        val isBangladesh = deviceLang == "bn" ||
            deviceCountry == "BD" ||
            simCountry == "BD" ||
            netCountry == "BD" ||
            timeZoneId.equals("Asia/Dhaka", ignoreCase = true)

        return if (isBangladesh) LANG_BANGLA else LANG_ENGLISH
    }

    fun setLanguage(context: Context, tag: String) {
        val normalized = when (tag.trim().lowercase(Locale.US)) {
            LANG_BANGLA -> LANG_BANGLA
            LANG_ENGLISH -> LANG_ENGLISH
            else -> LANG_SYSTEM
        }

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_APP_LANGUAGE, normalized)
            .putBoolean(KEY_EXPLICIT_LANGUAGE, normalized != LANG_SYSTEM)
            .apply()

        val localeList = if (normalized == LANG_SYSTEM) {
            LocaleListCompat.forLanguageTags(detectPreferredCountryLanguage(context))
        } else {
            LocaleListCompat.forLanguageTags(normalized)
        }
        AppCompatDelegate.setApplicationLocales(localeList)
    }

    fun currentLanguage(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_EXPLICIT_LANGUAGE, false)) {
            return LANG_SYSTEM
        }

        val appLocales = AppCompatDelegate.getApplicationLocales()
        if (!appLocales.isEmpty) {
            val tags = appLocales.toLanguageTags().lowercase(Locale.US)
            return when {
                tags.startsWith(LANG_BANGLA) -> LANG_BANGLA
                tags.startsWith(LANG_ENGLISH) -> LANG_ENGLISH
                else -> LANG_SYSTEM
            }
        }

        val saved = prefs.getString(KEY_APP_LANGUAGE, LANG_SYSTEM)
            ?.trim()
            ?.lowercase(Locale.US)
        return when (saved) {
            LANG_BANGLA -> LANG_BANGLA
            LANG_ENGLISH -> LANG_ENGLISH
            else -> LANG_SYSTEM
        }
    }
}
