pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "TxikiSvelteAndroid"
include(":app", ":gpui-mobile")
project(":gpui-mobile").projectDir = file("../../../.generated/gpuix/.generated/gpui-mobile/android")
