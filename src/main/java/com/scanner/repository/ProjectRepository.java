package com.scanner.repository;

import com.scanner.model.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {
    Optional<Project> findByName(String name);

    @org.springframework.data.jpa.repository.Query("SELECT p FROM Project p WHERE " +
            "(:search IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
            "(:from IS NULL OR p.createdAt >= :from) AND " +
            "(:to IS NULL OR p.createdAt <= :to)")
    org.springframework.data.domain.Page<Project> searchProjects(
            @org.springframework.data.repository.query.Param("search") String search,
            @org.springframework.data.repository.query.Param("from") java.time.LocalDateTime from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDateTime to,
            org.springframework.data.domain.Pageable pageable);
}
