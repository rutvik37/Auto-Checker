package com.scanner.repository;

import com.scanner.model.Scan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ScanRepository extends JpaRepository<Scan, Long> {
    List<Scan> findByProjectId(Long projectId);
    List<Scan> findByProjectIdOrderByIdDesc(Long projectId);
    List<Scan> findByStatus(String status);

    @org.springframework.data.jpa.repository.Query("SELECT s FROM Scan s WHERE " +
           "(:status IS NULL OR s.status = :status) AND " +
           "(:search IS NULL OR LOWER(s.name) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(s.url) LIKE LOWER(CONCAT('%', :search, '%')))")
    org.springframework.data.domain.Page<Scan> searchScans(
            @org.springframework.data.repository.query.Param("status") String status,
            @org.springframework.data.repository.query.Param("search") String search,
            org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("SELECT s.name, s.totalIssues, s.pagesScanned, s.wordsChecked, s.id FROM Scan s ORDER BY s.id DESC")
    List<Object[]> getScanAnalyticsLimit(org.springframework.data.domain.Pageable pageable);
}
