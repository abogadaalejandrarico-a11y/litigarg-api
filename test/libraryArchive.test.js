import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { readLibraryArchive } from "../src/services/libraryArchive.js";

function makeZip(entries) {
  const zip = new AdmZip();
  for (const [name, content] of entries) zip.addFile(name, Buffer.from(content));
  return { originalname: "coleccion.zip", mimetype: "application/zip", buffer: zip.toBuffer() };
}

test("imports supported documents and preserves folder paths", () => {
  const archive = readLibraryArchive(makeZip([
    ["reglas/regla-principal.txt", "Contenido jurídico suficiente para una regla principal."],
    ["doctrina/guia.md", "Guía interna de argumentación jurídica."],
    ["imagenes/portada.jpg", "not-an-image"]
  ]));

  assert.deepEqual(archive.files.map(file => file.originalname).sort(), [
    "doctrina/guia.md",
    "reglas/regla-principal.txt",
  ].sort());
  assert.equal(archive.skipped.length, 1);
});

test("does not import nested ZIP files", () => {
  assert.throws(
    () => readLibraryArchive(makeZip([["otra-carpeta.zip", "contenido"]])),
    /no contiene documentos compatibles/i
  );
});
