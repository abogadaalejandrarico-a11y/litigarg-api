import crypto from "crypto";
import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";

const AUTHORSHIP_ID = 1;

export const INTERNAL_AUTHORSHIP = {
  projectName: "LitigARG",
  authorshipCode: "LITIGARG-WA-2026",
  creatorReference:
    "Jeniffer Alejandra Rico Pineda, correo principal abogada.alejandrarico@gmail.com, coautora, creadora, codirectora del proyecto, responsable del desarrollo funcional y administradora de los correos litigarg@gmail.com y litigarg@argabogados.co",
  collaboratorReference:
    "Wilson Gómez Betancur, correo principal abogadogomez72@gmail.com, coautor, codirector del proyecto, responsable del desarrollo metodológico, estratégico, de reglas y doctrinal",
  authorshipNote:
    "Registro interno de autoría: LitigARG fue creada y desarrollada como proyecto conjunto de Jeniffer Alejandra Rico Pineda y Wilson Gómez Betancur. Jeniffer Alejandra Rico Pineda participa como coautora, creadora, codirectora del proyecto, responsable del desarrollo funcional y administradora de los correos principales asociados al sistema. Wilson Gómez Betancur participa como coautor, codirector del proyecto y responsable del desarrollo metodológico, estratégico, doctrinal y de reglas que orientan la especialización jurídica de LitigARG. Este registro no se muestra al usuario final y existe para trazabilidad interna del origen, evolución y configuración del sistema.",
  metadata: {
    projectStart: "abril de 2026",
    creator: {
      name: "Jeniffer Alejandra Rico Pineda",
      primaryEmail: "abogada.alejandrarico@gmail.com",
      projectEmails: ["litigarg@gmail.com", "litigarg@argabogados.co"],
      role: "Coautora, creadora, codirectora y responsable del desarrollo funcional"
    },
    collaborator: {
      name: "Wilson Gómez Betancur",
      primaryEmail: "abogadogomez72@gmail.com",
      role: "Coautor, codirector y responsable del desarrollo metodológico, estratégico, de reglas y doctrinal"
    },
    purpose: "Trazabilidad interna de autoría y evolución del sistema LitigARG",
    visibility: "internal",
    userFacing: false
  }
};

export function hashText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export async function ensureAuthorshipRecord(baseRules = "") {
  const baseRulesHash = hashText(baseRules);

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          INSERT INTO project_authorship (
            id, project_name, authorship_code, creator_reference,
            collaborator_reference, authorship_note, base_rules_hash,
            metadata, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            project_name = EXCLUDED.project_name,
            authorship_code = EXCLUDED.authorship_code,
            creator_reference = EXCLUDED.creator_reference,
            collaborator_reference = EXCLUDED.collaborator_reference,
            authorship_note = EXCLUDED.authorship_note,
            base_rules_hash = EXCLUDED.base_rules_hash,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING *
        `,
        [
          AUTHORSHIP_ID,
          INTERNAL_AUTHORSHIP.projectName,
          INTERNAL_AUTHORSHIP.authorshipCode,
          INTERNAL_AUTHORSHIP.creatorReference,
          INTERNAL_AUTHORSHIP.collaboratorReference,
          INTERNAL_AUTHORSHIP.authorshipNote,
          baseRulesHash,
          JSON.stringify(INTERNAL_AUTHORSHIP.metadata)
        ]
      );

      return result.rows[0];
    });
  }

  const db = await readDB();
  db.projectAuthorship = {
    ...INTERNAL_AUTHORSHIP,
    baseRulesHash,
    updatedAt: new Date().toISOString()
  };
  await writeDB(db);

  return db.projectAuthorship;
}
