package com.scanner.service;

import com.scanner.model.Project;
import com.scanner.model.Scan;
import com.scanner.repository.IssueRepository;
import com.scanner.repository.ProjectRepository;
import com.scanner.repository.ScannedPageRepository;
import com.scanner.repository.ScanRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class ProjectService {

    private final ProjectRepository   projectRepository;
    private final ScanRepository      scanRepository;
    private final IssueRepository     issueRepository;
    private final ScannedPageRepository scannedPageRepository;

    @Value("${app.projects-dir:C:/Users/suppo/Auto-Checker/Projects}")
    private String projectsDir;

    @Autowired
    public ProjectService(ProjectRepository projectRepository,
                          ScanRepository scanRepository,
                          IssueRepository issueRepository,
                          ScannedPageRepository scannedPageRepository) {
        this.projectRepository    = projectRepository;
        this.scanRepository       = scanRepository;
        this.issueRepository      = issueRepository;
        this.scannedPageRepository = scannedPageRepository;
    }

    // -------------------------------------------------------------------------
    // Create project
    // -------------------------------------------------------------------------
    @Transactional
    public Project createProject(String name) {
        String cleanName = name.trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        Optional<Project> existing = projectRepository.findByName(cleanName);
        if (existing.isPresent()) {
            return existing.get();
        }

        Project project = projectRepository.save(new Project(cleanName));

        // Create workspace folder structure (Disabled to prevent Windows file-system access errors)
        /*
        try {
            Path projectPath = Paths.get(projectsDir, cleanName);
            Files.createDirectories(projectPath.resolve("Reports"));
            Files.createDirectories(projectPath.resolve("Screenshots"));
            Files.createDirectories(projectPath.resolve("Logs"));
            Files.createDirectories(projectPath.resolve("Dictionary"));
            Files.createDirectories(projectPath.resolve("ScanHistory"));
        } catch (IOException e) {
            // Non-fatal – log but don't roll back (DB record is more important)
        }
        */

        return project;
    }

    // -------------------------------------------------------------------------
    // List / get projects
    // -------------------------------------------------------------------------
    @Transactional(readOnly = true)
    public List<Project> listProjects() {
        return projectRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<Project> getProject(Long id) {
        return projectRepository.findById(id);
    }

    // -------------------------------------------------------------------------
    // Delete a whole project (cascade handled by JPA)
    // -------------------------------------------------------------------------
    @Transactional
    public void deleteProject(Long id) {
        projectRepository.findById(id).ifPresent(project -> {
            // Try to remove files; don't fail if files are missing (Disabled)
            /*
            try {
                Path p = Paths.get(projectsDir, project.getName());
                if (Files.exists(p)) deleteDirectoryRecursively(p);
            } catch (Exception ignored) {}
            */

            projectRepository.delete(project);
        });
    }

    // -------------------------------------------------------------------------
    // Delete a single scan and ALL its child records explicitly
    // -------------------------------------------------------------------------
    @Transactional
    public void deleteScan(Long id) {
        scanRepository.findById(id).ifPresent(scan -> {
            // Explicitly delete children first to avoid lazy-load issues
            issueRepository.deleteByScanId(id);
            scannedPageRepository.deleteByScanId(id);

            // Remove associated files if they exist (Disabled)
            /*
            try {
                String projectName = scan.getProject().getName();
                Files.deleteIfExists(Paths.get(projectsDir, projectName, "Reports",  "report_" + id + ".xlsx"));
                Files.deleteIfExists(Paths.get(projectsDir, projectName, "Logs",     "scan_"   + id + ".log"));
            } catch (Exception ignored) {}
            */

            scanRepository.delete(scan);
        });
    }

    // -------------------------------------------------------------------------
    // Create scan record
    // -------------------------------------------------------------------------
    @Transactional
    public Scan createScan(Long projectId, String scanName, String url,
                           Integer maxPages, Integer crawlDepth) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("Project not found: " + projectId));

        Scan scan = new Scan();
        scan.setProject(project);
        scan.setName(scanName == null || scanName.trim().isEmpty()
                ? "Scan_" + System.currentTimeMillis()
                : scanName.trim());
        scan.setUrl(url.trim());
        scan.setMaxPages(maxPages);
        scan.setCrawlDepth(crawlDepth);
        scan.setStatus("PENDING");
        scan.setStartedAt(LocalDateTime.now());

        return scanRepository.save(scan);
    }

    @Transactional
    public Scan saveScan(Scan scan) {
        return scanRepository.save(scan);
    }

    // -------------------------------------------------------------------------
    // List / get scans
    // -------------------------------------------------------------------------
    @Transactional(readOnly = true)
    public List<Scan> listScans(Long projectId) {
        return scanRepository.findByProjectIdOrderByIdDesc(projectId);
    }

    @Transactional(readOnly = true)
    public Optional<Scan> getScan(Long scanId) {
        return scanRepository.findById(scanId);
    }

    @Transactional(readOnly = true)
    public List<Scan> getActiveScans() {
        return scanRepository.findByStatus("RUNNING");
    }

    // -------------------------------------------------------------------------
    // File helpers
    // -------------------------------------------------------------------------
    private void deleteDirectoryRecursively(Path path) throws IOException {
        Files.walk(path)
             .sorted(java.util.Comparator.reverseOrder())
             .map(Path::toFile)
             .forEach(java.io.File::delete);
    }
}
