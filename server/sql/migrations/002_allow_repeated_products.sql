USE cartsense;

ALTER TABLE order_lines
  DROP INDEX order_lines_import_order_product_idx;
