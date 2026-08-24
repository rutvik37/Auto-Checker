package com.scanner.config;

import org.apache.catalina.connector.Connector;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.servlet.server.ServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MultiPortConfig {

    @org.springframework.beans.factory.annotation.Value("${app.single-port:true}")
    private boolean singlePort;

    @Bean
    public ServletWebServerFactory servletContainer() {
        TomcatServletWebServerFactory tomcat = new TomcatServletWebServerFactory();
        if (!singlePort) {
            tomcat.addAdditionalTomcatConnectors(createAdditionalConnector());
        }
        return tomcat;
    }

    private Connector createAdditionalConnector() {
        Connector connector = new Connector("org.apache.coyote.http11.Http11NioProtocol");
        connector.setPort(5555);
        return connector;
    }
}
