package com.scanner.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "scans")
public class Scan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Project project;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String url;

    @Column(name = "max_pages")
    private Integer maxPages;

    @Column(name = "crawl_depth")
    private Integer crawlDepth;

    @Column(nullable = false)
    private String status; // PENDING, RUNNING, COMPLETED, FAILED, STOPPED

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "pages_scanned")
    private Integer pagesScanned = 0;

    @Column(name = "words_checked")
    private Long wordsChecked = 0L;

    @Column(name = "total_issues")
    private Integer totalIssues = 0;

    @OneToMany(mappedBy = "scan", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ScannedPage> scannedPages = new ArrayList<>();

    @OneToMany(mappedBy = "scan", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Issue> issues = new ArrayList<>();

    // Constructors
    public Scan() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Project getProject() { return project; }
    public void setProject(Project project) { this.project = project; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public Integer getMaxPages() { return maxPages; }
    public void setMaxPages(Integer maxPages) { this.maxPages = maxPages; }

    public Integer getCrawlDepth() { return crawlDepth; }
    public void setCrawlDepth(Integer crawlDepth) { this.crawlDepth = crawlDepth; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }

    public Integer getPagesScanned() { return pagesScanned; }
    public void setPagesScanned(Integer pagesScanned) { this.pagesScanned = pagesScanned; }

    public Long getWordsChecked() { return wordsChecked; }
    public void setWordsChecked(Long wordsChecked) { this.wordsChecked = wordsChecked; }

    public Integer getTotalIssues() { return totalIssues; }
    public void setTotalIssues(Integer totalIssues) { this.totalIssues = totalIssues; }

    public List<ScannedPage> getScannedPages() { return scannedPages; }
    public void setScannedPages(List<ScannedPage> scannedPages) { this.scannedPages = scannedPages; }

    public List<Issue> getIssues() { return issues; }
    public void setIssues(List<Issue> issues) { this.issues = issues; }
}
