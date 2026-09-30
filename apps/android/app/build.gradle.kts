plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.resonance.app"
    compileSdk = 37

    defaultConfig {
        // The same listing as the Capacitor shell this app replaces.
        applicationId = "com.resonance.stories"
        minSdk = 29 // Typeface.CustomFallbackBuilder (the web's per-glyph font stack)
        targetSdk = 36
        versionCode = 2
        versionName = "2.0.0"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    signingConfigs {
        // The Play upload key (Play App Signing keeps the key the store signs with).
        // Its file and passwords stay off the repo, in ~/.gradle/gradle.properties:
        // RESONANCE_UPLOAD_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD.
        providers.gradleProperty("RESONANCE_UPLOAD_STORE_FILE").orNull?.let { path ->
            create("upload") {
                storeFile = file(path)
                storePassword = providers.gradleProperty("RESONANCE_UPLOAD_STORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("RESONANCE_UPLOAD_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("RESONANCE_UPLOAD_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without the upload key (CI, another machine) a release still builds, debug-signed.
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
        }
    }

    sourceSets {
        getByName("main") {
            // Subset fonts (apps/shared/fonts), the grain tiles (shared with iOS's
            // DesignSystem package), the web's message catalogs, as they are, and
            // the story editor island (npm run native:editor → native/editor/dist).
            assets.srcDirs(
                "../../shared/fonts",
                "../../ios/Packages/DesignSystem/Sources/DesignSystem/Resources",
                "../../../src/messages",
                "../../../native/editor/dist",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":core:design"))
    implementation("androidx.activity:activity-compose:1.13.0")
    // The Google libraries below pull in an old Fragment (1.2.5), which lint refuses next to the ActivityResult API (the notification permission).
    implementation("androidx.fragment:fragment:1.8.9")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.navigation3:navigation3-runtime:1.2.0")
    implementation("androidx.navigation3:navigation3-ui:1.2.0")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.11.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.1")
}
