plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cz.souostrovi.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "cz.souostrovi.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 38
        versionName = "0.38"
    }

    // Podepisování release buildu: hodnoty z proměnných prostředí (GitHub Actions).
    // Když chybí, vznikne debug APK.
    fun prop(name: String): String? = System.getenv(name) ?: (project.findProperty(name) as String?)
    val ksPath = prop("KATAN_KEYSTORE")
    if (ksPath != null) {
        signingConfigs {
            create("release") {
                storeFile = file(ksPath)
                storePassword = prop("KATAN_KEYSTORE_PASSWORD")
                keyAlias = prop("KATAN_KEY_ALIAS")
                keyPassword = prop("KATAN_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (ksPath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// ---------- hra jako assets ----------
// Složka hra/ z kořene repa se při sestavení zkopíruje do assets jako hra/… (bez testů).
// Pozor: nástroj aapt vynechává soubory a složky začínající tečkou a složky začínající "_".
abstract class HraAssets : DefaultTask() {
    @get:Internal
    abstract val srcDir: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    @get:IgnoreEmptyDirectories
    val src: FileCollection
        get() = srcDir.asFileTree.matching { exclude("tests/**") }

    @get:OutputDirectory
    abstract val outDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun run() {
        fs.sync {
            from(srcDir) { exclude("tests/**") }
            into(outDir.dir("hra"))
        }
    }
}

val hraAssets = tasks.register<HraAssets>("hraAssets") {
    srcDir.set(rootProject.layout.projectDirectory.dir("hra"))
}

androidComponents {
    onVariants { variant ->
        // Zaregistruje výstup úlohy jako generovaný adresář assets; závislost na merge assets vznikne sama.
        variant.sources.assets?.addGeneratedSourceDirectory(hraAssets, HraAssets::outDir)
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.core:core:1.12.0")
    implementation("org.java-websocket:Java-WebSocket:1.6.0")
}
