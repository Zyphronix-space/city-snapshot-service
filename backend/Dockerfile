# Builds the Ballerina service and runs the resulting fat JAR.
# Used by Render (see ../render.yaml); works with any Docker host.
FROM ballerina/ballerina:2201.13.5 AS build
USER root
WORKDIR /src
COPY . .
RUN bal build --offline=false

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/bin/city_snapshot_service.jar app.jar
# The listener port is fixed in service.bal.
EXPOSE 8080
CMD ["java", "-Xmx300m", "-jar", "app.jar"]
