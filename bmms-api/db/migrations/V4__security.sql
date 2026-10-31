-- =====================================================================
-- БММС — 04. Эрхийн удирдлага (хамгийн бага эрхийн зарчим, SR104)
--   bmms_app    : Node.js API. audit_log-д зөвхөн INSERT (засах/устгах эрхгүй)
--   bmms_report : Удирдлагын хяналтын самбар. Зөвхөн нэгтгэсэн view (нэр, РД-гүй)
--   bmms_audit  : Аудитор / МАБ. Зөвхөн audit_log унших
-- =====================================================================

CREATE ROLE IF NOT EXISTS 'bmms_app', 'bmms_report', 'bmms_audit';

-- Аппликейшн: бүх ажлын хүснэгт
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.tsetserleg              TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hicheeliin_jil          TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hereglegch              TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hereglegch_session      TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.bagsh                   TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.buleg                   TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.suraltsagch             TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.buleg_gishuun           TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.toyrgiin_sudalgaa       TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.asran_hamgaalagch       TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.suraltsagch_asran       TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.havsralt                TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.eruul_mend              TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.irts                    TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hoolny_une              TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.amraltyn_odor           TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.font_khuraamj           TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.kinder_police           TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.osolt                   TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.surgaltyn_heregsel      TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hicheeliin_heregsel_turul TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hicheeliin_heregsel     TO 'bmms_app';
GRANT SELECT                         ON bmms.suraltsahuin_chiglel    TO 'bmms_app';
GRANT SELECT                         ON bmms.rubric_shalguur         TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE         ON bmms.hyanaltyn_asuult        TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE         ON bmms.bagshlahui_shalguur     TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.unelgee_uye             TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.rubric_unelgee          TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.hyanaltyn_unelgee       TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.bagshlahui_unelgee      TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.tuluvluguu              TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.tuluvluguu_chiglel      TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.tuluvluguu_alham        TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.tailan                  TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.tailan_zurag            TO 'bmms_app';
GRANT SELECT, INSERT                 ON bmms.sanal_shuumj            TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.gantsaarchilsan_surgalt TO 'bmms_app';
GRANT SELECT, INSERT, UPDATE, DELETE ON bmms.gantsaarchilsan_tailan  TO 'bmms_app';
GRANT INSERT                         ON bmms.audit_log               TO 'bmms_app';
GRANT SELECT ON bmms.v_buleg_huuhed         TO 'bmms_app';
GRANT SELECT ON bmms.v_irts_sar             TO 'bmms_app';
GRANT SELECT ON bmms.v_irts_uliral          TO 'bmms_app';
GRANT SELECT ON bmms.v_irts_jil             TO 'bmms_app';
GRANT SELECT ON bmms.v_rubric_buleg_dundaj  TO 'bmms_app';
GRANT SELECT ON bmms.v_rubric_ahits         TO 'bmms_app';
GRANT SELECT ON bmms.v_hyanaltyn_huvi       TO 'bmms_app';
GRANT SELECT ON bmms.v_font_sar             TO 'bmms_app';
GRANT SELECT ON bmms.v_osolt_buleg          TO 'bmms_app';
GRANT SELECT ON bmms.v_batlah_huleegdej_bui TO 'bmms_app';
GRANT EXECUTE ON PROCEDURE bmms.sp_irts_buglu   TO 'bmms_app';
GRANT EXECUTE ON PROCEDURE bmms.sp_batlah_urgal TO 'bmms_app';
GRANT EXECUTE ON FUNCTION  bmms.fn_ajlyn_udur   TO 'bmms_app';
GRANT EXECUTE ON FUNCTION  bmms.fn_hoolny_une   TO 'bmms_app';

-- Тайлан, хяналтын самбар: хүүхдийн нэр, РД агуулаагүй нэгтгэл л
GRANT SELECT ON bmms.v_irts_sar            TO 'bmms_report';
GRANT SELECT ON bmms.v_irts_uliral         TO 'bmms_report';
GRANT SELECT ON bmms.v_irts_jil            TO 'bmms_report';
GRANT SELECT ON bmms.v_rubric_buleg_dundaj TO 'bmms_report';
GRANT SELECT ON bmms.v_hyanaltyn_huvi      TO 'bmms_report';
GRANT SELECT ON bmms.v_font_sar            TO 'bmms_report';
GRANT SELECT ON bmms.v_osolt_buleg         TO 'bmms_report';
GRANT SELECT ON bmms.buleg                 TO 'bmms_report';
GRANT SELECT ON bmms.tsetserleg            TO 'bmms_report';

-- Аудит
GRANT SELECT ON bmms.audit_log TO 'bmms_audit';

-- ---------------------------------------------------------------------
-- Хэрэглэгч үүсгэх (нууц үгийг AWS Secrets Manager-ээс оноож ажиллуулна;
-- энэ файлд нууц үг бичихгүй). Холболтыг TLS-ээр шаардана.
-- ---------------------------------------------------------------------
-- CREATE USER 'bmms_api'@'10.0.%'   IDENTIFIED BY '<secret>' REQUIRE SSL;
-- CREATE USER 'bmms_bi'@'10.0.%'    IDENTIFIED BY '<secret>' REQUIRE SSL;
-- CREATE USER 'bmms_auditor'@'10.0.%' IDENTIFIED BY '<secret>' REQUIRE SSL;
-- GRANT 'bmms_app'    TO 'bmms_api'@'10.0.%';
-- GRANT 'bmms_report' TO 'bmms_bi'@'10.0.%';
-- GRANT 'bmms_audit'  TO 'bmms_auditor'@'10.0.%';
-- SET DEFAULT ROLE ALL TO 'bmms_api'@'10.0.%', 'bmms_bi'@'10.0.%', 'bmms_auditor'@'10.0.%';
