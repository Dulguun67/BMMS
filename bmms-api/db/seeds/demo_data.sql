-- =====================================================================
-- БММС — 05. Туршилтын (зохиомол) өгөгдөл. Бодит орчинд АЖИЛЛУУЛАХГҮЙ.
--   РД нь «ЖШ» (жишээ) угтвартай, хэрэглэгчийн хэш хүчингүй тул нэвтрэх боломжгүй.
-- =====================================================================
SET NAMES utf8mb4;
SET @app_hereglegch_id = NULL;

INSERT INTO tsetserleg (tsetserleg_id, ner, duureg, horoo) VALUES (1, 'Нийслэлийн 59-р цэцэрлэг', 'Баянзүрх', 15);
INSERT INTO hicheeliin_jil (jil_id, ehleh_on, ehleh_ognoo, duusah_ognoo) VALUES (1, 2026, '2026-09-01', '2027-05-31');
INSERT INTO amraltyn_odor (tsetserleg_id, ognoo, ner) VALUES (NULL, '2027-01-01', 'Шинэ жил');
INSERT INTO unelgee_uye (uye_id, jil_id, turul, ehleh_ognoo, duusah_ognoo) VALUES
 (1, 1, 'Эхлэлийн',   '2026-09-01', '2026-09-30'),
 (2, 1, 'Явцын',      '2027-01-05', '2027-01-31'),
 (3, 1, 'Төгсгөлийн', '2027-04-15', '2027-05-15');

INSERT INTO hereglegch (hereglegch_id, nevtreh_ner, nuuts_ug_hash, uureg) VALUES
 (1, 'nomin@demo.mn',  '!demo-not-a-valid-hash', 'bagsh'),
 (2, 'oyunaa@demo.mn', '!demo-not-a-valid-hash', 'arga_zuich');
INSERT INTO bagsh (bagsh_id, hereglegch_id, tsetserleg_id, ovog, ner, alban_tushaal, utas) VALUES
 (1, 1, 1, 'Ганбаатар', 'Номин', 'Бүлгийн багш', '99110001'),
 (2, 2, 1, 'Батболд',   'Оюунаа', 'Заах арга зүйч', '99110002');
INSERT INTO hoolny_une (tsetserleg_id, hugatsaa_ehleh, neg_odriin_une, oruulsan_hereglegch) VALUES
 (1, '2026-09-01', 4500.00, 2),
 (1, '2026-10-15', 4800.00, 2);
INSERT INTO buleg (buleg_id, tsetserleg_id, jil_id, ner, turul, bagsh_id) VALUES (1, 1, 1, 'Нарны бүлэг', 'Бэлтгэл', 1);

SET @app_hereglegch_id = 1;
INSERT INTO suraltsagch (suraltsagch_id, ovog, ner, registr, torson_ognoo, huis, tanih_temdeg) VALUES
 (1, 'Халиун',   'Аззаяа',   'ЖШ21031512', '2021-03-15', 'Эм', 'Алим'),
 (2, 'Төгөлдөр', 'Батэрдэнэ','ЖШ21052201', '2021-05-22', 'Эр', 'Баавгай'),
 (3, 'Батөлзий', 'Нэргүй',   'ЖШ21070903', '2021-07-09', 'Эр', 'Сарнай'),
 (4, 'Гантөгс',  'Өлзийбаяр','ЖШ21011804', '2021-01-18', 'Эр', 'Бөмбөр'),
 (5, 'Хангай',   'Сарнай',   'ЖШ21093005', '2021-09-30', 'Эм', 'Цаг'),
 (6, 'Мөнхөд',   'Байгаль',  'ЖШ21120706', '2021-12-07', 'Эм', 'Машин'),
 (7, 'Ганхөлөг', 'Есүхэй',   'ЖШ21042707', '2021-04-27', 'Эр', 'Дэгдээхэй'),
 (8, 'Энхбаяр',  'Тэмүүжин', 'ЖШ21081408', '2021-08-14', 'Эр', 'Онгоц');
INSERT INTO buleg_gishuun (buleg_id, suraltsagch_id, elssen_ognoo)
SELECT 1, suraltsagch_id, '2026-09-01' FROM suraltsagch;
INSERT INTO toyrgiin_sudalgaa (suraltsagch_id, duureg, horoo, delgerengui_hayg, toyrgiin_baidal)
SELECT suraltsagch_id, IF(suraltsagch_id = 5, 'Сүхбаатар', 'Баянзүрх'), IF(suraltsagch_id = 5, 8, 15),
       CONCAT(10 + suraltsagch_id, '-р байр, ', 20 + suraltsagch_id * 3, ' тоот'),
       IF(suraltsagch_id = 5, 'Тойргийн бус', 'Тойргийн')
  FROM suraltsagch;

INSERT INTO asran_hamgaalagch (asran_id, ovog, ner, utas, ajliin_bair) VALUES
 (1, 'Ганбат', 'Оюунчимэг', '99001001', 'Банк'),
 (2, 'Төмөр',  'Сарантуяа', '99001002', 'Сургууль'),
 (3, 'Бат',    'Энхжаргал', '99001003', 'Хувиараа'),
 (4, 'Мөнх',   'Цэцэгмаа',  '99001004', 'Эмнэлэг'),
 (5, 'Гантөгс','Батбаяр',   '88001005', 'Барилгын компани');
INSERT INTO suraltsagch_asran (suraltsagch_id, asran_id, hen_boloh, gol_holboo) VALUES
 (1,1,'Ээж',TRUE),(2,2,'Ээж',TRUE),(3,3,'Ээж',TRUE),(4,5,'Аав',TRUE),(4,4,'Ээж',FALSE),
 (5,4,'Ээж',TRUE),(6,1,'Ээж',TRUE),(7,2,'Эмээ',TRUE),(8,3,'Ээж',TRUE);
INSERT INTO kinder_police (suraltsagch_id, asran_id, ehleh_tsag, temdeglel) VALUES
 (1, 1, '2026-11-03 07:45:00', 'Өглөөний ээлж'),
 (4, 5, '2026-11-05 07:45:00', 'Өглөөний ээлж');

INSERT INTO eruul_mend (suraltsagch_id, shinjilgee_ner, hariu, ognoo, burtgesen_hereglegch)
SELECT suraltsagch_id, 'Цусны ерөнхий шинжилгээ', IF(suraltsagch_id = 6, 'Цус багадалт, давтан шинжлүүлэх', 'Хэвийн'), '2026-09-12', 1
  FROM suraltsagch;

-- Ирц: 2026-09-01 – 2026-10-30, ажлын өдөр (зохиомол тархалт)
INSERT INTO irts (suraltsagch_id, buleg_id, ognoo, tuluv, burtgesen_hereglegch)
WITH RECURSIVE d AS (
  SELECT DATE '2026-09-01' AS ognoo
  UNION ALL SELECT ognoo + INTERVAL 1 DAY FROM d WHERE ognoo < '2026-10-30'
)
SELECT s.suraltsagch_id, 1, d.ognoo,
       CASE WHEN MOD(CRC32(CONCAT(s.suraltsagch_id, d.ognoo)), 100) < 86 THEN 'Ирсэн'
            WHEN MOD(CRC32(CONCAT(s.suraltsagch_id, d.ognoo)), 100) < 92 THEN 'Чөлөөтэй'
            WHEN MOD(CRC32(CONCAT(s.suraltsagch_id, d.ognoo)), 100) < 97 THEN 'Өвчтэй'
            ELSE 'Тасалсан' END, 1
  FROM d CROSS JOIN suraltsagch s
 WHERE WEEKDAY(d.ognoo) < 5;

INSERT INTO font_khuraamj (suraltsagch_id, sar, tuluv, dun, burtgesen_hereglegch)
SELECT s.suraltsagch_id, m.sar,
       CASE WHEN s.suraltsagch_id = 7 THEN 'Чөлөөлсөн'
            WHEN m.sar = '2026-10-01' AND s.suraltsagch_id IN (3, 5) THEN 'Төлөөгүй'
            ELSE 'Төлсөн' END,
       IF(s.suraltsagch_id = 7, NULL, 30000), 1
  FROM suraltsagch s CROSS JOIN (SELECT DATE '2026-09-01' AS sar UNION ALL SELECT DATE '2026-10-01') m;

INSERT INTO osolt (suraltsagch_id, hemjilt_on, uliral, hemjsen_ognoo, nas_sar, jin, undur, tolgoi_toirog, tseej_toirog, unelgee, burtgesen_hereglegch)
SELECT suraltsagch_id, 2026, 'Намар', '2026-09-20', TIMESTAMPDIFF(MONTH, torson_ognoo, '2026-09-20'),
       17 + MOD(suraltsagch_id * 7, 6), 105 + MOD(suraltsagch_id * 5, 12), 49 + MOD(suraltsagch_id, 3), 52 + MOD(suraltsagch_id, 5),
       CASE suraltsagch_id WHEN 6 THEN 'Тураалтай' WHEN 4 THEN 'Илүүдэл жинтэй' ELSE 'Хэвийн' END, 1
  FROM suraltsagch;

INSERT INTO surgaltyn_heregsel (buleg_id, ner, angilal, too_shirheg, tuluv_temdeglel) VALUES
 (1,'Эвлүүлдэг тоглоом','Тоглоом',12,'Бүрэн'),(1,'Үлгэрийн ном','Ном',35,'3 ширхэг засвартай'),
 (1,'Тоо тоолох шоо','Хэрэглэгдэхүүн',60,'Бүрэн'),(1,'Хэнгэрэг','Хэрэглэгдэхүүн',6,'Бүрэн');
INSERT INTO hicheeliin_heregsel_turul (turul_id, buleg_id, ner) VALUES
 (1,1,'Усан будаг'),(2,1,'Зургийн дэвтэр'),(3,1,'Өнгийн харандаа'),(4,1,'Шүдний сойз'),(5,1,'Бийр');
INSERT INTO hicheeliin_heregsel (suraltsagch_id, turul_id, too)
SELECT s.suraltsagch_id, t.turul_id, 1 + MOD(s.suraltsagch_id + t.turul_id, 2) FROM suraltsagch s CROSS JOIN hicheeliin_heregsel_turul t;

-- Эхлэлийн үнэлгээ: математик, дүрслэх урлагт сул байхаар
INSERT INTO rubric_unelgee (suraltsagch_id, uye_id, chiglel_id, tuvshin, unelsen_hereglegch)
SELECT s.suraltsagch_id, 1, c.chiglel_id,
       CASE WHEN c.kod IN ('MAT','DUR') THEN 1 + MOD(CRC32(CONCAT(s.suraltsagch_id, c.kod)), 2)
            ELSE 2 + MOD(CRC32(CONCAT(s.suraltsagch_id, c.kod)), 2) END, 1
  FROM suraltsagch s CROSS JOIN suraltsahuin_chiglel c;
INSERT INTO hyanaltyn_unelgee (suraltsagch_id, uye_id, asuult_id, chaddag, unelsen_hereglegch)
SELECT s.suraltsagch_id, 1, q.asuult_id,
       MOD(CRC32(CONCAT(s.suraltsagch_id, '-', q.asuult_id)), 100) < IF(q.asuult_id IN (4,5,6,15), 45, 85), 1
  FROM suraltsagch s CROSS JOIN hyanaltyn_asuult q;
INSERT INTO bagshlahui_unelgee (bagsh_id, uye_id, shalguur_id, onoo)
SELECT 1, 1, shalguur_id, CASE shalguur_id WHEN 5 THEN 1 WHEN 13 THEN 2 ELSE 3 END FROM bagshlahui_shalguur;

-- Төлөвлөгөө: жилийн → сарын → үйл ажиллагааны
INSERT INTO tuluvluguu (tuluvluguu_id, buleg_id, ehleh_tuluvluguu_id, turul, garchig, hugatsaa_ehleh, hugatsaa_duusah, zorilgo, aguulga, bolovsruulsan_bagsh) VALUES
 (1, 1, NULL, 'Жилийн', '2026–2027 оны бүлгийн сургалтын жилийн төлөвлөгөө', '2026-09-01', '2027-05-31',
  'Математикийн энгийн төсөөлөл, дүрслэх урлагийн чиглэлд бүлгийн дунджийг II–III түвшинд хүргэх.',
  'Тоо тоолох, хэмжих тоглоомыг долоо хоногт 2 удаа; бүтээлч булан тохижуулах.', 1),
 (2, 1, 1, 'Сарын', '10-р сар: Намрын байгаль', '2026-10-01', '2026-10-31',
  'Намрын өөрчлөлтийг ажиглаж, 1–10 хүртэл тоолох чадварыг бэхжүүлэх.', 'Навч ангилах, тоолох; намрын үлгэр.', 1),
 (3, 1, 1, 'Сарын', '11-р сар: Миний гэр бүл', '2026-11-01', '2026-11-30',
  'Өөрийгөө болон гэр бүлээ танилцуулах.', 'Гэр бүлийн зургийн үзэсгэлэн, дүрд тоглох тоглоом.', 1);
INSERT INTO tuluvluguu (tuluvluguu_id, buleg_id, ehleh_tuluvluguu_id, turul, garchig, hugatsaa_ehleh, hugatsaa_duusah, zorilgo, aguulga, heregsel, surgaltyn_helber, bolovsruulsan_bagsh) VALUES
 (4, 1, 2, 'Үйл ажиллагааны', 'Навч тоолъё', '2026-10-14', '2026-10-14',
  '5 хүртэлх эд зүйлийг хэмжээгээр дараалуулах, 1–10 хүртэл оноож тоолох.',
  'Талбайгаас цуглуулсан навчийг ангилж тоолно.', 'Навч, сагс, тооны карт', 'Багаар', 1);
INSERT INTO tuluvluguu_alham (tuluvluguu_id, daraalal, alham) VALUES
 (4,1,'Навчийн тухай ярилцах'),(4,2,'Навчийг өнгөөр ангилах'),(4,3,'Хэмжээгээр дараалуулах'),(4,4,'Тоолж, тооны карттай тааруулах');
INSERT INTO tuluvluguu_chiglel (tuluvluguu_id, chiglel_id) VALUES
 (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(2,2),(2,3),(2,1),(3,1),(3,3),(4,2),(4,3);

-- Батлах урсгал процедуроор
CALL sp_batlah_urgal('tuluvluguu', 1, 1, 'Хянагдаж буй', NULL);
CALL sp_batlah_urgal('tuluvluguu', 1, 2, 'Батлагдсан', 'Эхлэлийн үнэлгээтэй уялдсан тул батлав.');
CALL sp_batlah_urgal('tuluvluguu', 2, 1, 'Хянагдаж буй', NULL);
CALL sp_batlah_urgal('tuluvluguu', 2, 2, 'Батлагдсан', NULL);
CALL sp_batlah_urgal('tuluvluguu', 4, 1, 'Хянагдаж буй', NULL);
CALL sp_batlah_urgal('tuluvluguu', 4, 2, 'Батлагдсан', NULL);
CALL sp_batlah_urgal('tuluvluguu', 3, 1, 'Хянагдаж буй', NULL);

INSERT INTO tailan (tailan_id, buleg_id, tuluvluguu_id, sar, hiigdsen_ajil, ur_dun, dugnelt, daraagiin_sar, bolovsruulsan_bagsh) VALUES
 (1, 1, 2, '2026-10-01', 'Намрын байгалийн сэдвээр 18 үйл ажиллагаа зохион байгуулав.',
  '1–10 хүртэл оноож тоолох чадвартай хүүхдийн тоо нэмэгдэв.',
  'Бодит эд зүйл ашигласан математикийн үйл ажиллагаа үр дүнтэй байв.',
  'Төө, сөөмөөр хэмжих дасгалыг 11-р сарын 2 дахь долоо хоногт хийнэ.', 1);
CALL sp_batlah_urgal('tailan', 1, 1, 'Хянагдаж буй', NULL);

SET @app_hereglegch_id = NULL;
