package com.scanner.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "scanned_pages")
public class ScannedPage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scan_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Scan scan;

    @Column(nullable = false)
    private String url;

    private String title;

    @Column(name = "status_code")
    private Integer statusCode;

    @Column(name = "timestamp")
    private LocalDateTime timestamp = LocalDateTime.now();

    // Constructors
    public ScannedPage() {}

    public ScannedPage(Scan scan, String url, String title, Integer statusCode) {
        this.scan = scan;
        this.url = url;
        this.title = title;
        this.statusCode = statusCode;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Scan getScan() { return scan; }
    public void setScan(Scan scan) { this.scan = scan; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Integer getStatusCode() { return statusCode; }
    public void setStatusCode(Integer statusCode) { this.statusCode = statusCode; }

    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
}
