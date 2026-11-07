-- The Umrah Store CRM - MySQL schema (reference copy).
-- Generated from lib/store.js. The application applies this automatically at startup (crm_schema_migrations tracks versions).
-- You never need to run this file by hand. Every statement is idempotent (IF NOT EXISTS).

-- migration v1: initial schema
CREATE TABLE IF NOT EXISTS crm_head (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL, last_token VARCHAR(40) NOT NULL, writer VARCHAR(120) NOT NULL, app_version VARCHAR(20) NOT NULL, committed_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS crm_kv (k VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, v LONGTEXT NOT NULL, rev BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS crm_sessions (sid VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, user_id VARCHAR(64) NULL, expires_at BIGINT NULL, doc LONGTEXT NOT NULL, rev BIGINT UNSIGNED NOT NULL, KEY idx_crm_sessions_user (user_id), KEY idx_crm_sessions_exp (expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS crm_backups (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL, reason VARCHAR(40) NOT NULL, raw_bytes INT UNSIGNED NOT NULL, payload LONGBLOB NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_crm_backups_created (created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_users` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `login` VARCHAR(190) NULL,
  `role` VARCHAR(32) NULL,
  `party_id` VARCHAR(64) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_users_ord` (`ord`),
  KEY `idx_crm_users_login` (`login`),
  KEY `idx_crm_users_party_id` (`party_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_parties` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `kind` VARCHAR(32) NULL,
  `name` VARCHAR(255) NULL,
  `phone` VARCHAR(64) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_parties_ord` (`ord`),
  KEY `idx_crm_parties_kind` (`kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_bookings` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `booking_no` VARCHAR(64) NULL,
  `party_id` VARCHAR(64) NULL,
  `status` VARCHAR(32) NULL,
  `category` VARCHAR(64) NULL,
  `travel_from` VARCHAR(10) NULL,
  `created_at` VARCHAR(32) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_bookings_ord` (`ord`),
  KEY `idx_crm_bookings_booking_no` (`booking_no`),
  KEY `idx_crm_bookings_party_id` (`party_id`),
  KEY `idx_crm_bookings_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_vouchers` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `voucher_no` VARCHAR(64) NULL,
  `token` VARCHAR(64) NULL,
  `booking_id` VARCHAR(64) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_vouchers_ord` (`ord`),
  KEY `idx_crm_vouchers_voucher_no` (`voucher_no`),
  KEY `idx_crm_vouchers_token` (`token`),
  KEY `idx_crm_vouchers_booking_id` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_payments` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `party_id` VARCHAR(64) NULL,
  `direction` VARCHAR(8) NULL,
  `status` VARCHAR(32) NULL,
  `amount` BIGINT NULL,
  `pay_date` VARCHAR(10) NULL,
  `booking_id` VARCHAR(64) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_payments_ord` (`ord`),
  KEY `idx_crm_payments_party_id` (`party_id`),
  KEY `idx_crm_payments_status` (`status`),
  KEY `idx_crm_payments_booking_id` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_ledger_entries` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `party_id` VARCHAR(64) NULL,
  `entry_date` VARCHAR(10) NULL,
  `debit` BIGINT NULL,
  `credit` BIGINT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_ledger_entries_ord` (`ord`),
  KEY `idx_crm_ledger_entries_party_id` (`party_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_expenses` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `category` VARCHAR(64) NULL,
  `expense_date` VARCHAR(10) NULL,
  `amount` BIGINT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_expenses_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_queries` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `query_no` VARCHAR(64) NULL,
  `status` VARCHAR(32) NULL,
  `party_id` VARCHAR(64) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_queries_ord` (`ord`),
  KEY `idx_crm_queries_query_no` (`query_no`),
  KEY `idx_crm_queries_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_paylinks` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `token` VARCHAR(64) NULL,
  `party_id` VARCHAR(64) NULL,
  `status` VARCHAR(32) NULL,
  `amount` BIGINT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_paylinks_ord` (`ord`),
  KEY `idx_crm_paylinks_token` (`token`),
  KEY `idx_crm_paylinks_party_id` (`party_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_groups` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `departure` VARCHAR(10) NULL,
  `code` VARCHAR(64) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_groups_ord` (`ord`),
  KEY `idx_crm_groups_departure` (`departure`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_hotels` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `name` VARCHAR(255) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_hotels_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_visa_tiers` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_visa_tiers_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_transport_vehicles` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_transport_vehicles_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_transport_routes` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_transport_routes_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_transport_prices` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_transport_prices_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_activity_log` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `logged_at` VARCHAR(32) NULL,
  `actor` VARCHAR(120) NULL,
  `action` VARCHAR(190) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_activity_log_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_tickets` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `ticket_no` VARCHAR(64) NULL,
  `party_id` VARCHAR(64) NULL,
  `status` VARCHAR(32) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_tickets_ord` (`ord`),
  KEY `idx_crm_tickets_ticket_no` (`ticket_no`),
  KEY `idx_crm_tickets_party_id` (`party_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_notifications` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `created_at` VARCHAR(32) NULL,
  `kind` VARCHAR(32) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_notifications_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_audit_log` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `created_at` VARCHAR(32) NULL,
  `user_id` VARCHAR(64) NULL,
  `action` VARCHAR(190) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_audit_log_ord` (`ord`),
  KEY `idx_crm_audit_log_created_at` (`created_at`),
  KEY `idx_crm_audit_log_user_id` (`user_id`),
  KEY `idx_crm_audit_log_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_chats` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `status` VARCHAR(32) NULL,
  `updated_at` VARCHAR(32) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_chats_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_promotions` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_promotions_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_signups` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `ref` VARCHAR(32) NULL,
  `email` VARCHAR(190) NULL,
  `status` VARCHAR(32) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_signups_ord` (`ord`),
  KEY `idx_crm_signups_ref` (`ref`),
  KEY `idx_crm_signups_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_roles` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `name` VARCHAR(190) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_roles_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_departments` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `name` VARCHAR(190) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_departments_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `crm_mail_log` (
  `id` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `ord` BIGINT NOT NULL,
  `sent_at` VARCHAR(32) NULL,
  `doc` LONGTEXT NOT NULL,
  `rev` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_crm_mail_log_ord` (`ord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
