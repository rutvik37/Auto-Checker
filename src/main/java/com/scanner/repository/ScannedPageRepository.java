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
}
