# Proguard rules for Orbit Payment Companion App

# Room DB
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao class *
-keepclassmembers class * {
    @androidx.room.* <methods>;
}
-dontwarn androidx.room.paging.**

# Kotlinx Serialization
-keepattributes *Annotation*,InnerClasses,Signature,RuntimeVisibleAnnotations
-dontnote kotlinx.serialization.SerializationKt
-keep,includedescriptorclasses class com.orbitsaas.payment.data.remote.**$$serializer { *; }
-keepclassmembers class com.orbitsaas.payment.data.remote.** {
    *** Companion;
}
-keepclasseswithmembers class com.orbitsaas.payment.data.remote.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclassmembers class * {
    *** Companion;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,allowobfuscation,allowshrinking class * {
    <fields>;
}

# Ktor
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-dontwarn kotlinx.atomicfu.**
-dontwarn org.slf4j.**

# Firebase Messaging
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# OkHttp 4 (WebSocket Push Client)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Strip verbose/debug logs in release builds so sensitive payloads never reach logcat
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
