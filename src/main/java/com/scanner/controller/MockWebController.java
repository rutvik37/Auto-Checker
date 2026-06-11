package com.scanner.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/mock-site")
public class MockWebController {

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    public String getRobotsTxt() {
        return "User-agent: *\n" +
                "Disallow: /mock-site/admin\n" +
                "Sitemap: http://localhost:8080/mock-site/sitemap.xml\n";
    }

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String getSitemapXml() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" +
                "  <url><loc>http://localhost:8080/mock-site/index</loc></url>\n" +
                "  <url><loc>http://localhost:8080/mock-site/about</loc></url>\n" +
                "  <url><loc>http://localhost:8080/mock-site/contact</loc></url>\n" +
                "</urlset>\n";
    }

    @GetMapping(value = "/index", produces = MediaType.TEXT_HTML_VALUE)
    public String getIndex() {
        return "<!DOCTYPE html>\n" +
                "<html>\n" +
                "<head>\n" +
                "  <title>Mock QA Home</title>\n" +
                "  <style>body { font-family: sans-serif; } .hidden { display: none; }</style>\n" +
                "</head>\n" +
                "<body>\n" +
                "  <header>\n" +
                "    <h1>Welcome to our compnay portal!</h1>\n" +
                "    <p>This is a test of the the QA Content Scanner.</p>\n" +
                "  </header>\n" +
                "  <main>\n" +
                "    <section>\n" +
                "      <p>We is here to provide high-quality services to our customers.</p>\n" +
                "      <button id=\"btn-action\">click here now</button>\n" +
                "    </section>\n" +
                "    <section class=\"hidden\">\n" +
                "      <p>This text is hidden, so the Jsoup extractor should ignore it. If it scans this, there is a bug!</p>\n"
                +
                "    </section>\n" +
                "  </main>\n" +
                "  <footer>\n" +
                "    <p>Links: <a href=\"/mock-site/about\">About Us</a> | <a href=\"/mock-site/contact\">Contact</a></p>\n"
                +
                "  </footer>\n" +
                "</body>\n" +
                "</html>";
    }

    @GetMapping(value = "/about", produces = MediaType.TEXT_HTML_VALUE)
    public String getAbout() {
        return "<!DOCTYPE html>\n" +
                "<html>\n" +
                "<head>\n" +
                "  <title>Mock QA About</title>\n" +
                "</head>\n" +
                "<body>\n" +
                "  <h1>About Our Business</h1>\n" +
                "  <p>We are dedecated to excellence.</p>\n" +
                "  <div id=\"dynamic-container\">Loading content dynamically...</div>\n" +
                "  \n" +
                "  <!-- Test dynamic rendering and SPA loading -->\n" +
                "  <script>\n" +
                "    setTimeout(() => {\n" +
                "      document.getElementById('dynamic-container').innerHTML = \n" +
                "        '<p>This content was loaded dynamically. It contains a spelling error: recieveing payments online.</p>';\n"
                +
                "    }, 1000);\n" +
                "  </script>\n" +
                "  <p><a href=\"/mock-site/index\">Back Home</a></p>\n" +
                "</body>\n" +
                "</html>";
    }

    @GetMapping(value = "/contact", produces = MediaType.TEXT_HTML_VALUE)
    public String getContact() {
        return "<!DOCTYPE html>\n" +
                "<html>\n" +
                "<head>\n" +
                "  <title>Mock QA Contact</title>\n" +
                "</head>\n" +
                "<body>\n" +
                "  <h1>Contact Us</h1>\n" +
                "  <p>Please enter your message in the form.</p>\n" +
                "  <form>\n" +
                "    <input type=\"text\" placeholder=\"Enter your full namee\">\n" +
                "    <textarea placeholder=\"Write a mesage...\"></textarea>\n" +
                "  </form>\n" +
                "  <table>\n" +
                "    <tr><th>Deparment</th><th>Email</th></tr>\n" +
                "    <tr><td>Support</td><td>support@example.com</td></tr>\n" +
                "  </table>\n" +
                "  <footer>\n" +
                "    <p>&copy; 2026 Auto-Checker. All rights reserved. footer typo compnay.</p>\n" +
                "  </footer>\n" +
                "  <p><a href=\"/mock-site/index\">Back Home</a></p>\n" +
                "</body>\n" +
                "</html>";
    }
}
