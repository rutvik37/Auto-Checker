package com.scanner.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "issues")
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scan_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Scan scan;

    @Column(nullable = false)
    private String word;

    @Column(name = "suggested_text")
    private String suggestedText;

    @Column(name = "page_url", nullable = false)
    private String pageUrl;

    @Column(name = "page_title")
    private String pageTitle;

    @Column(name = "dom_element")
    private String domElement;

    @Column(name = "full_sentence", nullable = false, length = 1000)
    private String fullSentence;

    @Column(name = "text_snippet", nullable = false, length = 1000)
    private String textSnippet;

    @Column(name = "html_tag")
    private String htmlTag = "Unknown";

    @Column(name = "detection_source")
    private String detectionSource = "Unknown Word";

    @Column(name = "timestamp")
    private LocalDateTime timestamp = LocalDateTime.now();

    @Column(name = "removed", nullable = false)
    private boolean removed = false;

    // Constructors
    public Issue() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Scan getScan() { return scan; }
    public void setScan(Scan scan) { this.scan = scan; }

    public String getWord() { return word; }
    public void setWord(String word) { this.word = word; }

    public String getSuggestedText() { return suggestedText; }
    public void setSuggestedText(String suggestedText) { this.suggestedText = suggestedText; }

    public String getPageUrl() { return pageUrl; }
    public void setPageUrl(String pageUrl) { this.pageUrl = pageUrl; }

    public String getPageTitle() { return pageTitle; }
    public void setPageTitle(String pageTitle) { this.pageTitle = pageTitle; }

    public String getDomElement() { return domElement; }
    public void setDomElement(String domElement) { this.domElement = domElement; }

    public String getFullSentence() { return fullSentence; }
    public void setFullSentence(String fullSentence) { this.fullSentence = fullSentence; }

    public String getTextSnippet() { return textSnippet; }
    public void setTextSnippet(String textSnippet) { this.textSnippet = textSnippet; }

    public String getHtmlTag() { return htmlTag; }
    public void setHtmlTag(String htmlTag) { this.htmlTag = htmlTag; }

    public String getDetectionSource() { return detectionSource; }
    public void setDetectionSource(String detectionSource) { this.detectionSource = detectionSource; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }

    public boolean isRemoved() { return removed; }
    public void setRemoved(boolean removed) { this.removed = removed; }
}
