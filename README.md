# LitigARG API

## Base de datos

LitigARG usa PostgreSQL cuando existe la variable de entorno `DATABASE_URL`.
Si esa variable no existe, usa `database.json` como respaldo local.

En Render:

1. Crear una base de datos PostgreSQL.
2. Copiar la `Internal Database URL`.
3. Pegarla en el servicio web como variable `DATABASE_URL`.
4. Hacer deploy nuevamente.

La aplicación crea automáticamente las tablas:

- `users`: usuario, correo y contraseña cifrada.
- `subscriptions`: plan, estado y vencimiento.
- `payments`: pagos recibidos desde Mercado Pago.
- `free_usage`: uso gratuito disponible por usuario.
- `document_library`: libros, PDFs y materiales internos cargados para consulta.
- `document_chunks`: fragmentos consultables de cada material interno.
- `jurisprudence_library`: providencias y fuentes juridicas encontradas.

## Correos transaccionales

LitigARG puede enviar correos cuando:

- se crea una cuenta,
- se cambia una contrasena,
- se activa un plan Premium mensual o anual.

Para activar los correos en Render, agregar estas variables de entorno:

- `SMTP_HOST`: servidor SMTP.
- `SMTP_PORT`: puerto SMTP, normalmente `587`.
- `SMTP_SECURE`: `true` si el proveedor exige conexion segura directa, si no `false`.
- `SMTP_USER`: usuario del correo.
- `SMTP_PASS`: contrasena o clave de aplicacion del correo.
- `SMTP_FROM`: remitente visible, por ejemplo `"LitigARG" <notificaciones@tudominio.com>`.

## Busqueda jurisprudencial oficial

LitigARG incluye un modulo inicial para buscar jurisprudencia en repositorios oficiales, sin depender de Perplexity.

Ruta interna:

- `POST /api/jurisprudence/search`

La busqueda usa o prepara enlaces verificables de estas fuentes:

- `corteconstitucional.gov.co`
- `cortesuprema.gov.co`
- `ramajudicial.gov.co`

Regla de seguridad: LitigARG no debe tratar una providencia como verificada si no hay enlace oficial trazable.

## Biblioteca documental interna

LitigARG puede guardar libros, PDFs, Word y textos para consulta interna.

La administracion de la biblioteca esta restringida a la cuenta creadora. Por defecto se autoriza `litigarg@gmail.com`. Para cambiar o agregar administradores en Render, usar:

- `LIBRARY_ADMIN_EMAILS`: correos separados por coma, por ejemplo `creadora@arg.com,socio@arg.com`.

Rutas internas:

- `POST /api/library/upload`: sube un documento y lo divide en fragmentos consultables.
- `GET /api/library`: lista documentos guardados.
- `POST /api/library/search`: busca fragmentos relevantes dentro de la biblioteca.

Campos opcionales al subir:

- `title`: titulo visible.
- `author`: autor, por ejemplo Wilson Gomez.
- `category`: categoria del material.
- `tags`: etiquetas separadas por coma.
- `description`: descripcion breve.

Los fragmentos de biblioteca se usan como apoyo doctrinal, metodologico o tecnico. No se presentan como jurisprudencia oficial.

## Aprendizaje por correcciones

Siguiente modulo pendiente: guardar retroalimentacion de usuarios sobre respuestas, especialmente correcciones, votos negativos y versiones corregidas. Esa informacion debe alimentar una tabla de patrones de mejora para ajustar instrucciones, biblioteca, ejemplos y evaluaciones internas sin modificar automaticamente la base juridica verificada.

Si estas variables no existen, LitigARG no envia correos, pero la app sigue funcionando.

Si la base PostgreSQL está vacía y existe `database.json`, LitigARG copia esos datos iniciales una sola vez. Para evitar esa copia automática, usar `MIGRATE_JSON_DB=false`.
