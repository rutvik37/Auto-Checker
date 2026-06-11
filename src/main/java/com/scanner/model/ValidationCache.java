package com.scanner.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "validation_cache", indexes = {
    @Index(name = "idx_vc_word_sug", columnList = "word, suggestion", unique = true)
})
public class ValidationCache {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String word;

    @Column(nullable = false)
    private String suggestion;

    @Column(nullable = false)
    private String decision;

    @Column(length = 1000)
    private String reason;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public ValidationCache() {}

    public ValidationCache(String word, String suggestion, String decision, String reason) {
        this.word = word != null ? word.toLowerCase() : "";
        this.suggestion = suggestion != null ? suggestion.toLowerCase() : "";
        this.decision = decision;
        this.reason = reason;
        this.createdAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getWord() { return word; }
    public void setWord(String word) { this.word = word != null ? word.toLowerCase() : ""; }

    public String getSuggestion() { return suggestion; }
    public void setSuggestion(String suggestion) { this.suggestion = suggestion != null ? suggestion.toLowerCase() : ""; }

    public String getDecision() { return decision; }
    public void setDecision(String decision) { this.decision = decision; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
