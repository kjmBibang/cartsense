CREATE DATABASE IF NOT EXISTS cartsense
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cartsense;

CREATE TABLE IF NOT EXISTS imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_filename VARCHAR(255) NOT NULL,
  status ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  imported_rows INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows INT UNSIGNED NOT NULL DEFAULT 0,
  validation_errors JSON NULL,
  file_sha256 CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY imports_file_sha256_unique (file_sha256),
  KEY imports_created_at_idx (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  order_number INT UNSIGNED NULL,
  order_dow TINYINT UNSIGNED NULL,
  order_hour_of_day TINYINT UNSIGNED NULL,
  days_since_prior_order DECIMAL(8,2) NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  reordered TINYINT(1) NOT NULL DEFAULT 0,
  add_to_cart_order INT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT order_lines_import_fk FOREIGN KEY (import_id) REFERENCES imports (id) ON DELETE CASCADE,
  KEY order_lines_import_order_idx (import_id, order_id),
  KEY order_lines_import_product_idx (import_id, product_id),
  KEY order_lines_import_department_idx (import_id, department)
) ENGINE=InnoDB;
