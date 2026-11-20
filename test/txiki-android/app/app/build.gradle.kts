plugins { id("com.android.application") }

android {
    namespace = "dev.gpuix.txikidemo"
    compileSdk = 36
    ndkVersion = "29.0.14206865"
    defaultConfig {
        applicationId = "dev.gpuix.txikidemo"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1"
        ndk { abiFilters += "arm64-v8a" }
        externalNativeBuild {
            cmake {
                arguments += listOf("-DTXIKI_SOURCE=${System.getenv("TXIKI_SOURCE") ?: error("Set TXIKI_SOURCE")}", "-DBUILD_WITH_FFI=OFF", "-DBUILD_WITH_WASM=OFF")
            }
        }
    }
    sourceSets["main"].assets.srcDir("../../../../dist/txiki-android/assets")
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    externalNativeBuild { cmake { path = file("src/main/cpp/CMakeLists.txt"); version = "3.22.1" } }
}
dependencies { implementation(project(":gpui-mobile")) }
