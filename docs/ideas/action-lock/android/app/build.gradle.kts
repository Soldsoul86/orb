import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.actionlock"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.orb"
        minSdk = 29
        targetSdk = 36
        versionCode = 5
        versionName = "0.3.1"
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// GuardRulesTest reads the shared cases written by `npm run guard-vectors`.
tasks.withType<Test>().configureEach { inputs.file("../../test/guard-vectors.json") }

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.fragment:fragment-ktx:1.8.8")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    testImplementation("junit:junit:4.13.2")
    // Android's org.json is a stub in local unit tests.
    testImplementation("org.json:json:20240303")
}
