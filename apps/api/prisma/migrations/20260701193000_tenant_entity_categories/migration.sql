CREATE TYPE "TenantEntityType" AS ENUM ('ORGANIZATION', 'INDIVIDUAL');

CREATE TABLE "TenantCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" "TenantEntityType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tenant"
ADD COLUMN "entityType" "TenantEntityType" NOT NULL DEFAULT 'ORGANIZATION',
ADD COLUMN "tenantCategoryId" TEXT;

CREATE UNIQUE INDEX "TenantCategory_code_key" ON "TenantCategory"("code");
CREATE INDEX "TenantCategory_entityType_isActive_sortOrder_idx" ON "TenantCategory"("entityType", "isActive", "sortOrder");
CREATE INDEX "Tenant_entityType_tenantCategoryId_idx" ON "Tenant"("entityType", "tenantCategoryId");

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_tenantCategoryId_fkey"
FOREIGN KEY ("tenantCategoryId") REFERENCES "TenantCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TenantCategory" ("id", "code", "name", "entityType", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  ('tenant_cat_technology', 'TECHNOLOGY', 'เทคโนโลยี / ซอฟต์แวร์', 'ORGANIZATION', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_finance', 'FINANCE', 'การเงิน / บัญชี', 'ORGANIZATION', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_healthcare', 'HEALTHCARE', 'สุขภาพ / การแพทย์', 'ORGANIZATION', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_education', 'EDUCATION', 'การศึกษา', 'ORGANIZATION', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_manufacturing', 'MANUFACTURING', 'การผลิต / อุตสาหกรรม', 'ORGANIZATION', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_retail', 'RETAIL', 'ค้าปลีก / พาณิชย์', 'ORGANIZATION', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_consulting', 'CONSULTING', 'ที่ปรึกษา / บริการวิชาชีพ', 'ORGANIZATION', 70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_government', 'GOVERNMENT', 'ภาครัฐ / หน่วยงานสาธารณะ', 'ORGANIZATION', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_nonprofit', 'NONPROFIT', 'มูลนิธิ / องค์กรไม่แสวงกำไร', 'ORGANIZATION', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_real_estate', 'REAL_ESTATE', 'อสังหาริมทรัพย์ / ก่อสร้าง', 'ORGANIZATION', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_logistics', 'LOGISTICS', 'โลจิสติกส์ / ขนส่ง', 'ORGANIZATION', 110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_hospitality', 'HOSPITALITY', 'โรงแรม / ท่องเที่ยว / บริการ', 'ORGANIZATION', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_media', 'MEDIA', 'สื่อ / การตลาด / โฆษณา', 'ORGANIZATION', 130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_other_org', 'OTHER_ORG', 'อื่น ๆ', 'ORGANIZATION', 999, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_student', 'STUDENT', 'นักเรียน / นักศึกษา', 'INDIVIDUAL', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_teacher', 'TEACHER', 'ครู / อาจารย์', 'INDIVIDUAL', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_freelancer', 'FREELANCER', 'ฟรีแลนซ์', 'INDIVIDUAL', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_consultant', 'CONSULTANT', 'ที่ปรึกษาอิสระ', 'INDIVIDUAL', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_entrepreneur', 'ENTREPRENEUR', 'เจ้าของกิจการ / ผู้ประกอบการ', 'INDIVIDUAL', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_employee', 'EMPLOYEE', 'พนักงานบริษัท', 'INDIVIDUAL', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_manager', 'MANAGER_OCCUPATION', 'ผู้จัดการ', 'INDIVIDUAL', 70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_executive', 'EXECUTIVE', 'ผู้บริหาร', 'INDIVIDUAL', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_engineer', 'ENGINEER', 'วิศวกร', 'INDIVIDUAL', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_developer', 'DEVELOPER', 'นักพัฒนาซอฟต์แวร์ / โปรแกรมเมอร์', 'INDIVIDUAL', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_designer', 'DESIGNER', 'นักออกแบบ', 'INDIVIDUAL', 110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_marketer', 'MARKETER', 'นักการตลาด / นักขาย', 'INDIVIDUAL', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_accountant', 'ACCOUNTANT', 'นักบัญชี / การเงิน', 'INDIVIDUAL', 130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_lawyer', 'LAWYER', 'ทนาย / นิติกร', 'INDIVIDUAL', 140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_doctor', 'DOCTOR', 'แพทย์ / บุคลากรทางการแพทย์', 'INDIVIDUAL', 150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_gov_officer', 'GOV_OFFICER', 'ข้าราชการ / พนักงานรัฐ', 'INDIVIDUAL', 160, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_creator', 'CREATOR', 'ครีเอเตอร์ / อินฟลูเอนเซอร์', 'INDIVIDUAL', 170, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant_cat_other_individual', 'OTHER_INDIVIDUAL', 'อื่น ๆ', 'INDIVIDUAL', 999, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
