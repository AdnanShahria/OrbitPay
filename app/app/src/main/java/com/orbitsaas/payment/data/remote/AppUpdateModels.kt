package com.orbitsaas.payment.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class AppReleaseDto(
    val id: String = "",
    val platform: String = "ANDROID",
    val versionCode: Int = 0,
    val versionName: String = "",
    val minSupportedVersionCode: Int = 1,
    val mandatory: Boolean = false,
    val releaseNotes: String = "",
    val fileName: String = "",
    val sha256: String = "",
    val sizeBytes: Long = 0L,
    val downloadUrl: String = "",
    val createdAt: String = ""
)

@Serializable
data class LatestReleaseData(
    val hasRelease: Boolean = false,
    val updateAvailable: Boolean = false,
    val forceUpdate: Boolean = false,
    val release: AppReleaseDto? = null
)
