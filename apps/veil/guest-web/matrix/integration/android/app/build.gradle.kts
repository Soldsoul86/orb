plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "chat.veil.matrix.interop"
    compileSdk = 35
    defaultConfig {
        applicationId = "chat.veil.matrix.interop"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "disposable-experiment"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk { abiFilters += "x86_64" }
    }
    sourceSets["main"].java.srcDir("src/main/sdk/kotlin")
    sourceSets["main"].jniLibs.srcDir("src/main/sdk/jniLibs")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions { jvmTarget = "21" }
    packaging { resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1") }
}
dependencies {
    implementation(project(":identity-core"))
    implementation("net.java.dev.jna:jna:5.18.1@aar")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("com.squareup.okhttp3:okhttp:4.12.0")
}
