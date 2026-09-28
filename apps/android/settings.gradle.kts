// The Resonance Android app (Jetpack Compose). See apps/README.md.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "resonance"
include(":app", ":core:kit", ":core:design")

// The Kotlin port of src/lib/design, verified against native/fixtures/geometry.json.
includeBuild("../../native/geometry/kotlin")
