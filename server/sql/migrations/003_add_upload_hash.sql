USE cartsense;

ALTER TABLE imports
  ADD COLUMN file_sha256 CHAR(64) NULL,
  ADD UNIQUE KEY imports_file_sha256_unique (file_sha256);