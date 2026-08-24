package com.scanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import java.util.ArrayList;
import java.util.List;

@Service
public class SettingsService {

    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(SettingsService.class);

    private final ObjectMapper objectMapper;
    private final File settingsFile = new File("CustomDictionaries/settings.json");

    @Value("${groq.api.key:}")
    private String defaultGroqApiKey;

    @Value("${groq.model:groq/compound}")
    private String defaultGroqModel;

    @Value("${groq.batch.size:50}")
    private int defaultGroqBatchSize;

    @Value("${crawler.parallel.enabled:true}")
    private boolean defaultCrawlerParallelEnabled;

    @Value("${crawler.parallel.workers:15}")
    private int defaultCrawlerParallelWorkers;

    private String groqApiKey;
    private String groqModel;
    private int groqBatchSize;
    private boolean crawlerParallelEnabled;
    private int crawlerParallelWorkers;
    private Map<String, Object> widgetSettings;
    private Map<String, Object> footerSettings;

    public SettingsService() {
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    @PostConstruct
    public void init() {
        File dir = new File("CustomDictionaries");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        
        if (settingsFile.exists()) {
            try {
                Map<String, Object> data = objectMapper.readValue(settingsFile, Map.class);
                this.groqApiKey = (String) data.getOrDefault("groqApiKey", defaultGroqApiKey);
                this.groqModel = (String) data.getOrDefault("groqModel", defaultGroqModel);
                this.groqBatchSize = ((Number) data.getOrDefault("groqBatchSize", defaultGroqBatchSize)).intValue();
                this.crawlerParallelEnabled = (Boolean) data.getOrDefault("crawlerParallelEnabled", defaultCrawlerParallelEnabled);
                this.crawlerParallelWorkers = ((Number) data.getOrDefault("crawlerParallelWorkers", defaultCrawlerParallelWorkers)).intValue();
                if (data.containsKey("widgetSettings")) {
                    this.widgetSettings = (Map<String, Object>) data.get("widgetSettings");
                } else {
                    this.widgetSettings = getDefaultWidgetSettings();
                }
                if (data.containsKey("footerSettings")) {
                    this.footerSettings = (Map<String, Object>) data.get("footerSettings");
                } else {
                    this.footerSettings = getDefaultFooterSettings();
                }
            } catch (IOException e) {
                loadDefaults();
            }
        } else {
            loadDefaults();
            saveToFile();
        }
        logger.info("[GROQ] Using model: {}", groqModel);
    }

    private void loadDefaults() {
        this.groqApiKey = defaultGroqApiKey;
        this.groqModel = defaultGroqModel;
        this.groqBatchSize = defaultGroqBatchSize;
        this.crawlerParallelEnabled = defaultCrawlerParallelEnabled;
        this.crawlerParallelWorkers = defaultCrawlerParallelWorkers;
        this.widgetSettings = getDefaultWidgetSettings();
        this.footerSettings = getDefaultFooterSettings();
    }

    private final java.util.concurrent.atomic.AtomicLong sec2ApiCallCount = new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.concurrent.atomic.AtomicLong sec3ApiCallCount = new java.util.concurrent.atomic.AtomicLong(0);

    public void incrementSec2ApiCount() { sec2ApiCallCount.incrementAndGet(); }
    public void incrementSec3ApiCount() { sec3ApiCallCount.incrementAndGet(); }
    public void resetApiCallCounts() { sec2ApiCallCount.set(0); sec3ApiCallCount.set(0); }
    public long getSec2ApiCallCount() { return sec2ApiCallCount.get(); }
    public long getSec3ApiCallCount() { return sec3ApiCallCount.get(); }

    public boolean isSec2ApiEnabled() {
        Map<String, Object> ws = getWidgetSettings();
        Object val = ws.get("sec2_api_enabled");
        if (val instanceof Boolean) return (Boolean) val;
        if (val instanceof String) return !"false".equalsIgnoreCase((String) val);
        return true;
    }

    public boolean isSec3ApiEnabled() {
        Map<String, Object> ws = getWidgetSettings();
        Object val = ws.get("sec3_api_enabled");
        if (val instanceof Boolean) return (Boolean) val;
        if (val instanceof String) return !"false".equalsIgnoreCase((String) val);
        return true;
    }

    private Map<String, Object> getDefaultWidgetSettings() {
        Map<String, Object> map = new HashMap<>();
        map.put("sec1_visible", true);
        map.put("sec2_visible", true);
        map.put("sec3_visible", true);

        // Section 2 Dynamic Controls & API Settings
        map.put("sec2_title", "Daily Tech Mind-Booster & Fun Facts");
        map.put("sec2_badge", "Did You Know?");
        map.put("sec2_subtitle", "Discover fascinating computing history, tech secrets, and easter eggs while your scan runs!");
        map.put("sec2_data_mode", "api");
        map.put("sec2_auto_rotate", 0);
        map.put("sec2_api_enabled", true);
        map.put("sec2_api_call_count", sec2ApiCallCount.get());

        // Section 3 Dynamic Controls & API Settings
        map.put("sec3_title", "World Wonders, Mysteries & Curiosities");
        map.put("sec3_badge", "Global Edition");
        map.put("sec3_subtitle", "Explore mind-bending natural phenomena, ancient human achievements, space mysteries & world records!");
        map.put("sec3_data_mode", "api");
        map.put("sec3_auto_rotate", 0);
        map.put("sec3_api_enabled", true);
        map.put("sec3_api_call_count", sec3ApiCallCount.get());

        Map<String, Boolean> modes = new HashMap<>();
        modes.put("math", true);
        modes.put("india", true);
        modes.put("ai", true);
        modes.put("history", true);
        modes.put("science", true);
        modes.put("cinema", true);
        modes.put("sports", true);
        modes.put("geography", true);
        modes.put("coding", true);
        modes.put("riddles", true);
        map.put("modes", modes);
        return map;
    }

    public Map<String, Object> getDefaultFooterSettings() {
        Map<String, Object> root = new HashMap<>();
        root.put("enabled", true);

        // Brand
        Map<String, Object> brand = new HashMap<>();
        brand.put("appName", "Auto-Checker");
        brand.put("tagline", "Automated Website Spelling Engine");
        brand.put("description", "Verify spelling issues on websites instantly with powerful automated website content analysis.");
        brand.put("logoIcon", "fa-solid fa-wand-magic-sparkles");
        brand.put("logoUrl", "");
        root.put("brand", brand);

        // Contact
        Map<String, Object> contact = new HashMap<>();
        contact.put("supportEmail", "support@example.com");
        contact.put("contactEmail", "info@example.com");
        contact.put("phone", "+1 (800) 555-0199");
        contact.put("address", "100 Tech Plaza, Suite 500, San Francisco, CA 94105");
        contact.put("supportUrl", "https://example.com/support");
        contact.put("businessHours", "Mon - Fri: 9:00 AM - 6:00 PM EST");
        contact.put("enabled", true);
        root.put("contact", contact);

        // Social Links
        List<Map<String, Object>> social = new ArrayList<>();
        social.add(createSocialItem("soc-1", "GitHub", "fa-brands fa-github", "https://github.com", true, 1));
        social.add(createSocialItem("soc-2", "LinkedIn", "fa-brands fa-linkedin", "https://linkedin.com", true, 2));
        social.add(createSocialItem("soc-3", "X / Twitter", "fa-brands fa-x-twitter", "https://x.com", true, 3));
        social.add(createSocialItem("soc-4", "YouTube", "fa-brands fa-youtube", "https://youtube.com", true, 4));
        social.add(createSocialItem("soc-5", "Facebook", "fa-brands fa-facebook", "https://facebook.com", false, 5));
        social.add(createSocialItem("soc-6", "Instagram", "fa-brands fa-instagram", "https://instagram.com", false, 6));
        root.put("socialLinks", social);

        // Columns & Links
        List<Map<String, Object>> columns = new ArrayList<>();

        // Column 1: Product
        List<Map<String, Object>> prodLinks = new ArrayList<>();
        prodLinks.add(createLinkItem("lnk-1", "Website Spell Check", "/", false, true, 1));
        prodLinks.add(createLinkItem("lnk-2", "Scan Website", "/#scan-form-card", false, true, 2));
        prodLinks.add(createLinkItem("lnk-3", "Projects & Reports", "/projects", false, true, 3));
        prodLinks.add(createLinkItem("lnk-4", "Spelling Mistakes Log", "/#scan-empty-state", false, true, 4));
        columns.add(createColumnItem("col-product", "Product", true, 1, prodLinks));

        // Column 2: Resources
        List<Map<String, Object>> resLinks = new ArrayList<>();
        resLinks.add(createLinkItem("lnk-5", "Documentation", "/documentation", false, true, 1));
        resLinks.add(createLinkItem("lnk-6", "Help Center & FAQ", "/help", false, true, 2));
        resLinks.add(createLinkItem("lnk-7", "API Reference", "/api-reference", false, true, 3));
        resLinks.add(createLinkItem("lnk-8", "Knowledge Base", "/knowledge-base", false, true, 4));
        columns.add(createColumnItem("col-resources", "Resources", true, 2, resLinks));

        // Column 3: Company
        List<Map<String, Object>> compLinks = new ArrayList<>();
        compLinks.add(createLinkItem("lnk-9", "About Us", "/about", false, true, 1));
        compLinks.add(createLinkItem("lnk-10", "Contact Support", "/contact", false, true, 2));
        compLinks.add(createLinkItem("lnk-11", "Latest Blog", "/blog", false, true, 3));
        compLinks.add(createLinkItem("lnk-12", "Careers", "/careers", false, true, 4));
        columns.add(createColumnItem("col-company", "Company", true, 3, compLinks));

        // Column 4: Legal
        List<Map<String, Object>> legalLinks = new ArrayList<>();
        legalLinks.add(createLinkItem("lnk-13", "Privacy Policy", "/privacy-policy", false, true, 1));
        legalLinks.add(createLinkItem("lnk-14", "Terms & Conditions", "/terms-and-conditions", false, true, 2));
        legalLinks.add(createLinkItem("lnk-15", "Cookie Policy", "/cookie-policy", false, true, 3));
        legalLinks.add(createLinkItem("lnk-16", "Disclaimer", "/disclaimer", false, true, 4));
        columns.add(createColumnItem("col-legal", "Legal", true, 4, legalLinks));

        root.put("columns", columns);

        // Copyright
        Map<String, Object> copyright = new HashMap<>();
        copyright.put("companyName", "Auto-Checker");
        copyright.put("year", "2026");
        copyright.put("autoYear", true);
        copyright.put("suffixText", "All rights reserved.");
        
        List<Map<String, Object>> botLinks = new ArrayList<>();
        botLinks.add(createLinkItem("bot-1", "Privacy Policy", "/privacy-policy", false, true, 1));
        botLinks.add(createLinkItem("bot-2", "Terms & Conditions", "/terms-and-conditions", false, true, 2));
        botLinks.add(createLinkItem("bot-3", "Cookie Policy", "/cookie-policy", false, true, 3));
        botLinks.add(createLinkItem("bot-4", "Disclaimer", "/disclaimer", false, true, 4));
        copyright.put("bottomLinks", botLinks);
        root.put("copyright", copyright);

        // Newsletter
        Map<String, Object> newsletter = new HashMap<>();
        newsletter.put("enabled", false);
        newsletter.put("title", "Stay Updated");
        newsletter.put("description", "Get the latest QA insights, improvements and product news directly to your inbox.");
        newsletter.put("placeholder", "Enter your email address");
        newsletter.put("buttonText", "Subscribe");
        root.put("newsletter", newsletter);

        return root;
    }

    private Map<String, Object> createSocialItem(String id, String platform, String icon, String url, boolean enabled, int order) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", id);
        item.put("platform", platform);
        item.put("icon", icon);
        item.put("url", url);
        item.put("enabled", enabled);
        item.put("order", order);
        return item;
    }

    private Map<String, Object> createLinkItem(String id, String title, String url, boolean targetBlank, boolean enabled, int order) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", id);
        item.put("title", title);
        item.put("url", url);
        item.put("targetBlank", targetBlank);
        item.put("enabled", enabled);
        item.put("order", order);
        return item;
    }

    private Map<String, Object> createColumnItem(String id, String title, boolean enabled, int order, List<Map<String, Object>> links) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", id);
        item.put("title", title);
        item.put("enabled", enabled);
        item.put("order", order);
        item.put("links", links);
        return item;
    }

    public synchronized void updateSettings(Map<String, Object> newSettings) {
        if (newSettings.containsKey("groqApiKey")) {
            String newKey = (String) newSettings.get("groqApiKey");
            if (newKey != null && !newKey.isEmpty() && !newKey.equals("••••••••••••••••") && !newKey.startsWith("••••••••••••••••")) {
                this.groqApiKey = newKey;
            }
        }
        if (newSettings.containsKey("groqModel")) {
            this.groqModel = (String) newSettings.get("groqModel");
        }
        if (newSettings.containsKey("groqBatchSize")) {
            this.groqBatchSize = ((Number) newSettings.get("groqBatchSize")).intValue();
        }
        if (newSettings.containsKey("crawlerParallelEnabled")) {
            this.crawlerParallelEnabled = (Boolean) newSettings.get("crawlerParallelEnabled");
        }
        if (newSettings.containsKey("crawlerParallelWorkers")) {
            this.crawlerParallelWorkers = ((Number) newSettings.get("crawlerParallelWorkers")).intValue();
        }
        if (newSettings.containsKey("widgetSettings")) {
            this.widgetSettings = (Map<String, Object>) newSettings.get("widgetSettings");
        }
        if (newSettings.containsKey("footerSettings")) {
            this.footerSettings = (Map<String, Object>) newSettings.get("footerSettings");
        }
        saveToFile();
    }

    private void saveToFile() {
        try {
            Map<String, Object> data = new HashMap<>();
            data.put("groqApiKey", this.groqApiKey);
            data.put("groqModel", this.groqModel);
            data.put("groqBatchSize", this.groqBatchSize);
            data.put("crawlerParallelEnabled", this.crawlerParallelEnabled);
            data.put("crawlerParallelWorkers", this.crawlerParallelWorkers);
            data.put("widgetSettings", this.widgetSettings != null ? this.widgetSettings : getDefaultWidgetSettings());
            data.put("footerSettings", this.footerSettings != null ? this.footerSettings : getDefaultFooterSettings());
            objectMapper.writeValue(settingsFile, data);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public String getGroqApiKey() { return groqApiKey; }
    public String getGroqModel() { return groqModel; }
    public int getGroqBatchSize() { return groqBatchSize; }
    public boolean isCrawlerParallelEnabled() { return crawlerParallelEnabled; }
    public int getCrawlerParallelWorkers() { return crawlerParallelWorkers; }
    public Map<String, Object> getWidgetSettings() {
        if (widgetSettings == null) {
            widgetSettings = getDefaultWidgetSettings();
        } else {
            Map<String, Object> defaults = getDefaultWidgetSettings();
            for (Map.Entry<String, Object> entry : defaults.entrySet()) {
                if (!widgetSettings.containsKey(entry.getKey()) || widgetSettings.get(entry.getKey()) == null) {
                    widgetSettings.put(entry.getKey(), entry.getValue());
                }
            }
        }
        widgetSettings.put("sec2_api_call_count", sec2ApiCallCount.get());
        widgetSettings.put("sec3_api_call_count", sec3ApiCallCount.get());
        return widgetSettings;
    }
    public Map<String, Object> getFooterSettings() {
        if (footerSettings == null) {
            footerSettings = getDefaultFooterSettings();
        } else {
            Map<String, Object> defaults = getDefaultFooterSettings();
            if (!footerSettings.containsKey("columns") || footerSettings.get("columns") == null) {
                footerSettings.put("columns", defaults.get("columns"));
            }
            if (!footerSettings.containsKey("socialLinks") || footerSettings.get("socialLinks") == null) {
                footerSettings.put("socialLinks", defaults.get("socialLinks"));
            }
            if (!footerSettings.containsKey("brand") || footerSettings.get("brand") == null) {
                footerSettings.put("brand", defaults.get("brand"));
            }
            if (!footerSettings.containsKey("contact") || footerSettings.get("contact") == null) {
                footerSettings.put("contact", defaults.get("contact"));
            }
            if (!footerSettings.containsKey("copyright") || footerSettings.get("copyright") == null) {
                footerSettings.put("copyright", defaults.get("copyright"));
            }
        }
        return footerSettings;
    }
}
