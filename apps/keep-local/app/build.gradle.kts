plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// No automatic replacement key: an absent key produces an UNSIGNED build.
// The original certificate is pinned so a wrong key fails before packaging.
val originalKeystore = System.getenv("KEEP_LOCAL_KEYSTORE")
val originalPassword = System.getenv("KEEP_LOCAL_STORE_PASSWORD")
val originalAlias = System.getenv("KEEP_LOCAL_KEY_ALIAS") ?: "androiddebugkey"
val originalKeyPassword = System.getenv("KEEP_LOCAL_KEY_PASSWORD") ?: originalPassword
if (originalKeystore != null) {
    val store = java.security.KeyStore.getInstance(java.io.File(originalKeystore),
        requireNotNull(originalPassword).toCharArray())
    val cert = requireNotNull(store.getCertificate(originalAlias)) { "Signing certificate missing" }
    val fingerprint = java.security.MessageDigest.getInstance("SHA-256").digest(cert.encoded)
        .joinToString("") { "%02x".format(it) }
    require(fingerprint == "323de20c67ad49e07d67d623b527306a96c80ba4ad7bccf573093b85b95ee7c9") {
        "RELEASE BLOCKED: signing certificate does not match the installed Keep Local APK"
    }
}

android {
    namespace = "com.keep.local"
    compileSdk = 36
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.keep.local"
        minSdk = 29
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets.getByName("test").java.srcDir("../core-tests")
    signingConfigs {
        if (originalKeystore != null) create("original") {
            storeFile = file(originalKeystore)
            storePassword = originalPassword
            keyAlias = originalAlias
            keyPassword = originalKeyPassword
        }
    }
    buildTypes {
        debug {
            signingConfig = if (originalKeystore != null) signingConfigs.getByName("original") else null
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    // Bundled Latin OCR model: usable without Google Play Services/network after install.
    implementation("com.google.mlkit:text-recognition:16.0.1")
}
