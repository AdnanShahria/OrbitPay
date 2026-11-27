package com.orbitsaas.payment.ui.update

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.orbitsaas.payment.BuildConfig
import com.orbitsaas.payment.R
import com.orbitsaas.payment.ui.theme.OrbitSemanticColors
import com.orbitsaas.payment.ui.theme.StatusRed
import com.orbitsaas.payment.ui.theme.StatusRedBg
import com.orbitsaas.payment.update.AppUpdateState
import com.orbitsaas.payment.update.UpdateStatus
import java.util.Locale

@Composable
fun AppUpdateDialog(
    state: AppUpdateState,
    canInstallPackages: Boolean,
    onDownloadClick: () -> Unit,
    onInstallClick: () -> Unit,
    onOpenPermissionSettings: () -> Unit,
    onRetryClick: () -> Unit,
    onDismiss: () -> Unit
) {
    val release = state.release ?: return
    val isBusy = state.status == UpdateStatus.DOWNLOADING ||
        state.status == UpdateStatus.VERIFYING ||
        state.status == UpdateStatus.INSTALLING

    val titleRes = if (state.forceUpdate) {
        R.string.update_dialog_required_title
    } else {
        R.string.update_dialog_available_title
    }

    AlertDialog(
        onDismissRequest = {
            if (!state.forceUpdate && !isBusy) {
                onDismiss()
            }
        },
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        textContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        shape = RoundedCornerShape(20.dp),
        icon = {
            IconSurfaceBadge(forceUpdate = state.forceUpdate)
        },
        title = {
            Text(
                text = stringResource(titleRes),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = stringResource(
                        R.string.update_dialog_version_line,
                        BuildConfig.VERSION_NAME,
                        release.versionName,
                        formatBytes(release.sizeBytes)
                    ),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Monospace,
                        fontFeatureSettings = "tnum"
                    ),
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                if (release.releaseNotes.isNotBlank()) {
                    Text(
                        text = release.releaseNotes,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                when (state.status) {
                    UpdateStatus.DOWNLOADING -> {
                        val pct = (state.downloadProgress * 100).toInt().coerceIn(0, 100)
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            LinearProgressIndicator(
                                progress = { state.downloadProgress.coerceIn(0f, 1f) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp),
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                            Text(
                                text = stringResource(
                                    R.string.update_status_downloading_pct,
                                    pct,
                                    formatBytes(state.downloadedBytes),
                                    formatBytes(state.totalBytes.coerceAtLeast(state.downloadedBytes))
                                ),
                                style = MaterialTheme.typography.labelMedium.copy(
                                    fontFeatureSettings = "tnum"
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    UpdateStatus.VERIFYING -> {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            LinearProgressIndicator(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp),
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                            Text(
                                text = stringResource(R.string.update_status_verifying),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    UpdateStatus.INSTALLING -> {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            LinearProgressIndicator(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp),
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                            Text(
                                text = stringResource(R.string.update_status_installing),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    UpdateStatus.READY_TO_INSTALL -> {
                        if (!canInstallPackages) {
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .border(
                                        1.dp,
                                        MaterialTheme.colorScheme.outline,
                                        RoundedCornerShape(12.dp)
                                    ),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    androidx.compose.material3.Icon(
                                        imageVector = Icons.Default.Security,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = stringResource(R.string.update_permission_hint),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        } else {
                            Text(
                                text = stringResource(R.string.update_status_ready),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Medium,
                                color = OrbitSemanticColors.statusGreen
                            )
                        }
                    }

                    UpdateStatus.ERROR -> {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, StatusRed.copy(alpha = 0.45f), RoundedCornerShape(12.dp)),
                            color = StatusRedBg,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = state.errorMessage ?: stringResource(R.string.update_status_error_generic),
                                style = MaterialTheme.typography.labelMedium,
                                color = OrbitSemanticColors.statusRed,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }

                    else -> Unit
                }
            }
        },
        confirmButton = {
            when (state.status) {
                UpdateStatus.READY_TO_INSTALL -> {
                    Button(
                        onClick = {
                            if (canInstallPackages) onInstallClick() else onOpenPermissionSettings()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        androidx.compose.material3.Icon(
                            imageVector = if (canInstallPackages) Icons.Default.SystemUpdate else Icons.Default.Security,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(
                                if (canInstallPackages) {
                                    R.string.update_action_install_now
                                } else {
                                    R.string.update_action_allow_installs
                                }
                            ),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                UpdateStatus.AVAILABLE -> {
                    Button(
                        onClick = onDownloadClick,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        androidx.compose.material3.Icon(
                            imageVector = Icons.Default.Download,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(R.string.update_action_download),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                UpdateStatus.ERROR -> {
                    Button(
                        onClick = onRetryClick,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary
                        ),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.update_action_retry),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                else -> Unit
            }
        },
        dismissButton = {
            if (!state.forceUpdate && !isBusy) {
                TextButton(onClick = onDismiss) {
                    Text(
                        text = stringResource(R.string.update_action_later),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    )
}

@Composable
private fun IconSurfaceBadge(forceUpdate: Boolean) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier
            .size(44.dp)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp))
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            androidx.compose.material3.Icon(
                imageVector = Icons.Default.SystemUpdate,
                contentDescription = null,
                tint = if (forceUpdate) OrbitSemanticColors.statusRed else MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0L) return "0 MB"
    val mb = bytes / (1024.0 * 1024.0)
    return if (mb >= 1.0) {
        String.format(Locale.US, "%.1f MB", mb)
    } else {
        val kb = (bytes / 1024.0).coerceAtLeast(1.0)
        String.format(Locale.US, "%.0f KB", kb)
    }
}
