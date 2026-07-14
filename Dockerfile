# Stage 1: Build the application
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
# Pre-download dependencies to utilize Docker layer caching
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Create runtime image
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/auto-checker-1.0.0.jar app.jar

# Copy runtime data directories
COPY CustomDictionaries ./CustomDictionaries
COPY AuditReports ./AuditReports

# Configure default port
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT} -Dapp.single-port=${APP_SINGLE_PORT:-false} -jar app.jar"]
