package com.scanner.model;

import jakarta.persistence.*;

@Entity
@Table(name = "profile_image")
public class ProfileImage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "data", nullable = false, length = 16777215) // up to 16MB
    private byte[] data;

    public ProfileImage() {}

    public ProfileImage(String contentType, byte[] data) {
        this.contentType = contentType;
        this.data = data;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public byte[] getData() { return data; }
    public void setData(byte[] data) { this.data = data; }
}
