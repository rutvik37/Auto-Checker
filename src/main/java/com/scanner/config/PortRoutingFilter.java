package com.scanner.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import java.io.IOException;

@Component
public class PortRoutingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        int port = httpRequest.getLocalPort();
        String uri = httpRequest.getRequestURI();

        if (port == 5555) {
            // Admin Port
            if (uri.equals("/")) {
                httpRequest.getRequestDispatcher("/admin.html").forward(request, response);
                return;
            }
            
            // Allow public admin static files, login status, and favicon
            boolean isAllowedAdminStatic = uri.equals("/admin.html") || 
                                           uri.equals("/admin.js") || 
                                           uri.equals("/admin.css") || 
                                           uri.equals("/favicon.ico");
                                           
            boolean isAllowedAdminApi = uri.equals("/api/admin/login") || 
                                        uri.equals("/api/admin/status");

            if (isAllowedAdminStatic || isAllowedAdminApi) {
                chain.doFilter(request, response);
                return;
            }

            if (uri.startsWith("/api/admin/")) {
                // Check session authentication
                HttpSession session = httpRequest.getSession(false);
                boolean authenticated = session != null && Boolean.TRUE.equals(session.getAttribute("admin_authenticated"));
                if (!authenticated) {
                    httpResponse.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized");
                    return;
                }
                chain.doFilter(request, response);
                return;
            }

            // Block everything else on port 5555 (like scanner API/pages)
            if (uri.startsWith("/api/") || uri.endsWith(".html") || uri.endsWith(".js") || uri.endsWith(".css")) {
                httpResponse.sendError(HttpServletResponse.SC_FORBIDDEN, "Access Denied on Admin Port");
                return;
            }
        } else {
            // Scanner Port (typically 8080)
            boolean isBlockedOnScanner = uri.contains("admin") || uri.startsWith("/api/admin/");
            if (isBlockedOnScanner) {
                httpResponse.sendError(HttpServletResponse.SC_FORBIDDEN, "Access Denied on Scanner Port");
                return;
            }
        }

        chain.doFilter(request, response);
    }
}
