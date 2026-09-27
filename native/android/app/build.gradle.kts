plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.openapi.generator")
}

// S6: the v1 client, generated from the same openapi/v1/openapi.json as iOS
// (which is generated from the Zod schemas the Next.js routes validate with).
val openApiOut = layout.buildDirectory.dir("generated/openapi")
openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set(rootProject.file("../../openapi/v1/openapi.json").path)
    outputDir.set(openApiOut.get().asFile.path)
    packageName.set("com.resonance.api")
    library.set("jvm-okhttp4")
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "sourceFolder" to "src/main/kotlin",
            "omitGradleWrapper" to "true",
        ),
    )
}
tasks.named("preBuild") { dependsOn("openApiGenerate") }

android {
    namespace = "com.resonance.spikes"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.resonance.spikes"
        minSdk = 29 // Typeface.CustomFallbackBuilder
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }

    buildFeatures { compose = true }

    buildTypes {
        // Benchmarks run on release (R8, not debuggable): Compose in a debug
        // build is several times slower and says nothing about the real app.
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    sourceSets {
        getByName("main") {
            // Ship-ready fonts (scripts/native/subset-fonts.py: Big5 subset, no hinting),
            // the spec-exact grain tiles (grain/) and the geometry golden fixtures.
            assets.srcDirs("../../fonts/app", "../../fixtures", "../../editor/dist")
        }
    }

    sourceSets {
        getByName("main") { kotlin.srcDir(openApiOut.get().asFile.resolve("src/main/kotlin")) }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.resonance:resonance-geometry:0.1.0")

    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core:1.7.8")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.navigation3:navigation3-runtime:1.2.0")
    implementation("androidx.navigation3:navigation3-ui:1.2.0")
    implementation("androidx.metrics:metrics-performance:1.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
