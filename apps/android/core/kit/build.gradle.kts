import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// The app's non-UI core, pure Kotlin/JVM so its tests run without a device:
// the /api/v1 client generated from openapi/v1/openapi.json, the token
// interceptor, localization over src/messages, and the story format
// (a story's Markdown → the reader's blocks).
plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.openapi.generator")
}

val openApiOut = layout.buildDirectory.dir("generated/openapi")
openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set(rootProject.file("../../openapi/v1/openapi.json").path)
    outputDir.set(openApiOut.get().asFile.path)
    packageName.set("com.resonance.api")
    library.set("jvm-okhttp4")
    // JSON numbers are Doubles here (the default BigDecimal serves money, not hues).
    typeMappings.set(mapOf("number" to "kotlin.Double"))
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "sourceFolder" to "src/main/kotlin",
            "omitGradleWrapper" to "true",
            "enumPropertyNaming" to "camelCase",
        ),
    )
}
kotlin {
    sourceSets["main"].kotlin.srcDir(openApiOut.map { it.dir("src/main/kotlin") })
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
tasks.named("compileKotlin") { dependsOn("openApiGenerate") }

dependencies {
    api("com.squareup.okhttp3:okhttp:4.12.0")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.commonmark:commonmark:0.30.0")
    implementation("org.commonmark:commonmark-ext-gfm-strikethrough:0.30.0")
    implementation("org.commonmark:commonmark-ext-gfm-tables:0.30.0")
    testImplementation(kotlin("test"))
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

tasks.test {
    useJUnitPlatform()
    testLogging { events("passed", "failed") }
    // The tests read the web's real catalogs and the shared Markdown corpus.
    systemProperty("repoRoot", rootProject.file("../..").absolutePath)
}
