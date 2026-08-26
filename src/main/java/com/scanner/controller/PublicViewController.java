package com.scanner.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PublicViewController {

    @GetMapping({ "/about" })
    public String about() {
        return "forward:/about.html";
    }

    @GetMapping({ "/contact" })
    public String contact() {
        return "forward:/contact.html";
    }

    @GetMapping({ "/blog" })
    public String blog() {
        return "forward:/blog.html";
    }

    @GetMapping({ "/careers" })
    public String careers() {
        return "forward:/careers.html";
    }

    @GetMapping({ "/documentation" })
    public String documentation() {
        return "forward:/documentation.html";
    }

    @GetMapping({ "/help", "/faq" })
    public String help() {
        return "forward:/help.html";
    }

    @GetMapping({ "/api-reference", "/api-docs" })
    public String apiReference() {
        return "forward:/api-reference.html";
    }

    @GetMapping({ "/knowledge-base", "/kb" })
    public String knowledgeBase() {
        return "forward:/knowledge-base.html";
    }

    @GetMapping({ "/privacy-policy", "/privacy" })
    public String privacyPolicy() {
        return "forward:/privacy-policy.html";
    }

    @GetMapping({ "/terms-and-conditions", "/terms" })
    public String termsAndConditions() {
        return "forward:/terms-and-conditions.html";
    }

    @GetMapping({ "/cookie-policy" })
    public String cookiePolicy() {
        return "forward:/cookie-policy.html";
    }

    @GetMapping({ "/disclaimer" })
    public String disclaimer() {
        return "forward:/disclaimer.html";
    }

    @GetMapping({ "/projects" })
    public String projectsInfo() {
        return "forward:/projects-info.html";
    }
}
