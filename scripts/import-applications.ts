import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { prismaClient } from "../src/data-access/data-access.service";

// Load environment variables
dotenv.config();

// Use the exported Prisma client from DataAccessService (DRY principle)
const prisma = prismaClient;

interface ExcelRow {
  "Application Name"?: string;
  Description?: string;
  Subs?: string;
  TechStack?: string;
  "Mambu Api Versoning"?: string;
  "Integration Type"?: string;
  "Containerization/CI/CD Pipeline"?: string;
  "Traffic/Usage"?: string;
  Subsidiary?: string;
  "Containerization/CI/CD"?: string;
  Status?: string;
  "Contact Person/Team"?: string;
  "AWS Account"?: string;
  "GIT Repository"?: string;
  "Tech Stack"?: string;
  "Production URL(s)"?: string;
  "Server IP"?: string;
  "Public Facing?"?: string;
  Migrated?: string;
  Secured?: string;
  "Deployed Sandbox"?: string;
  "Deployed Production"?: string;
  "Added to Backstage?"?: string;
  "Security Testing"?: string;
  Vendor?: string;
  RBAC?: string;
  "Mambu API Versioning"?: string;
  "Migrated to V2"?: string;
}

function normalizeYesNo(value: any): string | null {
  if (!value) return null;
  const str = String(value).trim().toLowerCase();
  if (str === "yes" || str === "y" || str === "1" || str === "true")
    return "Yes";
  if (str === "no" || str === "n" || str === "0" || str === "false")
    return "No";
  return null;
}

function normalizeStatus(value: any): string {
  if (!value) return "UNKNOWN";
  const str = String(value).trim().toUpperCase();
  const validStatuses = [
    "LIVE",
    "DEVELOPMENT",
    "DISABLED",
    "DECOMMISSIONED",
    "TESTING",
    "STALLED",
    "UNKNOWN",
  ];
  return validStatuses.includes(str) ? str : "UNKNOWN";
}

async function importApplications() {
  try {
    console.log("Reading Excel file...");
    const workbook = XLSX.readFile("./applications-data.xlsx");
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Found ${data.length} rows in Excel file`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of data) {
      try {
        // Import ALL rows, even if they appear empty or duplicate
        // Only skip if Application Name is completely missing
        if (
          !row["Application Name"] ||
          String(row["Application Name"]).trim() === ""
        ) {
          skipped++;
          continue;
        }

        const applicationData = {
          applicationName: String(row["Application Name"]).trim(),
          description: row["Description"]
            ? String(row["Description"]).trim()
            : null,
          trafficUsage: row["Traffic/Usage"]
            ? String(row["Traffic/Usage"]).trim()
            : null,
          subsidiary: row["Subsidiary"]
            ? String(row["Subsidiary"]).trim()
            : null,
          containerizationCICD: row["Containerization/CI/CD"]
            ? String(row["Containerization/CI/CD"]).trim()
            : null,
          status: normalizeStatus(row["Status"]),
          contactPerson: row["Contact Person/Team"]
            ? String(row["Contact Person/Team"]).trim()
            : null,
          awsAccount: row["AWS Account"]
            ? String(row["AWS Account"]).trim()
            : null,
          gitRepository: row["GIT Repository"]
            ? String(row["GIT Repository"]).trim()
            : null,
          techStack: row["Tech Stack"]
            ? String(row["Tech Stack"]).trim()
            : null,
          productionUrls: row["Production URL(s)"]
            ? String(row["Production URL(s)"]).trim()
            : null,
          serverIp: row["Server IP"] ? String(row["Server IP"]).trim() : null,
          publicFacing: normalizeYesNo(row["Public Facing?"]),
          migrated: normalizeYesNo(row["Migrated"]),
          secured: normalizeYesNo(row["Secured"]),
          deployedSandbox: normalizeYesNo(row["Deployed Sandbox"]),
          deployedProduction: normalizeYesNo(row["Deployed Production"]),
          addedToBackstage: normalizeYesNo(row["Added to Backstage?"]),
          securityTesting: normalizeYesNo(row["Security Testing"]),
          vendor: row["Vendor"] ? String(row["Vendor"]).trim() : null,
          rbac: row["RBAC"] ? String(row["RBAC"]).trim() : null,
          mambuApiVersioning: row["Mambu API Versioning"]
            ? String(row["Mambu API Versioning"]).trim()
            : null,
          migratedToV2: row["Migrated to V2"]
            ? String(row["Migrated to V2"]).trim()
            : null,
        };

        await prisma.application.create({
          data: applicationData,
        });

        imported++;
        console.log(`Imported: ${applicationData.applicationName}`);
      } catch (error: any) {
        errors++;
        console.error(
          `Error importing row: ${row["Application Name"]}`,
          error.message,
        );
      }
    }

    console.log("\nImport Summary:");
    console.log(`   Successfully imported: ${imported}`);
    console.log(`   Skipped (empty): ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total rows: ${data.length}`);
  } catch (error) {
    console.error("Fatal error during import:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importApplications()
  .then(() => {
    console.log("\nImport completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nImport failed:", error);
    process.exit(1);
  });
