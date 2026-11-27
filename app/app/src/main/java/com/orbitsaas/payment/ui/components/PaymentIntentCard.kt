package com.orbitsaas.payment.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.R
import com.orbitsaas.payment.data.remote.DynamicPaymentActionDto
import com.orbitsaas.payment.data.remote.PaymentIntentDto
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusAmber
import com.orbitsaas.payment.ui.theme.StatusAmberBg
import com.orbitsaas.payment.ui.theme.StatusGray
import com.orbitsaas.payment.ui.theme.StatusGrayBg
import com.orbitsaas.payment.ui.theme.StatusGreen
import com.orbitsaas.payment.ui.theme.StatusGreenBg
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import java.util.Locale

fun resolveSafeHttpUrl(rawUrl: String?, serverBaseUrl: String? = null): String? {
    val trimmed = rawUrl?.trim().orEmpty()
    if (trimmed.isBlank()) return null

    val candidate = when {
        trimmed.startsWith("https://", ignoreCase = true) ||
            trimmed.startsWith("http://", ignoreCase = true) -> trimmed
        trimmed.startsWith("/") && !serverBaseUrl.isNullOrBlank() ->
            serverBaseUrl.trim().removeSuffix("/") + trimmed
        else -> return null
    }

    val uri = runCatching { Uri.parse(candidate) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase(Locale.US)
    if (scheme != "https" && scheme != "http") return null
    if (uri.host.isNullOrBlank()) return null
    return candidate
}

fun openSafeExternalUrl(context: Context, rawUrl: String?, serverBaseUrl: String? = null): Boolean {
    val safeUrl = resolveSafeHttpUrl(rawUrl, serverBaseUrl) ?: return false
    return runCatching {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(safeUrl)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        true
    }.getOrDefault(false)
}

@Composable
fun intentStatusBadgeColors(status: String): Triple<String, Color, Color> {
    val normalized = status.uppercase(Locale.US)
    return when (normalized) {
        "VERIFIED" -> Triple(
            stringResource(R.string.intent_status_verified),
            OrbitSemanticColors.statusGreen,
            StatusGreenBg
        )
        "MANUAL_REVIEW_REQUIRED" -> Triple(
            stringResource(R.string.intent_status_manual_review),
            OrbitSemanticColors.statusAmber,
            StatusAmberBg
        )
        "WAITING_FOR_SMS" -> Triple(
            stringResource(R.string.intent_status_waiting_sms),
            OrbitSemanticColors.statusAmber,
            StatusAmberBg
        )
        "OPEN" -> Triple(
            stringResource(R.string.intent_status_open),
            MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.surfaceVariant
        )
        "REJECTED" -> Triple(
            stringResource(R.string.intent_status_rejected),
            OrbitSemanticColors.statusRed,
            StatusRedBg
        )
        "EXPIRED" -> Triple(
            stringResource(R.string.intent_status_expired),
            OrbitSemanticColors.statusGray,
            StatusGrayBg
        )
        "REFUNDED" -> Triple(
            stringResource(R.string.intent_status_refunded),
            OrbitSemanticColors.statusGray,
            StatusGrayBg
        )
        else -> Triple(
            normalized.replace("_", " "),
            OrbitSemanticColors.statusGray,
            StatusGrayBg
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PaymentIntentCard(
    intent: PaymentIntentDto,
    serverBaseUrl: String,
    fallbackAppName: String,
    isHighlighted: Boolean = false,
    isActionInProgress: Boolean = false,
    onApproveClick: () -> Unit,
    onRejectClick: () -> Unit,
    onDynamicActionClick: (DynamicPaymentActionDto) -> Unit
) {
    val context = LocalContext.current
    val cardShape = RoundedCornerShape(16.dp)
    val borderColor = if (isHighlighted) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.outline
    }
    val borderWidth = if (isHighlighted) 2.dp else 1.dp

    val displayAppName = intent.display.appName?.takeIf { it.isNotBlank() }
        ?: fallbackAppName.ifBlank { stringResource(R.string.app_name) }
    val displayRefLabel = intent.display.referenceLabel?.takeIf { it.isNotBlank() } ?: "Ref"
    val displayTitle = intent.display.title?.takeIf { it.isNotBlank() }
        ?: "$displayRefLabel #${intent.externalRefId}"

    val (statusLabel, statusFg, statusBg) = intentStatusBadgeColors(intent.status)
    val normalizedStatus = intent.status.uppercase(Locale.US)
    val isActionable = normalizedStatus in setOf("OPEN", "WAITING_FOR_SMS", "MANUAL_REVIEW_REQUIRED")
    val safeAdminUrl = resolveSafeHttpUrl(intent.display.adminDeepLink, serverBaseUrl)
    val safeReceiptUrl = resolveSafeHttpUrl(intent.receiptUrl, serverBaseUrl)
    val primaryAmount = intent.paidAmount ?: intent.uniqueAmount
    val formattedPrimaryAmount = formatBdtAmount(primaryAmount)

    val subtitleText = intent.display.subtitle?.trim().orEmpty()
    val filteredHighlights = remember(intent.display.highlights, subtitleText, primaryAmount, formattedPrimaryAmount) {
        val normalizedSubtitle = subtitleText.lowercase(Locale.US)
        val compactSubtitle = normalizedSubtitle.replace(",", "").replace(" ", "")
        val compactAmount = formattedPrimaryAmount.lowercase(Locale.US).replace(",", "").replace(" ", "")
        val amountRegex = Regex("[^0-9.]")

        intent.display.highlights.filter { hl ->
            val labelLower = hl.label.trim().lowercase(Locale.US)
            val valueTrimmed = hl.value.trim()
            if (valueTrimmed.isBlank()) return@filter false

            val valueLower = valueTrimmed.lowercase(Locale.US)
            val compactValue = valueLower.replace(",", "").replace(" ", "")

            val isCustomerLabel = labelLower == "customer" || labelLower.contains("customer")
            val isAmountLabel = labelLower == "payable" ||
                labelLower == "amount" ||
                labelLower.contains("payable") ||
                labelLower.contains("amount")

            val duplicatesCustomer = isCustomerLabel && normalizedSubtitle.isNotEmpty() && (
                normalizedSubtitle.contains(valueLower) ||
                    compactSubtitle.contains(compactValue) ||
                    normalizedSubtitle.startsWith(valueLower.substringBefore("·").trim())
                )

            val parsedAmount = valueLower.replace(",", "").replace(amountRegex, "").toDoubleOrNull()
            val matchesPrimaryAmount = parsedAmount != null &&
                kotlin.math.abs(parsedAmount - primaryAmount) < 0.01
            val duplicatesAmount = isAmountLabel && (
                compactValue == compactAmount ||
                    matchesPrimaryAmount ||
                    (compactSubtitle.isNotEmpty() && compactSubtitle.contains(compactValue))
                )

            !duplicatesCustomer && !duplicatesAmount
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(borderWidth, borderColor, cardShape),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = cardShape
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // App Badge + Status Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Text(
                        text = displayAppName,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.size(8.dp))

                StatusPill(
                    label = statusLabel,
                    foreground = statusFg,
                    background = statusBg
                )
            }

            // Title, Subtitle + Amount
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
                        text = displayTitle,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (subtitleText.isNotEmpty()) {
                        Text(
                            text = subtitleText,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.size(10.dp))

                Text(
                    text = formattedPrimaryAmount,
                    style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
                    fontWeight = FontWeight.Bold,
                    color = if (normalizedStatus == "VERIFIED") StatusGreen else MaterialTheme.colorScheme.onSurface
                )
            }

            // MFS Provider + TrxID + Sender
            val hasMfsDetails = !intent.provider.isNullOrBlank() ||
                !intent.trxId.isNullOrBlank() ||
                !intent.senderNumber.isNullOrBlank()
            if (hasMfsDetails) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    intent.provider?.takeIf { it.isNotBlank() }?.let { prov ->
                        Row(
                            modifier = Modifier.align(Alignment.CenterVertically),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            ProviderDot(provider = prov, size = 9.dp)
                            Text(
                                text = providerDisplayName(prov),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                    intent.trxId?.takeIf { it.isNotBlank() }?.let { trx ->
                        Text(
                            text = "TrxID: $trx",
                            modifier = Modifier.align(Alignment.CenterVertically),
                            style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    intent.senderNumber?.takeIf { it.isNotBlank() }?.let { sender ->
                        Text(
                            text = sender,
                            modifier = Modifier.align(Alignment.CenterVertically),
                            style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Escalation Reason, Trust Flag, Device Offline, Receipt Badges
            val hasAlertBadges = !intent.escalationReason.isNullOrBlank() ||
                !intent.trustFlag.isNullOrBlank() ||
                intent.deviceOnlineAtSubmit == false ||
                safeReceiptUrl != null

            if (hasAlertBadges) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    intent.escalationReason?.takeIf { it.isNotBlank() }?.let { reason ->
                        StatusPill(
                            label = reason.replace("_", " "),
                            foreground = OrbitSemanticColors.statusAmber,
                            background = StatusAmberBg
                        )
                    }
                    intent.trustFlag?.takeIf { it.isNotBlank() }?.let { flag ->
                        TrustWarningBadge(trustFlag = flag, compact = true)
                    }
                    if (intent.deviceOnlineAtSubmit == false) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = StatusAmberBg,
                            border = BorderStroke(1.dp, StatusAmber.copy(alpha = 0.35f))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.WifiOff,
                                    contentDescription = null,
                                    tint = OrbitSemanticColors.statusAmber,
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = stringResource(R.string.intent_device_offline_submit),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = OrbitSemanticColors.statusAmber
                                )
                            }
                        }
                    }
                    if (safeReceiptUrl != null) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = StatusGreenBg,
                            border = BorderStroke(1.dp, StatusGreen.copy(alpha = 0.35f))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.ReceiptLong,
                                    contentDescription = null,
                                    tint = OrbitSemanticColors.statusGreen,
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = stringResource(R.string.intent_receipt_attached),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = OrbitSemanticColors.statusGreen
                                )
                            }
                        }
                    }
                }
            }

            // Dynamic Highlights from Server (deduplicated against subtitle and amount)
            if (filteredHighlights.isNotEmpty()) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        filteredHighlights.forEach { hl ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Text(
                                    text = hl.label,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.weight(0.9f)
                                )
                                Text(
                                    text = hl.value,
                                    style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1.1f),
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }

            // Action Buttons (>= 48dp touch targets)
            val hasAnyButton = isActionable || intent.actions.isNotEmpty() || safeAdminUrl != null || safeReceiptUrl != null
            if (hasAnyButton) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val btnShape = RoundedCornerShape(12.dp)

                    if (isActionable) {
                        Button(
                            onClick = onApproveClick,
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            )
                        ) {
                            if (isActionInProgress) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                            } else {
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(
                                text = stringResource(R.string.intent_approve),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }

                        OutlinedButton(
                            onClick = onRejectClick,
                            enabled = !isActionInProgress,
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = OrbitSemanticColors.statusRed)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(
                                text = stringResource(R.string.intent_reject),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }

                    intent.actions.forEach { action ->
                        val styleLower = action.style.lowercase(Locale.US)
                        when (styleLower) {
                            "primary" -> {
                                Button(
                                    onClick = { onDynamicActionClick(action) },
                                    enabled = !isActionInProgress,
                                    modifier = Modifier.heightIn(min = 48.dp),
                                    shape = btnShape,
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.primary,
                                        contentColor = MaterialTheme.colorScheme.onPrimary
                                    )
                                ) {
                                    Text(
                                        text = action.label,
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
                            }
                            "danger" -> {
                                OutlinedButton(
                                    onClick = { onDynamicActionClick(action) },
                                    enabled = !isActionInProgress,
                                    modifier = Modifier.heightIn(min = 48.dp),
                                    shape = btnShape,
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                    border = BorderStroke(1.dp, StatusRed.copy(alpha = 0.45f)),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = OrbitSemanticColors.statusRed)
                                ) {
                                    Text(
                                        text = action.label,
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
                            }
                            else -> {
                                OutlinedButton(
                                    onClick = { onDynamicActionClick(action) },
                                    enabled = !isActionInProgress,
                                    modifier = Modifier.heightIn(min = 48.dp),
                                    shape = btnShape,
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                                ) {
                                    Text(
                                        text = action.label,
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
                            }
                        }
                    }

                    if (safeReceiptUrl != null) {
                        OutlinedButton(
                            onClick = { openSafeExternalUrl(context, safeReceiptUrl, serverBaseUrl) },
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                        ) {
                            Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(
                                text = stringResource(R.string.intent_view_receipt),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }

                    if (safeAdminUrl != null) {
                        OutlinedButton(
                            onClick = { openSafeExternalUrl(context, safeAdminUrl, serverBaseUrl) },
                            modifier = Modifier.heightIn(min = 48.dp),
                            shape = btnShape,
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
                        ) {
                            Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(
                                text = stringResource(R.string.intent_open_admin),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun RejectIntentDialog(
    intent: PaymentIntentDto,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onConfirmReject: (reason: String?) -> Unit
) {
    var reason by remember(intent.id) { mutableStateOf("") }
    val amountText = formatBdtAmount(intent.paidAmount ?: intent.uniqueAmount)

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        containerColor = MaterialTheme.colorScheme.surface,
        title = {
            Text(
                text = stringResource(R.string.intent_reject_dialog_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = stringResource(
                        R.string.intent_reject_dialog_body,
                        intent.externalRefId,
                        amountText
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text(stringResource(R.string.intent_reject_reason_label)) },
                    placeholder = { Text(stringResource(R.string.intent_reject_reason_placeholder)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirmReject(reason.trim().ifBlank { null }) },
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = StatusRed,
                    contentColor = Color.White
                )
            ) {
                Text(
                    text = stringResource(R.string.intent_reject),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp)
            ) {
                Text(
                    text = stringResource(R.string.common_cancel),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    )
}

@Composable
fun ApproveIntentDialog(
    intent: PaymentIntentDto,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onConfirmApprove: () -> Unit
) {
    val amountText = formatBdtAmount(intent.paidAmount ?: intent.uniqueAmount)

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        containerColor = MaterialTheme.colorScheme.surface,
        title = {
            Text(
                text = stringResource(R.string.intent_approve_dialog_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Text(
                text = stringResource(
                    R.string.intent_approve_dialog_body,
                    intent.externalRefId,
                    amountText
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirmApprove,
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            ) {
                Text(
                    text = stringResource(R.string.intent_approve),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp)
            ) {
                Text(
                    text = stringResource(R.string.common_cancel),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    )
}
