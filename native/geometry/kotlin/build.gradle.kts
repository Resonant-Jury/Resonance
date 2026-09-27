import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Kotlin port of src/lib/design (the procedural "hand-drawn" geometry).
// Pure Kotlin/JVM so the Android app consumes it as-is; verified against
// native/fixtures/geometry.json by the tests.
plugins {
    kotlin("jvm") version "2.4.20"
}

group = "com.resonance"
version = "0.1.0"

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "failed")
        showStandardStreams = true
    }
}
