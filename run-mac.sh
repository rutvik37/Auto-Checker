#!/bin/bash
export JAVA_HOME="$(pwd)/tools/jdk-21.0.11.jdk/Contents/Home"
export PATH="$(pwd)/tools/apache-maven-3.9.6/bin:$JAVA_HOME/bin:$PATH"
mvn spring-boot:run
