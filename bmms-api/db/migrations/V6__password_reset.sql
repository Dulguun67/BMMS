-- =====================================================================
-- V6. Нууц үгээ мартсан үед имэйлээр сэргээх; сесс цуцлахад access token-ыг ч хүчингүй болгох
--   Токеныг өөрийг нь биш, зөвхөн SHA-256 хэшийг хадгална. 30 минут хүчинтэй, нэг удаа ашиглагдана.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE nuuts_ug_sergeelt (
  sergeelt_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hereglegch_id   INT UNSIGNED NOT NULL,
  token_hash      CHAR(64) NOT NULL,
  duusah_hugatsaa DATETIME NOT NULL,
  ashiglasan_at   DATETIME NULL,
  huseltiin_ip    VARBINARY(16) NULL,
  ehelsen         ENUM('hereglegch','admin') NOT NULL DEFAULT 'hereglegch' COMMENT 'Хэрэглэгч өөрөө эсвэл admin илгээсэн',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sergeelt_hash (token_hash),
  KEY ix_sergeelt_user (hereglegch_id, created_at),
  CONSTRAINT fk_sergeelt_user FOREIGN KEY (hereglegch_id) REFERENCES hereglegch (hereglegch_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Нууц үг сэргээх нэг удаагийн токен';

GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.nuuts_ug_sergeelt TO 'bmms_app';

-- Энэ мөчөөс өмнө олгосон access token-ыг хүчингүй болгоно (нууц үг солих, сэргээх, admin эрх/төлөв өөрчлөх үед).
-- Ингэснээр 15 минутын access token ч гэсэн тэр даруй ажиллахаа болино.
ALTER TABLE hereglegch
  ADD COLUMN token_huchingui_ognoo DATETIME NULL COMMENT 'Үүнээс өмнө олгосон access token хүчингүй' AFTER mfa_suuld_alham;
