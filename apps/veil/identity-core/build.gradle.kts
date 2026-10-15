plugins { `java-library`; id("org.jetbrains.kotlin.jvm") }
kotlin { jvmToolchain(21) }
dependencies {
    implementation("com.nimbusds:nimbus-jose-jwt:10.9")
    compileOnly("org.json:json:20240303")
    testImplementation("org.json:json:20240303")
    testImplementation("junit:junit:4.13.2")
}
