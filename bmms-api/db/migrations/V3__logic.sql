-- =====================================================================
-- БММС — 03. Функц, харагдац (view), trigger, процедур
-- Аппликейшн холболт бүрийн эхэнд:  SET @app_hereglegch_id = <JWT-ээс авсан id>;
-- (аудит болон батлах урсгал үүгээр хэн хийснийг тодорхойлно)
-- =====================================================================
SET NAMES utf8mb4;
DELIMITER $$

-- ---------------------------------------------------------------------
-- Функц
-- ---------------------------------------------------------------------
-- Ажиллавал зохих өдөр: Да–Ба, амралтын өдрийг хасна (PR109)
CREATE FUNCTION fn_ajlyn_udur(p_tsetserleg_id INT UNSIGNED, p_sar DATE)
RETURNS SMALLINT READS SQL DATA
BEGIN
  DECLARE d DATE DEFAULT DATE_FORMAT(p_sar, '%Y-%m-01');
  DECLARE e DATE DEFAULT LAST_DAY(p_sar);
  DECLARE n SMALLINT DEFAULT 0;
  WHILE d <= e DO
    IF WEEKDAY(d) < 5 AND NOT EXISTS (
         SELECT 1 FROM amraltyn_odor a
          WHERE a.ognoo = d AND (a.tsetserleg_id IS NULL OR a.tsetserleg_id = p_tsetserleg_id)) THEN
      SET n = n + 1;
    END IF;
    SET d = d + INTERVAL 1 DAY;
  END WHILE;
  RETURN n;
END$$

-- Тухайн өдөр мөрдөж буй нэг өдрийн хоолны төлбөр
CREATE FUNCTION fn_hoolny_une(p_tsetserleg_id INT UNSIGNED, p_ognoo DATE)
RETURNS DECIMAL(10,2) READS SQL DATA
BEGIN
  RETURN COALESCE((SELECT h.neg_odriin_une FROM hoolny_une h
                    WHERE h.tsetserleg_id = p_tsetserleg_id AND h.hugatsaa_ehleh <= p_ognoo
                    ORDER BY h.hugatsaa_ehleh DESC LIMIT 1), 0);
END$$

-- ---------------------------------------------------------------------
-- Trigger: ажлын урсгал, бүрэн бүтэн байдал
-- ---------------------------------------------------------------------
-- Ирц: ирээдүйн огноо хориглох, хүүхэд тухайн өдөр бүлгийн гишүүн байх
CREATE TRIGGER trg_irts_bi BEFORE INSERT ON irts FOR EACH ROW
BEGIN
  IF NEW.ognoo > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ирээдүйн огноонд ирц бүртгэх боломжгүй';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM buleg_gishuun g
                  WHERE g.buleg_id = NEW.buleg_id AND g.suraltsagch_id = NEW.suraltsagch_id
                    AND g.elssen_ognoo <= NEW.ognoo
                    AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= NEW.ognoo)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Хүүхэд энэ өдөр тухайн бүлгийн гишүүн биш байна';
  END IF;
END$$

CREATE TRIGGER trg_irts_bu BEFORE UPDATE ON irts FOR EACH ROW
BEGIN
  IF NEW.ognoo <> OLD.ognoo OR NEW.suraltsagch_id <> OLD.suraltsagch_id OR NEW.buleg_id <> OLD.buleg_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ирцийн огноо, хүүхэд, бүлгийг өөрчлөхгүй. Шинээр бүртгэнэ үү';
  END IF;
END$$

-- Санал шүүмж яг нэг эзэнтэй (төлөвлөгөө ЭСВЭЛ тайлан)
CREATE TRIGGER trg_ss_bi BEFORE INSERT ON sanal_shuumj FOR EACH ROW
BEGIN
  IF (NEW.tuluvluguu_id IS NULL) = (NEW.tailan_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Санал шүүмж нэг төлөвлөгөө эсвэл нэг тайланд хамаарна';
  END IF;
END$$

-- Төлөвлөгөө: шатлал, төлөвийн шилжилт, батлагдсаны дараах түгжээ
CREATE TRIGGER trg_tl_bi BEFORE INSERT ON tuluvluguu FOR EACH ROW
BEGIN
  DECLARE p_turul INT; DECLARE p_buleg INT UNSIGNED;
  IF NEW.tuluv <> 'Ноорог' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Шинэ төлөвлөгөө Ноорог төлөвтэй үүснэ';
  END IF;
  IF NEW.ehleh_tuluvluguu_id IS NOT NULL THEN
    SELECT turul + 0, buleg_id INTO p_turul, p_buleg FROM tuluvluguu WHERE tuluvluguu_id = NEW.ehleh_tuluvluguu_id;
    IF p_buleg <> NEW.buleg_id OR p_turul >= NEW.turul + 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Дээд шатны төлөвлөгөө ижил бүлгийн, илүү өндөр шатных байна';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_tl_bu BEFORE UPDATE ON tuluvluguu FOR EACH ROW
BEGIN
  DECLARE p_turul INT; DECLARE p_buleg INT UNSIGNED;
  IF OLD.tuluv = 'Батлагдсан' AND (
       NEW.tuluv <> OLD.tuluv OR NOT (NEW.garchig <=> OLD.garchig) OR NOT (NEW.zorilgo <=> OLD.zorilgo)
       OR NOT (NEW.aguulga <=> OLD.aguulga) OR NOT (NEW.heregsel <=> OLD.heregsel)
       OR NEW.hugatsaa_ehleh <> OLD.hugatsaa_ehleh OR NEW.hugatsaa_duusah <> OLD.hugatsaa_duusah) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Батлагдсан төлөвлөгөөг өөрчлөхгүй. Шинэ хувилбар үүсгэнэ үү';
  END IF;
  IF NEW.tuluv <> OLD.tuluv AND NOT (
       (OLD.tuluv = 'Ноорог'       AND NEW.tuluv = 'Хянагдаж буй') OR
       (OLD.tuluv = 'Буцаасан'     AND NEW.tuluv IN ('Ноорог','Хянагдаж буй')) OR
       (OLD.tuluv = 'Хянагдаж буй' AND NEW.tuluv IN ('Батлагдсан','Буцаасан'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Төлөвийн шилжилт буруу';
  END IF;
  IF NEW.tuluv = 'Батлагдсан' AND OLD.tuluv <> 'Батлагдсан' THEN
    IF NEW.batalsan_hereglegch IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Баталсан хэрэглэгчийг заана уу';
    END IF;
    SET NEW.batalsan_at = NOW();
  END IF;
  IF NOT (NEW.ehleh_tuluvluguu_id <=> OLD.ehleh_tuluvluguu_id) AND NEW.ehleh_tuluvluguu_id IS NOT NULL THEN
    SELECT turul + 0, buleg_id INTO p_turul, p_buleg FROM tuluvluguu WHERE tuluvluguu_id = NEW.ehleh_tuluvluguu_id;
    IF p_buleg <> NEW.buleg_id OR p_turul >= NEW.turul + 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Дээд шатны төлөвлөгөө ижил бүлгийн, илүү өндөр шатных байна';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_tailan_bi BEFORE INSERT ON tailan FOR EACH ROW
BEGIN
  IF NEW.tuluv <> 'Ноорог' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Шинэ тайлан Ноорог төлөвтэй үүснэ';
  END IF;
  IF NEW.tuluvluguu_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM tuluvluguu t WHERE t.tuluvluguu_id = NEW.tuluvluguu_id
          AND t.buleg_id = NEW.buleg_id AND t.turul = 'Сарын') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Тайлан тухайн бүлгийн сарын төлөвлөгөөнд үндэслэнэ';
  END IF;
END$$

CREATE TRIGGER trg_tailan_bu BEFORE UPDATE ON tailan FOR EACH ROW
BEGIN
  IF OLD.tuluv = 'Батлагдсан' AND (NEW.tuluv <> OLD.tuluv OR NOT (NEW.hiigdsen_ajil <=> OLD.hiigdsen_ajil)
       OR NOT (NEW.ur_dun <=> OLD.ur_dun) OR NOT (NEW.dugnelt <=> OLD.dugnelt) OR NEW.sar <> OLD.sar) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Батлагдсан тайланг өөрчлөхгүй';
  END IF;
  IF NEW.tuluv <> OLD.tuluv AND NOT (
       (OLD.tuluv = 'Ноорог'       AND NEW.tuluv = 'Хянагдаж буй') OR
       (OLD.tuluv = 'Буцаасан'     AND NEW.tuluv IN ('Ноорог','Хянагдаж буй')) OR
       (OLD.tuluv = 'Хянагдаж буй' AND NEW.tuluv IN ('Батлагдсан','Буцаасан'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Төлөвийн шилжилт буруу';
  END IF;
  IF NEW.tuluv = 'Батлагдсан' AND OLD.tuluv <> 'Батлагдсан' THEN
    IF NEW.batalsan_hereglegch IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Баталсан хэрэглэгчийг заана уу';
    END IF;
    SET NEW.batalsan_at = NOW();
  END IF;
END$$

-- ---------------------------------------------------------------------
-- Trigger: аудит (хувийн мэдээллийн хүснэгтүүд). Зөвхөн танигч бичнэ.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_audit_noupd BEFORE UPDATE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log-ийг засах боломжгүй'$$
CREATE TRIGGER trg_audit_nodel BEFORE DELETE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log-оос устгах боломжгүй'$$

CREATE TRIGGER trg_aud_child_ai AFTER INSERT ON suraltsagch FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'INSERT','suraltsagch',NEW.suraltsagch_id)$$
CREATE TRIGGER trg_aud_child_au AFTER UPDATE ON suraltsagch FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'UPDATE','suraltsagch',NEW.suraltsagch_id)$$
CREATE TRIGGER trg_aud_child_ad AFTER DELETE ON suraltsagch FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'DELETE','suraltsagch',OLD.suraltsagch_id)$$

CREATE TRIGGER trg_aud_asran_ai AFTER INSERT ON asran_hamgaalagch FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'INSERT','asran_hamgaalagch',NEW.asran_id)$$
CREATE TRIGGER trg_aud_asran_au AFTER UPDATE ON asran_hamgaalagch FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'UPDATE','asran_hamgaalagch',NEW.asran_id)$$
CREATE TRIGGER trg_aud_asran_ad AFTER DELETE ON asran_hamgaalagch FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'DELETE','asran_hamgaalagch',OLD.asran_id)$$

CREATE TRIGGER trg_aud_em_ai AFTER INSERT ON eruul_mend FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'INSERT','eruul_mend',NEW.eruul_id)$$
CREATE TRIGGER trg_aud_em_au AFTER UPDATE ON eruul_mend FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'UPDATE','eruul_mend',NEW.eruul_id)$$
CREATE TRIGGER trg_aud_em_ad AFTER DELETE ON eruul_mend FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'DELETE','eruul_mend',OLD.eruul_id)$$

CREATE TRIGGER trg_aud_gs_ai AFTER INSERT ON gantsaarchilsan_surgalt FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'INSERT','gantsaarchilsan_surgalt',NEW.surgalt_id)$$
CREATE TRIGGER trg_aud_gs_au AFTER UPDATE ON gantsaarchilsan_surgalt FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'UPDATE','gantsaarchilsan_surgalt',NEW.surgalt_id)$$
CREATE TRIGGER trg_aud_gs_ad AFTER DELETE ON gantsaarchilsan_surgalt FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'DELETE','gantsaarchilsan_surgalt',OLD.surgalt_id)$$

CREATE TRIGGER trg_aud_gt_ai AFTER INSERT ON gantsaarchilsan_tailan FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'INSERT','gantsaarchilsan_tailan',NEW.tailan_id)$$
CREATE TRIGGER trg_aud_gt_au AFTER UPDATE ON gantsaarchilsan_tailan FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'UPDATE','gantsaarchilsan_tailan',NEW.tailan_id)$$
CREATE TRIGGER trg_aud_gt_ad AFTER DELETE ON gantsaarchilsan_tailan FOR EACH ROW
  INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id) VALUES (@app_hereglegch_id,'DELETE','gantsaarchilsan_tailan',OLD.tailan_id)$$

-- ---------------------------------------------------------------------
-- Процедур
-- ---------------------------------------------------------------------
-- Тухайн өдөр бүртгэгдээгүй бүх хүүхдийг «Ирсэн» болгох
CREATE PROCEDURE sp_irts_buglu(IN p_buleg_id INT UNSIGNED, IN p_ognoo DATE, IN p_hereglegch_id INT UNSIGNED)
BEGIN
  DECLARE v_ts INT UNSIGNED;
  SELECT tsetserleg_id INTO v_ts FROM buleg WHERE buleg_id = p_buleg_id;
  IF v_ts IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Бүлэг олдсонгүй'; END IF;
  IF WEEKDAY(p_ognoo) >= 5 OR EXISTS (SELECT 1 FROM amraltyn_odor a WHERE a.ognoo = p_ognoo
                                         AND (a.tsetserleg_id IS NULL OR a.tsetserleg_id = v_ts)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ажлын бус өдөр байна';
  END IF;
  SET @app_hereglegch_id = p_hereglegch_id;
  INSERT INTO irts (suraltsagch_id, buleg_id, ognoo, tuluv, burtgesen_hereglegch)
  SELECT g.suraltsagch_id, p_buleg_id, p_ognoo, 'Ирсэн', p_hereglegch_id
    FROM buleg_gishuun g
   WHERE g.buleg_id = p_buleg_id AND g.elssen_ognoo <= p_ognoo
     AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= p_ognoo)
     AND NOT EXISTS (SELECT 1 FROM irts i WHERE i.suraltsagch_id = g.suraltsagch_id AND i.ognoo = p_ognoo);
  SELECT ROW_COUNT() AS nemegdsen;
END$$

-- Батлах урсгал (AR101, AR103): илгээх → батлах / буцаах
--   p_obekt: 'tuluvluguu' | 'tailan'
CREATE PROCEDURE sp_batlah_urgal(IN p_obekt VARCHAR(12), IN p_id INT UNSIGNED,
                                 IN p_hereglegch_id INT UNSIGNED, IN p_shine_tuluv VARCHAR(20),
                                 IN p_tekst TEXT)
BEGIN
  DECLARE v_uureg VARCHAR(20); DECLARE v_user_ts INT UNSIGNED;
  DECLARE v_obj_ts INT UNSIGNED; DECLARE v_author_user INT UNSIGNED;
  DECLARE v_uildel VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  SELECT h.uureg, b.tsetserleg_id INTO v_uureg, v_user_ts
    FROM hereglegch h LEFT JOIN bagsh b ON b.hereglegch_id = h.hereglegch_id
   WHERE h.hereglegch_id = p_hereglegch_id AND h.tuluv = 'idevhtei';
  IF v_uureg IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Хэрэглэгч идэвхгүй эсвэл олдсонгүй'; END IF;

  IF p_obekt = 'tuluvluguu' THEN
    SELECT bu.tsetserleg_id, ba.hereglegch_id INTO v_obj_ts, v_author_user
      FROM tuluvluguu t JOIN buleg bu ON bu.buleg_id = t.buleg_id JOIN bagsh ba ON ba.bagsh_id = t.bolovsruulsan_bagsh
     WHERE t.tuluvluguu_id = p_id;
  ELSEIF p_obekt = 'tailan' THEN
    SELECT bu.tsetserleg_id, ba.hereglegch_id INTO v_obj_ts, v_author_user
      FROM tailan t JOIN buleg bu ON bu.buleg_id = t.buleg_id JOIN bagsh ba ON ba.bagsh_id = t.bolovsruulsan_bagsh
     WHERE t.tailan_id = p_id;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p_obekt нь tuluvluguu эсвэл tailan байна';
  END IF;
  IF v_obj_ts IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Бичлэг олдсонгүй'; END IF;

  IF p_shine_tuluv = 'Хянагдаж буй' THEN
    IF v_author_user <> p_hereglegch_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Зөвхөн боловсруулсан багш илгээнэ';
    END IF;
    SET v_uildel = 'Илгээв';
  ELSEIF p_shine_tuluv IN ('Батлагдсан','Буцаасан') THEN
    IF v_uureg <> 'arga_zuich' OR v_user_ts <> v_obj_ts THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Зөвхөн тухайн цэцэрлэгийн заах арга зүйч батална';
    END IF;
    IF p_shine_tuluv = 'Буцаасан' AND (p_tekst IS NULL OR TRIM(p_tekst) = '') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Буцаах шалтгааныг бичнэ үү';
    END IF;
    SET v_uildel = IF(p_shine_tuluv = 'Батлагдсан', 'Батлав', 'Буцаав');
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Шинэ төлөв буруу';
  END IF;

  START TRANSACTION;
  SET @app_hereglegch_id = p_hereglegch_id;
  IF p_obekt = 'tuluvluguu' THEN
    UPDATE tuluvluguu SET tuluv = p_shine_tuluv,
           batalsan_hereglegch = IF(p_shine_tuluv = 'Батлагдсан', p_hereglegch_id, batalsan_hereglegch)
     WHERE tuluvluguu_id = p_id;
    INSERT INTO sanal_shuumj (tuluvluguu_id, hereglegch_id, uildel, tekst) VALUES (p_id, p_hereglegch_id, v_uildel, p_tekst);
  ELSE
    UPDATE tailan SET tuluv = p_shine_tuluv,
           batalsan_hereglegch = IF(p_shine_tuluv = 'Батлагдсан', p_hereglegch_id, batalsan_hereglegch)
     WHERE tailan_id = p_id;
    INSERT INTO sanal_shuumj (tailan_id, hereglegch_id, uildel, tekst) VALUES (p_id, p_hereglegch_id, v_uildel, p_tekst);
  END IF;
  COMMIT;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- Харагдац (view)
-- ---------------------------------------------------------------------
-- Бүлгийн одоогийн хүүхдүүд
CREATE VIEW v_buleg_huuhed AS
SELECT g.buleg_id, s.suraltsagch_id, s.ovog, s.ner, s.huis, s.torson_ognoo,
       TIMESTAMPDIFF(MONTH, s.torson_ognoo, CURDATE()) AS nas_sar,
       s.tanih_temdeg, t.toyrgiin_baidal, g.elssen_ognoo
  FROM buleg_gishuun g
  JOIN suraltsagch s ON s.suraltsagch_id = g.suraltsagch_id
  LEFT JOIN toyrgiin_sudalgaa t ON t.suraltsagch_id = s.suraltsagch_id
 WHERE g.garsan_ognoo IS NULL OR g.garsan_ognoo >= CURDATE();

-- Ирцийн сарын нэгтгэл (PR109)
--   ирвэл зохих = ажилласан өдөр × хүүхдийн тоо; төлөвлөгөө = ирвэл зохих
--   гүйцэтгэл = «Ирсэн»-ий тоо; хоолны зардал = ирсэн өдөр бүрийн тухайн үеийн үнэ
CREATE VIEW v_irts_sar AS
WITH s AS (
  SELECT i.buleg_id, b.tsetserleg_id,
         CAST(DATE_FORMAT(i.ognoo, '%Y-%m-01') AS DATE) AS sar,
         COUNT(DISTINCT i.ognoo)     AS ajillasan_udur,
         SUM(i.tuluv = 'Ирсэн')     AS guitsetgel,
         SUM(i.tuluv = 'Чөлөөтэй')  AS chuluutei,
         SUM(i.tuluv = 'Өвчтэй')    AS ovchtei,
         SUM(i.tuluv = 'Тасалсан')  AS tasalsan,
         SUM(CASE WHEN i.tuluv = 'Ирсэн' THEN fn_hoolny_une(b.tsetserleg_id, i.ognoo) ELSE 0 END) AS hoolny_zardal
    FROM irts i JOIN buleg b ON b.buleg_id = i.buleg_id
   GROUP BY i.buleg_id, b.tsetserleg_id, CAST(DATE_FORMAT(i.ognoo, '%Y-%m-01') AS DATE)
), t AS (
  SELECT s.*,
         fn_ajlyn_udur(s.tsetserleg_id, s.sar) AS ajillaval_zohih_udur,
         (SELECT COUNT(*) FROM buleg_gishuun g
           WHERE g.buleg_id = s.buleg_id AND g.elssen_ognoo <= LAST_DAY(s.sar)
             AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= s.sar)) AS huuhdiin_too
    FROM s
)
SELECT buleg_id, tsetserleg_id, sar, ajillaval_zohih_udur, ajillasan_udur, huuhdiin_too,
       ajillasan_udur * huuhdiin_too AS irvel_zohih,
       ajillasan_udur * huuhdiin_too AS tuluvluguu,
       guitsetgel,
       ROUND(100 * guitsetgel / NULLIF(ajillasan_udur * huuhdiin_too, 0), 1) AS guitsetgel_huvi,
       ROUND(guitsetgel / NULLIF(ajillasan_udur, 0), 1) AS dundaj_irts,
       chuluutei, ovchtei, tasalsan,
       hoolny_zardal AS niit_hoolny_zardal
  FROM t;

-- Улирлын (календарийн) нэгтгэл
CREATE VIEW v_irts_uliral AS
SELECT buleg_id, YEAR(sar) AS jil, QUARTER(sar) AS uliral,
       SUM(ajillaval_zohih_udur) AS ajillaval_zohih_udur, SUM(ajillasan_udur) AS ajillasan_udur,
       SUM(irvel_zohih) AS irvel_zohih, SUM(guitsetgel) AS guitsetgel,
       ROUND(100 * SUM(guitsetgel) / NULLIF(SUM(irvel_zohih), 0), 1) AS guitsetgel_huvi,
       ROUND(SUM(guitsetgel) / NULLIF(SUM(ajillasan_udur), 0), 1) AS dundaj_irts,
       SUM(niit_hoolny_zardal) AS niit_hoolny_zardal
  FROM v_irts_sar GROUP BY buleg_id, YEAR(sar), QUARTER(sar);

-- Хичээлийн жилийн нэгтгэл
CREATE VIEW v_irts_jil AS
SELECT v.buleg_id, b.jil_id,
       SUM(v.ajillaval_zohih_udur) AS ajillaval_zohih_udur, SUM(v.ajillasan_udur) AS ajillasan_udur,
       SUM(v.irvel_zohih) AS irvel_zohih, SUM(v.guitsetgel) AS guitsetgel,
       ROUND(100 * SUM(v.guitsetgel) / NULLIF(SUM(v.irvel_zohih), 0), 1) AS guitsetgel_huvi,
       ROUND(SUM(v.guitsetgel) / NULLIF(SUM(v.ajillasan_udur), 0), 1) AS dundaj_irts,
       SUM(v.niit_hoolny_zardal) AS niit_hoolny_zardal
  FROM v_irts_sar v JOIN buleg b ON b.buleg_id = v.buleg_id
 GROUP BY v.buleg_id, b.jil_id;

-- Рубрикийн бүлгийн дундаж, анхаарах чиглэл (TR104, AR102)
CREATE VIEW v_rubric_buleg_dundaj AS
SELECT g.buleg_id, r.uye_id, u.turul AS uye, r.chiglel_id, c.ner AS chiglel,
       ROUND(AVG(r.tuvshin), 2) AS dundaj, COUNT(*) AS unelsen_huuhed,
       (AVG(r.tuvshin) < 2) AS anhaarah
  FROM rubric_unelgee r
  JOIN unelgee_uye u ON u.uye_id = r.uye_id
  JOIN buleg_gishuun g ON g.suraltsagch_id = r.suraltsagch_id
  JOIN buleg b ON b.buleg_id = g.buleg_id AND b.jil_id = u.jil_id
  JOIN suraltsahuin_chiglel c ON c.chiglel_id = r.chiglel_id
 GROUP BY g.buleg_id, r.uye_id, u.turul, r.chiglel_id, c.ner;

-- Хүүхэд бүрийн ахиц: эхлэлийн → сүүлийн үе (BR102)
CREATE VIEW v_rubric_ahits AS
WITH a AS (
  SELECT r.suraltsagch_id, u.jil_id, u.turul, AVG(r.tuvshin) AS dundaj
    FROM rubric_unelgee r JOIN unelgee_uye u ON u.uye_id = r.uye_id
   GROUP BY r.suraltsagch_id, u.jil_id, u.turul
), p AS (
  SELECT suraltsagch_id, jil_id,
         MAX(CASE WHEN turul = 'Эхлэлийн'   THEN dundaj END) AS ehlel,
         MAX(CASE WHEN turul = 'Явцын'      THEN dundaj END) AS yavts,
         MAX(CASE WHEN turul = 'Төгсгөлийн' THEN dundaj END) AS tugsgul
    FROM a GROUP BY suraltsagch_id, jil_id
)
SELECT suraltsagch_id, jil_id, ROUND(ehlel, 2) AS ehlel, ROUND(yavts, 2) AS yavts, ROUND(tugsgul, 2) AS tugsgul,
       ROUND(COALESCE(tugsgul, yavts) - ehlel, 2) AS ahits
  FROM p;

-- Хяналтын хуудас: чадвар бүрийг эзэмшсэн хувь (<60% анхаарах)
CREATE VIEW v_hyanaltyn_huvi AS
SELECT g.buleg_id, h.uye_id, h.asuult_id, q.chiglel_id, q.asuult,
       ROUND(100 * AVG(h.chaddag), 0) AS chaddag_huvi, COUNT(*) AS unelsen_huuhed,
       (AVG(h.chaddag) < 0.6) AS anhaarah
  FROM hyanaltyn_unelgee h
  JOIN unelgee_uye u ON u.uye_id = h.uye_id
  JOIN buleg_gishuun g ON g.suraltsagch_id = h.suraltsagch_id
  JOIN buleg b ON b.buleg_id = g.buleg_id AND b.jil_id = u.jil_id
  JOIN hyanaltyn_asuult q ON q.asuult_id = h.asuult_id
 GROUP BY g.buleg_id, h.uye_id, h.asuult_id, q.chiglel_id, q.asuult;

-- Фонтын хураамжийн сарын нэгтгэл
CREATE VIEW v_font_sar AS
SELECT g.buleg_id, f.sar,
       SUM(f.tuluv = 'Төлсөн') AS tulsun, SUM(f.tuluv = 'Төлөөгүй') AS tuluugui,
       SUM(f.tuluv = 'Чөлөөлсөн') AS chuluulsun, SUM(f.dun) AS niit_dun
  FROM font_khuraamj f
  JOIN buleg_gishuun g ON g.suraltsagch_id = f.suraltsagch_id
       AND g.elssen_ognoo <= LAST_DAY(f.sar) AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= f.sar)
 GROUP BY g.buleg_id, f.sar;

-- Өсөлтийн бүлгийн дундаж
CREATE VIEW v_osolt_buleg AS
SELECT g.buleg_id, o.hemjilt_on, o.uliral, COUNT(*) AS hemjsen,
       ROUND(AVG(o.jin), 1) AS dundaj_jin, ROUND(AVG(o.undur), 1) AS dundaj_undur,
       ROUND(AVG(o.tseej_toirog), 1) AS dundaj_tseej, ROUND(AVG(o.tolgoi_toirog), 1) AS dundaj_tolgoi,
       SUM(o.unelgee <> 'Хэвийн') AS anhaarah_huuhed
  FROM osolt o
  JOIN buleg_gishuun g ON g.suraltsagch_id = o.suraltsagch_id
       AND g.elssen_ognoo <= o.hemjsen_ognoo AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= o.hemjsen_ognoo)
 GROUP BY g.buleg_id, o.hemjilt_on, o.uliral;

-- Арга зүйчийн батлах дараалал
CREATE VIEW v_batlah_huleegdej_bui AS
SELECT 'tuluvluguu' AS obekt, t.tuluvluguu_id AS id, b.tsetserleg_id, t.buleg_id, b.ner AS buleg,
       t.turul AS turul, t.garchig, t.updated_at
  FROM tuluvluguu t JOIN buleg b ON b.buleg_id = t.buleg_id WHERE t.tuluv = 'Хянагдаж буй'
UNION ALL
SELECT 'tailan', r.tailan_id, b.tsetserleg_id, r.buleg_id, b.ner, 'Сарын тайлан',
       DATE_FORMAT(r.sar, '%Y-%m'), r.updated_at
  FROM tailan r JOIN buleg b ON b.buleg_id = r.buleg_id WHERE r.tuluv = 'Хянагдаж буй';
