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
}
