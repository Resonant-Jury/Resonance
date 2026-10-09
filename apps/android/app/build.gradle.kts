import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    // The back stacks' routes are saved with the activity (rotation, process death).
    id("org.jetbrains.kotlin.plugin.serialization")
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
        versionCode = 8
        versionName = "2.0.0"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    signingConfigs {
        // The Play upload key (Play App Signing keeps the key the store signs with):
        // keys/android-upload.properties + the keystore it names, in the repo's
        // git-ignored keys/ folder (storeFile, storePassword, keyAlias, keyPassword).
        val upload = rootProject.file("../../keys/android-upload.properties")
        if (upload.exists()) {
            val props = Properties().apply { upload.inputStream().use { load(it) } }
            create("upload") {
                storeFile = upload.parentFile.resolve(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
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

// The story editor (native/editor/dist/editor.html) is build output the repo does not keep: it comes
// from `npm run native:editor` (also part of `npm run apps:generate`). An APK built from a clean export
// without it installs and runs, but the writer's story field shows "Webpage not available". So a release
// build (APK, bundle, lint, anything of the variant) stops at once when it is missing, and a debug build
// says so loudly.
val storyEditor = file("../../../native/editor/dist/editor.html")
val storyEditorMissing = "native/editor/dist/editor.html is missing or empty: the writer's story editor would not load " +
    "(\"Webpage not available\"). Run `npm run native:editor` (or `npm run apps:generate`) in the repository root first."
val requireStoryEditor = tasks.register("requireStoryEditor") {
    val editor = storyEditor
    val message = storyEditorMissing
    doLast { if (!editor.isFile || editor.length() == 0L) throw GradleException(message) }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(requireStoryEditor) }
tasks.matching { it.name == "preDebugBuild" }.configureEach {
    val editor = storyEditor
    val message = storyEditorMissing
    doFirst {
        if (!editor.isFile || editor.length() == 0L) {
            val bar = "=".repeat(78)
            logger.warn("\n$bar\nWARNING: $message\nThis debug build will have NO story editor.\n$bar\n")
        }
    }
}

dependencies {
    implementation(project(":core:design"))
    implementation("androidx.activity:activity-compose:1.13.0")
    // The launch: Android 12's splash (the waves on the paper), backported to 10–11, and its hand-off to the first screen.
    implementation("androidx.core:core-splashscreen:1.2.0")
    // Custom Tabs: the policy pages open inside the app (Play wants the privacy policy reachable there).
    implementation("androidx.browser:browser:1.8.0")
    // The Google libraries below pull in an old Fragment (1.2.5), which lint refuses next to the ActivityResult API (the notification permission).
    implementation("androidx.fragment:fragment:1.8.9")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.navigation3:navigation3-runtime:1.2.0")
    implementation("androidx.navigation3:navigation3-ui:1.2.0")
    // A ViewModelStore per back-stack entry (rememberViewModelStoreNavEntryDecorator): two card pages never share one.
    implementation("androidx.lifecycle:lifecycle-viewmodel-navigation3:2.11.0")
    // AVIF (the AI illustrations) on Android 10–11, whose own decoders can't read it (libavif, BSD-2).
    implementation("org.aomedia.avif.android:avif:1.3.0.841110fd")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-messaging")
    // App Check (watched, not enforced): Play Integrity in release builds, the debug provider in debug ones.
    implementation("com.google.firebase:firebase-appcheck-playintegrity")
    debugImplementation("com.google.firebase:firebase-appcheck-debug")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.11.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.1")
    testImplementation("junit:junit:4.13.2")
}
