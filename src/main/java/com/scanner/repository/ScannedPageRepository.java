package com.scanner.repository;

import com.scanner.model.ScannedPage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ScannedPageRepository extends JpaRepository<ScannedPage, Long> {
    List<ScannedPage> findByScanId(Long scanId);
    long countByScanId(Long scanId);

    @Modifying
    @Query("DELETE FROM ScannedPage sp WHERE sp.scan.id = :scanId")
    void deleteByScanId(Long scanId);

    @org.springframework.data.jpa.repository.Query("SELECT sp FROM ScannedPage sp WHERE " +
           "(:scanId IS NULL OR sp.scan.id = :scanId) AND " +
           "(:statusCode IS NULL OR sp.statusCode = :statusCode) AND " +
           "(:search IS NULL OR LOWER(sp.url) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(sp.title) LIKE LOWER(CONCAT('%', :search, '%')))")
    org.springframework.data.domain.Page<ScannedPage> searchScannedPages(
            @org.springframework.data.repository.query.Param("scanId") Long scanId,
            @org.springframework.data.repository.query.Param("statusCode") Integer statusCode,
            @org.springframework.data.repository.query.Param("search") String search,
            org.springframework.data.domain.Pageable pageable);
}
