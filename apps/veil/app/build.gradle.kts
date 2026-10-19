plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
val purposePreview = providers.gradleProperty("veilPurposePreview").orNull == "true"
android {
    namespace = "chat.veil"
    compileSdk = 35
    ndkVersion = "27.0.12077973"
    defaultConfig {
        applicationId = if (purposePreview) "chat.veil.purposes.preview" else "chat.veil"
        resValue("string", "app_name", if (purposePreview) "Veil Purposes Preview" else "Veil")
        minSdk = 28
        targetSdk = 35
        versionCode = 6
        versionName = "0.3.1-contact-preview"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    sourceSets {
        getByName("test").java.srcDir("src/cryptoTest/java")
        getByName("androidTest").java.srcDir("src/cryptoTest/java")
    }
    // CI may supply the original development signing key from a repository secret.
    // Local test builds retain Android's default debug signing configuration.
    System.getenv("VEIL_DEBUG_KEYSTORE")?.let { keyPath ->
        signingConfigs.getByName("debug") {
            storeFile = file(keyPath)
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    testOptions { unitTests.all { it.systemProperty("veil.relayDir", rootProject.file("relay").absolutePath); it.systemProperty("veil.providerDir", rootProject.file("portable-provider").absolutePath) } }
    buildFeatures { compose = true }
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions { jvmTarget = "21" }
    packaging {
        jniLibs.excludes += "**/libsignal_jni_testing.so"
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1", "libsignal_jni*.dylib", "signal_jni*.dll", "libsignal_jni*.so") }
}
dependencies {
    implementation(project(":identity-core"))
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.signal:libsignal-android:0.105.0")
    implementation("org.signal:libsignal-client:0.105.0")
    implementation("com.google.zxing:core:3.5.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.12.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
