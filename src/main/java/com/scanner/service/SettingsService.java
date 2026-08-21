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

@Service
public class SettingsService {

    private final ObjectMapper objectMapper;
    private final File settingsFile = new File("CustomDictionaries/settings.json");

    @Value("${groq.api.key:}")
    private String defaultGroqApiKey;

    @Value("${groq.model:llama-3.3-70b-versatile}")
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
            } catch (IOException e) {
                loadDefaults();
            }
        } else {
            loadDefaults();
            saveToFile();
        }
    }

    private void loadDefaults() {
        this.groqApiKey = defaultGroqApiKey;
        this.groqModel = defaultGroqModel;
        this.groqBatchSize = defaultGroqBatchSize;
        this.crawlerParallelEnabled = defaultCrawlerParallelEnabled;
        this.crawlerParallelWorkers = defaultCrawlerParallelWorkers;
        this.widgetSettings = getDefaultWidgetSettings();
    }

    private Map<String, Object> getDefaultWidgetSettings() {
        Map<String, Object> map = new HashMap<>();
        map.put("sec1_visible", true);
        map.put("sec2_visible", true);
        map.put("sec3_visible", true);
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
    public Map<String, Object> getWidgetSettings() { return widgetSettings != null ? widgetSettings : getDefaultWidgetSettings(); }
}
