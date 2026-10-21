pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "VeilMatrixInteropExperiment"
include(":app", ":identity-core")
project(":identity-core").projectDir = file("../../../../identity-core")
