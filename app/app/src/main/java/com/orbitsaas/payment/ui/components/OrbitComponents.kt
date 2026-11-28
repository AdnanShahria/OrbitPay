package com.orbitsaas.payment.ui.components

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.MerchantOrderDto
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import kotlinx.coroutines.delay
import com.orbitsaas.payment.ui.theme.ColorBkash
import com.orbitsaas.payment.ui.theme.ColorCellfin
import com.orbitsaas.payment.ui.theme.ColorNagad
import com.orbitsaas.payment.ui.theme.ColorRocket
import com.orbitsaas.payment.ui.theme.ColorUpay
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGray
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.time.Instant
import java.util.Date
import java.util.Locale

@Composable
fun providerColor(provider: String): Color {
    return when (provider.uppercase(Locale.US)) {
        "BKASH" -> ColorBkash
        "NAGAD" -> ColorNagad
        "ROCKET" -> ColorRocket
        "UPAY" -> ColorUpay
        "CELLFIN" -> ColorCellfin
        else -> MaterialTheme.colorScheme.primary
    }
}

@Composable
fun providerDisplayName(provider: String): String {
    return when (provider.uppercase(Locale.US)) {
        "BKASH" -> stringResource(R.string.provider_bkash)
        "NAGAD" -> stringResource(R.string.provider_nagad)
        "ROCKET" -> stringResource(R.string.provider_rocket)
        "UPAY" -> stringResource(R.string.provider_upay)
        "CELLFIN" -> stringResource(R.string.provider_cellfin)
        else -> provider
    }
}

fun formatNumberAmount(amount: Double): String {
    val formatter = NumberFormat.getNumberInstance(Locale.US).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }
    return formatter.format(amount)
}

@Composable
fun formatBdtAmount(amount: Double): String {
    return stringResource(R.string.common_amount_bdt, formatNumberAmount(amount))
}

fun parseIsoEpochMs(iso: String?): Long? {
    val trimmed = iso?.trim().orEmpty()
    if (trimmed.isBlank()) return null
    val numeric = trimmed.toLongOrNull()
    if (numeric != null && numeric > 0L) {
        return if (numeric < 10_000_000_000L) numeric * 1000L else numeric
    }
    return runCatching { Instant.parse(trimmed).toEpochMilli() }.getOrNull()
}

fun formatFullTimestamp(epochMs: Long): String {
    val formatter = SimpleDateFormat("dd MMM yyyy, hh:mm:ss a", Locale.getDefault())
    return formatter.format(Date(epochMs))
}

fun formatShortTimestamp(epochMs: Long): String {
    val formatter = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
    return formatter.format(Date(epochMs))
}

private val UUID_REF_REGEX = Regex(
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

fun isPaymentLinkOrder(order: MerchantOrderDto): Boolean {
    return order.externalOrderId.trim().startsWith("lnk_", ignoreCase = true)
}

fun isDeliveryOrder(order: MerchantOrderDto): Boolean {
    if (isPaymentLinkOrder(order)) return false
    return order.paymentMethod.equals("COD", ignoreCase = true) ||
        !order.shippingAddress.isNullOrBlank() ||
        !order.itemsSummary.isNullOrBlank()
}

private fun extractPaymentLinkLabel(externalOrderId: String): String {
    val withoutPrefix = externalOrderId.trim().removePrefix("lnk_").removePrefix("LNK_")
    val slugPart = if (withoutPrefix.contains("_")) {
        withoutPrefix.substringBeforeLast("_")
    } else {
        withoutPrefix
    }
    return slugPart
        .replace('-', ' ')
        .trim()
        .replace(Regex("\\s+"), " ")
        .split(" ")
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.replaceFirstChar { ch ->
                if (ch.isLowerCase()) ch.titlecase(Locale.getDefault()) else ch.toString()
            }
        }
}

fun formatBusinessOrderHeadline(context: Context, order: MerchantOrderDto): String {
    val customerName = order.customerName?.trim()?.takeIf { it.isNotBlank() }
    val rawId = order.externalOrderId.trim()

    if (isPaymentLinkOrder(order)) {
        val linkName = extractPaymentLinkLabel(rawId)
        return when {
            customerName != null -> customerName
            linkName.isNotBlank() -> context.getString(R.string.order_link_payment_label, linkName)
            else -> context.getString(R.string.order_business_fallback_title)
        }
    }

    if (UUID_REF_REGEX.matches(rawId)) {
        return customerName
            ?: order.itemsSummary?.trim()?.takeIf { it.isNotBlank() }
            ?: order.customerPhone?.trim()?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.order_business_fallback_title)
    }

    if (customerName != null) {
        return customerName
    }

    val cleanId = rawId.removePrefix("#").trim()
    return if (cleanId.isNotBlank()) {
        context.getString(R.string.order_readable_title, cleanId)
    } else {
        context.getString(R.string.order_business_fallback_title)
    }
}

fun formatBusinessOrderSubRef(context: Context, order: MerchantOrderDto): String? {
    val rawId = order.externalOrderId.trim()
    if (isPaymentLinkOrder(order)) {
        val linkName = extractPaymentLinkLabel(rawId)
        return if (linkName.isNotBlank()) {
            context.getString(R.string.order_link_payment_label, linkName)
        } else {
            null
        }
    }
    if (UUID_REF_REGEX.matches(rawId)) {
        return null
    }
    val hasCustomerName = !order.customerName.isNullOrBlank()
    val cleanId = rawId.removePrefix("#").trim()
    return if (hasCustomerName && cleanId.isNotBlank()) {
        context.getString(R.string.order_readable_title, cleanId)
    } else {
        null
    }
}

fun formatBusinessIntentTitle(context: Context, intent: PaymentIntentDto): String {
    intent.display.title?.trim()?.takeIf { it.isNotBlank() }?.let { rawTitle ->
        if (!rawTitle.contains("lnk_", ignoreCase = true) && !UUID_REF_REGEX.containsMatchIn(rawTitle)) {
            return rawTitle
        }
    }
    val customerName = intent.customer?.name?.trim()?.takeIf { it.isNotBlank() }
    val rawId = intent.externalRefId.trim().removePrefix("#").trim()
    if (rawId.startsWith("lnk_", ignoreCase = true)) {
        val linkName = extractPaymentLinkLabel(rawId)
        return when {
            customerName != null -> customerName
            linkName.isNotBlank() -> context.getString(R.string.order_link_payment_label, linkName)
            else -> context.getString(R.string.order_business_fallback_title)
        }
    }
    if (UUID_REF_REGEX.matches(rawId) || rawId.isBlank()) {
        return customerName
            ?: intent.customer?.phone?.trim()?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.order_business_fallback_title)
    }
    return context.getString(R.string.order_readable_title, rawId)
}

fun formatRelativeTime(context: Context, epochMs: Long): String {
    if (epochMs <= 0L) return context.getString(R.string.common_never)
    val diffMs = (System.currentTimeMillis() - epochMs).coerceAtLeast(0L)
    val minutes = diffMs / 60_000L
    val hours = diffMs / 3_600_000L
    val days = diffMs / 86_400_000L
    return when {
        minutes < 1L -> context.getString(R.string.common_just_now)
        minutes < 60L -> context.getString(R.string.common_minutes_ago, minutes.toInt())
        hours < 24L -> context.getString(R.string.common_hours_ago, hours.toInt())
        days < 7L -> context.getString(R.string.common_days_ago, days.toInt())
        else -> SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault()).format(Date(epochMs))
    }
}

fun trustFlagDescription(context: Context, trustFlag: String): String {
    return when (trustFlag.uppercase(Locale.US)) {
        "LEGACY_UNVERIFIED_SENDER" -> context.getString(R.string.trust_flag_legacy_unverified)
        "UNTRUSTED_SENDER" -> context.getString(R.string.trust_flag_untrusted_sender)
        "PARSE_MISMATCH" -> context.getString(R.string.trust_flag_parse_mismatch)
        else -> context.getString(R.string.trust_flag_generic, trustFlag)
    }
}

@Composable
fun ProviderDot(
    provider: String,
    size: Dp = 10.dp
) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(providerColor(provider))
    )
}

@Composable
fun StatusPill(
    label: String,
    foreground: Color,
    background: Color
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = background,
        border = BorderStroke(1.dp, foreground.copy(alpha = 0.35f))
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun TransactionStatusBadge(status: String) {
    val (labelRes, fg, bg) = when (status.uppercase(Locale.US)) {
        "VERIFIED" -> Triple(R.string.status_verified, StatusGreen, StatusGreenBg)
        "MANUAL_VERIFIED" -> Triple(R.string.status_manual_verified, StatusGreen, StatusGreenBg)
        "PENDING_UPLOAD" -> Triple(R.string.status_pending_upload, StatusAmber, StatusAmberBg)
        "UPLOADED" -> Triple(R.string.status_uploaded, StatusGray, StatusGrayBg)
        else -> Triple(R.string.status_unclaimed, StatusGray, StatusGrayBg)
    }
    StatusPill(
        label = stringResource(labelRes),
        foreground = fg,
        background = bg
    )
}

@Composable
fun TrustWarningBadge(
    trustFlag: String,
    compact: Boolean = true
) {
    val context = LocalContext.current
    val isSevere = trustFlag.equals("UNTRUSTED_SENDER", ignoreCase = true) ||
        trustFlag.equals("PARSE_MISMATCH", ignoreCase = true)
    val fg = if (isSevere) StatusRed else StatusAmber
    val bg = if (isSevere) StatusRedBg else StatusAmberBg
    val label = if (compact) {
        stringResource(R.string.trust_badge_flagged)
    } else {
        trustFlagDescription(context, trustFlag)
    }

    Surface(
        shape = RoundedCornerShape(8.dp),
        color = bg,
        border = BorderStroke(1.dp, fg.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = if (compact) 7.dp else 12.dp,
                vertical = if (compact) 3.dp else 10.dp
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = stringResource(R.string.trust_badge_flagged),
                tint = fg,
                modifier = Modifier.size(if (compact) 13.dp else 18.dp)
            )
            Text(
                text = label,
                style = if (compact) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = fg
            )
        }
    }
}

@Composable
fun SegmentedPillTabs(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val containerShape = RoundedCornerShape(16.dp)
    val pillShape = RoundedCornerShape(12.dp)

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, containerShape),
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = containerShape
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            options.forEachIndexed { index, title ->
                val isSelected = selectedIndex == index
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 48.dp)
                        .clip(pillShape)
                        .clickable { onSelect(index) },
                    shape = pillShape,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontFeatureSettings = "tnum"
                            ),
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.onPrimary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

enum class FloatingToastTone {
    SUCCESS,
    ERROR,
    INFO
}

@Composable
fun OrbitFloatingToast(
    visible: Boolean,
    message: String,
    tone: FloatingToastTone = FloatingToastTone.INFO,
    onDismiss: () -> Unit,
    autoDismissMs: Long = 3800L,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(visible, message) {
        if (visible && message.isNotBlank() && autoDismissMs > 0L) {
            delay(autoDismissMs)
            onDismiss()
        }
    }

    AnimatedVisibility(
        visible = visible && message.isNotBlank(),
        enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut(),
        modifier = modifier
            .fillMaxWidth()
            .zIndex(20f)
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        val (accentColor, icon) = when (tone) {
            FloatingToastTone.SUCCESS -> OrbitSemanticColors.statusGreen to Icons.Default.CheckCircle
            FloatingToastTone.ERROR -> OrbitSemanticColors.statusRed to Icons.Default.Error
            FloatingToastTone.INFO -> MaterialTheme.colorScheme.primary to Icons.Default.Info
        }
        val bgColor = when (tone) {
            FloatingToastTone.SUCCESS -> MaterialTheme.colorScheme.surface
            FloatingToastTone.ERROR -> MaterialTheme.colorScheme.surface
            FloatingToastTone.INFO -> MaterialTheme.colorScheme.surface
        }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 520.dp)
                .clickable(onClick = onDismiss),
            shape = RoundedCornerShape(16.dp),
            color = bgColor,
            shadowElevation = 10.dp,
            tonalElevation = 2.dp,
            border = BorderStroke(1.dp, accentColor.copy(alpha = 0.45f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Text(
                    text = message,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.common_close),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun OrbitSnackbarHost(
    hostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    SnackbarHost(
        hostState = hostState,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 10.dp)
    ) { data ->
        val msg = data.visuals.message
        val lower = msg.lowercase(Locale.US)
        val isError = lower.contains("failed") ||
            lower.contains("error") ||
            lower.contains("mismatch") ||
            lower.contains("unable") ||
            lower.contains("invalid")
        val isSuccess = lower.contains("approved") ||
            lower.contains("verified") ||
            lower.contains("created") ||
            lower.contains("updated") ||
            lower.contains("copied") ||
            lower.contains("saved") ||
            lower.contains("added") ||
            lower.contains("synced") ||
            lower.contains("confirmed") ||
            lower.contains("paid")

        val accent = when {
            isError -> OrbitSemanticColors.statusRed
            isSuccess -> OrbitSemanticColors.statusGreen
            else -> MaterialTheme.colorScheme.primary
        }
        val icon = when {
            isError -> Icons.Default.Error
            isSuccess -> Icons.Default.CheckCircle
            else -> Icons.Default.Info
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp,
            tonalElevation = 2.dp,
            border = BorderStroke(1.dp, accent.copy(alpha = 0.4f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = msg,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

fun isLinkPaymentIntent(intent: PaymentIntentDto): Boolean {
    if (intent.externalRefId.trim().startsWith("lnk_", ignoreCase = true)) return true
    if (intent.display.referenceLabel.equals("Link", ignoreCase = true)) return true
    return intent.metadata?.containsKey("paymentLinkId") == true
}

fun resolvePaymentProjectLabel(intent: PaymentIntentDto, fallbackAppName: String): String {
    return intent.projectName?.trim()?.takeIf { it.isNotBlank() }
        ?: intent.display.appName?.trim()?.takeIf { it.isNotBlank() }
        ?: fallbackAppName.trim().ifBlank { "ORBIT" }
}

@Composable
fun verticalDisplayName(vertical: String?): String {
    return when (vertical?.trim()?.lowercase(Locale.US)) {
        "invoice_b2b" -> stringResource(R.string.vertical_invoice_b2b)
        "ecommerce" -> stringResource(R.string.vertical_ecommerce)
        "lms_course" -> stringResource(R.string.vertical_lms_course)
        "saas_subscription" -> stringResource(R.string.vertical_saas_subscription)
        "booking_appointment" -> stringResource(R.string.vertical_booking_appointment)
        "donation" -> stringResource(R.string.vertical_donation)
        "digital_topup" -> stringResource(R.string.vertical_digital_topup)
        "custom", null, "" -> stringResource(R.string.vertical_custom)
        else -> vertical.replace("_", " ").replaceFirstChar {
            if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString()
        }
    }
}

@Composable
fun resolvePaymentMediumLabel(intent: PaymentIntentDto): Pair<String, ImageVector> {
    return if (isLinkPaymentIntent(intent)) {
        stringResource(R.string.medium_payment_link) to Icons.Default.Link
    } else if (intent.vertical.equals("ecommerce", ignoreCase = true)) {
        stringResource(R.string.medium_storefront_checkout) to Icons.Default.ShoppingBag
    } else {
        verticalDisplayName(intent.vertical) to Icons.Default.Storefront
    }
}

@Composable
fun ProjectTagChip(
    projectName: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(
                imageVector = Icons.Default.FolderOpen,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(12.dp)
            )
            Text(
                text = projectName,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun MediumTagChip(
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.22f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(12.dp)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun ProviderBadgeChip(
    provider: String,
    modifier: Modifier = Modifier
) {
    val brandColor = OrbitSemanticColors.providerColor(provider)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        color = brandColor.copy(alpha = 0.12f),
        border = BorderStroke(1.dp, brandColor.copy(alpha = 0.30f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            ProviderDot(provider = provider, size = 8.dp)
            Text(
                text = providerDisplayName(provider),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = brandColor,
                maxLines = 1
            )
        }
    }
}
