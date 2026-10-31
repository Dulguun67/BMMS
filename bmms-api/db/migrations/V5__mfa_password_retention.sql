-- =====================================================================
-- V5. Нэвтрэлтийн хамгаалалт ба хадгалалтын хугацаа
--   * Анх нэвтрэхэд эсвэл admin нууц үг шинэчилсний дараа нууц үг солиулах
--   * Хоёр шатлалт баталгаажуулалт (TOTP, RFC 6238) ба нөөц код
--   * Хадгалах хугацаа дууссан хүүхдийн мэдээллийг устгах, хуучин сессийг цэвэрлэх
-- =====================================================================
SET NAMES utf8mb4;

ALTER TABLE hereglegch
  ADD COLUMN nuuts_ug_solih   BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'TRUE бол дараагийн нэвтрэлтэд нууц үг солиулна' AFTER nuuts_ug_hash,
  ADD COLUMN mfa_secret_enc   VARBINARY(256) NULL COMMENT 'TOTP нууц, AES-256-GCM (API-ийн FIELD_KEYS)' AFTER nuuts_ug_solih,
  ADD COLUMN mfa_key_id       VARCHAR(128) NULL AFTER mfa_secret_enc,
  ADD COLUMN mfa_idevhtei     BOOLEAN NOT NULL DEFAULT FALSE AFTER mfa_key_id,
  ADD COLUMN mfa_suuld_alham  BIGINT UNSIGNED NULL COMMENT 'Сүүлд ашигласан TOTP алхам: нэг кодыг дахин ашиглахаас сэргийлнэ' AFTER mfa_idevhtei;

CREATE TABLE hereglegch_mfa_noots (
  noots_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hereglegch_id   INT UNSIGNED NOT NULL,
  kod_hash        CHAR(64) NOT NULL COMMENT 'Нөөц кодын HMAC-SHA256. Код өөрөө хадгалагдахгүй',
  ashiglasan_at   DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_noots (hereglegch_id, kod_hash),
  CONSTRAINT fk_noots_user FOREIGN KEY (hereglegch_id) REFERENCES hereglegch (hereglegch_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='MFA-ийн нэг удаагийн нөөц код';

GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hereglegch_mfa_noots TO 'bmms_app';

DELIMITER $$

-- Хадгалах хугацаа дууссан хүүхдийн мэдээллийг устгана.
--   Бүх бүлгээс гарснаас хойш p_jil жил өнгөрсөн, одоо аль ч бүлгийн гишүүн биш хүүхэд.
--   Устгалт CASCADE-аар ирц, үнэлгээ, эрүүл мэнд, ганцаарчилсан сургалт хүртэл хамарна;
--   suraltsagch-ийн DELETE trigger audit_log-д бүртгэнэ. p_tursh = TRUE бол зөвхөн тоолно.
CREATE PROCEDURE sp_hugatsaa_duussan_ustgah(IN p_jil TINYINT UNSIGNED, IN p_tursh BOOLEAN)
BEGIN
  DECLARE v_huuhed INT DEFAULT 0;
  DECLARE v_asran INT DEFAULT 0;
  DECLARE v_sess INT DEFAULT 0;
  IF p_jil IS NULL OR p_jil < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Хадгалах хугацаа (жил) 1-ээс багагүй байна';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_ustgah;
  CREATE TEMPORARY TABLE tmp_ustgah (suraltsagch_id INT UNSIGNED PRIMARY KEY) ENGINE=MEMORY;
  INSERT INTO tmp_ustgah
  SELECT s.suraltsagch_id FROM suraltsagch s
   WHERE s.tuluv IN ('Шилжсэн','Төгссөн')
     AND NOT EXISTS (SELECT 1 FROM buleg_gishuun g WHERE g.suraltsagch_id = s.suraltsagch_id
                      AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo > CURDATE() - INTERVAL p_jil YEAR));
  SELECT COUNT(*) INTO v_huuhed FROM tmp_ustgah;

  IF NOT p_tursh THEN
    START TRANSACTION;
    DELETE s FROM suraltsagch s JOIN tmp_ustgah t ON t.suraltsagch_id = s.suraltsagch_id;
    -- Аль ч хүүхэдтэй холбоогүй болсон асран хамгаалагч
    DELETE a FROM asran_hamgaalagch a
     WHERE NOT EXISTS (SELECT 1 FROM suraltsagch_asran sa WHERE sa.asran_id = a.asran_id);
    SET v_asran = ROW_COUNT();
    -- 30 хоногоос өмнө дууссан/цуцлагдсан сесс
    DELETE FROM hereglegch_session
     WHERE COALESCE(tsutsalsan_at, duusah_hugatsaa) < NOW() - INTERVAL 30 DAY;
    SET v_sess = ROW_COUNT();
    INSERT INTO audit_log (hereglegch_id, uildel, husnegt, delgerengui)
    VALUES (@app_hereglegch_id, 'DELETE', 'retention',
            JSON_OBJECT('jil', p_jil, 'suraltsagch', v_huuhed, 'asran_hamgaalagch', v_asran, 'session', v_sess));
    COMMIT;
  END IF;
  DROP TEMPORARY TABLE IF EXISTS tmp_ustgah;
  SELECT v_huuhed AS suraltsagch, v_asran AS asran_hamgaalagch, v_sess AS session, p_tursh AS tursh;
END$$

DELIMITER ;

GRANT EXECUTE ON PROCEDURE bmms.sp_hugatsaa_duussan_ustgah TO 'bmms_app';
