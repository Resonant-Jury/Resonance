// Android spike app for the native-feasibility experiments (S1–S6).
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

rootProject.name = "resonance-spikes"
include(":app")

// The Kotlin port of src/lib/design, verified against native/fixtures/geometry.json.
includeBuild("../geometry/kotlin")
