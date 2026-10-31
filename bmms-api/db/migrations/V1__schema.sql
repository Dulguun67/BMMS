-- =====================================================================
-- БММС — Бүлгийн менежментийн мэдээллийн систем
-- 01. Өгөгдлийн сангийн бүтэц (MySQL 8.0+, InnoDB, utf8mb4)
--
-- Үндэслэл: Б.Дөлгөөн, "Бүлгийн менежментийн мэдээллийн системийн
-- шинжилгээ ба зохиомж", СЭЗИС, 2025.
--   Зураг 4.9 (өгөгдлийн сангийн дизайн)-ын хүснэгтийн нэрийг хадгалж,
--   III бүлгийн PR101–PR117, IR101–IR106, SR101–SR107 шаардлагаар өргөтгөв.
--
-- Collation: utf8mb4_0900_as_ci — Ё/Е, Ө/О, Ү/У-г ялгана
-- (0900_ai_ci нь Ё ба Е-г ижил гэж үздэг тул монгол нэрд тохиромжгүй).
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Байгууллага, хичээлийн жил
-- ---------------------------------------------------------------------
CREATE TABLE tsetserleg (
  tsetserleg_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ner             VARCHAR(150) NOT NULL,
  duureg          ENUM('Багануур','Багахангай','Баянгол','Баянзүрх','Налайх',
                       'Сонгинохайрхан','Сүхбаатар','Хан-Уул','Чингэлтэй') NULL,
  horoo           TINYINT UNSIGNED NULL,
  bairshil        VARCHAR(255) NULL,
  utas            VARCHAR(20)  NULL,
  esis_kod        VARCHAR(40)  NULL COMMENT 'ESIS дахь байгууллагын код (OR103)',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tsetserleg_ner (ner),
  UNIQUE KEY uq_tsetserleg_esis (esis_kod),
  CONSTRAINT ck_tsetserleg_horoo CHECK (horoo IS NULL OR horoo BETWEEN 1 AND 45)
) ENGINE=InnoDB COMMENT='Цэцэрлэг (PR101: багш профайлдаа сонгоно)';

CREATE TABLE hicheeliin_jil (
  jil_id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ehleh_on        YEAR NOT NULL,
  ehleh_ognoo     DATE NOT NULL,
  duusah_ognoo    DATE NOT NULL,
  UNIQUE KEY uq_jil_on (ehleh_on),
  CONSTRAINT ck_jil_ognoo CHECK (duusah_ognoo > ehleh_ognoo)
) ENGINE=InnoDB COMMENT='Хичээлийн жил (жишээ нь 2026–2027)';

-- ---------------------------------------------------------------------
-- 2. Хэрэглэгч, нэвтрэлт (JWT, SR101)
-- ---------------------------------------------------------------------
CREATE TABLE hereglegch (
  hereglegch_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nevtreh_ner     VARCHAR(120) NOT NULL COMMENT 'Имэйл',
  nuuts_ug_hash   VARCHAR(255) NULL COMMENT 'scrypt хэш (OWASP параметр). ДАН-аар л нэвтэрдэг бол NULL',
  dan_sub         VARCHAR(64)  NULL COMMENT 'ДАН (sso.gov.mn) хэрэглэгчийн танигч (SR101)',
  uureg           ENUM('bagsh','arga_zuich','admin') NOT NULL,
  tuluv           ENUM('idevhtei','tugjigdsen','idevhgui') NOT NULL DEFAULT 'idevhtei',
  amjiltgui_oroldlogo TINYINT UNSIGNED NOT NULL DEFAULT 0,
  tugjigdsen_hurtel   DATETIME NULL,
  suuld_nevtersen     DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hereglegch_ner (nevtreh_ner),
  UNIQUE KEY uq_hereglegch_dan (dan_sub),
  CONSTRAINT ck_hereglegch_nevtrelt CHECK (nuuts_ug_hash IS NOT NULL OR dan_sub IS NOT NULL)
) ENGINE=InnoDB COMMENT='Системийн хэрэглэгч, эрх';

CREATE TABLE hereglegch_session (
  session_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hereglegch_id   INT UNSIGNED NOT NULL,
  refresh_hash    CHAR(64) NOT NULL COMMENT 'Refresh token-ий SHA-256 (токен өөрөө хадгалагдахгүй)',
  duusah_hugatsaa DATETIME NOT NULL,
  tsutsalsan_at   DATETIME NULL,
  ip              VARBINARY(16) NULL COMMENT 'INET6_ATON()',
  user_agent      VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_hash (refresh_hash),
  KEY ix_session_user (hereglegch_id, duusah_hugatsaa),
  CONSTRAINT fk_session_user FOREIGN KEY (hereglegch_id)
    REFERENCES hereglegch (hereglegch_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='JWT refresh token-ий бүртгэл';

CREATE TABLE bagsh (
  bagsh_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hereglegch_id   INT UNSIGNED NOT NULL,
  tsetserleg_id   INT UNSIGNED NOT NULL,
  ovog            VARCHAR(60) NOT NULL,
  ner             VARCHAR(60) NOT NULL,
  alban_tushaal   ENUM('Бүлгийн багш','Туслах багш','Заах арга зүйч','Эрхлэгч') NOT NULL,
  utas            CHAR(8) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bagsh_hereglegch (hereglegch_id),
  KEY ix_bagsh_tsetserleg (tsetserleg_id),
  CONSTRAINT fk_bagsh_hereglegch FOREIGN KEY (hereglegch_id) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT fk_bagsh_tsetserleg FOREIGN KEY (tsetserleg_id) REFERENCES tsetserleg (tsetserleg_id),
  CONSTRAINT ck_bagsh_utas CHECK (utas IS NULL OR REGEXP_LIKE(utas, '^[0-9]{8}$'))
) ENGINE=InnoDB COMMENT='Багш, арга зүйчийн профайл (PR101, IR101)';

-- ---------------------------------------------------------------------
-- 3. Бүлэг, суралцагч
-- ---------------------------------------------------------------------
CREATE TABLE buleg (
  buleg_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tsetserleg_id   INT UNSIGNED NOT NULL,
  jil_id          SMALLINT UNSIGNED NOT NULL,
  ner             VARCHAR(80) NOT NULL,
  turul           ENUM('Бага','Дунд','Ахлах','Бэлтгэл') NOT NULL,
  tuvshin         VARCHAR(3) AS (CASE turul WHEN 'Бэлтгэл' THEN 'III'
                                            WHEN 'Ахлах'   THEN 'II'
                                            WHEN 'Дунд'    THEN 'II'
                                            ELSE 'I' END) STORED COMMENT 'Хүснэгт 1.1',
  bagsh_id        INT UNSIGNED NOT NULL COMMENT 'Бүлгийн багш',
  tuslah_bagsh_id INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_buleg (tsetserleg_id, jil_id, ner),
  KEY ix_buleg_bagsh (bagsh_id),
  CONSTRAINT fk_buleg_tsetserleg FOREIGN KEY (tsetserleg_id) REFERENCES tsetserleg (tsetserleg_id),
  CONSTRAINT fk_buleg_jil   FOREIGN KEY (jil_id)   REFERENCES hicheeliin_jil (jil_id),
  CONSTRAINT fk_buleg_bagsh FOREIGN KEY (bagsh_id) REFERENCES bagsh (bagsh_id),
  CONSTRAINT fk_buleg_tuslah FOREIGN KEY (tuslah_bagsh_id) REFERENCES bagsh (bagsh_id)
) ENGINE=InnoDB COMMENT='Бүлэг: хичээлийн жил бүр шинээр үүснэ';

CREATE TABLE suraltsagch (
  suraltsagch_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  esis_id         VARCHAR(40) NULL COMMENT 'ESIS-ээс татсан бол танигч (PR102, OR103)',
  ovog            VARCHAR(60) NOT NULL,
  ner             VARCHAR(60) NOT NULL,
  registr         CHAR(10) NULL,
  torson_ognoo    DATE NOT NULL,
  huis            ENUM('Эр','Эм') NOT NULL,
  tanih_temdeg    VARCHAR(60) NULL COMMENT 'PR105 (Зураг 4.9-ийн TanihTemdeg 1:1 тул нэгтгэв)',
  tuluv           ENUM('Суралцаж буй','Шилжсэн','Төгссөн') NOT NULL DEFAULT 'Суралцаж буй',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_suraltsagch_registr (registr),
  UNIQUE KEY uq_suraltsagch_esis (esis_id),
  KEY ix_suraltsagch_ner (ner, ovog),
  CONSTRAINT ck_suraltsagch_registr
    CHECK (registr IS NULL OR REGEXP_LIKE(registr, '^[А-ЯӨҮЁ]{2}[0-9]{8}$', 'c'))
) ENGINE=InnoDB COMMENT='Суралцагч хүүхэд (PR102, IR102)';

CREATE TABLE buleg_gishuun (
  gishuun_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buleg_id        INT UNSIGNED NOT NULL,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  elssen_ognoo    DATE NOT NULL,
  garsan_ognoo    DATE NULL COMMENT 'Шилжсэн, дэвшсэн, төгссөн огноо',
  UNIQUE KEY uq_gishuun (buleg_id, suraltsagch_id),
  KEY ix_gishuun_child (suraltsagch_id),
  CONSTRAINT fk_gishuun_buleg FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id),
  CONSTRAINT fk_gishuun_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT ck_gishuun_ognoo CHECK (garsan_ognoo IS NULL OR garsan_ognoo >= elssen_ognoo)
) ENGINE=InnoDB COMMENT='Хүүхэд-бүлгийн харьяалал (жил бүрийн дэвшилтийн түүх хадгалагдана)';

CREATE TABLE toyrgiin_sudalgaa (
  sudalgaa_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  duureg          ENUM('Багануур','Багахангай','Баянгол','Баянзүрх','Налайх',
                       'Сонгинохайрхан','Сүхбаатар','Хан-Уул','Чингэлтэй') NOT NULL,
  horoo           TINYINT UNSIGNED NOT NULL,
  delgerengui_hayg VARCHAR(255) NULL,
  toyrgiin_baidal ENUM('Тойргийн','Тойргийн бус') NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_toyrog_child (suraltsagch_id),
  CONSTRAINT fk_toyrog_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT ck_toyrog_horoo CHECK (horoo BETWEEN 1 AND 45)
) ENGINE=InnoDB COMMENT='Тойргийн судалгаа, хаяг (PR104)';

CREATE TABLE asran_hamgaalagch (
  asran_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ovog            VARCHAR(60) NOT NULL,
  ner             VARCHAR(60) NOT NULL,
  utas            CHAR(8) NOT NULL,
  ajliin_bair     VARCHAR(150) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_asran_utas (utas),
  CONSTRAINT ck_asran_utas CHECK (REGEXP_LIKE(utas, '^[0-9]{8}$'))
) ENGINE=InnoDB COMMENT='Асран хамгаалагч (PR103)';

CREATE TABLE suraltsagch_asran (
  suraltsagch_id  INT UNSIGNED NOT NULL,
  asran_id        INT UNSIGNED NOT NULL,
  hen_boloh       ENUM('Ээж','Аав','Эмээ','Өвөө','Ах','Эгч','Бусад') NOT NULL,
  gol_holboo      BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Яаралтай үед эхэлж холбогдох',
  PRIMARY KEY (suraltsagch_id, asran_id),
  KEY ix_sa_asran (asran_id),
  CONSTRAINT fk_sa_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_asran FOREIGN KEY (asran_id) REFERENCES asran_hamgaalagch (asran_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Хүүхэд-асран хамгаалагч (олон:олон, ах дүүс нэг асран хамгаалагчтай байж болно)';

-- ---------------------------------------------------------------------
-- 4. Хавсралт файл (S3 объектын түлхүүр, URL биш)
-- ---------------------------------------------------------------------
CREATE TABLE havsralt (
  havsralt_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  storage_key     VARCHAR(512) NOT NULL COMMENT 'S3 object key. Нийтэд нээлттэй URL хадгалахгүй',
  mime_turul      VARCHAR(100) NOT NULL,
  hemjee_byte     INT UNSIGNED NOT NULL,
  sha256          CHAR(64) NOT NULL,
  oruulsan_hereglegch INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_havsralt_key (storage_key),
  CONSTRAINT fk_havsralt_user FOREIGN KEY (oruulsan_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_havsralt_mime CHECK (mime_turul IN ('image/jpeg','image/png','image/webp','application/pdf'))
) ENGINE=InnoDB COMMENT='Шинжилгээний хуудас, тайлангийн зураг';

CREATE TABLE eruul_mend (
  eruul_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  shinjilgee_ner  VARCHAR(120) NOT NULL,
  hariu           VARCHAR(255) NOT NULL,
  ognoo           DATE NOT NULL,
  havsralt_id     BIGINT UNSIGNED NULL COMMENT 'Шинжилгээний хуудасны зураг',
  burtgesen_hereglegch INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_eruul_child (suraltsagch_id, ognoo),
  CONSTRAINT fk_eruul_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_eruul_file  FOREIGN KEY (havsralt_id) REFERENCES havsralt (havsralt_id) ON DELETE SET NULL,
  CONSTRAINT fk_eruul_user  FOREIGN KEY (burtgesen_hereglegch) REFERENCES hereglegch (hereglegch_id)
) ENGINE=InnoDB COMMENT='Эрүүл мэндийн судалгаа (PR106)';

-- ---------------------------------------------------------------------
-- 5. Ирц, хоолны төлбөр, амралтын өдөр
-- ---------------------------------------------------------------------
CREATE TABLE irts (
  irts_id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  buleg_id        INT UNSIGNED NOT NULL,
  ognoo           DATE NOT NULL,
  tuluv           ENUM('Ирсэн','Чөлөөтэй','Өвчтэй','Тасалсан') NOT NULL,
  burtgesen_hereglegch INT UNSIGNED NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_irts_child_day (suraltsagch_id, ognoo),
  KEY ix_irts_buleg_day (buleg_id, ognoo, tuluv),
  CONSTRAINT fk_irts_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_irts_buleg FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id),
  CONSTRAINT fk_irts_user  FOREIGN KEY (burtgesen_hereglegch) REFERENCES hereglegch (hereglegch_id)
) ENGINE=InnoDB COMMENT='Өдөр тутмын ирц (PR108)';

CREATE TABLE hoolny_une (
  une_id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tsetserleg_id   INT UNSIGNED NOT NULL,
  hugatsaa_ehleh  DATE NOT NULL COMMENT 'Энэ өдрөөс эхлэн мөрдөнө',
  neg_odriin_une  DECIMAL(10,2) NOT NULL,
  oruulsan_hereglegch INT UNSIGNED NOT NULL COMMENT 'Заах арга зүйч (PR109)',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hoolny_une (tsetserleg_id, hugatsaa_ehleh),
  CONSTRAINT fk_une_tsetserleg FOREIGN KEY (tsetserleg_id) REFERENCES tsetserleg (tsetserleg_id),
  CONSTRAINT fk_une_user FOREIGN KEY (oruulsan_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_une CHECK (neg_odriin_une >= 0)
) ENGINE=InnoDB COMMENT='Нэг өдрийн хоолны төлбөр, түүхтэй';

CREATE TABLE amraltyn_odor (
  amralt_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tsetserleg_id   INT UNSIGNED NULL COMMENT 'NULL = улсын хэмжээний баяр',
  ognoo           DATE NOT NULL,
  ner             VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_amralt (tsetserleg_id, ognoo),
  KEY ix_amralt_ognoo (ognoo),
  CONSTRAINT fk_amralt_tsetserleg FOREIGN KEY (tsetserleg_id) REFERENCES tsetserleg (tsetserleg_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Ажлын өдрөөс хасагдах өдөр (ирцийн нэгтгэлд)';

-- ---------------------------------------------------------------------
-- 6. Фонтын хураамж, Kinder police
-- ---------------------------------------------------------------------
CREATE TABLE font_khuraamj (
  khuraamj_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  sar             DATE NOT NULL COMMENT 'Сарын 1-ний өдөр',
  tuluv           ENUM('Төлсөн','Төлөөгүй','Чөлөөлсөн') NOT NULL,
  dun             DECIMAL(10,2) NULL,
  burtgesen_hereglegch INT UNSIGNED NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_font (suraltsagch_id, sar),
  KEY ix_font_sar (sar, tuluv),
  CONSTRAINT fk_font_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_font_user  FOREIGN KEY (burtgesen_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_font_sar CHECK (DAY(sar) = 1),
  CONSTRAINT ck_font_dun CHECK (dun IS NULL OR dun >= 0)
) ENGINE=InnoDB COMMENT='Фонтын хураамж (PR107)';

CREATE TABLE kinder_police (
  kp_id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  asran_id        INT UNSIGNED NOT NULL,
  ehleh_tsag      DATETIME NOT NULL,
  temdeglel       VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_kp_tsag (ehleh_tsag),
  CONSTRAINT fk_kp_link FOREIGN KEY (suraltsagch_id, asran_id)
    REFERENCES suraltsagch_asran (suraltsagch_id, asran_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Kinder police хуваарь (PR110). Тухайн хүүхдийн асран хамгаалагч л байж болно';

-- ---------------------------------------------------------------------
-- 7. Өсөлтийн судалгаа
-- ---------------------------------------------------------------------
CREATE TABLE osolt (
  osolt_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  hemjilt_on      YEAR NOT NULL,
  uliral          ENUM('Намар','Хавар') NOT NULL,
  hemjsen_ognoo   DATE NOT NULL,
  nas_sar         SMALLINT UNSIGNED NOT NULL COMMENT 'Хэмжилтийн үеийн нас (сараар)',
  jin             DECIMAL(4,1) NULL COMMENT 'кг',
  undur           DECIMAL(4,1) NULL COMMENT 'см',
  tolgoi_toirog   DECIMAL(4,1) NULL,
  tseej_toirog    DECIMAL(4,1) NULL,
  bji             DECIMAL(4,1) AS (ROUND(jin / POW(undur / 100, 2), 1)) STORED COMMENT 'Биеийн жингийн индекс',
  centil          DECIMAL(5,2) NULL COMMENT 'ДЭМБ-ын хүснэгтээр эмч/багш оруулна',
  unelgee         ENUM('Хэвийн','Тураалтай','Илүүдэл жинтэй','Намхан') NULL,
  burtgesen_hereglegch INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_osolt (suraltsagch_id, hemjilt_on, uliral),
  CONSTRAINT fk_osolt_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_osolt_user  FOREIGN KEY (burtgesen_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_osolt_jin   CHECK (jin IS NULL OR jin BETWEEN 5 AND 60),
  CONSTRAINT ck_osolt_undur CHECK (undur IS NULL OR undur BETWEEN 50 AND 160),
  CONSTRAINT ck_osolt_centil CHECK (centil IS NULL OR centil BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='Бүлгийн өсөлтийн судалгаа: намар, хавар (PR111)';

-- ---------------------------------------------------------------------
-- 8. Анги, танхим
-- ---------------------------------------------------------------------
CREATE TABLE surgaltyn_heregsel (
  heregsel_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buleg_id        INT UNSIGNED NOT NULL,
  ner             VARCHAR(120) NOT NULL,
  angilal         ENUM('Тоглоом','Ном','Хэрэглэгдэхүүн','Тавилга') NOT NULL,
  too_shirheg     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tuluv_temdeglel VARCHAR(255) NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_heregsel_buleg (buleg_id),
  CONSTRAINT fk_heregsel_buleg FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Танхимын тоглоом, сургалтын хэрэглэгдэхүүн (PR112)';

CREATE TABLE hicheeliin_heregsel_turul (
  turul_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buleg_id        INT UNSIGNED NOT NULL,
  ner             VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_hht (buleg_id, ner),
  CONSTRAINT fk_hht_buleg FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Хичээлийн хэрэглэгдэхүүний төрөл (усан будаг, бийр ...)';

CREATE TABLE hicheeliin_heregsel (
  suraltsagch_id  INT UNSIGNED NOT NULL,
  turul_id        INT UNSIGNED NOT NULL,
  too             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (suraltsagch_id, turul_id),
  KEY ix_hh_turul (turul_id),
  CONSTRAINT fk_hh_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_hh_turul FOREIGN KEY (turul_id) REFERENCES hicheeliin_heregsel_turul (turul_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Хүүхэд бүрийн хичээлийн хэрэглэгдэхүүний үлдэгдэл (PR112)';

-- ---------------------------------------------------------------------
-- 9. Үнэлгээ (PR113, IR103)
-- ---------------------------------------------------------------------
CREATE TABLE suraltsahuin_chiglel (
  chiglel_id      TINYINT UNSIGNED PRIMARY KEY,
  kod             CHAR(3) NOT NULL,
  ner             VARCHAR(80) NOT NULL,
  daraalal        TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_chiglel_kod (kod)
) ENGINE=InnoDB COMMENT='Суралцахуйн чиглэл (Хүснэгт 1.2, 1.5)';

CREATE TABLE rubric_shalguur (
  chiglel_id      TINYINT UNSIGNED NOT NULL,
  tuvshin         TINYINT UNSIGNED NOT NULL,
  tailbar         TEXT NOT NULL,
  PRIMARY KEY (chiglel_id, tuvshin),
  CONSTRAINT fk_rs_chiglel FOREIGN KEY (chiglel_id) REFERENCES suraltsahuin_chiglel (chiglel_id),
  CONSTRAINT ck_rs_tuvshin CHECK (tuvshin BETWEEN 1 AND 3)
) ENGINE=InnoDB COMMENT='Рубрикийн I–III түвшний шалгуур (Хүснэгт 1.5)';

CREATE TABLE hyanaltyn_asuult (
  asuult_id       SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chiglel_id      TINYINT UNSIGNED NOT NULL,
  asuult          VARCHAR(255) NOT NULL,
  daraalal        SMALLINT UNSIGNED NOT NULL,
  idevhtei        BOOLEAN NOT NULL DEFAULT TRUE,
  oruulsan_hereglegch INT UNSIGNED NULL COMMENT 'Заах арга зүйч оруулна',
  KEY ix_asuult_chiglel (chiglel_id),
  CONSTRAINT fk_asuult_chiglel FOREIGN KEY (chiglel_id) REFERENCES suraltsahuin_chiglel (chiglel_id),
  CONSTRAINT fk_asuult_user FOREIGN KEY (oruulsan_hereglegch) REFERENCES hereglegch (hereglegch_id)
) ENGINE=InnoDB COMMENT='Хяналтын хуудасны чадварууд (Хүснэгт 1.4)';

CREATE TABLE bagshlahui_shalguur (
  shalguur_id     SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shalguur        VARCHAR(255) NOT NULL,
  daraalal        SMALLINT UNSIGNED NOT NULL,
  idevhtei        BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB COMMENT='Багш өөрийн багшлахуйг үнэлэх шалгуур (Хүснэгт 1.6)';

CREATE TABLE unelgee_uye (
  uye_id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  jil_id          SMALLINT UNSIGNED NOT NULL,
  turul           ENUM('Эхлэлийн','Явцын','Төгсгөлийн') NOT NULL,
  ehleh_ognoo     DATE NOT NULL,
  duusah_ognoo    DATE NOT NULL,
  UNIQUE KEY uq_uye (jil_id, turul),
  CONSTRAINT fk_uye_jil FOREIGN KEY (jil_id) REFERENCES hicheeliin_jil (jil_id),
  CONSTRAINT ck_uye_ognoo CHECK (duusah_ognoo >= ehleh_ognoo)
) ENGINE=InnoDB COMMENT='Үнэлгээний үе (эхлэлийн/явцын/төгсгөлийн)';

CREATE TABLE rubric_unelgee (
  suraltsagch_id  INT UNSIGNED NOT NULL,
  uye_id          INT UNSIGNED NOT NULL,
  chiglel_id      TINYINT UNSIGNED NOT NULL,
  tuvshin         TINYINT UNSIGNED NOT NULL,
  unelsen_hereglegch INT UNSIGNED NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (suraltsagch_id, uye_id, chiglel_id),
  KEY ix_ru_uye (uye_id, chiglel_id),
  CONSTRAINT fk_ru_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_ru_uye FOREIGN KEY (uye_id) REFERENCES unelgee_uye (uye_id),
  CONSTRAINT fk_ru_chiglel FOREIGN KEY (chiglel_id) REFERENCES suraltsahuin_chiglel (chiglel_id),
  CONSTRAINT fk_ru_user FOREIGN KEY (unelsen_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_ru_tuvshin CHECK (tuvshin BETWEEN 1 AND 3)
) ENGINE=InnoDB COMMENT='Рубрикийн үнэлгээ: хүүхэд × чиглэл × үе';

CREATE TABLE hyanaltyn_unelgee (
  suraltsagch_id  INT UNSIGNED NOT NULL,
  uye_id          INT UNSIGNED NOT NULL,
  asuult_id       SMALLINT UNSIGNED NOT NULL,
  chaddag         BOOLEAN NOT NULL COMMENT 'TRUE = Чаддаг, FALSE = Хараахан чадахгүй',
  unelsen_hereglegch INT UNSIGNED NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (suraltsagch_id, uye_id, asuult_id),
  KEY ix_hu_uye (uye_id, asuult_id),
  CONSTRAINT fk_hu_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_hu_uye FOREIGN KEY (uye_id) REFERENCES unelgee_uye (uye_id),
  CONSTRAINT fk_hu_asuult FOREIGN KEY (asuult_id) REFERENCES hyanaltyn_asuult (asuult_id),
  CONSTRAINT fk_hu_user FOREIGN KEY (unelsen_hereglegch) REFERENCES hereglegch (hereglegch_id)
) ENGINE=InnoDB COMMENT='Хяналтын хуудасны үнэлгээ';

CREATE TABLE bagshlahui_unelgee (
  bagsh_id        INT UNSIGNED NOT NULL,
  uye_id          INT UNSIGNED NOT NULL,
  shalguur_id     SMALLINT UNSIGNED NOT NULL,
  onoo            TINYINT UNSIGNED NOT NULL COMMENT '1-хангалтгүй, 2-дунд, 3-хангалттай',
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (bagsh_id, uye_id, shalguur_id),
  CONSTRAINT fk_bu_bagsh FOREIGN KEY (bagsh_id) REFERENCES bagsh (bagsh_id) ON DELETE CASCADE,
  CONSTRAINT fk_bu_uye FOREIGN KEY (uye_id) REFERENCES unelgee_uye (uye_id),
  CONSTRAINT fk_bu_shalguur FOREIGN KEY (shalguur_id) REFERENCES bagshlahui_shalguur (shalguur_id),
  CONSTRAINT ck_bu_onoo CHECK (onoo BETWEEN 1 AND 3)
) ENGINE=InnoDB COMMENT='Багш өөрийн үнэлгээ';

-- ---------------------------------------------------------------------
-- 10. Төлөвлөгөө, тайлан, батлах урсгал (PR114–PR116, AR101–AR103)
-- ---------------------------------------------------------------------
CREATE TABLE tuluvluguu (
  tuluvluguu_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buleg_id        INT UNSIGNED NOT NULL,
  ehleh_tuluvluguu_id INT UNSIGNED NULL COMMENT 'Дээд шатны төлөвлөгөө (жилийн → улирлын → сарын → үйл ажиллагааны)',
  turul           ENUM('Жилийн','Улирлын','Сарын','Үйл ажиллагааны') NOT NULL,
  garchig         VARCHAR(200) NOT NULL COMMENT 'Үйл ажиллагааны төлөвлөгөөнд сэдэв',
  hugatsaa_ehleh  DATE NOT NULL,
  hugatsaa_duusah DATE NOT NULL,
  zorilgo         TEXT NULL,
  aguulga         TEXT NULL,
  heregsel        TEXT NULL COMMENT 'Үйл ажиллагааны хэрэглэгдэхүүн',
  surgaltyn_helber ENUM('Бүлгээр','Багаар','Ганцаарчилсан') NULL,
  tuluv           ENUM('Ноорог','Хянагдаж буй','Батлагдсан','Буцаасан') NOT NULL DEFAULT 'Ноорог',
  bolovsruulsan_bagsh INT UNSIGNED NOT NULL,
  batalsan_hereglegch INT UNSIGNED NULL,
  batalsan_at     DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_tl_buleg (buleg_id, turul, hugatsaa_ehleh),
  KEY ix_tl_parent (ehleh_tuluvluguu_id),
  KEY ix_tl_tuluv (tuluv),
  CONSTRAINT fk_tl_buleg  FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id),
  CONSTRAINT fk_tl_parent FOREIGN KEY (ehleh_tuluvluguu_id) REFERENCES tuluvluguu (tuluvluguu_id) ON DELETE SET NULL,
  CONSTRAINT fk_tl_bagsh  FOREIGN KEY (bolovsruulsan_bagsh) REFERENCES bagsh (bagsh_id),
  CONSTRAINT fk_tl_batalsan FOREIGN KEY (batalsan_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_tl_hugatsaa CHECK (hugatsaa_duusah >= hugatsaa_ehleh)
) ENGINE=InnoDB COMMENT='Төлөвлөгөө (PR114, PR115, IR104)';

CREATE TABLE tuluvluguu_chiglel (
  tuluvluguu_id   INT UNSIGNED NOT NULL,
  chiglel_id      TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (tuluvluguu_id, chiglel_id),
  CONSTRAINT fk_tc_tl FOREIGN KEY (tuluvluguu_id) REFERENCES tuluvluguu (tuluvluguu_id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_ch FOREIGN KEY (chiglel_id) REFERENCES suraltsahuin_chiglel (chiglel_id)
) ENGINE=InnoDB COMMENT='Төлөвлөгөөний суралцахуйн чиглэл';

CREATE TABLE tuluvluguu_alham (
  alham_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tuluvluguu_id   INT UNSIGNED NOT NULL,
  daraalal        TINYINT UNSIGNED NOT NULL,
  alham           VARCHAR(500) NOT NULL,
  UNIQUE KEY uq_alham (tuluvluguu_id, daraalal),
  CONSTRAINT fk_alham_tl FOREIGN KEY (tuluvluguu_id) REFERENCES tuluvluguu (tuluvluguu_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Үйл ажиллагааны алхмууд';

CREATE TABLE tailan (
  tailan_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  buleg_id        INT UNSIGNED NOT NULL,
  tuluvluguu_id   INT UNSIGNED NULL COMMENT 'Үндэслэсэн сарын төлөвлөгөө',
  sar             DATE NOT NULL COMMENT 'Сарын 1-ний өдөр',
  hiigdsen_ajil   TEXT NOT NULL,
  ur_dun          TEXT NULL,
  dugnelt         TEXT NULL,
  daraagiin_sar   TEXT NULL,
  tuluv           ENUM('Ноорог','Хянагдаж буй','Батлагдсан','Буцаасан') NOT NULL DEFAULT 'Ноорог',
  bolovsruulsan_bagsh INT UNSIGNED NOT NULL,
  batalsan_hereglegch INT UNSIGNED NULL,
  batalsan_at     DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tailan (buleg_id, sar),
  KEY ix_tailan_tuluv (tuluv),
  CONSTRAINT fk_tailan_buleg FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id),
  CONSTRAINT fk_tailan_tl FOREIGN KEY (tuluvluguu_id) REFERENCES tuluvluguu (tuluvluguu_id) ON DELETE SET NULL,
  CONSTRAINT fk_tailan_bagsh FOREIGN KEY (bolovsruulsan_bagsh) REFERENCES bagsh (bagsh_id),
  CONSTRAINT fk_tailan_batalsan FOREIGN KEY (batalsan_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_tailan_sar CHECK (DAY(sar) = 1)
) ENGINE=InnoDB COMMENT='Сарын тайлан (PR116, IR105)';

CREATE TABLE tailan_zurag (
  tailan_id       INT UNSIGNED NOT NULL,
  havsralt_id     BIGINT UNSIGNED NOT NULL,
  tailbar         VARCHAR(255) NULL,
  PRIMARY KEY (tailan_id, havsralt_id),
  CONSTRAINT fk_tz_tailan FOREIGN KEY (tailan_id) REFERENCES tailan (tailan_id) ON DELETE CASCADE,
  CONSTRAINT fk_tz_file FOREIGN KEY (havsralt_id) REFERENCES havsralt (havsralt_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Тайлангийн зураг';

CREATE TABLE sanal_shuumj (
  shuumj_id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tuluvluguu_id   INT UNSIGNED NULL,
  tailan_id       INT UNSIGNED NULL,
  hereglegch_id   INT UNSIGNED NOT NULL,
  uildel          ENUM('Сэтгэгдэл','Илгээв','Батлав','Буцаав') NOT NULL,
  tekst           TEXT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ss_tl (tuluvluguu_id, created_at),
  KEY ix_ss_tailan (tailan_id, created_at),
  CONSTRAINT fk_ss_tl FOREIGN KEY (tuluvluguu_id) REFERENCES tuluvluguu (tuluvluguu_id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_tailan FOREIGN KEY (tailan_id) REFERENCES tailan (tailan_id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_user FOREIGN KEY (hereglegch_id) REFERENCES hereglegch (hereglegch_id)
) ENGINE=InnoDB COMMENT='Арга зүйчийн санал шүүмж, батлах урсгалын түүх. Яг нэг эзэнтэй байхыг trigger шалгана';

-- ---------------------------------------------------------------------
-- 11. Ганцаарчилсан сургалт — шифрлэгдсэн (PR117, IR106, SR107)
--   *_enc баганад аппликейшн AES-256-GCM-ээр (AWS KMS envelope)
--   шифрлэсэн өгөгдөл: [12 байт IV][ciphertext][16 байт tag].
--   MySQL-ийн AES_ENCRYPT()-ийг ашиглахгүй: түлхүүр SQL лог руу орох эрсдэлтэй.
-- ---------------------------------------------------------------------
CREATE TABLE gantsaarchilsan_surgalt (
  surgalt_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  suraltsagch_id  INT UNSIGNED NOT NULL,
  buleg_id        INT UNSIGNED NOT NULL,
  onosh_enc       VARBINARY(4096)  NOT NULL COMMENT 'Онош, хөгжлийн онцлог',
  ehlel_ajiglalt_enc VARBINARY(16384) NULL COMMENT 'Эхлэлийн ажиглалт: давуу, сул тал',
  zorilt_enc      VARBINARY(16384) NULL COMMENT 'Хөгжлийн чиглэл тус бүрийн зорилт',
  key_id          VARCHAR(128) NOT NULL COMMENT 'KMS түлхүүрийн хувилбар (түлхүүр солиход)',
  ehelsen_ognoo   DATE NOT NULL,
  duussan_ognoo   DATE NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_gs_child (suraltsagch_id),
  KEY ix_gs_buleg (buleg_id),
  CONSTRAINT fk_gs_child FOREIGN KEY (suraltsagch_id) REFERENCES suraltsagch (suraltsagch_id) ON DELETE CASCADE,
  CONSTRAINT fk_gs_buleg FOREIGN KEY (buleg_id) REFERENCES buleg (buleg_id)
) ENGINE=InnoDB COMMENT='Ганцаарчилсан сургалт (шифрлэгдсэн)';

CREATE TABLE gantsaarchilsan_tailan (
  tailan_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  surgalt_id      INT UNSIGNED NOT NULL,
  sar             DATE NOT NULL,
  tailan_enc      VARBINARY(16384) NOT NULL,
  key_id          VARCHAR(128) NOT NULL,
  burtgesen_hereglegch INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gt (surgalt_id, sar),
  CONSTRAINT fk_gt_surgalt FOREIGN KEY (surgalt_id) REFERENCES gantsaarchilsan_surgalt (surgalt_id) ON DELETE CASCADE,
  CONSTRAINT fk_gt_user FOREIGN KEY (burtgesen_hereglegch) REFERENCES hereglegch (hereglegch_id),
  CONSTRAINT ck_gt_sar CHECK (DAY(sar) = 1)
) ENGINE=InnoDB COMMENT='Ганцаарчилсан сургалтын сарын тайлан (шифрлэгдсэн)';

-- ---------------------------------------------------------------------
-- 12. Аудитын бүртгэл (SR104, ISO/IEC 27001 A.8.15)
--   Зөвхөн нэмэх боломжтой: засах, устгахыг trigger хориглоно.
--   Хувийн мэдээлэл (нэр, онош) энд бичигдэхгүй, зөвхөн танигч.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  audit_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hereglegch_id   INT UNSIGNED NULL COMMENT 'Аппликейшн @app_hereglegch_id session хувьсагчаар дамжуулна',
  uildel          ENUM('INSERT','UPDATE','DELETE','READ','LOGIN','LOGIN_FAIL','LOGOUT','EXPORT') NOT NULL,
  husnegt         VARCHAR(64) NULL,
  bichlegiin_id   VARCHAR(64) NULL,
  ip              VARBINARY(16) NULL,
  delgerengui     JSON NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_time (created_at),
  KEY ix_audit_user (hereglegch_id, created_at),
  KEY ix_audit_obj (husnegt, bichlegiin_id)
) ENGINE=InnoDB COMMENT='Аудитын бүртгэл (append-only)';
