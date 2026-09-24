FROM sonarsource/sonar-scanner-cli:latest AS scanner
FROM sonarqube:26.9.0.129388-community AS sonar-runtime

FROM node:22-bookworm-slim
COPY --from=scanner --chown=node:node /opt/sonar-scanner /opt/sonar-scanner
COPY --from=sonar-runtime /opt/java/openjdk /opt/java/openjdk

ENV JAVA_HOME="/opt/java/openjdk"
ENV PATH="/opt/sonar-scanner/bin:${PATH}"
ENV SONAR_USER_HOME="/tmp/.sonar"

USER node
WORKDIR /usr/src
ENTRYPOINT ["/opt/sonar-scanner/bin/sonar-scanner"]
